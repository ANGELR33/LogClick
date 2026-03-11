import { runJobPipeline } from "./runner.js";

type QueueItem = { jobId: string };

const queue: QueueItem[] = [];
let running = false;

export function getQueueStatus() {
  return { running, queued: queue.map((q) => q.jobId) };
}

export async function enqueueJob(jobId: string) {
  queue.push({ jobId });
  void pump();
}

async function pump() {
  if (running) return;
  const item = queue.shift();
  if (!item) return;

  running = true;
  try {
    await runJobPipeline(item.jobId);
  } finally {
    running = false;
    void pump();
  }
}
