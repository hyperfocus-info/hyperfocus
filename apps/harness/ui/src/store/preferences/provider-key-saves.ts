import type { ClientCommand, ServerEvent } from "@hyperfocus/ai-core/protocol";

const keyFields = ["openAiApiKey", "googleApiKey", "anthropicApiKey"] as const;
type KeyField = typeof keyFields[number];
type Drafts = Record<`${KeyField}Draft`, string>;

/** Keep drafts until the matching server acknowledgement, including edits made in flight. */
export function createProviderKeySaves() {
  const pending = new Map<KeyField, { requestId: string; value: string }>();
  const tests = new Map<string, { requestId: string; value: string }>();
  return {
    reset() { pending.clear(); tests.clear(); },
    track(command: ClientCommand) {
      if (command.type === "preferences.testProviderConnection") {
        tests.set(command.payload.provider, { requestId: command.requestId, value: command.payload.apiKey ?? "" });
      }
      if (command.type !== "preferences.save") return;
      for (const key of keyFields) {
        const value = command.payload[key];
        if (value) pending.set(key, { requestId: command.requestId, value });
      }
    },
    accepts(event: ServerEvent, state: Drafts) {
      if (event.type !== "preferences.providerConnectionTested") return true;
      const test = tests.get(event.payload.provider);
      const fields = { openai: "openAiApiKeyDraft", google: "googleApiKeyDraft", anthropic: "anthropicApiKeyDraft" } as const;
      return !test || (test.requestId === event.requestId && test.value === state[fields[event.payload.provider]].trim());
    },
    apply(event: ServerEvent, state: Drafts): Partial<Drafts> {
      if (event.type !== "preferences.saved" && event.type !== "command.rejected") return {};
      const patch: Partial<Drafts> = {};
      for (const [key, saved] of pending) {
        if (saved.requestId !== event.requestId) continue;
        pending.delete(key);
        const field = `${key}Draft` as const;
        if (event.type === "preferences.saved" && state[field].trim() === saved.value) patch[field] = "";
      }
      return patch;
    },
  };
}
