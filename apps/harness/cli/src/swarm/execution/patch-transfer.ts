import { createHash } from 'node:crypto';

/** Shared admission/retention ceiling; each command remains below the provider's 64k limit. */
export const swarmPatchByteLimit = 262_144;

export function swarmPatchApplyCommands(bytes: Uint8Array) {
  if (bytes.length > swarmPatchByteLimit) throw Error(`Candidate patch exceeds the ${swarmPatchByteLimit}-byte apply limit; split the requested scope.`);
  const encoded = Buffer.from(bytes).toString('base64');
  if (encoded.length <= 48_000) return [`printf '%s' '${encoded}' | base64 -d | git apply --whitespace=error -`];
  const path = `/tmp/hyperfocus-patch-${crypto.randomUUID()}`, commands: string[] = [];
  for (let offset = 0; offset < encoded.length; offset += 48_000) {
    commands.push(`umask 077; printf '%s' '${encoded.slice(offset, offset + 48_000)}' ${offset ? '>>' : '>'} ${path}.b64`);
  }
  const digest = createHash('sha256').update(bytes).digest('hex');
  commands.push(`set -eu; trap 'rm -f ${path}.b64 ${path}.patch' EXIT; base64 -d ${path}.b64 > ${path}.patch; printf '%s  %s\\n' '${digest}' '${path}.patch' | sha256sum -c - >/dev/null; git apply --whitespace=error ${path}.patch`);
  return commands;
}
