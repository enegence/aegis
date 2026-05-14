import type { FastifyInstance } from 'fastify';
import { unlinkSync, existsSync } from 'fs';
import {
  listPacketsBySwitchId,
  getPacketById,
  type PacketRecord,
} from '../repositories/packet-repository.js';
import { buildPacket, PacketBuildError } from '../services/packet-builder.js';
import { eq } from 'drizzle-orm';
import { packets } from '../db/schema.js';
import { writeAuditEvent } from '../services/audit.js';

function toPublicRecord(r: PacketRecord) {
  return {
    id: r.id,
    switchId: r.switchId,
    releaseRunId: r.releaseRunId,
    version: r.version,
    schemaVersion: r.schemaVersion,
    encryptionAlgorithm: r.encryptionAlgorithm,
    keyId: r.keyId,
    contentHash: r.contentHash,
    encryptedObjectHash: r.encryptedObjectHash,
    storageProvider: r.storageProvider,
    storageBucket: r.storageBucket,
    storageObjectKey: r.storageObjectKey,
    deletionStatus: r.deletionStatus,
    lastVerifiedAt: r.lastVerifiedAt?.toISOString() ?? null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function packetRoutes(app: FastifyInstance) {
  app.get('/api/packets', {
    preHandler: [app.requireAuth],
  }, async (_req, reply) => {
    const allPackets = await app.db.select().from(packets);
    return reply.send(allPackets.map((r) => toPublicRecord({
      id: r.id,
      switchId: r.switchId,
      releaseRunId: r.releaseRunId ?? null,
      version: r.version,
      schemaVersion: r.schemaVersion,
      encryptionAlgorithm: r.encryptionAlgorithm,
      keyId: r.keyId,
      contentHash: r.contentHash,
      encryptedObjectHash: r.encryptedObjectHash ?? null,
      localCiphertextPath: r.localCiphertextPath ?? null,
      storageProvider: r.storageProvider ?? null,
      storageBucket: r.storageBucket ?? null,
      storageObjectKey: r.storageObjectKey ?? null,
      storageRegion: r.storageRegion ?? null,
      storageVersionId: r.storageVersionId ?? null,
      deletionStatus: r.deletionStatus ?? null,
      lastVerifiedAt: r.lastVerifiedAt ?? null,
      expiresAt: r.expiresAt ?? null,
      createdAt: r.createdAt,
    })));
  });

  app.get('/api/packets/:id', {
    preHandler: [app.requireAuth],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const record = await getPacketById(app.db, parseInt(id));
    if (!record) return reply.status(404).send({ error: 'Not found' });
    return reply.send(toPublicRecord(record));
  });

  app.get('/api/switches/:id/packets', {
    preHandler: [app.requireAuth],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const list = await listPacketsBySwitchId(app.db, parseInt(id));
    return reply.send(list.map(toPublicRecord));
  });

  app.post('/api/switches/:id/packets/generate', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const switchId = parseInt(id);
    try {
      const record = await buildPacket(
        app.db,
        app.config.fieldEncryptionKey,
        app.config.dataDir,
        switchId,
      );
      return reply.status(201).send(toPublicRecord(record));
    } catch (err) {
      if (err instanceof PacketBuildError) {
        return reply.status(422).send({ error: err.message });
      }
      throw err;
    }
  });

  app.delete('/api/packets/:id', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const packetId = parseInt(id);
    const record = await getPacketById(app.db, packetId);
    if (!record) return reply.status(404).send({ error: 'Not found' });

    if (record.localCiphertextPath && existsSync(record.localCiphertextPath)) {
      unlinkSync(record.localCiphertextPath);
    }

    await app.db
      .update(packets)
      .set({ deletionStatus: 'deleted' })
      .where(eq(packets.id, packetId));

    await writeAuditEvent(app.db, {
      switchId: record.switchId,
      eventType: 'packet_deleted',
      actorType: 'owner',
      metadata: { packetId, version: record.version },
    });

    return reply.status(204).send();
  });
}
