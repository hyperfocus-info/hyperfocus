export const ASSISTANT_PAGE_POSITION_ID_MAX_LENGTH = 128;
export const ASSISTANT_PAGE_POSITION_TIMESTAMP_MAX_LENGTH = 256;

export function assistantTimestampPageabilitySql(
  timestampColumn: "created_at" | "updated_at" | "asked_at" = "created_at"
) {
  return `typeof(${timestampColumn}) = 'text' AND length(${timestampColumn}) <= ${ASSISTANT_PAGE_POSITION_TIMESTAMP_MAX_LENGTH} AND typeof(id) = 'text' AND length(id) BETWEEN 1 AND ${ASSISTANT_PAGE_POSITION_ID_MAX_LENGTH}`;
}

export function assistantTodoPageabilitySql() {
  return `${assistantTimestampPageabilitySql("updated_at")} AND typeof(sort_order) IN ('integer', 'real') AND sort_order >= -1.7976931348623157e308 AND sort_order <= 1.7976931348623157e308`;
}

export function assistantLearningVisibilitySql() {
  return "(compacted_at IS NULL OR kind = 'summary')";
}
