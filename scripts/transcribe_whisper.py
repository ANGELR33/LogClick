import argparse
import json

from faster_whisper import WhisperModel


def to_srt_time(seconds: float) -> str:
    ms = max(0, int(round(seconds * 1000.0)))
    h = ms // 3600000
    m = (ms % 3600000) // 60000
    s = (ms % 60000) // 1000
    milli = ms % 1000
    return f"{h:02d}:{m:02d}:{s:02d},{milli:03d}"


def build_srt(segments):
    lines = []
    idx = 1
    for seg in segments:
        text = (seg.get("text") or "").strip()
        if not text:
            continue
        lines.append(str(idx))
        lines.append(f"{to_srt_time(seg['start'])} --> {to_srt_time(seg['end'])}")
        lines.append(text)
        lines.append("")
        idx += 1
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--out_json", required=True)
    parser.add_argument("--out_srt", required=True)
    parser.add_argument("--model", default="small")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--compute_type", default="int8")
    parser.add_argument("--language", default="")
    args = parser.parse_args()

    def run_transcribe(model_name: str, word_timestamps: bool, vad_filter: bool):
        m = WhisperModel(model_name, device=args.device, compute_type=args.compute_type)
        language = args.language.strip() or None
        return m.transcribe(
            args.audio,
            language=language,
            word_timestamps=word_timestamps,
            vad_filter=vad_filter,
        )

    try:
        segments_iter, info = run_transcribe(args.model, word_timestamps=True, vad_filter=False)
    except Exception as e1:
        msg1 = str(e1).lower()

        class InfoFallback:
            language = "en"
            duration = 0.0

        if args.model != "base" and (("bad allocation" in msg1) or ("onnxruntime" in msg1) or ("runtimeexception" in msg1)):
            try:
                segments_iter, info = run_transcribe("base", word_timestamps=False, vad_filter=False)
            except Exception:
                segments_iter = []
                info = InfoFallback()
        else:
            # Fallback for empty audio bounds or unsupported formats
            segments_iter = []
            info = InfoFallback()

    segments = []
    for s in segments_iter:
        seg = {
            "start": float(s.start),
            "end": float(s.end),
            "text": s.text,
        }
        if getattr(s, "words", None):
            seg["words"] = [
                {
                    "start": float(w.start),
                    "end": float(w.end),
                    "text": w.word,
                }
                for w in s.words
                if w is not None
            ]
        segments.append(seg)

    payload = {
        "language": info.language,
        "duration": float(info.duration),
        "segments": segments,
    }

    with open(args.out_json, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    srt = build_srt(segments)
    with open(args.out_srt, "w", encoding="utf-8") as f:
        f.write(srt)


if __name__ == "__main__":
    main()
