import json
import os
import re
import selectors
import subprocess
import sys
import time
import numpy as np
from faster_whisper import WhisperModel

MODEL_NAME = os.environ.get("IRISTV_WHISPER_MODEL", "small")
SAMPLE_RATE = 16000
TAIL_SECONDS = 2.2
MAX_TAIL_SAMPLES = int(SAMPLE_RATE * TAIL_SECONDS)
BATCH_MIN_SECONDS = 3.6
BATCH_WAIT_SECONDS = 2.3

HALLUCINATIONS = (
    "obrigado por assistir",
    "obrigada por assistir",
    "legendas pela comunidade",
    "legendas por",
    "subtitles by",
    "amara.org",
    "inscreva-se no canal",
    "thank you for watching",
    "thanks for watching",
    "tchau",
    "mbc",
)


def emit(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def load_model():
    try:
        return WhisperModel(MODEL_NAME, device="cpu", compute_type="int8", cpu_threads=6, local_files_only=True)
    except Exception:
        return WhisperModel(MODEL_NAME, device="cpu", compute_type="int8", cpu_threads=6)


def run_ffmpeg_pcm(input_args, input_bytes=None):
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel", "error",
        *input_args,
        "-map", "0:a:0?",
        "-vn",
        "-af", "highpass=f=80",
        "-ac", "1",
        "-ar", str(SAMPLE_RATE),
        "-f", "s16le",
        "pipe:1",
    ]
    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE if input_bytes is not None else subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    pcm, _ = proc.communicate(input=input_bytes)
    if not pcm:
        return np.zeros(0, dtype=np.float32)
    return np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0


def decode_bytes_to_pcm(raw_bytes):
    return run_ffmpeg_pcm(["-i", "pipe:0"], input_bytes=raw_bytes)


def decode_vod_window_to_pcm(url, ss, duration):
    return run_ffmpeg_pcm([
        "-ss", f"{max(0.0, float(ss)):.2f}",
        "-t", f"{max(1.0, float(duration)):.2f}",
        "-i", url,
    ])


def normalize_lang(raw_lang):
    if not raw_lang or raw_lang in ("auto", "undefined", "null"):
        return None
    return str(raw_lang).strip().lower()[:4] or None


def is_hallucination(text):
    low = re.sub(r"[^\w\s]", "", text.lower()).strip()
    if not low or len(low) < 2:
        return True
    return any(h in low for h in HALLUCINATIONS)


def polish_text(text):
    t = re.sub(r"\s+", " ", text).strip()
    t = re.sub(r"(?:\.{2,}|…)+$", "", t).strip()
    t = re.sub(r"\s*(?:\.{2,}|…)+\s*", ", ", t).strip()
    t = re.sub(r"\s+([,.;:!?])", r"\1", t)
    t = re.sub(r"^[,.;:\-\s]+", "", t).strip()
    return t


def norm_word(w):
    return re.sub(r"[^\w]", "", w.lower())


def strip_word_overlap(recent_words, text, expected_ratio=0.0):
    """Remove words already emitted in previous chunk by matching suffix/anchor anywhere in text."""
    if not recent_words or not text:
        return text, 0.0
    words = text.split()
    if len(words) < 2:
        return text, 0.0
    norm_new = [norm_word(w) for w in words]

    # 1. Exact k-word suffix match anywhere in the newly transcribed segment
    max_k = min(len(recent_words), len(words), 8)
    for k in range(max_k, 1, -1):
        suffix = recent_words[-k:]
        for idx in range(len(norm_new) - k, -1, -1):
            if norm_new[idx : idx + k] == suffix:
                cut = idx + k
                return " ".join(words[cut:]).strip(), float(cut) / float(len(words))

    # 2. Fallback: distinctive anchor word (>= 4 chars) near expected overlap boundary
    exp_idx = int(round(expected_ratio * len(words)))
    for w_prev in reversed(recent_words[-5:]):
        if len(w_prev) < 4:
            continue
        best_idx = -1
        best_dist = 5
        for idx, w_cur in enumerate(norm_new):
            if w_cur == w_prev and abs(idx - exp_idx) < best_dist:
                best_dist = abs(idx - exp_idx)
                best_idx = idx
        if best_idx != -1:
            cut = best_idx + 1
            return " ".join(words[cut:]).strip(), float(cut) / float(len(words))

    return text, 0.0


