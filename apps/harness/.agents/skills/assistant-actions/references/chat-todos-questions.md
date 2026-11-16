# Chat, todos, and questions

Use [operation handoffs](operation-handoffs.md) for exact actions and required fields.

Direct chat uses the live `assistant.chat.send` path, which observes global pause,
assistant pause, deletion, and circuit breakers. Do not bypass these gates through
SQLite. Use [recovery](recovery.md) if the requested work includes recovery.

Resolve a todo or question by id or unambiguous title/prompt. Todo updates support
pending, in-progress, blocked, completed, failed, and cancelled; reorder only when
requested. Verify the saved state and any reprioritization outcome.

Question answers use `assistant.question.answer`; linked work can unblock and
reprioritize unless globally paused. Do not promise completion of the linked task
merely because the answer was accepted.

"Remember this" is a chat handoff. Durable learning is confirmed only when
reprioritization writes a learning; check [saved state](state-reporting.md).
