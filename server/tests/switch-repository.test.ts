import { describe, it, expect, beforeAll } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createTestDb, type AegisDb } from '../src/db/index.js';
import {
  listSwitches,
  getSwitchById,
  createSwitch,
  updateSwitch,
  deleteSwitch,
  markSwitchStatus,
  getActiveReleaseRun,
  createReleaseRun,
} from '../src/services/switch-repository.js';

let db: AegisDb;

beforeAll(() => {
  db = createTestDb();
  migrate(db, { migrationsFolder: './drizzle' });
});

describe('switch-repository', () => {
  it('creates a switch and gets it back by ID', async () => {
    const created = await createSwitch(db, {
      name: 'My Switch',
      mode: 'heartbeat',
      deploymentMode: 'vault',
    });

    expect(created.id).toBeGreaterThan(0);
    expect(created.name).toBe('My Switch');
    expect(created.mode).toBe('heartbeat');

    const fetched = await getSwitchById(db, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.name).toBe('My Switch');
  });

  it('listSwitches returns created switch', async () => {
    const created = await createSwitch(db, {
      name: 'List Test Switch',
      mode: 'trip',
    });

    const list = await listSwitches(db);
    const found = list.find(s => s.id === created.id);
    expect(found).toBeDefined();
    expect(found?.name).toBe('List Test Switch');
  });

  it('updates switch name', async () => {
    const created = await createSwitch(db, {
      name: 'Original Name',
      mode: 'heartbeat',
    });

    const updated = await updateSwitch(db, created.id, { name: 'Updated Name' });
    expect(updated.name).toBe('Updated Name');
    expect(updated.id).toBe(created.id);

    const fetched = await getSwitchById(db, created.id);
    expect(fetched?.name).toBe('Updated Name');
  });

  it('deleteSwitch removes the switch', async () => {
    const created = await createSwitch(db, {
      name: 'To Delete',
      mode: 'trip',
    });

    await deleteSwitch(db, created.id);

    const fetched = await getSwitchById(db, created.id);
    expect(fetched).toBeNull();
  });

  it('getSwitchById returns null for missing ID', async () => {
    const result = await getSwitchById(db, 999999);
    expect(result).toBeNull();
  });

  it('selectedContactIds is parsed as number[] (not string)', async () => {
    const created = await createSwitch(db, {
      name: 'Contact IDs Test',
      mode: 'heartbeat',
      selectedContactIds: [1, 2, 3],
    });

    expect(Array.isArray(created.selectedContactIds)).toBe(true);
    expect(created.selectedContactIds).toEqual([1, 2, 3]);

    const fetched = await getSwitchById(db, created.id);
    expect(Array.isArray(fetched?.selectedContactIds)).toBe(true);
    expect(fetched?.selectedContactIds).toEqual([1, 2, 3]);
  });

  it('selectedEstateItemIds is parsed as number[] (not string)', async () => {
    const created = await createSwitch(db, {
      name: 'Estate IDs Test',
      mode: 'heartbeat',
      selectedEstateItemIds: [10, 20],
    });

    expect(Array.isArray(created.selectedEstateItemIds)).toBe(true);
    expect(created.selectedEstateItemIds).toEqual([10, 20]);

    const fetched = await getSwitchById(db, created.id);
    expect(Array.isArray(fetched?.selectedEstateItemIds)).toBe(true);
    expect(fetched?.selectedEstateItemIds).toEqual([10, 20]);
  });

  it('markSwitchStatus updates the status', async () => {
    const created = await createSwitch(db, {
      name: 'Status Test Switch',
      mode: 'heartbeat',
    });

    expect(created.status).toBe('draft');

    const updated = await markSwitchStatus(db, created.id, 'armed');
    expect(updated.status).toBe('armed');

    const fetched = await getSwitchById(db, created.id);
    expect(fetched?.status).toBe('armed');
  });

  it('getActiveReleaseRun returns null when none exists', async () => {
    // Use isolated DB for this test
    const isolatedDb = createTestDb();
    migrate(isolatedDb, { migrationsFolder: './drizzle' });

    const result = await getActiveReleaseRun(isolatedDb);
    expect(result).toBeNull();
  });

  it('createReleaseRun creates and returns release run', async () => {
    const sw = await createSwitch(db, {
      name: 'Release Run Test Switch',
      mode: 'trip',
    });

    const run = await createReleaseRun(db, sw.id);
    expect(run.id).toBeGreaterThan(0);
    expect(run.triggeringSwitchId).toBe(sw.id);
    expect(run.status).toBe('active');
    expect(run.completedAt).toBeNull();
    expect(run.cancelledAt).toBeNull();
  });

  it('getActiveReleaseRun returns the active release run after creation', async () => {
    // Use isolated DB to avoid interference from other tests
    const isolatedDb = createTestDb();
    migrate(isolatedDb, { migrationsFolder: './drizzle' });

    const sw = await createSwitch(isolatedDb, {
      name: 'Active Run Switch',
      mode: 'trip',
    });

    await createReleaseRun(isolatedDb, sw.id);

    const active = await getActiveReleaseRun(isolatedDb);
    expect(active).not.toBeNull();
    expect(active?.triggeringSwitchId).toBe(sw.id);
    expect(active?.status).toBe('active');
  });
});
