import { randomUUID } from 'node:crypto';
const JOB_TTL_MS = 30 * 60 * 1000; // 30 minutes
const jobs = new Map();
const cleanupExpiredJobs = () => {
    const now = Date.now();
    for (const [jobId, job] of jobs.entries()) {
        if (now - job.updatedAt > JOB_TTL_MS) {
            jobs.delete(jobId);
        }
    }
};
export const createDebateJob = (metadata) => {
    cleanupExpiredJobs();
    const jobId = randomUUID();
    const now = Date.now();
    const job = {
        jobId,
        status: 'pending',
        currentStep: null,
        steps: [],
        createdAt: now,
        updatedAt: now,
        metadata,
    };
    jobs.set(jobId, job);
    return toSnapshot(job);
};
export const markJobRunning = (jobId) => {
    const job = jobs.get(jobId);
    if (!job)
        return;
    job.status = 'running';
    job.updatedAt = Date.now();
};
export const appendJobStep = (jobId, event) => {
    const job = jobs.get(jobId);
    if (!job)
        return;
    const step = {
        step: event.step,
        message: event.message,
        timestamp: new Date().toISOString(),
    };
    if (event.detail !== undefined) {
        step.detail = event.detail;
    }
    job.currentStep = event.step;
    job.steps.push(step);
    job.updatedAt = Date.now();
};
export const completeJob = (jobId, result) => {
    const job = jobs.get(jobId);
    if (!job)
        return;
    job.status = 'completed';
    job.currentStep = 'completed';
    job.result = result;
    job.updatedAt = Date.now();
};
export const failJob = (jobId, error) => {
    const job = jobs.get(jobId);
    if (!job)
        return;
    job.status = 'failed';
    job.currentStep = 'failed';
    job.error = error;
    job.updatedAt = Date.now();
};
export const getJobSnapshot = (jobId) => {
    cleanupExpiredJobs();
    const job = jobs.get(jobId);
    if (!job) {
        return undefined;
    }
    return toSnapshot(job);
};
const toSnapshot = (job) => {
    const snapshot = {
        jobId: job.jobId,
        status: job.status,
        currentStep: job.currentStep,
        steps: job.steps.slice(),
        metadata: job.metadata,
        createdAt: new Date(job.createdAt).toISOString(),
        updatedAt: new Date(job.updatedAt).toISOString(),
    };
    if (job.error !== undefined) {
        snapshot.error = job.error;
    }
    if (job.result !== undefined) {
        snapshot.result = job.result;
    }
    return snapshot;
};
//# sourceMappingURL=chartDebateJobService.js.map