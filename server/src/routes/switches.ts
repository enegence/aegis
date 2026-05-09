import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import {
  CreateSwitchInputSchema,
  UpdateSwitchInputSchema,
} from '../schemas/switches.js';
import {
  listSwitches,
  getSwitchById,
  createSwitch,
  updateSwitch,
  deleteSwitch,
} from '../services/switch-repository.js';
import {
  armSwitch,
  pauseSwitch,
  cancelSwitch,
  checkIn,
  evaluateAndTransition,
} from '../services/switch-engine.js';
import { checkSwitchReadiness } from '../services/readiness.js';
import type { SwitchRecord } from '../services/switch-repository.js';

function switchToResponse(sw: SwitchRecord) {
  return {
    id: sw.id,
    name: sw.name,
    mode: sw.mode,
    deploymentMode: sw.deploymentMode,
    status: sw.status,
    triggerAt: sw.triggerAt ? sw.triggerAt.toISOString() : null,
    heartbeatIntervalDays: sw.heartbeatIntervalDays,
    nextCheckInDueAt: sw.nextCheckInDueAt ? sw.nextCheckInDueAt.toISOString() : null,
    warningStartsAt: sw.warningStartsAt ? sw.warningStartsAt.toISOString() : null,
    gracePeriodHours: sw.gracePeriodHours,
    warningWindowDays: sw.warningWindowDays,
    lastCheckInAt: sw.lastCheckInAt ? sw.lastCheckInAt.toISOString() : null,
    lastPacketSyncAt: sw.lastPacketSyncAt ? sw.lastPacketSyncAt.toISOString() : null,
    lastReminderSentAt: sw.lastReminderSentAt ? sw.lastReminderSentAt.toISOString() : null,
    lastWarningSentAt: sw.lastWarningSentAt ? sw.lastWarningSentAt.toISOString() : null,
    lastEvaluatedAt: sw.lastEvaluatedAt ? sw.lastEvaluatedAt.toISOString() : null,
    selectedContactIds: sw.selectedContactIds,
    selectedEstateItemIds: sw.selectedEstateItemIds,
    createdAt: sw.createdAt.toISOString(),
    updatedAt: sw.updatedAt.toISOString(),
  };
}

export async function switchRoutes(app: FastifyInstance) {
  // GET /api/switches — list all switches
  app.get('/api/switches', {
    preHandler: [app.requireAuth],
  }, async (_req, reply) => {
    const switches = await listSwitches(app.db);
    return reply.send(switches.map(switchToResponse));
  });

  // GET /api/switches/:id — get switch by ID
  app.get('/api/switches/:id', {
    preHandler: [app.requireAuth],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const sw = await getSwitchById(app.db, parseInt(id));
    if (!sw) return reply.status(404).send({ error: 'Switch not found' });
    return reply.send(switchToResponse(sw));
  });

  // POST /api/switches — create switch
  app.post('/api/switches', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    let body: ReturnType<typeof CreateSwitchInputSchema.parse>;
    try {
      body = CreateSwitchInputSchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({ error: 'Validation error', details: err.errors });
      }
      throw err;
    }

    const sw = await createSwitch(app.db, {
      name: body.name,
      mode: body.mode,
      deploymentMode: body.deploymentMode,
      triggerAt: body.triggerAt ? new Date(body.triggerAt) : null,
      heartbeatIntervalDays: body.heartbeatIntervalDays ?? null,
      gracePeriodHours: body.gracePeriodHours,
      warningWindowDays: body.warningWindowDays,
      selectedContactIds: body.selectedContactIds,
      selectedEstateItemIds: body.selectedEstateItemIds,
    });

    return reply.status(201).send(switchToResponse(sw));
  });

  // PUT /api/switches/:id — update switch (cannot set status directly)
  app.put('/api/switches/:id', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };

    // Strip status from input before validation
    const rawBody = req.body as Record<string, unknown>;
    const { status: _status, ...bodyWithoutStatus } = rawBody ?? {};

    let body: ReturnType<typeof UpdateSwitchInputSchema.parse>;
    try {
      body = UpdateSwitchInputSchema.parse(bodyWithoutStatus);
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({ error: 'Validation error', details: err.errors });
      }
      throw err;
    }

    const existing = await getSwitchById(app.db, parseInt(id));
    if (!existing) return reply.status(404).send({ error: 'Switch not found' });

    const updated = await updateSwitch(app.db, parseInt(id), {
      name: body.name,
      mode: body.mode,
      deploymentMode: body.deploymentMode,
      triggerAt: body.triggerAt !== undefined ? new Date(body.triggerAt) : undefined,
      heartbeatIntervalDays: body.heartbeatIntervalDays,
      gracePeriodHours: body.gracePeriodHours,
      warningWindowDays: body.warningWindowDays,
      selectedContactIds: body.selectedContactIds,
      selectedEstateItemIds: body.selectedEstateItemIds,
    });

    return reply.send(switchToResponse(updated));
  });

  // DELETE /api/switches/:id — delete switch
  app.delete('/api/switches/:id', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const sw = await getSwitchById(app.db, parseInt(id));
    if (!sw) return reply.status(404).send({ error: 'Switch not found' });

    if (sw.status === 'triggered' || sw.status === 'cascade_active') {
      return reply.status(400).send({ error: 'Cannot delete active switch; cancel instead' });
    }

    await deleteSwitch(app.db, parseInt(id));
    return reply.status(204).send();
  });

  // GET /api/switches/:id/readiness — get readiness checks
  app.get('/api/switches/:id/readiness', {
    preHandler: [app.requireAuth],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const sw = await getSwitchById(app.db, parseInt(id));
    if (!sw) return reply.status(404).send({ error: 'Switch not found' });

    const readiness = await checkSwitchReadiness(app.db, sw);
    return reply.send(readiness);
  });

  // POST /api/switches/:id/arm — arm switch
  app.post('/api/switches/:id/arm', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const sw = await armSwitch(app.db, parseInt(id));
      return reply.send(switchToResponse(sw));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('not found')) {
        return reply.status(404).send({ error: message });
      }
      return reply.status(400).send({ error: message });
    }
  });

  // POST /api/switches/:id/pause — pause switch
  app.post('/api/switches/:id/pause', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const sw = await pauseSwitch(app.db, parseInt(id));
      return reply.send(switchToResponse(sw));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('not found')) {
        return reply.status(404).send({ error: message });
      }
      return reply.status(400).send({ error: message });
    }
  });

  // POST /api/switches/:id/cancel — cancel switch
  app.post('/api/switches/:id/cancel', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const sw = await cancelSwitch(app.db, parseInt(id));
      return reply.send(switchToResponse(sw));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('not found')) {
        return reply.status(404).send({ error: message });
      }
      return reply.status(400).send({ error: message });
    }
  });

  // POST /api/switches/:id/check-in — check in
  app.post('/api/switches/:id/check-in', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const sw = await checkIn(app.db, parseInt(id));
      return reply.send(switchToResponse(sw));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('not found')) {
        return reply.status(404).send({ error: message });
      }
      return reply.status(400).send({ error: message });
    }
  });

  // POST /api/switches/:id/evaluate — manual evaluate/transition
  app.post('/api/switches/:id/evaluate', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const sw = await evaluateAndTransition(app.db, parseInt(id));
      return reply.send(switchToResponse(sw));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('not found')) {
        return reply.status(404).send({ error: message });
      }
      return reply.status(400).send({ error: message });
    }
  });
}
