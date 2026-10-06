"""Voz y pantalla de los lives, sin navegador y sin guardar audio ni imagen.

Lo lanza `collect-live.ts` y recibe órdenes por la entrada estándar, una por
línea en JSON:

    {"cmd": "start", "room": "<roomId>", "audio": "<flv ao>", "video": "<flv>"}
    {"cmd": "stop", "room": "<roomId>"}
    {"cmd": "quit"}

Por cada sala hay dos hilos:

- **voz**: abre la calidad `ao` (solo audio) con PyAV, la pasa a 16 kHz mono
  y entrega bloques de 30 s a la cola de transcripción. Granularidad máxima
  (decisión del 6-oct-2026): se transcribe TODO el audio, no muestras.
- **pantalla**: abre el video decodificando solo fotogramas clave y, cada
  `--frame-seconds`, lee el texto en pantalla (precios, carteles) con RapidOCR
  en ONNX.

El hilo principal transcribe con faster-whisper (CTranslate2, sin PyTorch:
PyTorch no carga en esta laptop) en la GPU, o en CPU int8 si la GPU no está.
Se guarda solo el texto con su hora en `speech/<sala>.jsonl` y
`screen/<sala>.jsonl`; el audio y los fotogramas viven en memoria.

PyAV 19 no es compatible con el `decode_audio` de faster-whisper
(`metadata_errors`), por eso el audio se decodifica aquí y se le pasa el arreglo.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import queue
import sys
import threading
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
for _bin in glob.glob(os.path.join(sys.prefix, "Lib", "site-packages", "nvidia", "*", "bin")):
    os.add_dll_directory(_bin)
    os.environ["PATH"] = _bin + os.pathsep + os.environ["PATH"]

import av  # noqa: E402
import numpy as np  # noqa: E402

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/141.0.0.0 Safari/537.36"
)
RATE = 16_000
CHUNK_SECONDS = 30


def emit(**event) -> None:
    sys.stdout.write(json.dumps(event, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def append(path: Path, row: dict) -> None:
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def open_stream(url: str):
    return av.open(
        url,
        options={"user_agent": UA, "rw_timeout": "20000000", "reconnect": "1"},
        timeout=25,
    )


class Room:
    def __init__(self, room: str, audio: str | None, video: str | None, out: Path, chunks: queue.Queue, args) -> None:
        self.room = room
        self.audio = audio
        self.video = video
        self.out = out
        self.chunks = chunks
        self.args = args
        self.stop = threading.Event()
        self.threads: list[threading.Thread] = []
        self.audio_seconds = 0.0
        self.frames = 0

    def start(self) -> None:
        if self.audio:
            self.threads.append(threading.Thread(target=self.listen, daemon=True))
        if self.video and self.args.frame_seconds > 0:
            self.threads.append(threading.Thread(target=self.look, daemon=True))
        for thread in self.threads:
            thread.start()

    def listen(self) -> None:
        assert self.audio
        failures = 0
        while not self.stop.is_set() and failures < 4:
            try:
                container = open_stream(self.audio)
                resampler = av.AudioResampler(format="s16", layout="mono", rate=RATE)
                buffer: list[np.ndarray] = []
                size = 0
                started = time.time()
                for frame in container.decode(audio=0):
                    if self.stop.is_set():
                        break
                    for out in resampler.resample(frame):
                        samples = out.to_ndarray().reshape(-1)
                        buffer.append(samples)
                        size += samples.size
                    if size >= CHUNK_SECONDS * RATE:
                        self.flush(buffer, started)
                        self.audio_seconds += size / RATE
                        buffer, size, started = [], 0, time.time()
                if size >= 2 * RATE:
                    self.flush(buffer, started)
                    self.audio_seconds += size / RATE
                container.close()
                failures = 0 if self.stop.is_set() else failures + 1
            except Exception as error:  # el stream se corta: se reintenta
                failures += 1
                emit(event="audio-error", room=self.room, error=str(error)[:200], failures=failures)
                time.sleep(5)

    def flush(self, buffer: list[np.ndarray], started: float) -> None:
        audio = np.concatenate(buffer).astype(np.float32) / 32768.0
        self.chunks.put((self.room, started, audio))

    def look(self) -> None:
        from rapidocr_onnxruntime import RapidOCR

        assert self.video
        engine = RapidOCR()
        previous: set[str] = set()
        failures = 0
        while not self.stop.is_set() and failures < 4:
            try:
                container = open_stream(self.video)
                stream = container.streams.video[0]
                stream.codec_context.skip_frame = "NONKEY"
                last = 0.0
                for frame in container.decode(stream):
                    if self.stop.is_set():
                        break
                    now = time.time()
                    if now - last < self.args.frame_seconds:
                        continue
                    last = now
                    width = 480
                    height = int(width * frame.height / max(frame.width, 1)) // 2 * 2
                    image = frame.reformat(width=width, height=height, format="rgb24").to_ndarray()
                    result, _ = engine(image)
                    self.frames += 1
                    lines = [
                        {"text": text.strip(), "score": round(float(score), 3)}
                        for _, text, score in (result or [])
                        if float(score) >= 0.6 and len(text.strip()) >= 2
                    ]
                    current = {line["text"] for line in lines}
                    if lines and current != previous:
                        append(self.out / "screen" / f"{self.room}.jsonl", {"t": int(now * 1000), "lines": lines})
                    previous = current
                container.close()
                failures = 0 if self.stop.is_set() else failures + 1
            except Exception as error:
                failures += 1
                emit(event="video-error", room=self.room, error=str(error)[:200], failures=failures)
                time.sleep(5)


def load_model(name: str):
    from faster_whisper import WhisperModel

    root = str(Path.home() / ".observatorio-social" / "whisper")
    try:
        return WhisperModel(name, device="cuda", compute_type="float16", download_root=root), "cuda"
    except Exception as error:
        emit(event="gpu-unavailable", error=str(error)[:200])
        return WhisperModel(name, device="cpu", compute_type="int8", download_root=root), "cpu"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--model", default="small")
    parser.add_argument("--frame-seconds", type=float, default=10.0)
    args = parser.parse_args()
    out = Path(args.out)
    (out / "speech").mkdir(parents=True, exist_ok=True)
    (out / "screen").mkdir(parents=True, exist_ok=True)

    model, device = load_model(args.model)
    emit(event="ready", model=args.model, device=device)
    chunks: queue.Queue = queue.Queue()
    rooms: dict[str, Room] = {}
    quit_flag = threading.Event()

    def commands() -> None:
        for raw in sys.stdin:
            try:
                order = json.loads(raw)
            except json.JSONDecodeError:
                continue
            room = str(order.get("room", ""))
            if order.get("cmd") == "start" and room and room not in rooms:
                rooms[room] = Room(room, order.get("audio"), order.get("video"), out, chunks, args)
                rooms[room].start()
                emit(event="started", room=room)
            elif order.get("cmd") == "stop" and room in rooms:
                current = rooms.pop(room)
                current.stop.set()
                emit(event="stopped", room=room, audioSeconds=round(current.audio_seconds), frames=current.frames)
            elif order.get("cmd") == "quit":
                break
        for current in rooms.values():
            current.stop.set()
        quit_flag.set()

    threading.Thread(target=commands, daemon=True).start()
    while not (quit_flag.is_set() and chunks.empty()):
        try:
            room, started, audio = chunks.get(timeout=1)
        except queue.Empty:
            continue
        clock = time.time()
        segments, _ = model.transcribe(audio, language="es", vad_filter=True, beam_size=5)
        for segment in segments:
            text = segment.text.strip()
            if not text:
                continue
            append(
                out / "speech" / f"{room}.jsonl",
                {
                    "t0": int((started + segment.start) * 1000),
                    "t1": int((started + segment.end) * 1000),
                    "text": text,
                    "logprob": round(segment.avg_logprob, 3),
                    "noSpeech": round(segment.no_speech_prob, 3),
                },
            )
        emit(event="chunk", room=room, seconds=round(audio.size / RATE), took=round(time.time() - clock, 2), queued=chunks.qsize())
    emit(event="bye")


if __name__ == "__main__":
    main()
