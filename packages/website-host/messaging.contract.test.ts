import { expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import { approvalPolicySchema, approvalRoute, notificationsMuted } from '@hyperfocus/website-host/approval-policy';
import { parseMute } from '@hyperfocus/website-host/mute';
import { ownerForReply } from '@hyperfocus/website-host/text-channel';
import { createTwilioText } from '@hyperfocus/website-host/twilio';

test('owner approval defaults hold; mute suppresses approvals but does not revoke automatic entry authority', () => {
  const policy = approvalPolicySchema.parse({});
  expect(approvalRoute(policy, { automaticEligible: true, confirmationRequired: false })).toBe('app');
  policy.mode = 'automatically-approve'; policy.mutedUntil = '2030-01-01T00:00:00.000Z';
  expect(notificationsMuted(policy, Date.parse('2026-01-01'))).toBe(true);
  expect(approvalRoute(policy, { automaticEligible: true, confirmationRequired: false })).toBe('automatic');
  expect(approvalRoute(policy, { automaticEligible: true, confirmationRequired: true })).toBe('muted');
  delete policy.mutedUntil;
  expect(approvalRoute(policy, { automaticEligible: false, confirmationRequired: false })).toBe('text');
});
test('mute grammar distinguishes minutes/months and honors local midnight and DST', () => {
  const at = { timeZone: 'America/New_York', now: Date.parse('2026-01-31T17:30:00Z') };
  expect(parseMute('mute 5m', at)).toBe('2026-01-31T17:35:00.000Z');
  expect(parseMute('2M', at)).toBe('2026-03-31T16:30:00.000Z');
  expect(parseMute('1M', at)).toBe('2026-02-28T17:30:00.000Z');
  for (const [input, hours] of [['1D', 24], ['4H', 4], ['1W', 168]] as const) expect(Date.parse(parseMute(input, at)) - at.now).toBe(hours * 3600000);
  expect(parseMute('until tommorow', { ...at, now: Date.parse('2026-03-08T06:30:00Z') })).toBe('2026-03-09T04:00:00.000Z');
  expect(parseMute('until 2026-02-01T00:00:00-05:00', at)).toBe('2026-02-01T05:00:00.000Z');
  for (const value of ['0m', '-1D', '25M', '2030-01-01', 'until next month', '2026-02-31T12:00:00Z', '2026-02-01T24:00:00Z']) expect(() => parseMute(value, at)).toThrow();
  expect(() => parseMute('1M', { timeZone: 'America/New_York', now: Date.parse('2026-02-08T07:30:00Z') })).toThrow('missing or ambiguous');
});
test('recipient mapping permits many scopes for one owner and never ambiguous ownership', () => {
  const binding = { address: '+12025550123', channel: 'sms:sender', verifiedAt: new Date().toISOString(), scopes: ['financial:a', 'financial:b'] };
  expect(ownerForReply([{ owner: 'one', binding }], binding.address, binding.channel)).toBe('one');
  expect(() => ownerForReply([{ owner: 'one', binding }, { owner: 'two', binding }], binding.address, binding.channel)).toThrow('unique');
  expect(() => ownerForReply([{ owner: 'one', binding }], binding.address, 'another-channel')).toThrow('unique');
});
test('Twilio contract: canonical signed callback, provider timestamps, bounded send and no retries', async () => {
  const accountSid = `AC${'a'.repeat(32)}`, sid = `SM${'b'.repeat(32)}`, token = 'fixture-token', origin = 'https://trade.example.com', from = '+12025550199', to = '+12025550123';
  let calls = 0, fail = false, mismatch = false, delivery = false;
  const fetcher: typeof fetch = Object.assign(async (url: string | URL | Request, init?: RequestInit) => {
    calls++; expect(String(url)).toStartWith(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages`); expect(init?.redirect).toBe('error');
    if (fail) throw new Error('lost response');
    if (init?.method === 'POST') {
      const body = new URLSearchParams(String(init.body)); expect(body.get('To')).toBe(to); expect(Number(body.get('ValidityPeriod'))).toBeLessThanOrEqual(120); expect(body.get('Body')).toBe('Approval fixture');
      return Response.json({ sid, account_sid: accountSid, from, to, body: 'Approval fixture', direction: 'outbound-api', date_sent: null, status: 'queued' });
    }
    return Response.json({ sid, account_sid: accountSid, from: delivery ? from : to, to: delivery ? to : from, body: mismatch ? 'different' : '1', direction: delivery ? 'outbound-api' : 'inbound', date_sent: new Date().toUTCString(), status: delivery ? 'undelivered' : 'received' });
  }, { preconnect() {} });
  const channel = createTwilioText({ accountSid, authToken: token, from, origin, fetcher });
  expect(channel.available).toBe(true);
  expect(await channel.send({ to, text: 'Approval fixture', expiresAt: new Date(Date.now() + 120000).toISOString() })).toEqual({ id: sid });
  const params = { AccountSid: accountSid, MessageSid: sid, From: to, To: from, Body: '1', ExtraFutureField: 'accepted' };
  // Independent HMAC fixture follows Twilio's published canonical algorithm.
  const signature = createHmac('sha1', token).update(`${origin}/api/text/inbound` + Object.entries(params).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, value]) => key + value).join('')).digest('base64');
  const request = (body = new URLSearchParams(params).toString(), sig = signature) => new Request(`${origin}/api/text/inbound`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': sig }, body });
  const received = await channel.receive(request()); expect(received.from).toBe(to); expect(received.text).toBe('1'); expect(received.sentAt).toEndWith('Z');
  await expect(channel.receive(request(undefined, 'forged'))).rejects.toThrow('authenticated');
  await expect(channel.receive(request(new URLSearchParams({ ...params, Body: '0' }).toString()))).rejects.toThrow('authenticated');
  await expect(channel.receive(request(`${new URLSearchParams(params)}&Body=1`))).rejects.toThrow('Duplicate');
  mismatch = true; await expect(channel.receive(request())).rejects.toThrow('provider record');
  delivery = true;
  const deliveryParams = { AccountSid: accountSid, MessageSid: sid, MessageStatus: 'undelivered' }, deliveryUrl = `${origin}/api/text/delivery`;
  const deliverySignature = createHmac('sha1', token).update(deliveryUrl + Object.entries(deliveryParams).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, value]) => key + value).join('')).digest('base64');
  expect(await channel.delivery!(new Request(deliveryUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': deliverySignature }, body: new URLSearchParams(deliveryParams) }))).toEqual({ id: sid, recipient: to, status: 'failed' });
  fail = true; const before = calls; await expect(channel.send({ to, text: 'Approval fixture', expiresAt: new Date(Date.now() + 120000).toISOString() })).rejects.toThrow('lost response'); expect(calls - before).toBe(1);
  expect(createTwilioText({ origin }).available).toBe(false);
});
