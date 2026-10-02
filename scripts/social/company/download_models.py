"""Deja listos los tres modelos de pysentimiento en la carpeta que lee `sentiment_onnx.py`.

- Polaridad: `Xenova/robertuito-sentiment-analysis`, la conversión a ONNX de
  `pysentimiento/robertuito-sentiment-analysis` publicada por el autor de
  transformers.js.
- Emoción e ironía: `pysentimiento/robertuito-{emotion-analysis,irony}` sólo se
  publican en PyTorch. Se bajan sus pesos y `export_robertuito_onnx.py` los
  convierte a ONNX sin PyTorch, verificando contra la cuenta de numpy.

    python scripts/social/company/download_models.py
"""

from huggingface_hub import hf_hub_download

from export_robertuito_onnx import export
from sentiment_onnx import MODELS

POLARITY = ["config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "onnx/model_quantized.onnx"]
for name in POLARITY:
    hf_hub_download("Xenova/robertuito-sentiment-analysis", name, local_dir=str(MODELS / "sentiment"))

for repo, task in (("pysentimiento/robertuito-emotion-analysis", "emotion"), ("pysentimiento/robertuito-irony", "irony")):
    for name in ("config.json", "tokenizer.json", "pytorch_model.bin"):
        hf_hub_download(repo, name, local_dir=str(MODELS / task))
    export(task, verify=True)

print(f"modelos en {MODELS}")
