import { applyAppearanceTexture3D, resolveAppearanceTexture3D, type AppearanceCatalog3D, type Hyperfocus3DEvaluatedFrame, type Hyperfocus3DRuntime, type ResolvedAppearanceTexture3D } from '@hyperfocus/engine/project/runtime-3d';
import { readUploadResponse, type UploadCommand, type UploadResponse } from '@hyperfocus/touch-of-death/uploads/protocol';
import { uploadRasterBytes, type UploadRaster } from '@hyperfocus/touch-of-death/uploads/raster';

type Owner = { ownerId: string; actors: string[]; status: 'loading' | 'ready' | 'error'; error: string; retryAt: number; targets: ResolvedAppearanceTexture3D[]; emblem?: Readonly<UploadRaster>; releasePending?: () => void };
type View = { identity: string; active: boolean; actors: Array<{ actorId: string; ownerId: string }>; blocked: string[]; hidden: boolean };

/** Shared presentation pixels only. One background request lane, fenced by room/owner visibility. */
export function createEquippedUploads(options: {
  catalog: AppearanceCatalog3D; runtime: Pick<Hyperfocus3DRuntime, 'replaceTexture' | 'resetTexture'>;
  request(command: UploadCommand): Promise<UploadResponse>; now?: () => number;
}) {
  const owners = new Map<string, Owner>(), now = options.now ?? Date.now;
  let identity = '', disposed = false, busy = false;
  const current = (owner: Owner) => !disposed && owners.get(owner.ownerId) === owner;
  function clear(owner: Owner) {
    owners.delete(owner.ownerId);
    owner.releasePending?.();owner.releasePending = undefined;
    for (const target of owner.targets) { try { options.runtime.resetTexture({ textureId: target.textureId }); } catch {} }
    owner.targets = [];owner.emblem = undefined;
  }
  async function request(owner: Owner, type: 'upload-list' | 'upload-read', uploadId?: string) {
    const requestId = crypto.randomUUID();
    const response = readUploadResponse(await options.request(type === 'upload-list' ? { type, requestId, ownerId: owner.ownerId } : { type, requestId, ownerId: owner.ownerId, uploadId: uploadId! }));
    if (!current(owner)) return undefined;
    if (response.requestId !== requestId || response.ownerId !== owner.ownerId || response.error) throw new Error(response.error || 'Picture response identity changed.');
    return response;
  }
  async function load(owner: Owner) {
    try {
      const listing = await request(owner, 'upload-list');if (!listing) return;
      const equipment = Object.entries(listing.equipment ?? {});
      const jobs = new Map<string, { uploadId: string; targets: ResolvedAppearanceTexture3D[]; emblem: boolean }>();
      for (const [slotId, uploadId] of equipment) {
        const emblem = slotId === 'profile-emblem';
        if (emblem && !listing.emblemEnabled) continue;
        const job = jobs.get(uploadId) ?? { uploadId, targets: [], emblem: false };
        if (emblem) job.emblem = true;
        else job.targets.push(...owner.actors.map(actorId => resolveAppearanceTexture3D({ catalog: options.catalog, actorId, slotId })));
        jobs.set(uploadId, job);
      }
      // Validate every target before requesting pixels or changing any runtime texture.
      const decoded: Array<{ targets: ResolvedAppearanceTexture3D[]; width: number; height: number; pixels: Uint8Array; emblem?: Readonly<UploadRaster> }> = [];
      owner.releasePending = () => { decoded.length = 0; };
      for (const job of jobs.values()) {
        const response = await request(owner, 'upload-read', job.uploadId);if (!response) return;
        const available = response.uploads.find(upload => upload.id === job.uploadId && upload.status !== 'rejected');
        if (response.emblemEnabled !== listing.emblemEnabled || !available || available.hash !== listing.uploads.find(upload => upload.id === job.uploadId)?.hash || !response.raster || response.uploadId !== job.uploadId || response.revision !== listing.revision
          || Object.keys(response.equipment ?? {}).length !== equipment.length || equipment.some(([slot, id]) => response.equipment?.[slot] !== id)) throw new Error('Equipped pictures changed. Try again.');
        decoded.push({ targets: job.targets, width: response.raster.width, height: response.raster.height, pixels: new Uint8Array(uploadRasterBytes(response.raster)), ...(job.emblem ? { emblem: Object.freeze({ ...response.raster }) } : {}) });
      }
      if (!current(owner)) return;
      for (const image of decoded) for (const target of image.targets) {
        owner.targets.push(target);options.runtime.replaceTexture({ textureId: target.textureId, width: image.width, height: image.height, pixels: image.pixels });
      }
      owner.emblem = decoded.find(image => image.emblem)?.emblem;
      owner.status = 'ready';decoded.length = 0;owner.releasePending = undefined;
    } catch (cause) {
      if (!current(owner)) return;
      owner.releasePending?.();owner.releasePending = undefined;
      for (const target of owner.targets) { try { options.runtime.resetTexture({ textureId: target.textureId }); } catch {} }
      owner.targets = [];owner.emblem = undefined;owner.status = 'error';owner.error = cause instanceof Error ? cause.message : 'Could not load equipped pictures.';owner.retryAt = now() + 10000;
    }
  }
  function pump() {
    if (busy || disposed) return;
    const owner = [...owners.values()].find(owner => owner.status === 'loading' || owner.status === 'error' && now() >= owner.retryAt);
    if (!owner) return;busy = true;owner.status = 'loading';owner.error = '';
    void load(owner).finally(() => { busy = false;pump(); });
  }
  return {
    sync(view: View) {
      if (disposed) return;
      const valid = view.active && !view.hidden && !!view.identity && view.actors.length <= 4 && new Set(view.actors.map(actor => actor.actorId)).size === view.actors.length;
      if (view.identity !== identity || !valid) { for (const owner of [...owners.values()]) clear(owner);identity = view.identity; }
      if (!valid) return;
      const desired = new Map<string, string[]>();
      for (const actor of view.actors) {
        if (!actor.ownerId || view.blocked.includes(actor.ownerId) || !options.catalog.actors.some(item => item.entityId === actor.actorId)) continue;
        desired.set(actor.ownerId, [...(desired.get(actor.ownerId) ?? []), actor.actorId]);
      }
      for (const owner of [...owners.values()]) if (JSON.stringify(desired.get(owner.ownerId)?.sort()) !== JSON.stringify([...owner.actors].sort())) clear(owner);
      for (const [ownerId, actors] of desired) if (!owners.has(ownerId)) owners.set(ownerId, { ownerId, actors, status: 'loading', error: '', retryAt: 0, targets: [] });
      pump();
    },
    apply(frame: Hyperfocus3DEvaluatedFrame) {
      for (const owner of [...owners.values()]) if (owner.status === 'ready') {
        if (owner.targets.some(target => !frame.materials.some(material => material.id === target.materialId))) { clear(owner);continue; }
        for (const target of owner.targets) applyAppearanceTexture3D({ frame, target });
      }
    },
    invalidate(ownerId: string) { const owner = owners.get(ownerId);if (owner) clear(owner); },
    emblem(actorId: string) { return [...owners.values()].find(owner => owner.status === 'ready' && owner.actors.includes(actorId))?.emblem; },
    get state() { return [...owners.values()].map(({ ownerId, actors, status, error, targets, emblem }) => ({ ownerId, emblemReady: !!emblem, actors: [...actors], status, error, targets: targets.map(target => ({ ...target })) })); },
    dispose() { disposed = true;for (const owner of [...owners.values()]) clear(owner); },
  };
}
