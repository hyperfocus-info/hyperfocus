import { expect, test } from 'bun:test';
import { isServerSocket } from './server-admission.ts';

test('socket narrowing proves both required transport operations before admission uses the port', () => {
  for (const value of [null, undefined, {}, { send() {} }, { close() {} }, { send() {}, close: 1 }, { send: 1, close() {} }]) expect(isServerSocket(value)).toBe(false);
  expect(isServerSocket({ send() {}, close() {} })).toBe(true);
  expect(isServerSocket({ data: null, send() { return 0; }, close() {} })).toBe(true);
});
