import argparse
import json
import os
import subprocess


def to_ass_time(seconds: float) -> str:
    cs = max(0, int(round(seconds * 100.0)))
    h = cs // 360000
    m = (cs % 360000) // 6000
    s = (cs % 6000) // 100
    c = cs % 100
    return f"{h}:{m:02d}:{s:02d}.{c:02d}"


def ass_escape(text: str) -> str:
    return (text or "").replace("\\", "\\\\").replace("{", "(").replace("}", ")").replace("\n", "\\N")


def build_ass(play_res_x: int, play_res_y: int, lines: list[dict], style_name: str = "opus") -> str:
    # Default is the Opus style
    style_def = "Style: Default,Arial,65,&H0000FFFF,&H0000FFFF,&H00000000,&H7F000000,-1,0,0,0,100,100,0,0,1,3,2,2,30,30,130,1"
    
    if style_name == "clean":
        style_def = "Style: Default,Helvetica,55,&H00FFFFFF,&H00FFFFFF,&H00000000,&H7F000000,-1,0,0,0,100,100,0,0,1,2,1,2,30,30,90,1"
    elif style_name == "neon":
        # Cyan color
        style_def = "Style: Default,Arial,60,&H00FFFF00,&H00FFFF00,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,2,30,30,140,1"

    header = "\n".join(
        [
            "[Script Info]",
            "ScriptType: v4.00+",
            "WrapStyle: 1",
            f"PlayResX: {play_res_x}",
            f"PlayResY: {play_res_y}",
            "ScaledBorderAndShadow: yes",
            "",
            "[V4+ Styles]",
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
            style_def,
            "",
            "[Events]",
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
        ]
    )

    ev = []
    for ln in lines:
        start = to_ass_time(float(ln["start"]))
        end = to_ass_time(float(ln["end"]))
        text = str(ln.get("text") or "").strip()
        
        # In opus/neon style we uppercase for impact
        if style_name in ["opus", "neon"]:
            text = text.upper()
            
        text = ass_escape(text)
        if not text:
            continue
        
        # Effects
        if style_name == "clean":
            text = "{\\fad(150,150)}" + text
        elif style_name == "neon":
            text = "{\\t(0,100,\\fscx105\\fscy105)\\t(100,200,\\fscx100\\fscy100)}" + text
        else: # opus
            text = "{\\t(0,80,\\fscx115\\fscy115)\\t(80,200,\\fscx100\\fscy100)}" + text
            
        ev.append(f"Dialogue: 0,{start},{end},Default,,0,0,0,,{text}")

    return header + "\n" + "\n".join(ev) + "\n"


def run(cmd):
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, shell=False)
    if p.returncode != 0:
        raise RuntimeError(p.stderr)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--clips", required=True)
    parser.add_argument("--outdir", required=True)
    parser.add_argument("--mode", default="shorts")
    parser.add_argument("--captions_json", default="")
    args = parser.parse_args()

    os.makedirs(args.outdir, exist_ok=True)

    with open(args.clips, "r", encoding="utf-8") as f:
        clips_data = json.load(f)
        clips = clips_data.get("clips", [])
        subtitle_style = clips_data.get("subtitleStyle", "opus")

    captions = None
    captions_path = (args.captions_json or "").strip() or None
    if captions_path and os.path.exists(captions_path):
        try:
            with open(captions_path, "r", encoding="utf-8") as f:
                captions = json.load(f)
        except Exception:
            captions = None

    segments = []
    if isinstance(captions, dict):
        segs = captions.get("segments")
        if isinstance(segs, list):
            for s in segs:
                try:
                    segments.append(
                        {
                            "start": float(s.get("start")),
                            "end": float(s.get("end")),
                            "text": str(s.get("text") or "").strip(),
                        }
                    )
                except Exception:
                    pass

    for i, c in enumerate(clips, start=1):
        start_s = float(c["start"])
        end_s = float(c["end"])
        start = str(start_s)
        end = str(end_s)
        out = os.path.join(args.outdir, f"clip_{i:02d}.mp4")
        thumb = os.path.join(args.outdir, f"clip_{i:02d}.jpg")

        vf_parts = []
        play_res_x, play_res_y = 720, 1280
        if args.mode == "shorts":
            vf_parts.append("crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=720:1280")
        else:
            play_res_x, play_res_y = 1280, 720

        ass_path = None
        if segments:
            local_lines = []
            for s in segments:
                s0 = max(start_s, s["start"])
                s1 = min(end_s, s["end"])
                if s1 <= s0:
                    continue
                local_lines.append({"start": s0 - start_s, "end": s1 - start_s, "text": s["text"]})
            if local_lines:
                ass_path = os.path.join(args.outdir, f"clip_{i:02d}.ass")
                with open(ass_path, "w", encoding="utf-8") as f:
                    f.write(build_ass(play_res_x, play_res_y, local_lines, subtitle_style))
                ass_path_ff = ass_path.replace("\\", "/").replace(":", "\\:")
                ass_path_ff = ass_path_ff.replace("'", "\\'")
                vf_parts.append(f"ass=filename='{ass_path_ff}'")

        cmd = [
            "ffmpeg",
            "-y",
            "-ss",
            start,
            "-to",
            end,
            "-i",
            args.input,
            "-vf",
            ",".join(vf_parts) if vf_parts else "null",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "16",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            out,
        ]

        run(cmd)

        run([
            "ffmpeg",
            "-y",
            "-ss",
            "0",
            "-i",
            out,
            "-vframes",
            "1",
            "-q:v",
            "3",
            "-strict",
            "-2",
            thumb,
        ])


if __name__ == "__main__":
    main()
