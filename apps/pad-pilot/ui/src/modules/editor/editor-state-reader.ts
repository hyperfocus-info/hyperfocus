import { requireText } from "@hyperfocus/utilities/text";
import { optional, readList, readObject, requireOneOf } from "@hyperfocus/utilities/validation";


export function readEditorState(value: unknown) {
  return readObject(value, {
    profileName: requireText,
    mappings: (value: unknown) => readList(value, value => readObject(value, {
      control: requireText,
      actionType: value => requireOneOf(value, ["automation", "daw", "macro", "midi", "profile"] as const),
      profile: optional(requireText),
      target: optional(requireText),
    })),
  });
}
