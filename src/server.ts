import "dotenv/config";
import cors from "cors";
import express from "express";
import multer from "multer";
import pinoHttpImport from "pino-http";
import path from "node:path";
import fs from "node:fs";

import { createJob, getJob, getAllJobs, getJobArtifactPath, jobsRootDir } from "./storage/jobs.js";
import { enqueueJob, getQueueStatus } from "./workers/queue.js";
import { resumeJobPipeline } from "./workers/runner.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
const pinoHttpAny: any = (pinoHttpImport as any).default ?? (pinoHttpImport as any);
app.use(pinoHttpAny());

const publicDir = path.resolve(process.cwd(), "public");
app.use(express.static(publicDir));

const uploadsTmpDir = path.resolve(process.cwd(), "data", "tmp", "uploads");
fs.mkdirSync(uploadsTmpDir, { recursive: true });
const upload = multer({ dest: uploadsTmpDir });

app.get("/health", async (_req, res) => {
  res.json({ ok: true, jobsRootDir });
});

app.get("/", async (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.post("/api/jobs", upload.single("video"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "missing file field 'video'" });
  }

  const proMode = true;
  const aggrRaw = String(req.body?.aggressiveness ?? "medium").toLowerCase();
  const aggressiveness = (aggrRaw === "low" || aggrRaw === "high" || aggrRaw === "medium")
    ? aggrRaw
    : "medium";

  const job = await createJob({
    originalFilename: req.file.originalname,
    uploadedTempPath: req.file.path,
    options: { proMode, aggressiveness },
  });

  await enqueueJob(job.id);

  res.status(201).json({ jobId: job.id });
});

app.get("/api/jobs/:jobId", async (req, res) => {
  const job = await getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "job not found" });
  res.json(job);
});

app.get("/api/jobs", async (req, res) => {
  const jobs = await getAllJobs();
  res.json(jobs);
});

app.post("/api/jobs/:jobId/clips", async (req, res) => {
  const job = await getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "job not found" });

  if (job.stage !== "awaiting_clips") {
    return res.status(400).json({ error: "job is not in awaiting_clips stage" });
  }

  const clips = req.body.clips;
  if (!Array.isArray(clips) || clips.length === 0) {
    return res.status(400).json({ error: "invalid clips array" });
  }

  const subtitleStyle = req.body.subtitleStyle || "opus";
  const clipsJsonPath = getJobArtifactPath(job.id, "clips.json");
  await fs.promises.writeFile(clipsJsonPath, JSON.stringify({ clips, subtitleStyle }, null,  2));

  // Start the background rendering
  resumeJobPipeline(job.id).catch(console.error);

  res.json({ success: true });
});


app.get("/api/jobs/:jobId/files/:file", async (req, res) => {
  const p = getJobArtifactPath(req.params.jobId, req.params.file);
  res.sendFile(p);
});

app.get("/api/jobs/:jobId/clips", async (req, res) => {
  const dir = getJobArtifactPath(req.params.jobId, "clips");
  try {
    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => d.name);

    const videos = entries.filter((n) => n.toLowerCase().endsWith(".mp4")).sort();
    const thumbs = new Set(entries.filter((n) => n.toLowerCase().endsWith(".jpg")).sort());

    res.json({
      clips: videos.map((v) => {
        const t = v.replace(/\.mp4$/i, ".jpg");
        return { video: v, thumb: thumbs.has(t) ? t : null };
      }),
    });
  } catch {
    res.json({ clips: [] });
  }
});

app.get("/api/jobs/:jobId/clips/:file", async (req, res) => {
  const p = getJobArtifactPath(req.params.jobId, path.join("clips", req.params.file));
  res.sendFile(p);
});

app.get("/api/jobs/:jobId/clips.zip", async (req, res) => {
  const dir = getJobArtifactPath(req.params.jobId, "clips");
  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=clips_${req.params.jobId}.zip`,
  );

  const archiverMod = await import("archiver");
  const archiver = archiverMod.default;

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err: unknown) => {
    res.status(500).end(String(err));
  });

  archive.pipe(res);
  archive.glob("*.mp4", { cwd: dir });
  await archive.finalize();
});

app.get("/api/queue", async (_req, res) => {
  res.json(getQueueStatus());
});

const port = Number(process.env.PORT ?? 3131);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`auto-clipper api listening on http://localhost:${port}`);
});
