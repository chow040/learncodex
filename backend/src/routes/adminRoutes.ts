import { Router, type Response } from 'express';
import { ZodError } from 'zod';

import { requireAdmin, requireAuth } from '../middleware/auth.js';
import {
  assignPromptProfileToAgent,
  createPromptProfile,
  getAgentConfiguration,
  getPromptProfile,
  listAgentSummaries,
  listPromptProfiles,
  listSystemSettingsByScope,
  previewAgentPrompt,
  updateAgentConfiguration,
  updatePromptProfile,
  upsertSystemSettings,
} from '../services/adminDashboardService.js';
import {
  agentUpdateSchema,
  assignPromptSchema,
  createPromptProfileSchema,
  promptPreviewSchema,
  promptProfileQuerySchema,
  systemSettingsPatchSchema,
  updatePromptProfileSchema,
} from '../validators/adminDashboard.js';
import type {
  AgentUpdateInput,
  CreatePromptProfileInput,
  ListPromptProfilesOptions,
  PromptPreviewInput,
  SystemSettingUpdateInput,
  UpdatePromptProfileInput,
} from '../types/adminDashboard.js';

export const adminRouter = Router();

const handleZodError = (error: ZodError, res: Response): void => {
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    res.status(400).json({
      error: firstIssue?.message ?? 'Invalid request payload',
      issues: error.issues,
    });
  }
};

const normalizeArrayPayload = (body: unknown): unknown[] => {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object' && Array.isArray((body as Record<string, unknown>).updates)) {
    return (body as Record<string, unknown>).updates as unknown[];
  }
  return [];
};

adminRouter.use(requireAuth);
adminRouter.use(requireAdmin);

adminRouter.get('/system-settings', async (_req, res, next) => {
  try {
    const settings = await listSystemSettingsByScope();
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/system-settings', async (req, res, next) => {
  try {
    const updates = systemSettingsPatchSchema.parse(
      normalizeArrayPayload(req.body),
    ) as SystemSettingUpdateInput[];
    const result = await upsertSystemSettings(updates);
    res.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      handleZodError(error, res);
      return;
    }
    next(error);
  }
});

adminRouter.get('/agents', async (_req, res, next) => {
  try {
    const agents = await listAgentSummaries();
    res.json(agents);
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/agents/:id', async (req, res, next) => {
  try {
    const agentId = typeof req.params.id === 'string' ? req.params.id : '';
    if (!agentId) {
      return res.status(400).json({ error: 'Agent id is required' });
    }
    const agent = await getAgentConfiguration(agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    res.json(agent);
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/agents/:id', async (req, res, next) => {
  try {
    const agentId = typeof req.params.id === 'string' ? req.params.id : '';
    if (!agentId) {
      return res.status(400).json({ error: 'Agent id is required' });
    }
    const payload = agentUpdateSchema.parse(req.body ?? {}) as AgentUpdateInput;
    const updated = await updateAgentConfiguration(agentId, payload);
    res.json(updated);
  } catch (error) {
    if (error instanceof ZodError) {
      handleZodError(error, res);
      return;
    }
    next(error);
  }
});

adminRouter.post('/agents/:id/assign-prompt', async (req, res, next) => {
  try {
    const agentId = typeof req.params.id === 'string' ? req.params.id : '';
    if (!agentId) {
      return res.status(400).json({ error: 'Agent id is required' });
    }
    const payload = assignPromptSchema.parse(req.body ?? {});
    const updated = await assignPromptProfileToAgent(agentId, payload.promptProfileId);
    res.json(updated);
  } catch (error) {
    if (error instanceof ZodError) {
      handleZodError(error, res);
      return;
    }
    next(error);
  }
});

adminRouter.post('/agents/:id/preview-prompt', async (req, res, next) => {
  try {
    const agentId = typeof req.params.id === 'string' ? req.params.id : '';
    if (!agentId) {
      return res.status(400).json({ error: 'Agent id is required' });
    }
    const payload = promptPreviewSchema.parse(req.body ?? {}) as PromptPreviewInput;
    const preview = await previewAgentPrompt(agentId, payload);
    res.json(preview);
  } catch (error) {
    if (error instanceof ZodError) {
      handleZodError(error, res);
      return;
    }
    next(error);
  }
});

adminRouter.get('/prompt-profiles', async (req, res, next) => {
  try {
    const query = promptProfileQuerySchema.parse({
      type: typeof req.query.type === 'string' ? req.query.type : undefined,
      agentId: typeof req.query.agentId === 'string' ? req.query.agentId : undefined,
    }) as ListPromptProfilesOptions;
    const profiles = await listPromptProfiles(query);
    res.json(profiles);
  } catch (error) {
    if (error instanceof ZodError) {
      handleZodError(error, res);
      return;
    }
    next(error);
  }
});

adminRouter.get('/prompt-profiles/:id', async (req, res, next) => {
  try {
    const promptId = typeof req.params.id === 'string' ? req.params.id : '';
    if (!promptId) {
      return res.status(400).json({ error: 'Prompt profile id is required' });
    }
    const profile = await getPromptProfile(promptId);
    if (!profile) {
      return res.status(404).json({ error: 'Prompt profile not found' });
    }
    res.json(profile);
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/prompt-profiles', async (req, res, next) => {
  try {
    const payload = createPromptProfileSchema.parse(req.body ?? {}) as CreatePromptProfileInput;
    const created = await createPromptProfile(payload);
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof ZodError) {
      handleZodError(error, res);
      return;
    }
    next(error);
  }
});

adminRouter.patch('/prompt-profiles/:id', async (req, res, next) => {
  try {
    const promptId = typeof req.params.id === 'string' ? req.params.id : '';
    if (!promptId) {
      return res.status(400).json({ error: 'Prompt profile id is required' });
    }
    const payload = updatePromptProfileSchema.parse(req.body ?? {}) as UpdatePromptProfileInput;
    const updated = await updatePromptProfile(promptId, payload);
    res.json(updated);
  } catch (error) {
    if (error instanceof ZodError) {
      handleZodError(error, res);
      return;
    }
    next(error);
  }
});
