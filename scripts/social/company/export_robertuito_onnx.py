"""Convierte un modelo RoBERTuito de pysentimiento a ONNX sin PyTorch.

Los modelos de emoción y de ironía sólo se publican como `pytorch_model.bin`,
y PyTorch no carga en una Windows con Control de aplicaciones. Los pesos se
leen con `robertuito_numpy` (sin PyTorch) y el grafo de RoBERTa —embeddings,
12 capas de atención y la cabeza de clasificación— se escribe a mano con
`onnx.helper`, operación por operación, igual que la cuenta de numpy.

Queda en float32, sin cuantizar: medido el 1-oct-2026, el grafo float32
reproduce los logits de numpy con un error máximo de 5e-6, y la versión int8
cambiaba la etiqueta de un caso límite de ironía de cada ocho. La conversión se
da por buena sólo si las etiquetas coinciden todas con las de numpy en el lote
de verificación (`--verify`).

    python scripts/social/company/export_robertuito_onnx.py emotion irony --verify
"""

from __future__ import annotations

import argparse
import math
import sys

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

from robertuito_numpy import RobertaClassifier
from sentiment_onnx import MODELS, NumpyTask, OnnxTask

OPSET = 17
SAMPLES = [
    "Excelente servicio, gracias 💜",
    "Pésimo internet, tres días sin señal y nadie responde",
    "jajajaja qué buen servicio, otra vez sin internet 🙄",
    "Hola, ¿a qué hora abren mañana?",
    "Me cobraron dos veces y no me devuelven la plata, son unos ladrones",
    "Qué miedo, otra vez subió el dólar",
    "Claro, porque el internet nunca falla 🙃",
    "Felicidades por los 140 años, orgullo boliviano",
]


class Graph:
    def __init__(self) -> None:
        self.nodes: list[onnx.NodeProto] = []
        self.inits: list[onnx.TensorProto] = []
        self.count = 0

    def const(self, name: str, value: np.ndarray) -> str:
        self.inits.append(numpy_helper.from_array(value, name))
        return name

    def op(self, kind: str, inputs: list[str], **attrs: object) -> str:
        self.count += 1
        out = f"{kind.lower()}_{self.count}"
        self.nodes.append(helper.make_node(kind, inputs, [out], **attrs))
        return out

    def linear(self, x: str, weights: dict[str, np.ndarray], name: str) -> str:
        w = self.const(f"{name}.wT", np.ascontiguousarray(weights[f"{name}.weight"].T))
        b = self.const(f"{name}.b", weights[f"{name}.bias"])
        return self.op("Add", [self.op("MatMul", [x, w]), b])

    def norm(self, x: str, weights: dict[str, np.ndarray], name: str, eps: float) -> str:
        w = self.const(f"{name}.w", weights[f"{name}.weight"])
        b = self.const(f"{name}.b", weights[f"{name}.bias"])
        return self.op("LayerNormalization", [x, w, b], axis=-1, epsilon=eps)


