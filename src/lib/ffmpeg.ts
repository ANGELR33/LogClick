import { execa } from "execa";

export async function runFfmpeg(args: string[]) {
  const { exitCode, stderr } = await execa("ffmpeg", args, {
    stdout: "pipe",
    stderr: "pipe",
    reject: false,
  });
  if (exitCode !== 0) throw new Error(`ffmpeg failed (code ${exitCode}): ${stderr}`);
}

export async function getVideoDurationSeconds(inputPath: string) {
  const { exitCode, stdout, stderr } = await execa(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      inputPath,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
      reject: false,
    },
  );
  if (exitCode !== 0) throw new Error(`ffprobe failed (code ${exitCode}): ${stderr}`);
  const v = Number(String(stdout).trim());
  if (!Number.isFinite(v) || v <= 0) throw new Error(`ffprobe returned invalid duration: ${stdout}`);
  return v;
}
