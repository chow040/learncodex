import { env } from '../config/env.js';
import { getAutotradeHttpClient } from './autotradeHttpClient.js';
import { withServiceError } from './utils/serviceHelpers.js';
const SERVICE_NAME = 'autotrade-python';
const mapJob = (job) => ({
    jobId: job.job_id,
    name: job.name,
    status: job.status,
    lastRunAt: job.last_run_at,
    nextRunAt: job.next_run_at,
    consecutiveFailures: job.consecutive_failures,
});
const mapSchedulerStatus = (scheduler) => ({
    implementation: scheduler.implementation,
    isRunning: scheduler.is_running,
    isPaused: scheduler.is_paused,
    lastRunAt: scheduler.last_run_at,
    nextRunAt: scheduler.next_run_at,
    consecutiveFailures: scheduler.consecutive_failures,
    jobs: scheduler.jobs.map(mapJob),
});
export const fetchPythonHealth = async () => {
    if (!env.autotradeServiceUrl) {
        throw new Error('AUTOTRADE_SERVICE_URL is not configured');
    }
    const client = getAutotradeHttpClient();
    return withServiceError(SERVICE_NAME, 'health', async () => {
        const response = await client.get('/healthz');
        return response.data;
    });
};
export const fetchSchedulerStatus = async () => {
    if (!env.autotradeServiceUrl) {
        throw new Error('AUTOTRADE_SERVICE_URL is not configured');
    }
    const client = getAutotradeHttpClient();
    const envelope = await withServiceError(SERVICE_NAME, 'scheduler-status', async () => {
        const response = await client.get('/internal/autotrade/v1/scheduler/status');
        return response.data;
    });
    return mapSchedulerStatus(envelope.scheduler);
};
export const pauseScheduler = async () => {
    const client = getAutotradeHttpClient();
    const envelope = await withServiceError(SERVICE_NAME, 'scheduler-pause', async () => {
        const response = await client.post('/internal/autotrade/v1/scheduler/pause');
        return response.data;
    });
    return mapSchedulerStatus(envelope.scheduler);
};
export const resumeScheduler = async () => {
    const client = getAutotradeHttpClient();
    const envelope = await withServiceError(SERVICE_NAME, 'scheduler-resume', async () => {
        const response = await client.post('/internal/autotrade/v1/scheduler/resume');
        return response.data;
    });
    return mapSchedulerStatus(envelope.scheduler);
};
export const triggerScheduler = async () => {
    const client = getAutotradeHttpClient();
    const payload = await withServiceError(SERVICE_NAME, 'scheduler-trigger', async () => {
        const response = await client.post('/internal/autotrade/v1/scheduler/trigger');
        return response.data;
    });
    return {
        triggeredAt: payload.triggered_at,
        scheduler: mapSchedulerStatus(payload.scheduler),
    };
};
//# sourceMappingURL=autotradePythonService.js.map