import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { releaseRuns, switches } from '../db/schema.js';
import {
  getActiveReleaseRunFull,
  getReleaseRunById,
  cancelReleaseRun,
  type ReleaseRunRecord,
} from '../repositories/release-run-repository.js';
import { listClaimsForRun } from '../repositories/contact-claim-repository.js';
import { listPacketsBySwitchId } from '../repositories/packet-repository.js';
import { writeAuditEvent } from '../services/audit.js';
import { markSwitchStatus } from '../services/switch-repository.js';

function serializeRun(run: ReleaseRunRecord) {
  return {
    id: run.id,
    triggeringSwitchId: run.triggeringSwitchId,
    status: run.status,
    activePacketId: run.activePacketId,
    currentContactClaimId: run.currentContactClaimId,
    suppressedSwitchIds: run.suppressedSwitchIds,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    cancelledAt: run.cancelledAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

export async function releaseRoutes(app: FastifyInstance) {
  // GET /api/release/status — active run summary
  app.get('/api/release/status', {
    preHandler: [app.requireAuth],
  }, async (_req, reply) => {
    const activeRun = await getActiveReleaseRunFull(app.db);
    if (!activeRun) {
      return reply.send({ activeRun: null });
    }

    const claims = await listClaimsForRun(app.db, activeRun.id);
    const currentClaim = claims.find((c) =>
      !['acknowledged', 'expired', 'escalated', 'failed'].includes(c.status),
    );

    return reply.send({
      activeRun: serializeRun(activeRun),
      currentClaim: currentClaim
        ? {
            id: currentClaim.id,
            status: currentClaim.status,
            contactId: currentClaim.contactId,
            notifiedAt: currentClaim.notifiedAt?.toISOString() ?? null,
            expiresAt: currentClaim.expiresAt.toISOString(),
          }
        : null,
      claimCount: claims.length,
    });
  });

  // GET /api/release/runs — all release runs (most recent first)
  app.get('/api/release/runs', {
    preHandler: [app.requireAuth],
  }, async (_req, reply) => {
    const rows = await app.db
      .select()
      .from(releaseRuns)
      .orderBy(releaseRuns.createdAt);

    const runs = rows.map((r) => ({
      id: r.id,
      triggeringSwitchId: r.triggeringSwitchId,
      status: r.status,
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
      cancelledAt: r.cancelledAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));

    return reply.send({ runs });
  });

  // GET /api/release/runs/:id
  app.get('/api/release/runs/:id', {
    preHandler: [app.requireAuth],
  }, async (req, reply) => {
    const id = parseInt((req.params as { id: string }).id, 10);
    const run = await getReleaseRunById(app.db, id);
    if (!run) return reply.status(404).send({ error: 'Not found' });

    const claims = await listClaimsForRun(app.db, id);
    return reply.send({
      run: serializeRun(run),
      claims: claims.map((c) => ({
        id: c.id,
        contactId: c.contactId,
        status: c.status,
        notifiedAt: c.notifiedAt?.toISOString() ?? null,
        expiresAt: c.expiresAt.toISOString(),
        acknowledgedAt: c.acknowledgedAt?.toISOString() ?? null,
      })),
    });
  });

  // POST /api/release/runs/:id/cancel
  app.post('/api/release/runs/:id/cancel', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const id = parseInt((req.params as { id: string }).id, 10);
    const run = await getReleaseRunById(app.db, id);
    if (!run) return reply.status(404).send({ error: 'Not found' });

    if (run.status !== 'active' && run.status !== 'cascade_active') {
      return reply.status(409).send({ error: `Cannot cancel run in status '${run.status}'` });
    }

    await cancelReleaseRun(app.db, id);
    await markSwitchStatus(app.db, run.triggeringSwitchId, 'cancelled');

    await writeAuditEvent(app.db, {
      switchId: run.triggeringSwitchId,
      eventType: 'release_run_cancelled',
      actorType: 'owner',
      metadata: { releaseRunId: id },
    });

    return reply.send({ ok: true });
  });

  // POST /api/release/simulate — dry-run validation (no real notifications)
  app.post('/api/release/simulate', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (_req, reply) => {
    const allSwitches = await app.db.select().from(switches).where(
      eq(switches.status, 'armed'),
    );

    const issues: string[] = [];

    for (const sw of allSwitches) {
      let selectedContactIds: number[] = [];
      try { selectedContactIds = JSON.parse(sw.selectedContactIds ?? '[]'); } catch {}
      let selectedItemIds: number[] = [];
      try { selectedItemIds = JSON.parse(sw.selectedEstateItemIds ?? '[]'); } catch {}

      if (selectedContactIds.length === 0) {
        issues.push(`Switch "${sw.name}" has no contacts selected`);
      }
      if (selectedItemIds.length === 0) {
        issues.push(`Switch "${sw.name}" has no estate items selected`);
      }
    }

    return reply.send({
      valid: issues.length === 0,
      switchesChecked: allSwitches.length,
      issues,
    });
  });
}
