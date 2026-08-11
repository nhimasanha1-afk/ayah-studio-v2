import { randomUUID } from 'node:crypto';

/**
 * In-memory job store for the async export pattern (start job -> poll
 * status -> download result). This is a single-process server with no
 * persistence requirement beyond the process lifetime, so an in-memory Map
 * is the honest choice here -- jobs are lost on restart, and a real
 * multi-instance deployment would need a shared store (Redis, a DB table)
 * instead. Old jobs are pruned lazily so this can't grow unbounded.
 */
const jobs = new Map();
const JOB_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function pruneOldJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.updatedAt < cutoff) jobs.delete(id);
  }
}

export function createJob() {
  pruneOldJobs();
  const job = {
    id: randomUUID(),
    status: 'queued', // queued | running | done | error
    stage: null,
    progress: null,
    result: null,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id) {
  return jobs.get(id) ?? null;
}

export function updateJob(id, partial) {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, partial, { updatedAt: Date.now() });
  return job;
}
