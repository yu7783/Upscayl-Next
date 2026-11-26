import {
  BatchUpscaylPayload,
  DoubleUpscaylPayload,
  ImageUpscaylPayload,
  MultiModelUpscaylPayload,
  VideoUpscaylPayload,
} from "./types/types";

export type QueueJobType = "image" | "double" | "batch" | "multi-model" | "video";

export type QueueJobStatus =
  | "pending"
  | "running"
  | "done"
  | "error"
  | "cancelled";

export type QueueJobPayload =
  | ImageUpscaylPayload
  | DoubleUpscaylPayload
  | BatchUpscaylPayload
  | MultiModelUpscaylPayload
  | VideoUpscaylPayload;

export type QueueJob = {
  id: string;
  type: QueueJobType;
  label: string;
  detail: string;
  status: QueueJobStatus;
  progress: number;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  outputPath?: string;
  error?: string;
  payload: QueueJobPayload;
};

export type QueueSnapshot = {
  jobs: QueueJob[];
  isRunning: boolean;
  isPaused: boolean;
};

export function createQueueJob(input: {
  type: QueueJobType;
  label: string;
  detail?: string;
  payload: QueueJobPayload;
  id?: string;
}): QueueJob {
  return {
    id:
      input.id ||
      `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: input.type,
    label: input.label,
    detail: input.detail ?? "",
    status: "pending",
    progress: 0,
    createdAt: Date.now(),
    payload: input.payload,
  };
}

export function enqueueJob(jobs: QueueJob[], job: QueueJob): QueueJob[] {
  return [...jobs, job];
}

export function removeQueueJob(jobs: QueueJob[], jobId: string): QueueJob[] {
  return jobs.filter((j) => !(j.id === jobId && j.status !== "running"));
}

export function moveQueueJob(
  jobs: QueueJob[],
  jobId: string,
  direction: "up" | "down",
): QueueJob[] {
  const idx = jobs.findIndex((j) => j.id === jobId);
  if (idx < 0 || jobs[idx].status !== "pending") return jobs;
  const targetIdx = direction === "up" ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= jobs.length) return jobs;
  if (jobs[targetIdx].status !== "pending") return jobs;

  const copy = [...jobs];
  const [item] = copy.splice(idx, 1);
  copy.splice(targetIdx, 0, item);
  return copy;
}

export function pickNextPendingJob(jobs: QueueJob[]): QueueJob | null {
  return jobs.find((j) => j.status === "pending") ?? null;
}

export function updateQueueJob(
  jobs: QueueJob[],
  jobId: string,
  patch: Partial<QueueJob>,
): QueueJob[] {
  return jobs.map((j) => (j.id === jobId ? { ...j, ...patch } : j));
}

export function clearFinishedJobs(jobs: QueueJob[]): QueueJob[] {
  return jobs.filter((j) => j.status === "pending" || j.status === "running");
}

export function summarizeQueue(jobs: QueueJob[]): {
  total: number;
  pending: number;
  running: number;
  done: number;
  error: number;
} {
  let pending = 0;
  let running = 0;
  let done = 0;
  let error = 0;
  for (const job of jobs) {
    if (job.status === "pending") pending += 1;
    else if (job.status === "running") running += 1;
    else if (job.status === "done") done += 1;
    else if (job.status === "error" || job.status === "cancelled") error += 1;
  }
  return { total: jobs.length, pending, running, done, error };
}
