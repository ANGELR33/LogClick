import path from "node:path";

import { getVideoDurationSeconds, runFfmpeg } from "../lib/ffmpeg.js";
import { runPython } from "../lib/python.js";
import { analyzeTranscript } from "../lib/gemini.js";
import { getJob, getJobArtifactPath, markArtifact, updateJob } from "../storage/jobs.js";

export async function runJobPipeline(jobId: string) {
  const job = await getJob(jobId);
  if (!job) throw new Error(`job not found: ${jobId}`);

  await updateJob(jobId, {
    status: "running",
    stage: "extract_audio",
    progress: 0.1,
    error: undefined,
  });

  try {
    const input = job.inputVideoPath;

    const inputThumb = getJobArtifactPath(jobId, "input_thumb.jpg");
    try {
      await runFfmpeg(["-y", "-ss", "0.5", "-i", input, "-vframes", "1", "-q:v", "3", inputThumb]);
      await markArtifact(jobId, "inputThumb", "input_thumb.jpg");
    } catch {
      // safe ignore
    }

    const audioWav = getJobArtifactPath(jobId, "audio.wav");
    await runFfmpeg([
      "-y",
      "-i",
      input,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      audioWav,
    ]);
    await markArtifact(jobId, "audioWav", "audio.wav");

    const proMode = true;
    await updateJob(jobId, { stage: "transcribe", progress: 0.25 });

    if (proMode) {
      try {
        const model = process.env.WHISPER_MODEL ?? "base";
        const device = process.env.WHISPER_DEVICE ?? "cpu";
        const computeType = process.env.WHISPER_COMPUTE_TYPE ?? "int8";
        const language = process.env.WHISPER_LANGUAGE ?? "";

        const outJson = getJobArtifactPath(jobId, "captions.json");
        const outSrt = getJobArtifactPath(jobId, "captions.srt");

        const heartbeat = setInterval(() => {
          void updateJob(jobId, { stage: "transcribe", progress: 0.25 });
        }, 3000);
        try {
          await runPython({
            scriptPath: path.resolve(process.cwd(), "scripts", "transcribe_whisper.py"),
            args: [
              "--audio",
              audioWav,
              "--out_json",
              outJson,
              "--out_srt",
              outSrt,
              "--model",
              model,
              "--device",
              device,
              "--compute_type",
              computeType,
              "--language",
              language,
            ],
          });
        } finally {
          clearInterval(heartbeat);
        }

        await markArtifact(jobId, "captionsJson", "captions.json");
        await markArtifact(jobId, "captionsSrt", "captions.srt");
        await updateJob(jobId, { stage: "awaiting_clips", progress: 0.4 });
        return; // Pause pipeline here, wait for manual input

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const existingWarnings = (await getJob(jobId))?.warnings ?? [];
        await updateJob(jobId, {
          warnings: [...existingWarnings, `Subtítulos: no se pudo transcribir (Whisper). Detalle: ${msg}`],
          stage: "awaiting_clips", // Still allow manual clipping even if subtitles failed
        });
        return; // Pause pipeline
      }
    } else {
      await updateJob(jobId, { stage: "awaiting_clips", progress: 0.4 });
      return; 
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateJob(jobId, { status: "failed", error: message });
  }
}

export async function resumeJobPipeline(jobId: string) {
  const job = await getJob(jobId);
  if (!job) throw new Error(`job not found: ${jobId}`);

  await updateJob(jobId, {
    status: "running",
    stage: "render_clips",
    progress: 0.75,
    error: undefined,
  });

  try {
    const input = job.inputVideoPath;
    const clipsJson = getJobArtifactPath(jobId, "clips.json");
    const clipsDir = getJobArtifactPath(jobId, "clips");
    const captionsJson = getJobArtifactPath(jobId, "captions.json");
    
    // Check if captions exist (might have failed)
    const captionsExist = await (async () => {
      try {
        const fs = await import("node:fs/promises");
        await fs.access(captionsJson);
        return true;
      } catch {
        return false;
      }
    })();

    const pythonArgs = [
      "--input",
      input,
      "--clips",
      clipsJson,
      "--outdir",
      clipsDir,
    ];

    if (captionsExist) {
        pythonArgs.push("--captions_json", captionsJson);
    }

    await runPython({
      scriptPath: path.resolve(process.cwd(), "scripts", "render_clips.py"),
      args: pythonArgs,
    });
    
    await markArtifact(jobId, "clipsDir", "clips");
    await updateJob(jobId, { status: "completed", stage: "done", progress: 1 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateJob(jobId, { status: "failed", error: message });
  }
}
