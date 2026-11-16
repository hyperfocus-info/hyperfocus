import { afterEach, expect, test } from 'bun:test';
import { createModerationPanel } from '../src/uploads/moderation-panel.ts';
import { mountModerationEntry } from '../src/uploads/moderation-entry.ts';
import type { ModerationCommand, ModerationResponse, UploadReportMetadata } from '../src/uploads/moderation-protocol.ts';
afterEach(() => document.body.replaceChildren());
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const item = { id: 'picture', hash: 'a'.repeat(64), width: 1, height: 1, status: 'pending' as const, reason: '<img src=x>' };
const result = (command: ModerationCommand, changes: Partial<ModerationResponse> = {}): ModerationResponse => ({ type: 'moderation-result', requestId: command.requestId, error: '', owners: [], reporters: [], nextCursor: '', ownerId: '', revision: 0, uploads: [], uploadId: '', raster: null, reporterId: '', reports: [], ...changes });
function fixture(request: (command: ModerationCommand) => Promise<ModerationResponse>) {
  const host = document.createElement('section');document.body.append(host);let draws = 0;
  const panel = createModerationPanel({ host, request, draw() { draws++; } });
  const button = (key: string) => host.querySelector<HTMLButtonElement>(`[data-moderation-${key}]`)!;
  return { host, panel, button, draws: () => draws };
}

test('moderator paginates owners, previews before approval, and retries the exact revision-checked decision', async () => {
  const commands: ModerationCommand[] = [];let fail = true;
  const f = fixture(async command => {
    commands.push(command);
    if (command.type === 'moderation-owners') return result(command, { owners: ['alice'], nextCursor: 'next' });
    if (command.type === 'moderation-review' && fail) throw new Error('Connection interrupted');
    return result(command, { ownerId: 'alice', revision: command.type === 'moderation-review' ? 8 : 7, uploads: [item], ...(command.type === 'moderation-preview' ? { uploadId: 'picture', raster: { width: 1, height: 1, rgba: '/wAA/w==' } } : {}) });
  });
  expect(commands).toHaveLength(0);f.button('owners').click();await flush();expect(f.button('owners-next').disabled).toBe(false);f.button('owners-next').click();await flush();expect(commands.at(-1)).toMatchObject({ cursor: 'next' });
  f.button('load-owner').click();await flush();expect(f.host.querySelector('img')).toBeNull();expect(f.host.textContent).toContain('Revision 7');expect(f.button('approve').disabled).toBe(true);
  f.button('reject').click();await flush();expect(f.host.textContent).toContain('Explain why');expect(commands.some(command => command.type === 'moderation-review')).toBe(false);
  f.button('preview').focus();const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });f.button('preview').dispatchEvent(enter);expect(enter.defaultPrevented).toBe(false);f.button('preview').click();await flush();expect(f.draws()).toBe(1);expect(f.button('approve').disabled).toBe(false);
  f.button('approve').click();await flush();const decision = commands.at(-1);expect(decision).toMatchObject({ type: 'moderation-review', expectedRevision: 7, ownerId: 'alice', uploadId: 'picture', status: 'approved' });fail = false;f.button('retry').click();await flush();expect(commands.at(-1)).toEqual(decision);expect(f.button('approve').disabled).toBe(true);expect(f.host.textContent).toContain('decision saved');f.panel.dispose();
});

test('report resolution requires a reason and never changes picture approval', async () => {
  const commands: ModerationCommand[] = [];
  const report: UploadReportMetadata = { id: 'report', reporterId: 'bob', ownerId: 'alice', uploadId: 'picture', contentId: 'a'.repeat(64), roomId: 'friends', reason: 'inappropriate', createdAt: 1, status: 'pending', reviewerId: '', reviewedAt: null, resolution: '' };
  const f = fixture(async command => { commands.push(command);return result(command, command.type === 'moderation-reporters' ? { reporters: ['bob'] } : { reporterId: 'bob', revision: 4, reports: [report] }); });
  f.button('reports-tab').click();f.button('reporters').click();await flush();f.button('load-reports').click();await flush();f.button('reviewed').click();await flush();expect(f.host.textContent).toContain('Explain the report decision');
  f.host.querySelector<HTMLInputElement>('[data-moderation-resolution]')!.value = 'Reviewed against host policy';f.button('dismissed').click();await flush();expect(commands.at(-1)).toMatchObject({ type: 'moderation-resolve', reporterId: 'bob', reportId: 'report', expectedRevision: 4, status: 'dismissed', resolution: 'Reviewed against host policy' });expect(commands.some(command => command.type === 'moderation-review')).toBe(false);expect(f.host.textContent).toContain('approval is unchanged');f.panel.dispose();
});

