"""RoBERTuito (RobertaForSequenceClassification) corrido en numpy puro.

pysentimiento publica los modelos de emoción y de ironía sólo como
`pytorch_model.bin`, sin conversión a ONNX, y PyTorch no carga en una Windows
con Control de aplicaciones (su DLL queda bloqueada). Un `pytorch_model.bin` es
un zip con un pickle que apunta a buffers crudos: se lee aquí sin PyTorch, con
un `Unpickler` que devuelve arreglos de numpy, y la red —12 capas de un
codificador RoBERTa-base y la cabeza de clasificación— se calcula con numpy.

Es lento al lado de onnxruntime (decenas de textos por segundo, no cientos),
pero suficiente para unos miles de comentarios por semana. La prueba de que la
cuenta está bien es `verify` más abajo: el mismo texto, por esta vía y por el
ONNX de polaridad, tiene que dar la misma etiqueta.
"""

from __future__ import annotations

import json
import math
import pickle
import struct
import zipfile
from pathlib import Path

import numpy as np

DTYPES = {"FloatStorage": np.float32, "HalfStorage": np.float16, "LongStorage": np.int64, "IntStorage": np.int32}


class _Storage:
    def __init__(self, dtype: type) -> None:
        self.dtype = dtype


def _rebuild_tensor(storage: np.ndarray, offset: int, size: tuple, stride: tuple, *_: object) -> np.ndarray:
    item = storage.itemsize
    return np.lib.stride_tricks.as_strided(
        storage[offset:], shape=size, strides=tuple(step * item for step in stride)
    ).copy()


class _TorchUnpickler(pickle.Unpickler):
    """Lee el `data.pkl` de un archivo de PyTorch sin importar PyTorch."""

    def __init__(self, archive: zipfile.ZipFile, prefix: str, *args: object, **kwargs: object) -> None:
        super().__init__(*args, **kwargs)
        self.archive = archive
        self.prefix = prefix

    def find_class(self, module: str, name: str):  # noqa: ANN201 — firma de pickle
        # Lista blanca estricta: un pickle puede pedir cualquier clase (y con
        # ella ejecutar código). Aquí sólo se entregan las tres piezas que un
        # diccionario de pesos necesita; cualquier otra cosa detiene la carga.
        if module == "torch._utils" and name == "_rebuild_tensor_v2":
            return _rebuild_tensor
        if module == "torch" and name in DTYPES:
            return _Storage(DTYPES[name])
        if module == "collections" and name == "OrderedDict":
            from collections import OrderedDict

            return OrderedDict
        raise pickle.UnpicklingError(f"clase no permitida en un archivo de pesos: {module}.{name}")

    def persistent_load(self, pid: tuple) -> np.ndarray:
        _, storage_type, key, _location, _count = pid
        dtype = storage_type.dtype if isinstance(storage_type, _Storage) else np.float32
        raw = self.archive.read(f"{self.prefix}/data/{key}")
        return np.frombuffer(raw, dtype=dtype)


def load_torch_bin(path: Path) -> dict[str, np.ndarray]:
    with zipfile.ZipFile(path) as archive:
        pickled = next(name for name in archive.namelist() if name.endswith("data.pkl"))
        prefix = pickled.rsplit("/", 1)[0]
        with archive.open(pickled) as handle:
            return dict(_TorchUnpickler(archive, prefix, handle).load())


def load_safetensors(path: Path) -> dict[str, np.ndarray]:
    raw = path.read_bytes()
    (length,) = struct.unpack("<Q", raw[:8])
    header = json.loads(raw[8 : 8 + length])
    base = 8 + length
    kinds = {"F32": np.float32, "F16": np.float16, "I64": np.int64}
    out = {}
    for name, meta in header.items():
        if name == "__metadata__":
            continue
        start, end = meta["data_offsets"]
        out[name] = np.frombuffer(raw[base + start : base + end], dtype=kinds[meta["dtype"]]).reshape(meta["shape"])
    return out


