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


def build_ass(play_res_x: int, play_res_y: int, lines: list[dict], style_name: str = "opus", watermark: bool = False) -> str:
    # Default is the Opus style
    style_def = "Style: Default,Arial,65,&H0000FFFF,&H0000FFFF,&H00000000,&H7F000000,-1,0,0,0,100,100,0,0,1,3,2,2,30,30,130,1"
    
    if style_name == "clean":
        style_def = "Style: Default,Helvetica,55,&H00FFFFFF,&H00FFFFFF,&H00000000,&H7F000000,-1,0,0,0,100,100,0,0,1,2,1,2,30,30,90,1"
    elif style_name == "neon":
        style_def = "Style: Default,Arial,60,&H00FFFF00,&H00FFFF00,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,2,30,30,140,1"
    elif style_name == "boxed":
        style_def = "Style: Default,Arial,60,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,3,0,0,2,30,30,130,1"
    elif style_name == "karaoke_yellow" or style_name == "karaoke":
        # Base: White, Highlight: Yellow, Font: Arial Black
        style_def = "Style: Default,Arial Black,62,&H00FFFFFF,&H00FFFFFF,&H00000000,&H7F000000,-1,0,0,0,100,100,0,0,1,4,3,2,30,30,130,1"
    elif style_name == "karaoke_cyan":
        # Base: Light Cyan, Highlight: Cyan, Font: Verdana (Bold)
        style_def = "Style: Default,Verdana,58,&H00FFF0F0,&H00FFF0F0,&H00000000,&H7F000000,-1,0,0,0,100,100,0,0,1,3,2,2,30,30,130,1"
    elif style_name == "karaoke_green":
        # Base: Light Green, Highlight: Green, Font: Impact
        style_def = "Style: Default,Impact,65,&H00D0FFD0,&H00D0FFD0,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,3,0,2,30,30,130,1"
    elif style_name == "karaoke_magenta":
        # Base: Light Pink, Highlight: Magenta, Font: Comic Sans MS (Bold)
        style_def = "Style: Default,Comic Sans MS,60,&H00FFE0FF,&H00FFE0FF,&H00000000,&H7F000000,-1,0,0,0,100,100,0,0,1,3,3,2,30,30,130,1"

    if watermark:
        style_def += "\nStyle: Watermark,Segoe Script,38,&HC0FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,0,0,9,30,30,30,1"

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

    import math
    MAX_WORDS = 4

    flattened_lines = []
    for ln in lines:
        start_t = float(ln["start"])
        end_t = float(ln["end"])
        raw_text = str(ln.get("text") or "").strip()
        words = ln.get("words", [])
        
        if len(raw_text.split()) <= MAX_WORDS:
            flattened_lines.append({"start": start_t, "end": end_t, "text": raw_text, "words": words})
            continue

        if words:
            current_chunk = []
            for w in words:
                current_chunk.append(w)
                if len(current_chunk) >= MAX_WORDS or w.get("text", "").strip()[-1:] in ".?!":
                    ctext = "".join([cw.get("text", "") for cw in current_chunk]).strip()
                    cstart = max(start_t, float(current_chunk[0].get("start", start_t)))
                    cend = min(end_t, float(current_chunk[-1].get("end", end_t)))
                    flattened_lines.append({
                        "start": cstart, "end": cend, "text": ctext, "words": current_chunk
                    })
                    current_chunk = []
            if current_chunk:
                ctext = "".join([cw.get("text", "") for cw in current_chunk]).strip()
                cstart = max(start_t, float(current_chunk[0].get("start", start_t)))
                cend = min(end_t, float(current_chunk[-1].get("end", end_t)))
                flattened_lines.append({
                    "start": cstart, "end": cend, "text": ctext, "words": current_chunk
                })
        else:
            tokens = raw_text.split()
            total_chars = sum(len(t) for t in tokens)
            dur = end_t - start_t
            current_chunk = []
            chunk_chars = 0
            curr_start = start_t
            for i, token in enumerate(tokens):
                current_chunk.append(token)
                chunk_chars += len(token)
                if len(current_chunk) >= MAX_WORDS or token[-1:] in ".?!":
                    fraction = chunk_chars / total_chars if total_chars > 0 else 0
                    curr_end = curr_start + (fraction * dur)
                    if i == len(tokens) - 1: curr_end = end_t
                    flattened_lines.append({
                        "start": curr_start, "end": curr_end, "text": " ".join(current_chunk), "words": []
                    })
                    curr_start = curr_end
                    current_chunk = []
                    chunk_chars = 0
            if current_chunk:
                flattened_lines.append({
                    "start": curr_start, "end": end_t, "text": " ".join(current_chunk), "words": []
                })

    ev = []
    for ln in flattened_lines:
        start_t = float(ln["start"])
        end_t = float(ln["end"])
        raw_text = str(ln.get("text") or "").strip()
        words = ln.get("words", [])
        if not raw_text:
            continue
            
        if style_name.startswith("karaoke") and words:
            highlight_color = "&H00FFFF&" # default yellow
            anim_tag = "\\t(0,50,\\fscx105\\fscy105)\\t(50,200,\\fscx100\\fscy100)"
            if style_name == "karaoke_cyan": 
                highlight_color = "&HFFFF00&"
                anim_tag = "\\t(0,40,\\fscx110\\fscy110)\\t(40,150,\\fscx100\\fscy100)" 
            elif style_name == "karaoke_green": 
                highlight_color = "&H00FF00&"
                anim_tag = "\\t(0,60,\\fscx108\\fscy108)\\t(60,200,\\fscx100\\fscy100)"
            elif style_name == "karaoke_magenta": 
                highlight_color = "&HFF00FF&"
                anim_tag = "\\t(0,30,\\fscx115\\fscy115)\\t(30,100,\\fscx100\\fscy100)"

            full_text_parts = [ass_escape(w.get("text", "").strip().upper()) for w in words]
            mid = math.ceil(len(full_text_parts) / 2) if len(full_text_parts) > 2 else len(full_text_parts)
            for i, w in enumerate(words):
                w_start = max(start_t, float(w.get("start", start_t)))
                w_end = min(end_t, float(w.get("end", end_t)))
                
                if i == 0: w_start = start_t
                if i == len(words) - 1: w_end = end_t
                if i > 0 and float(words[i-1].get("end", start_t)) < w_start: w_start = float(words[i-1].get("end", start_t))
                    
                if w_end <= w_start: continue
                    
                colored_text = ""
                for j, part in enumerate(full_text_parts):
                    if j == mid and mid > 0 and mid < len(full_text_parts):
                        colored_text = colored_text.strip() + "\\N"
                    if j == i:
                        colored_text += f"{{{anim_tag}\\c{highlight_color}}}" + part + "{\\fscx100\\fscy100\\c} "
                    else:
                        colored_text += part + " "
                
                colored_text = colored_text.strip()
                t_s = to_ass_time(w_start)
                t_e = to_ass_time(w_end)
                ev.append(f"Dialogue: 0,{t_s},{t_e},Default,,0,0,0,,{colored_text}")
            continue

        if style_name in ["opus", "neon", "boxed"] or style_name.startswith("karaoke"):
            raw_text = raw_text.upper()
            
        tokens = raw_text.split()
        if len(tokens) > 2:
            mid = math.ceil(len(tokens) / 2)
            raw_text = " ".join(tokens[:mid]) + "\\N" + " ".join(tokens[mid:])
            
        text = ass_escape(raw_text)
        
        if style_name == "clean": text_out = "{\\fad(200,200)}" + text
        elif style_name == "boxed": text_out = "{\\fad(50,50)}" + text
        elif style_name == "neon": text_out = "{\\t(0,100,\\fscx105\\fscy105)\\t(100,200,\\fscx100\\fscy100)}" + text
        else: text_out = "{\\t(0,80,\\fscx115\\fscy115)\\t(80,200,\\fscx100\\fscy100)}" + text
            
        ev.append(f"Dialogue: 0,{to_ass_time(start_t)},{to_ass_time(end_t)},Default,,0,0,0,,{text_out}")

        ev.append(f"Dialogue: 0,{to_ass_time(start_t)},{to_ass_time(end_t)},Default,,0,0,0,,{text_out}")

    if watermark:
        ev.append("Dialogue: 0,0:00:00.00,9:59:59.99,Watermark,,0,0,0,,Angel R")

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
        watermark = clips_data.get("watermark", False)

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
                            "words": s.get("words", []),
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
                s0 = max(start_s, float(s["start"]))
                s1 = min(end_s, float(s["end"]))
                if s1 <= s0:
                    continue
                local_lines.append({
                    "start": s0 - start_s, 
                    "end": s1 - start_s, 
                    "text": s["text"],
                    "words": s.get("words", [])
                })
            if local_lines:
                ass_path = os.path.join(args.outdir, f"clip_{i:02d}.ass")
                with open(ass_path, "w", encoding="utf-8") as f:
                    f.write(build_ass(play_res_x, play_res_y, local_lines, subtitle_style, watermark))
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
