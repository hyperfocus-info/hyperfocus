import { create } from "@bufbuild/protobuf";
import { ListSchema, RecordSchema, ValueSchema, type Value as MessageValue } from "./generated/value_pb";
import type { Value } from "./value";

export function toMessage(value: Value): MessageValue {
  if (value === null) return create(ValueSchema, { kind: { case: "nullValue", value: 0 } });
  if (typeof value === "boolean") return create(ValueSchema, { kind: { case: "boolValue", value } });
  if (typeof value === "number") return create(ValueSchema, { kind: { case: "numberValue", value } });
  if (typeof value === "string") return create(ValueSchema, { kind: { case: "stringValue", value } });
  if (Array.isArray(value)) return create(ValueSchema, { kind: { case: "listValue", value: create(ListSchema, { values: value.map(toMessage) }) } });
  return create(ValueSchema, { kind: { case: "structValue", value: create(RecordSchema, {
    entries: Object.entries(value).map(([key, item]) => ({ key, value: toMessage(item) })),
  }) } });
}

export function fromMessage(message: MessageValue): Value {
  const kind = message.kind;
  switch (kind.case) {
    case "nullValue":
      if (kind.value !== 0) throw new Error("Unknown protobuf null value");
      return null;
    case "numberValue": case "boolValue": case "stringValue": return kind.value;
    case "listValue": return kind.value.values.map(fromMessage);
    case "structValue": return Object.fromEntries(kind.value.entries.map(entry => {
      if (!entry.value) throw new Error("Missing protobuf record value");
      return [entry.key, fromMessage(entry.value)];
    }));
    default: throw new Error("Missing protobuf value");
  }
}
