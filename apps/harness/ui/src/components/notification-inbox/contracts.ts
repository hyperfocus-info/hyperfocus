import type { Accessor } from "solid-js";
import type { NotificationInboxItem } from "@hyperfocus/ai-core/protocol";

export const ASSISTANT_JOB_BOOTSTRAP_QUESTION_PREFIX = "assistant-job-bootstrap:";

export type PlanningQuestionNotification = Extract<NotificationInboxItem, { kind: "planning-question" }>;
export type PlanningQuestionBatchNotification = Extract<NotificationInboxItem, { kind: "planning-question-batch" }>;
export type AssistantQuestionNotification = Extract<NotificationInboxItem, { kind: "assistant-question" }>;
export type AssistantQuestionBatchNotification = Extract<NotificationInboxItem, { kind: "assistant-question-batch" }>;
export type BrowserApprovalNotification = Extract<NotificationInboxItem, { kind: "browser-approval" }>;

export interface NotificationInboxController {
  readonly open: Accessor<boolean>;
  readonly expandedId: Accessor<string | undefined>;
  readonly unreadCount: Accessor<number>;
  readonly items: Accessor<readonly NotificationInboxItem[]>;
  close(): void;
  toggle(): void;
  markAllRead(): void;
  openItem(notification: NotificationInboxItem): void;
  readDraft(notificationId: string, questionId?: string): string;
  writeDraft(notificationId: string, value: string, questionId?: string): void;
  canBootstrapAssistantJob(notification: AssistantQuestionNotification): boolean;
  isBrowserApprovalTerminal(notification: BrowserApprovalNotification): boolean;
  answerPlanningQuestion(notification: PlanningQuestionNotification, content: string): void;
  answerPlanningQuestionBatch(notification: PlanningQuestionBatchNotification): void;
  answerAssistantQuestion(notification: AssistantQuestionNotification, answerText?: string): void;
  bootstrapAssistantJobs(notification: AssistantQuestionNotification, accepted: boolean): void;
  answerAssistantQuestionBatch(notification: AssistantQuestionBatchNotification): void;
  resolveBrowserApproval(notification: BrowserApprovalNotification, approved: boolean): void;
}