test('disposing while an image is in flight cannot draw it into the detached page', async () => {
  let finish!: (value: ModerationResponse) => void;let pending: ModerationCommand | undefined;
  const f = fixture(async command => { if (command.type === 'moderation-preview') { pending = command;return new Promise(resolve => { finish = resolve; }); }return result(command, command.type === 'moderation-owners' ? { owners: ['alice'] } : { ownerId: 'alice', revision: 1, uploads: [item] }); });
  f.button('owners').click();await flush();f.button('load-owner').click();await flush();f.button('preview').click();f.panel.dispose();finish(result(pending!, { ownerId: 'alice', revision: 1, uploads: [item], uploadId: 'picture', raster: { width: 1, height: 1, rgba: '/wAA/w==' } }));await flush();expect(f.draws()).toBe(0);
});

test('moderator credentials are submitted only in the header, cleared from the field, and aborted on disconnect', async () => {
  const host = document.createElement('section');document.body.append(host);let headers: HeadersInit | undefined, body = '', signal: AbortSignal | null | undefined;
  const entry = mountModerationEntry({ host, fetch: Object.assign(async (_url: RequestInfo | URL, options?: RequestInit) => { headers = options?.headers;body = String(options?.body);signal = options?.signal;return new Promise<Response>(() => {}); }, { preconnect() {} }) });
  expect(headers).toBeUndefined();const token = host.querySelector<HTMLInputElement>('[data-moderation-token]')!;token.value = 'private-secret';host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));expect(token.value).toBe('');expect(host.textContent).toContain('Verifying moderator access');
  expect(new Headers(headers).get('Authorization')).toBe('Bearer private-secret');expect(body).not.toContain('private-secret');expect(host.textContent).not.toContain('private-secret');
  host.querySelector<HTMLButtonElement>('[data-moderation-disconnect]')!.click();expect(signal?.aborted).toBe(true);expect(host.querySelector('[data-moderation-image-section]')).toBeNull();entry.dispose();
});

test('Connect verifies access before claiming success and returns denied credentials to the login flow', async () => {
  const host = document.createElement('section');document.body.append(host);let allowed = false;
  const entry = mountModerationEntry({ host, fetch: Object.assign(async (_url: RequestInfo | URL, options?: RequestInit) => allowed ? new Response(JSON.stringify(result(JSON.parse(String(options?.body)), { owners: ['alice'] })), { status: 200 }) : new Response('', { status: 403 }), { preconnect() {} }) });
  const token = host.querySelector<HTMLInputElement>('[data-moderation-token]')!, form = host.querySelector('form')!;
  token.value = 'bad';form.dispatchEvent(new Event('submit', { cancelable: true }));await flush();expect(host.textContent).toContain('access was denied');expect(form.hidden).toBe(false);expect(token.value).toBe('');
  allowed = true;token.value = 'valid';form.dispatchEvent(new Event('submit', { cancelable: true }));await flush();expect(host.textContent).toContain('access verified');expect(host.querySelector<HTMLSelectElement>('[data-moderation-owner]')!.value).toBe('alice');entry.dispose();
});

test('reported picture navigation pins its actual owner and a superseded owner response cannot replace selection', async () => {
  let complete!: (value: ModerationResponse) => void;let pending: ModerationCommand | undefined;
  const report: UploadReportMetadata = { id: 'report', reporterId: 'bob', ownerId: 'target', uploadId: 'picture', contentId: 'a'.repeat(64), roomId: 'friends', reason: 'inappropriate', createdAt: 1, status: 'pending', reviewerId: '', reviewedAt: null, resolution: '' };
  const f = fixture(async command => {
    if (command.type === 'moderation-owners') return result(command, { owners: ['different'] });
    if (command.type === 'moderation-reporters') return result(command, { reporters: ['bob'] });
    if (command.type === 'moderation-reports') return result(command, { reporterId: 'bob', reports: [report] });
    if (command.type === 'moderation-owner' && command.ownerId === 'different') { pending = command;return new Promise(resolve => { complete = resolve; }); }
    return result(command, { ownerId: 'target', revision: 3, uploads: [item] });
  });
  f.button('owners').click();await flush();f.button('reports-tab').click();f.button('reporters').click();await flush();f.button('load-reports').click();await flush();f.button('report-image').click();await flush();
  const owner = f.host.querySelector<HTMLSelectElement>('[data-moderation-owner]')!;expect(owner.value).toBe('target');expect(f.host.textContent).toContain('Owner: target');expect(f.button('approve').disabled).toBe(true);
  owner.value = 'different';owner.dispatchEvent(new Event('change'));f.button('load-owner').click();owner.value = 'target';owner.dispatchEvent(new Event('change'));complete(result(pending!, { ownerId: 'different', revision: 9, uploads: [item] }));await flush();expect(owner.value).toBe('target');expect(f.button('approve').disabled).toBe(true);expect(f.host.querySelector<HTMLSelectElement>('[data-moderation-upload]')!.value).toBe('');f.panel.dispose();
});
