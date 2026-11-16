import { z } from 'zod';
import { validateRequest } from 'twilio/lib/webhooks/webhooks';
import { exactOrigin, readBody } from './http';
import { textAddressSchema, type TextChannel } from './text-channel';

const sid = z.string().regex(/^SM[a-fA-F0-9]{32}$/);
const message = z.object({ sid, account_sid: z.string(), from: z.string(), to: z.string(), body: z.string(), direction: z.string(), date_sent: z.string().nullable(), status: z.string() });

/** Small REST adapter; only the provider's signature validator is imported from its SDK. */
export function createTwilioText(options: { accountSid?: string; authToken?: string; from?: string; origin: string; path?: string; deliveryPath?: string; fetcher?: typeof fetch }): TextChannel {
  const available = Boolean(options.accountSid && /^AC[a-fA-F0-9]{32}$/.test(options.accountSid) && options.authToken && textAddressSchema.safeParse(options.from).success);
  const callback = `${exactOrigin(options.origin)}${options.path ?? '/api/text/inbound'}`, root = `https://api.twilio.com/2010-04-01/Accounts/${options.accountSid}`;
  const deliveryCallback = `${exactOrigin(options.origin)}${options.deliveryPath ?? '/api/text/delivery'}`;
  async function request(path: string, body?: URLSearchParams) {
    if (!available) throw new Error('Text messaging is not configured on this host.');
    const response = await (options.fetcher ?? fetch)(root + path, { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Authorization: `Basic ${Buffer.from(`${options.accountSid}:${options.authToken}`).toString('base64')}`, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) }, body: body?.toString() });
    if (!response.ok) throw new Error(`Text provider returned ${response.status}. Delivery is unconfirmed; do not automatically resend.`);
    const raw = await response.text(); if (raw.length > 30000) throw new Error('Text provider response exceeded the limit.');
    const value: unknown = JSON.parse(raw);
    return value;
  }
  async function signedForm(incoming: Request, url: string) {
    if (!available || incoming.method !== 'POST' || new URL(incoming.url).search || !incoming.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) throw new Error('Invalid text callback.');
    const form = new URLSearchParams(Buffer.from(await readBody(incoming, 16000)).toString('utf8'));
    const params: Record<string, string> = Object.create(null);
    for (const [key, value] of form) { if (Object.hasOwn(params, key)) throw new Error('Duplicate callback parameters are not accepted.'); params[key] = value; }
    if (!validateRequest(options.authToken!, incoming.headers.get('x-twilio-signature') ?? '', url, params) || params.AccountSid !== options.accountSid) throw new Error('Text callback could not be authenticated.');
    return params;
  }
  return { available, sender: options.from ?? '',
    async send(input) {
      const remaining = Math.floor((Date.parse(input.expiresAt) - Date.now()) / 1000);
      if (remaining < 5) throw new Error('The text approval expires too soon to send.');
      const result = message.parse(await request('/Messages.json', new URLSearchParams({ To: textAddressSchema.parse(input.to), From: options.from ?? '', Body: z.string().min(1).max(1400).parse(input.text), ValidityPeriod: String(Math.min(36000, remaining)), StatusCallback: deliveryCallback })));
      if (['failed', 'undelivered', 'canceled'].includes(result.status)) throw new Error('The provider did not accept the text.');
      return { id: result.sid };
    },
    async receive(incoming) {
      const params = await signedForm(incoming, callback);
      if (params.To !== options.from) throw new Error('Text callback destination does not match.');
      const id = sid.parse(params.MessageSid), record = message.parse(await request(`/Messages/${id}.json`));
      if (record.sid !== id || record.account_sid !== options.accountSid || record.direction !== 'inbound' || record.from !== params.From || record.to !== params.To || record.body !== params.Body || !record.date_sent) throw new Error('The text does not match the provider record.');
      const sent = Date.parse(record.date_sent); if (!Number.isFinite(sent) || sent > Date.now() + 10000) throw new Error('The text timestamp is unavailable.');
      return { id, from: textAddressSchema.parse(record.from), to: textAddressSchema.parse(record.to), text: record.body, sentAt: new Date(sent).toISOString() };
    },
    async delivery(incoming) {
      const params = await signedForm(incoming, deliveryCallback), id = sid.parse(params.MessageSid), record = message.parse(await request(`/Messages/${id}.json`));
      if (record.sid !== id || record.account_sid !== options.accountSid || record.from !== options.from || !record.direction.startsWith('outbound')) throw new Error('Delivery does not match this channel.');
      return { id, recipient: textAddressSchema.parse(record.to), status: ['failed', 'undelivered', 'canceled'].includes(record.status) ? 'failed' : ['delivered', 'read'].includes(record.status) ? 'delivered' : 'accepted' };
    },
  };
}