def build(model: RobertaClassifier) -> onnx.ModelProto:
    g, w = Graph(), model.w
    hidden = w["embeddings.word_embeddings.weight"].shape[1]
    size = hidden // model.heads
    ids, mask = "input_ids", "attention_mask"

    positions = g.op("Add", [g.op("Mul", [g.op("CumSum", [mask, g.const("axis1", np.array(1, np.int64))]), mask]), g.const("pad", np.array(model.pad, np.int64))])
    x = g.op("Add", [
        g.op("Gather", [g.const("word", w["embeddings.word_embeddings.weight"]), ids]),
        g.op("Gather", [g.const("position", w["embeddings.position_embeddings.weight"]), positions]),
    ])
    x = g.op("Add", [x, g.const("type0", w["embeddings.token_type_embeddings.weight"][0])])
    x = g.norm(x, w, "embeddings.LayerNorm", model.eps)

    as_float = g.op("Cast", [mask], to=TensorProto.FLOAT)
    blocked = g.op("Mul", [g.op("Sub", [g.const("one", np.array(1.0, np.float32)), as_float]), g.const("neg", np.array(-1e9, np.float32))])
    blocked = g.op("Unsqueeze", [blocked, g.const("axes12", np.array([1, 2], np.int64))])
    heads = g.const("heads_shape", np.array([0, 0, model.heads, size], np.int64))
    merged = g.const("merged_shape", np.array([0, 0, hidden], np.int64))
    scale = g.const("scale", np.array(1.0 / math.sqrt(size), np.float32))
    half, root2 = g.const("half", np.array(0.5, np.float32)), g.const("inv_root2", np.array(1.0 / math.sqrt(2.0), np.float32))

    for layer in range(model.layers):
        p = f"encoder.layer.{layer}"
        split = lambda t, perm: g.op("Transpose", [g.op("Reshape", [t, heads])], perm=perm)  # noqa: E731
        q = split(g.linear(x, w, f"{p}.attention.self.query"), [0, 2, 1, 3])
        k = split(g.linear(x, w, f"{p}.attention.self.key"), [0, 2, 3, 1])
        v = split(g.linear(x, w, f"{p}.attention.self.value"), [0, 2, 1, 3])
        scores = g.op("Softmax", [g.op("Add", [g.op("Mul", [g.op("MatMul", [q, k]), scale]), blocked])], axis=-1)
        context = g.op("Reshape", [g.op("Transpose", [g.op("MatMul", [scores, v])], perm=[0, 2, 1, 3]), merged])
        x = g.norm(g.op("Add", [g.linear(context, w, f"{p}.attention.output.dense"), x]), w, f"{p}.attention.output.LayerNorm", model.eps)
        inner = g.linear(x, w, f"{p}.intermediate.dense")
        gelu = g.op("Mul", [g.op("Mul", [inner, half]), g.op("Add", [g.const(f"one_{layer}", np.array(1.0, np.float32)), g.op("Erf", [g.op("Mul", [inner, root2])])])])
        x = g.norm(g.op("Add", [g.linear(gelu, w, f"{p}.output.dense"), x]), w, f"{p}.output.LayerNorm", model.eps)

    first = g.op("Gather", [x, g.const("zero", np.array(0, np.int64))], axis=1)
    head = g.op("Tanh", [g.linear(first, w, "classifier.dense")])
    logits = g.linear(head, w, "classifier.out_proj")
    g.nodes.append(helper.make_node("Identity", [logits], ["logits"]))

    graph = helper.make_graph(
        g.nodes,
        "robertuito",
        [helper.make_tensor_value_info(ids, TensorProto.INT64, ["batch", "tokens"]),
         helper.make_tensor_value_info(mask, TensorProto.INT64, ["batch", "tokens"])],
        [helper.make_tensor_value_info("logits", TensorProto.FLOAT, ["batch", len(model.labels)])],
        g.inits,
    )
    built = helper.make_model(graph, opset_imports=[helper.make_opsetid("", OPSET)])
    built.ir_version = 9
    onnx.checker.check_model(built, full_check=False)
    return built


def export(task: str, verify: bool) -> None:
    folder = MODELS / task
    target = folder / "onnx"
    target.mkdir(exist_ok=True)
    full = target / "model.onnx"
    onnx.save(build(RobertaClassifier(folder)), str(full), save_as_external_data=False)
    print(f"{task}: {full}")
    if verify:
        expected = NumpyTask(folder).predict(SAMPLES)
        got = OnnxTask(folder).predict(SAMPLES)
        agree = sum(left == right for left, right in zip(expected, got))
        print(f"{task}: {agree}/{len(SAMPLES)} etiquetas iguales a numpy")
        if agree < len(SAMPLES):
            full.unlink()
            sys.exit(f"{task}: la conversión no reproduce a numpy; se descarta")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("tasks", nargs="+")
    parser.add_argument("--verify", action="store_true")
    arguments = parser.parse_args()
    for name in arguments.tasks:
        export(name, arguments.verify)