def split_clean_cues(abs_start, abs_end, text, max_chars=66):
    text = polish_text(text)
    if not text or is_hallucination(text):
        return []
    dur = max(0.5, abs_end - abs_start)
    if len(text) <= max_chars:
        return [{"start": round(abs_start, 3), "end": round(abs_end, 3), "text": text}]

    # Prefer splitting on sentence boundaries or commas near the middle
    parts = []
    cur = text
    while len(cur) > max_chars:
        mid = len(cur) // 2
        best_idx = -1
        best_dist = 99999
        for m in re.finditer(r"([.!?]|[,;])\s+", cur):
            idx = m.end()
            if 18 <= idx <= len(cur) - 12:
                weight = 0 if m.group(1) in ".!?" else 10
                dist = abs(idx - mid) + weight
                if dist < best_dist:
                    best_dist = dist
                    best_idx = idx
        if best_idx == -1:
            space_left = cur.rfind(" ", 18, max_chars)
            best_idx = space_left + 1 if space_left > 18 else max_chars
        parts.append(cur[:best_idx].strip())
        cur = cur[best_idx:].strip()
    if cur:
        parts.append(cur)

    total_chars = max(1, sum(len(p) for p in parts))
    out = []
    t = abs_start
    for idx, p in enumerate(parts):
        frac = len(p) / total_chars
        chunk_dur = (abs_end - t) if idx == len(parts) - 1 else max(0.45, dur * frac)
        out.append({
            "start": round(t, 3),
            "end": round(t + chunk_dur, 3),
            "text": polish_text(p),
        })
        t += chunk_dur
    return [c for c in out if c["text"] and not is_hallucination(c["text"])]


