import { expect, test } from 'bun:test';
import { createDurableMmoServices, createMemoryDurableServiceStore } from '@hyperfocus/engine/server';
import { createRoomSocialService } from '../community/social.ts';
import { createUploadService } from './service.ts';

test('approved pixels require current shared membership and durable blocks survive rejoining', async () => {
  const records = new Map<string, unknown>();
  const persistence = {
    async loadPlayer(id: string) { return structuredClone(records.get(id) ?? null); },
    async savePlayer(id: string, record: unknown) { records.set(id, structuredClone(record)); },
  };
  const services = createDurableMmoServices(createMemoryDurableServiceStore());
  const social = createRoomSocialService({ persistence, services });
  const uploads = createUploadService({ persistence, allowedSlots: ['top'],
    allowView: ({ roomId, ownerId, viewerId }) => social.allowCommunication({ roomId, userId: viewerId, otherUserId: ownerId }),
  });
  const raster = { width: 1, height: 1, rgba: 'AQEBAQ==' };
  const submitted = await uploads.submit({ ownerId: 'owner', requestId: 'submit', expectedRevision: 0, raster });
  const uploadId = submitted.uploads[0]!.id;
  await uploads.review({ ownerId: 'owner', reviewerId: 'moderator', requestId: 'review', expectedRevision: 1, uploadId, status: 'approved', reason: '' });
  await uploads.equip({ ownerId: 'owner', requestId: 'equip', expectedRevision: 2, slotId: 'top', uploadId });
  const query = (roomId = 'friends') => ({ roomId, ownerId: 'owner', viewerId: 'viewer', uploadId });
  async function denied() {
    expect(await uploads.read(query())).toBeNull();
    expect(await uploads.listForViewer(query())).toEqual({ revision: 0, uploads: [], equipment: {} });
    expect(await uploads.readWithList(query())).toEqual({ revision: 0, uploads: [], equipment: {}, image: null });
  }
  await denied();
  for (const roomId of ['friends', 'other']) for (const userId of ['owner', 'viewer']) await social.join({ roomId, userId });
  expect((await uploads.read(query()))?.raster).toEqual(raster);
  await social.leave({ roomId: 'friends', userId: 'viewer' });await denied();
  expect((await uploads.read(query('other')))?.raster).toEqual(raster);
  await social.join({ roomId: 'friends', userId: 'viewer' });
  expect((await uploads.readWithList(query())).equipment).toEqual({ top: uploadId });
  await social.leave({ roomId: 'friends', userId: 'owner' });await denied();
  await social.join({ roomId: 'friends', userId: 'owner' });
  await social.handle({ roomId: 'friends', userId: 'viewer', command: { type: 'social-block', requestId: 'block', targetId: 'owner', enabled: true } });
  await social.dispose({ roomId: 'friends' });await social.dispose({ roomId: 'other' });await denied();
  for (const userId of ['owner', 'viewer']) await social.join({ roomId: 'friends', userId });
  await denied();
  await social.handle({ roomId: 'friends', userId: 'viewer', command: { type: 'social-block', requestId: 'unblock', targetId: 'owner', enabled: false } });
  expect((await uploads.read(query()))?.raster).toEqual(raster);
  // Leaving the audience never deletes an owner's durable equipment or pixels.
  expect((await uploads.list({ ownerId: 'owner' })).equipment).toEqual({ top: uploadId });
});
