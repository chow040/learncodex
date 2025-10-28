import { env } from '../config/env.js';
import type { AutoTradeSchedulerJobStatus, AutoTradeSchedulerStatus } from '../types/autotrade.js';
import { getAutotradeHttpClient } from './autotradeHttpClient.js';
import { withServiceError } from './utils/serviceHelpers.js';

const SERVICE_NAME = 'autotrade-python';

type PythonHealth = {
  status: string;
  service?: string;
  time?: string;
};

type PythonSchedulerJob = {
  job_id: string;
  name: string;
  status: 'idle' | 'running' | 'paused';
  last_run_at: string | null;
  next_run_at: string | null;
  consecutive_failures: number;
};

type PythonSchedulerStatus = {
  implementation: string;
  is_running: boolean;
  is_paused: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  consecutive_failures: number;
  jobs: PythonSchedulerJob[];
};

type PythonSchedulerEnvelope = {
  scheduler: PythonSchedulerStatus;
};

type PythonSchedulerTriggerResponse = {
  triggered_at: string;
  scheduler: PythonSchedulerStatus;
};

export type SchedulerJobStatus = AutoTradeSchedulerJobStatus;
export type SchedulerStatus = AutoTradeSchedulerStatus;

const mapJob = (job: PythonSchedulerJob): SchedulerJobStatus => ({
  jobId: job.job_id,
  name: job.name,
  status: job.status,
  lastRunAt: job.last_run_at,
  nextRunAt: job.next_run_at,
  consecutiveFailures: job.consecutive_failures,
});

const mapSchedulerStatus = (scheduler: PythonSchedulerStatus): SchedulerStatus => ({
  implementation: scheduler.implementation,
  isRunning: scheduler.is_running,
  isPaused: scheduler.is_paused,
  lastRunAt: scheduler.last_run_at,
  nextRunAt: scheduler.next_run_at,
  consecutiveFailures: scheduler.consecutive_failures,
  jobs: scheduler.jobs.map(mapJob),
});

export const fetchPythonHealth = async (): Promise<PythonHealth> => {
  if (!env.autotradeServiceUrl) {
    throw new Error('AUTOTRADE_SERVICE_URL is not configured');
  }
  const client = getAutotradeHttpClient();
  return withServiceError(SERVICE_NAME, 'health', async () => {
    const response = await client.get<PythonHealth>('/healthz');
    return response.data;
  });
};

export const fetchSchedulerStatus = async (): Promise<SchedulerStatus> => {
  if (!env.autotradeServiceUrl) {
    throw new Error('AUTOTRADE_SERVICE_URL is not configured');
  }
  const client = getAutotradeHttpClient();
  const envelope = await withServiceError<PythonSchedulerEnvelope>(SERVICE_NAME, 'scheduler-status', async () => {
    const response = await client.get<PythonSchedulerEnvelope>('/internal/autotrade/v1/scheduler/status');
    return response.data;
  });
  return mapSchedulerStatus(envelope.scheduler);
};

export const pauseScheduler = async (): Promise<SchedulerStatus> => {
  const client = getAutotradeHttpClient();
  const envelope = await withServiceError<PythonSchedulerEnvelope>(SERVICE_NAME, 'scheduler-pause', async () => {
    const response = await client.post<PythonSchedulerEnvelope>('/internal/autotrade/v1/scheduler/pause');
    return response.data;
  });
  return mapSchedulerStatus(envelope.scheduler);
};

export const resumeScheduler = async (): Promise<SchedulerStatus> => {
  const client = getAutotradeHttpClient();
  const envelope = await withServiceError<PythonSchedulerEnvelope>(SERVICE_NAME, 'scheduler-resume', async () => {
    const response = await client.post<PythonSchedulerEnvelope>('/internal/autotrade/v1/scheduler/resume');
    return response.data;
  });
  return mapSchedulerStatus(envelope.scheduler);
};

export const triggerScheduler = async (): Promise<{ triggeredAt: string; scheduler: SchedulerStatus }> => {
  const client = getAutotradeHttpClient();
  const payload = await withServiceError<PythonSchedulerTriggerResponse>(SERVICE_NAME, 'scheduler-trigger', async () => {
    const response = await client.post<PythonSchedulerTriggerResponse>('/internal/autotrade/v1/scheduler/trigger');
    return response.data;
  });
  return {
    triggeredAt: payload.triggered_at,
    scheduler: mapSchedulerStatus(payload.scheduler),
  };
};