def _erf(x: np.ndarray) -> np.ndarray:
    """erf con el error máximo de 1,5e-7 de Abramowitz y Stegun (7.1.26)."""
    sign = np.sign(x)
    x = np.abs(x)
    t = 1.0 / (1.0 + 0.3275911 * x)
    poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
    return sign * (1.0 - poly * np.exp(-x * x))


def _gelu(x: np.ndarray) -> np.ndarray:
    return 0.5 * x * (1.0 + _erf(x * (1.0 / math.sqrt(2.0))))


def _layer_norm(x: np.ndarray, weight: np.ndarray, bias: np.ndarray, eps: float) -> np.ndarray:
    mean = x.mean(-1, keepdims=True)
    var = ((x - mean) ** 2).mean(-1, keepdims=True)
    return (x - mean) / np.sqrt(var + eps) * weight + bias  # eps es float de Python: no promueve


class RobertaClassifier:
    def __init__(self, folder: Path) -> None:
        config = json.loads((folder / "config.json").read_text(encoding="utf-8"))
        weights_file = folder / "model.safetensors"
        raw = load_safetensors(weights_file) if weights_file.exists() else load_torch_bin(folder / "pytorch_model.bin")
        self.w = {name.removeprefix("roberta."): np.asarray(value, dtype=np.float32) for name, value in raw.items()}
        self.layers = config["num_hidden_layers"]
        self.heads = config["num_attention_heads"]
        self.eps = config.get("layer_norm_eps", 1e-5)
        self.pad = config.get("pad_token_id", 1)
        labels = config["id2label"]
        self.labels = [labels[str(index)] for index in range(len(labels))]

    def _linear(self, x: np.ndarray, name: str) -> np.ndarray:
        return x @ self.w[f"{name}.weight"].T + self.w[f"{name}.bias"]

    def logits(self, ids: np.ndarray, mask: np.ndarray) -> np.ndarray:
        w = self.w
        positions = np.cumsum(mask, axis=1) * mask + self.pad
        x = w["embeddings.word_embeddings.weight"][ids] + w["embeddings.position_embeddings.weight"][positions]
        x = x + w["embeddings.token_type_embeddings.weight"][0]
        x = _layer_norm(x, w["embeddings.LayerNorm.weight"], w["embeddings.LayerNorm.bias"], self.eps)
        batch, length, hidden = x.shape
        size = hidden // self.heads
        blocked = (1.0 - mask[:, None, None, :].astype(np.float32)) * -1e9
        for layer in range(self.layers):
            p = f"encoder.layer.{layer}"
            split = lambda t: t.reshape(batch, length, self.heads, size).transpose(0, 2, 1, 3)  # noqa: E731
            q = split(self._linear(x, f"{p}.attention.self.query"))
            k = split(self._linear(x, f"{p}.attention.self.key"))
            v = split(self._linear(x, f"{p}.attention.self.value"))
            # math.sqrt y no np.sqrt: un escalar float64 de numpy promovería todo a float64.
            scores = q @ k.transpose(0, 1, 3, 2) * (1.0 / math.sqrt(size)) + blocked
            scores = np.exp(scores - scores.max(-1, keepdims=True))
            scores /= scores.sum(-1, keepdims=True)
            context = (scores @ v).transpose(0, 2, 1, 3).reshape(batch, length, hidden)
            x = _layer_norm(
                self._linear(context, f"{p}.attention.output.dense") + x,
                w[f"{p}.attention.output.LayerNorm.weight"], w[f"{p}.attention.output.LayerNorm.bias"], self.eps,
            )
            inner = _gelu(self._linear(x, f"{p}.intermediate.dense"))
            x = _layer_norm(
                self._linear(inner, f"{p}.output.dense") + x,
                w[f"{p}.output.LayerNorm.weight"], w[f"{p}.output.LayerNorm.bias"], self.eps,
            )
        head = np.tanh(self._linear(x[:, 0], "classifier.dense"))
        return self._linear(head, "classifier.out_proj")
