import argparse
import json
import math
import wave


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--scenes", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--audio", default="")
    parser.add_argument("--viral", default="")
    parser.add_argument("--max-clips", type=int, default=8)
    parser.add_argument("--min-len", type=float, default=6.0)
    parser.add_argument("--max-len", type=float, default=60.0)
    parser.add_argument("--target-len", type=float, default=22.0)
    args = parser.parse_args()

    with open(args.scenes, "r", encoding="utf-8") as f:
        scenes = json.load(f).get("scenes", [])

    audio_path = (args.audio or "").strip() or None

    wav = None
    if audio_path:
        try:
            wav = wave.open(audio_path, "rb")
        except Exception:
            wav = None

    def audio_rms(start_s: float, end_s: float) -> float:
        if not wav:
            return 0.0
        try:
            sr = wav.getframerate()
            channels = wav.getnchannels()
            sampwidth = wav.getsampwidth()
            if sampwidth != 2:
                return 0.0
            start_i = max(0, int(start_s * sr))
            end_i = max(start_i, int(end_s * sr))
            n = min(end_i - start_i, int(sr * 60))
            if n <= 0:
                return 0.0
            wav.setpos(start_i)
            frames = wav.readframes(n)
            if not frames:
                return 0.0
            step = 2 * channels
            acc = 0.0
            count = 0
            for i in range(0, len(frames) - 1, step):
                v = int.from_bytes(frames[i : i + 2], byteorder="little", signed=True)
                acc += float(v) * float(v)
                count += 1
            if count == 0:
                return 0.0
            return math.sqrt(acc / count) / 32768.0
        except Exception:
            return 0.0

    viral_segments = []
    if args.viral:
        try:
            with open(args.viral, "r", encoding="utf-8") as f:
                viral_segments = json.load(f).get("segments", [])
        except Exception:
            viral_segments = []

    def viral_bonus(start_s: float, end_s: float) -> tuple[float, str]:
        best_bonus = 0.0
        best_reason = ""
        for vs in viral_segments:
            # Check overlap
            overlap_start = max(start_s, vs["start"])
            overlap_end = min(end_s, vs["end"])
            overlap_dur = overlap_end - overlap_start
            if overlap_dur > 2.0:  # Significant overlap
                bonus = float(vs.get("viral_score", 0)) * (overlap_dur / (vs["end"] - vs["start"]))
                if bonus > best_bonus:
                    best_bonus = bonus
                    best_reason = vs.get("reason", "")
        return best_bonus, best_reason

    clips = []
    for s in scenes:
        start = float(s["start"])
        end = float(s["end"])
        dur = end - start
        if dur < args.min_len:
            continue

        max_end = min(end, start + args.max_len)
        cur = start
        while cur < max_end - args.min_len + 1e-6:
            seg_end = min(max_end, cur + args.target_len)
            seg_dur = seg_end - cur
            if seg_dur < args.min_len:
                break
            rms = audio_rms(cur, seg_end)
            v_bonus, v_reason = viral_bonus(cur, seg_end)
            score = (seg_dur * 0.35) + (rms * 3.0) + (v_bonus * 2.0)
            clips.append({
                "start": cur, 
                "end": seg_end, 
                "score": score, 
                "rms": rms, 
                "viral_score": v_bonus,
                "reason": v_reason
            })
            cur = seg_end

    clips.sort(key=lambda c: c["score"], reverse=True)
    clips = clips[: args.max_clips]
    clips.sort(key=lambda c: c["start"])

    if wav:
        try:
            wav.close()
        except Exception:
            pass

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump({"clips": clips}, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