def main():
    if "--daemon" not in sys.argv:
        emit({"error": "Use --daemon mode"})
        sys.exit(1)

    emit({"status": "loading", "text": f"Carregando modelo Whisper {MODEL_NAME}..."})
    model = load_model()
    emit({"status": "ready", "text": "Legendas sincronizadas prontas"})

    class PipeReader:
        """Buffered non-blocking-aware reader over sys.stdin fd."""

        def __init__(self, fd):
            self.fd = fd
            self.buf = bytearray()
            self.eof = False
            self.sel = selectors.DefaultSelector()
            self.sel.register(fd, selectors.EVENT_READ)

        def wait_ready(self, timeout):
            if self.buf or self.eof:
                return True
            return bool(self.sel.select(timeout=timeout))

        def _fill(self):
            chunk = os.read(self.fd, 65536)
            if not chunk:
                self.eof = True
                return False
            self.buf.extend(chunk)
            return True

        def readline(self):
            while True:
                idx = self.buf.find(b"\n")
                if idx != -1:
                    line = bytes(self.buf[: idx + 1])
                    del self.buf[: idx + 1]
                    return line
                if not self._fill():
                    if self.buf:
                        line = bytes(self.buf)
                        self.buf.clear()
                        return line
                    return b""

        def read_exact(self, n):
            while len(self.buf) < n:
                if not self._fill():
                    out = bytes(self.buf)
                    self.buf.clear()
                    return out
            out = bytes(self.buf[:n])
            del self.buf[:n]
            return out

    reader = PipeReader(sys.stdin.fileno())

    state = {
        "session": None,
        "last_seq": None,
        "expected_next_start": None,
        "tail": np.zeros(0, dtype=np.float32),
        "prompt": "",
        "recent_words": [],
        "emitted_any": False,
    }

    def reset_state(session_id=None):
        state["session"] = session_id
        state["last_seq"] = None
        state["expected_next_start"] = None
        state["tail"] = np.zeros(0, dtype=np.float32)
        state["prompt"] = ""
        state["recent_words"] = []
        state["emitted_any"] = False

    def read_next_job(timeout=None):
        if timeout is not None and not reader.wait_ready(timeout):
            return None
        header_line = reader.readline()
        if not header_line:
            return "EOF"
        raw_line = header_line.decode("utf-8", "replace").strip()
        if not raw_line:
            return None
        try:
            job = json.loads(raw_line)
        except Exception:
            return None
        if job.get("cmd") == "segment":
            byte_len = int(job.get("byte_len") or 0)
            payload = reader.read_exact(byte_len) if byte_len > 0 else b""
            if len(payload) < byte_len:
                return "EOF"
            job["_payload"] = payload
        return job

    def transcribe_batch(batch_samples, batch_start, batch_seq, session, lang_arg, is_contiguous):
        dur_sec = len(batch_samples) / float(SAMPLE_RATE)
        rms = float(np.sqrt(np.mean(batch_samples * batch_samples)))
        if rms < 0.0025:
            state["tail"] = np.concatenate([state["tail"], batch_samples])[-MAX_TAIL_SAMPLES:]
            state["last_seq"] = batch_seq
            state["expected_next_start"] = batch_start + dur_sec
            emit({"status": "cues", "session": session, "seq": batch_seq, "lang": lang_arg or "auto", "cues": []})
            return

        if is_contiguous and len(state["tail"]) > 0:
            prefix_samples = state["tail"]
            prefix_sec = len(prefix_samples) / float(SAMPLE_RATE)
            full_audio = np.concatenate([prefix_samples, batch_samples])
        else:
            prefix_sec = 0.0
            full_audio = batch_samples
            state["prompt"] = ""
            state["recent_words"] = []

        beam = 2
        prompt_to_use = state["prompt"] if state["prompt"].endswith((".", "!", "?")) else None
        try:
            segs, info = model.transcribe(
                full_audio,
                language=lang_arg,
                beam_size=beam,
                best_of=beam,
                temperature=0.0,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 280, "speech_pad_ms": 180},
                condition_on_previous_text=False,
                initial_prompt=prompt_to_use,
                word_timestamps=False,
                no_speech_threshold=0.60,
                compression_ratio_threshold=2.2,
            )
            seg_list = list(segs)
        except Exception as exc:
            emit({"status": "error", "session": session, "text": str(exc)})
            return

        cues = []
        new_texts = []
        for seg in seg_list:
            s_start = float(seg.start)
            s_end = float(seg.end)
            s_text = polish_text(seg.text or "")
            if not s_text or s_end <= prefix_sec + 0.10:
                continue

            if s_start < prefix_sec:
                cut_ratio = min(0.85, max(0.0, (prefix_sec - s_start) / max(0.25, s_end - s_start)))
                trimmed, overlap_ratio = strip_word_overlap(state["recent_words"], s_text, cut_ratio)
                if overlap_ratio > 0.0:
                    if not trimmed:
                        continue
                    s_text = trimmed
                    s_start = max(prefix_sec, s_start + (s_end - s_start) * overlap_ratio)
                else:
                    words = s_text.split()
                    drop_n = max(0, int(len(words) * cut_ratio) - 1)
                    if drop_n >= len(words):
                        continue
                    s_text = " ".join(words[drop_n:]).strip()
                    s_start = prefix_sec

            abs_s = batch_start + max(0.0, s_start - prefix_sec)
            abs_e = batch_start + max(0.25, s_end - prefix_sec)
            seg_cues = split_clean_cues(abs_s, abs_e, s_text)
            if seg_cues:
                cues.extend(seg_cues)
                new_texts.append(s_text)

        if cues:
            full_batch_text = polish_text(" ".join(new_texts))
            state["prompt"] = (state["prompt"] + " " + full_batch_text).strip()[-160:]
            words_norm = [norm_word(w) for w in full_batch_text.split() if norm_word(w)]
            state["recent_words"] = (state["recent_words"] + words_norm)[-16:]
            state["emitted_any"] = True

        state["tail"] = full_audio[-MAX_TAIL_SAMPLES:]
        state["last_seq"] = batch_seq
        state["expected_next_start"] = batch_start + dur_sec

        emit({
            "status": "cues",
            "session": session,
            "seq": batch_seq,
            "lang": getattr(info, "language", None) or lang_arg or "auto",
            "cues": cues,
        })

    queued_job = None
    while True:
        job = queued_job if queued_job is not None else read_next_job(timeout=None)
        queued_job = None
        if job == "EOF":
            break
        if not job:
            continue

        cmd = job.get("cmd")
        session = job.get("session")
        if cmd == "reset":
            reset_state(session)
            continue
        if session != state["session"]:
            reset_state(session)

        lang_arg = normalize_lang(job.get("lang"))

        if cmd == "segment":
            seq = int(job.get("seq") or 0)
            base_start = float(job.get("start") or 0.0)
            samples = decode_bytes_to_pcm(job.get("_payload") or b"")
            if len(samples) < int(SAMPLE_RATE * 0.25):
                continue

            is_contiguous = (
                state["last_seq"] is not None
                and seq == state["last_seq"] + 1
                and state["expected_next_start"] is not None
                and abs(base_start - state["expected_next_start"]) <= 0.85
            )

            batch_chunks = [samples]
            batch_dur = len(samples) / float(SAMPLE_RATE)
            batch_end_seq = seq
            expected_next = base_start + batch_dur

            # Coalesce short 2s segments into ~4s+ windows so `small` runs 1.7x-2.4x faster than real-time
            wait_budget = BATCH_WAIT_SECONDS if state["emitted_any"] else 0.45
            deadline = time.monotonic() + wait_budget
            while batch_dur < BATCH_MIN_SECONDS:
                rem = deadline - time.monotonic()
                if rem <= 0:
                    break
                nxt = read_next_job(timeout=rem)
                if nxt == "EOF":
                    queued_job = "EOF"
                    break
                if nxt is None:
                    continue
                if nxt.get("cmd") != "segment" or nxt.get("session") != session:
                    queued_job = nxt
                    break
                nseq = int(nxt.get("seq") or 0)
                nstart = float(nxt.get("start") or 0.0)
                if nseq != batch_end_seq + 1 or abs(nstart - expected_next) > 0.85:
                    queued_job = nxt
                    break
                nsamples = decode_bytes_to_pcm(nxt.get("_payload") or b"")
                if len(nsamples) < int(SAMPLE_RATE * 0.2):
                    batch_end_seq = nseq
                    continue
                batch_chunks.append(nsamples)
                ndur = len(nsamples) / float(SAMPLE_RATE)
                batch_dur += ndur
                expected_next = nstart + ndur
                batch_end_seq = nseq

            combined = np.concatenate(batch_chunks) if len(batch_chunks) > 1 else batch_chunks[0]
            transcribe_batch(combined, base_start, batch_end_seq, session, lang_arg, is_contiguous)

        elif cmd == "vod":
            url = job.get("url") or ""
            ss = float(job.get("ss") or 0.0)
            dur = float(job.get("duration") or 8.0)
            samples = decode_vod_window_to_pcm(url, ss, dur)
            if len(samples) < int(SAMPLE_RATE * 0.4):
                emit({"status": "cues", "session": session, "lang": lang_arg or "auto", "cues": []})
                continue
            try:
                segs, info = model.transcribe(
                    samples,
                    language=lang_arg,
                    beam_size=2,
                    best_of=2,
                    temperature=(0.0, 0.2),
                    vad_filter=True,
                    vad_parameters={"min_silence_duration_ms": 280, "speech_pad_ms": 180},
                    condition_on_previous_text=False,
                    word_timestamps=False,
                    no_speech_threshold=0.60,
                )
                cues = []
                for s in segs:
                    cues.extend(split_clean_cues(ss + float(s.start), ss + float(s.end), s.text or ""))
            except Exception as exc:
                emit({"status": "error", "session": session, "text": str(exc)})
                continue
            emit({
                "status": "cues",
                "session": session,
                "lang": getattr(info, "language", None) or lang_arg or "auto",
                "cues": cues,
            })


if __name__ == "__main__":
    main()
