"""Los clasificadores de pysentimiento corridos con onnxruntime.

pysentimiento importa PyTorch al cargarse, y en una máquina con Control de
aplicaciones de Windows la DLL de PyTorch queda bloqueada. Los mismos modelos
(RoBERTuito afinado por pysentimiento) existen convertidos a ONNX y corren con
onnxruntime, que sí carga. Aquí se replica el preprocesamiento de tuits de
pysentimiento —usuarios, enlaces, emojis a texto, risas y letras repetidas— para
que el modelo vea el texto como lo vio al entrenarse.

Cada modelo vive en `<carpeta>/<tarea>/` con `onnx/model_quantized.onnx`,
`tokenizer.json` y `config.json` (que trae `id2label`). Una tarea sin carpeta
se omite y su campo queda nulo: el resto del análisis sigue.

    sentimiento: Xenova/robertuito-sentiment-analysis (conversión de pysentimiento)
    emoción, ironía: pysentimiento/robertuito-{emotion-analysis,irony}, sus pesos
    de PyTorch leídos y corridos con numpy (`robertuito_numpy.py`).
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

import emoji
import numpy as np
import onnxruntime
from tokenizers import Tokenizer

MODELS = Path(os.environ.get("SOCIAL_MODELS", Path.home() / ".observatorio-social" / "models"))
MAX_TOKENS = 128
BATCH = 32

USER = re.compile(r"@[\w.]+")
URL = re.compile(r"https?://\S+|www\.\S+")
HASHTAG = re.compile(r"#(\w+)")
LAUGH = re.compile(r"\b(?:[ja]*j[ja]*a[ja]*|[je]*j[je]*e[je]*){3,}\b", re.IGNORECASE)
REPEATED = re.compile(r"(.)\1{3,}")
CAMEL = re.compile(r"(?<=[a-z])(?=[A-Z])")


def preprocess(text: str) -> str:
    """El preprocesamiento de `pysentimiento.preprocessing.preprocess_tweet` para español."""
    text = USER.sub("@usuario", text)
    text = URL.sub("url", text)
    text = HASHTAG.sub(lambda match: "hashtag " + CAMEL.sub(" ", match.group(1)), text)
    text = emoji.demojize(text, language="es", delimiters=(" emoji ", " emoji "))
    text = text.replace("_", " ")
    text = LAUGH.sub("jaja", text)
    text = REPEATED.sub(r"\1\1\1", text)
    return " ".join(text.split())


class OnnxTask:
    def __init__(self, folder: Path) -> None:
        # float32 si está (las conversiones propias), si no la cuantizada publicada.
        full = folder / "onnx" / "model.onnx"
        model = full if full.exists() else folder / "onnx" / "model_quantized.onnx"
        self.session = onnxruntime.InferenceSession(str(model))
        self.tokenizer = Tokenizer.from_file(str(folder / "tokenizer.json"))
        self.tokenizer.enable_truncation(MAX_TOKENS)
        self.tokenizer.enable_padding()
        labels = json.loads((folder / "config.json").read_text(encoding="utf-8"))["id2label"]
        self.labels = [labels[str(index)] for index in range(len(labels))]
        self.inputs = {item.name for item in self.session.get_inputs()}

    def predict(self, texts: list[str]) -> list[str]:
        out: list[str] = []
        for start in range(0, len(texts), BATCH):
            encoded = self.tokenizer.encode_batch([preprocess(text) for text in texts[start : start + BATCH]])
            feed = {
                "input_ids": np.array([item.ids for item in encoded], dtype=np.int64),
                "attention_mask": np.array([item.attention_mask for item in encoded], dtype=np.int64),
            }
            if "token_type_ids" in self.inputs:
                feed["token_type_ids"] = np.zeros_like(feed["input_ids"])
            logits = self.session.run(None, {key: value for key, value in feed.items() if key in self.inputs})[0]
            out += [self.labels[int(index)] for index in logits.argmax(axis=1)]
        return out


class NumpyTask:
    """La misma tarea por `robertuito_numpy`, para los modelos sin ONNX publicado."""

    def __init__(self, folder: Path) -> None:
        from robertuito_numpy import RobertaClassifier

        self.model = RobertaClassifier(folder)
        self.tokenizer = Tokenizer.from_file(str(folder / "tokenizer.json"))
        self.tokenizer.enable_truncation(MAX_TOKENS)
        self.tokenizer.enable_padding(pad_id=self.model.pad)
        self.labels = self.model.labels

    def predict(self, texts: list[str]) -> list[str]:
        out: list[str] = []
        for start in range(0, len(texts), 16):
            encoded = self.tokenizer.encode_batch([preprocess(text) for text in texts[start : start + 16]])
            ids = np.array([item.ids for item in encoded], dtype=np.int64)
            mask = np.array([item.attention_mask for item in encoded], dtype=np.int64)
            out += [self.labels[int(index)] for index in self.model.logits(ids, mask).argmax(axis=1)]
        return out


def load(task: str) -> OnnxTask | NumpyTask | None:
    folder = MODELS / task
    if (folder / "onnx" / "model.onnx").exists() or (folder / "onnx" / "model_quantized.onnx").exists():
        return OnnxTask(folder)
    if (folder / "pytorch_model.bin").exists() or (folder / "model.safetensors").exists():
        return NumpyTask(folder)
    return None


class Classifier:
    """Polaridad siempre; emoción e ironía cuando sus modelos están."""

    def __init__(self) -> None:
        self.sentiment = load("sentiment")
        if self.sentiment is None:
            raise SystemExit(f"falta el modelo de sentimiento en {MODELS / 'sentiment'}")
        self.emotion = load("emotion")
        self.irony = load("irony")
        self.name = "pysentimiento/robertuito en ONNX: " + ", ".join(
            task for task, model in (("sentiment", self.sentiment), ("emotion", self.emotion), ("irony", self.irony)) if model
        )

    def classify(self, texts: list[str]) -> list[dict]:
        if not texts:
            return []
        clipped = [text[:600] or "." for text in texts]
        polarity = self.sentiment.predict(clipped)
        emotion = self.emotion.predict(clipped) if self.emotion else [None] * len(texts)
        irony = self.irony.predict(clipped) if self.irony else [None] * len(texts)
        return [
            {"polarity": p, "emotion": e, "ironic": None if i is None else i.lower() == "ironic"}
            for p, e, i in zip(polarity, emotion, irony)
        ]
