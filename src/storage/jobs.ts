import fs from "node:fs/promises";
import path from "node:path";

import { nanoid } from "nanoid";

export const jobsRootDir = path.resolve(process.cwd(), "data", "jobs");

export type JobStatus =
  | "created"
  | "queued"
  | "running"
  | "failed"
  | "completed";

export type JobStage =
  | "created"
  | "uploading"
  | "extract_audio"
  | "transcribe"
  | "awaiting_clips"
  | "ai_analysis"
  | "detect_scenes"
  | "select_clips"
  | "render_clips"
  | "done";

export type JobOptions = {
  proMode: boolean;
  aggressiveness: "low" | "medium" | "high";
};

export type JobRecord = {
  id: string;
  status: JobStatus;
  stage?: JobStage;
  progress?: number;
  createdAt: string;
  updatedAt: string;
  originalFilename: string;
  inputVideoPath: string;
  error?: string;
  warnings?: string[];
  options?: JobOptions;
  artifacts: Record<string, string>;
};

export function getJobDir(jobId: string) {
  return path.join(jobsRootDir, jobId);
}

export function getJobArtifactPath(jobId: string, filename: string) {
  return path.join(getJobDir(jobId), filename);
}

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

export async function createJob(params: {
  originalFilename: string;
  uploadedTempPath: string;
  options?: JobOptions;
}): Promise<JobRecord> {
  const id = nanoid();
  const now = new Date().toISOString();
  const dir = getJobDir(id);
  await ensureDir(dir);

  const inputVideoPath = getJobArtifactPath(id, "input.mp4");
  await fs.rename(params.uploadedTempPath, inputVideoPath);

  const job: JobRecord = {
    id,
    status: "created",
    stage: "created",
    progress: 0,
    createdAt: now,
    updatedAt: now,
    originalFilename: params.originalFilename,
    inputVideoPath,
    options: params.options,
    artifacts: {
      inputVideo: inputVideoPath,
    },
  };

  await saveJob(job);
  return job;
}

export async function getJob(jobId: string): Promise<JobRecord | null> {
  try {
    const raw = await fs.readFile(getJobArtifactPath(jobId, "job.json"), "utf8");
    return JSON.parse(raw) as JobRecord;
  } catch {
    return null;
  }
}

export async function getAllJobs(): Promise<JobRecord[]> {
  try {
    const dirs = await fs.readdir(jobsRootDir, { withFileTypes: true });
    const jobs: JobRecord[] = [];
    for (const d of dirs) {
      if (d.isDirectory()) {
        const job = await getJob(d.name);
        if (job) jobs.push(job);
      }
    }
    // Ordenar del más reciente al más antiguo
    return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}

export async function saveJob(job: JobRecord) {
  job.updatedAt = new Date().toISOString();
  await fs.writeFile(
    getJobArtifactPath(job.id, "job.json"),
    JSON.stringify(job, null, 2),
    "utf8",
  );
}

export async function updateJob(jobId: string, patch: Partial<JobRecord>) {
  const job = await getJob(jobId);
  if (!job) throw new Error(`job not found: ${jobId}`);
  const next = { ...job, ...patch } satisfies JobRecord;
  await saveJob(next);
  return next;
}

export async function markArtifact(jobId: string, key: string, filename: string) {
  const job = await getJob(jobId);
  if (!job) throw new Error(`job not found: ${jobId}`);
  job.artifacts[key] = getJobArtifactPath(jobId, filename);
  await saveJob(job);
}

export async function deleteJob(jobId: string) {
  const dir = getJobDir(jobId);
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch (e) {
    console.error("Failed to delete job", jobId, e);
  }
}
