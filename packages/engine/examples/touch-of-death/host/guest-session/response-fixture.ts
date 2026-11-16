import { readObject } from '@hyperfocus/utilities/validation';
import { requireText } from '@hyperfocus/utilities/text';

/** Session/recovery HTTP fixtures require both actual string fields before using a token. */
export function readIssuedSession(value: unknown) { return readObject(value, { token: requireText, lease: requireText }); }
