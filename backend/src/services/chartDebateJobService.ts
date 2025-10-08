import { randomUUID } from 'node:crypto';

import type { ChartDebateResult } from './chartDebateService.js';
import type { DebateProgressEvent, DebateProgressStep } from './chartDebateProgress.js';

type DebateJobStatusType = 'pending' | 'running' | 'completed' | 'failed';

interface DebateJobStep {
  step: DebateProgressStep;
  message: string;
  detail?: string;
  timestamp: string;
}

interface DebateJobMetadata {
  tradeIdeaId: string | null;
  ticker?: string | undefined;
  timeframe?: string | undefined;
}

interface DebateJobInternal {
  jobId: string;
  status: DebateJobStatusType;
  currentStep: DebateProgressStep | null;
  steps: DebateJobStep[];
  error?: string;
  result?: ChartDebateResult;
  createdAt: number;
  updatedAt: number;
  metadata: DebateJobMetadata;
}

export interface DebateJobSnapshot {
  jobId: string;
  status: DebateJobStatusType;
  currentStep: DebateProgressStep | null;
  steps: DebateJobStep[];
  error?: string;
  result?: ChartDebateResult;
  metadata: DebateJobMetadata;
  createdAt: string;
  updatedAt: string;
}

const JOB_TTL_MS = 30 * 60 * 1000; // 30 minutes
const jobs = new Map<string, DebateJobInternal>();

const cleanupExpiredJobs = (): void => {
  const now = Date.now();
  for (const [jobId, job] of jobs.entries()) {
    if (now - job.updatedAt > JOB_TTL_MS) {
      jobs.delete(jobId);
    }
  }
};

export const createDebateJob = (
  metadata: DebateJobMetadata,
): DebateJobSnapshot => {
  cleanupExpiredJobs();

  const jobId = randomUUID();
  const now = Date.now();
  const job: DebateJobInternal = {
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

export const markJobRunning = (jobId: string): void => {
  const job = jobs.get(jobId);
  if (!job) return;

  job.status = 'running';
  job.updatedAt = Date.now();
};

export const appendJobStep = (jobId: string, event: DebateProgressEvent): void => {
  const job = jobs.get(jobId);
  if (!job) return;

  const step: DebateJobStep = {
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

export const completeJob = (jobId: string, result: ChartDebateResult): void => {
  const job = jobs.get(jobId);
  if (!job) return;

  job.status = 'completed';
  job.currentStep = 'completed';
  job.result = result;
  job.updatedAt = Date.now();
};

export const failJob = (jobId: string, error: string): void => {
  const job = jobs.get(jobId);
  if (!job) return;

  job.status = 'failed';
  job.currentStep = 'failed';
  job.error = error;
  job.updatedAt = Date.now();
};

export const getJobSnapshot = (jobId: string): DebateJobSnapshot | undefined => {
  cleanupExpiredJobs();
  const job = jobs.get(jobId);
  if (!job) {
    return undefined;
  }

  return toSnapshot(job);
};

const toSnapshot = (job: DebateJobInternal): DebateJobSnapshot => {
  const snapshot: DebateJobSnapshot = {
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
