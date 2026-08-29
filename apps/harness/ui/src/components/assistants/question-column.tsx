import { For, Show } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { Check, Save } from "lucide-solid";
import type { AssistantQuestion } from "@hyperfocus/ai-core/protocol";
import { getAssistantQuestionDefaultChoices } from "../../assistant-question-defaults";
import { formatShortTimestamp } from "../../lib/time-format";
import { submitOnEnter } from "../../textarea-submit";
import { ActionButton } from "../action-button";
import { assistantPanelStyles, assistantUtilityStyles } from "../assistants-panel.styles";
import { FileLinkedText, type FileLinkConfig } from "../file-linked-text";
import { StatusChip, type StatusChipTone } from "../primitives/status-chip";
import { Textarea } from "../primitives/textarea";
import { VirtualList } from "../primitives/virtual-list";

function questionStatusTone(status: AssistantQuestion["status"]): StatusChipTone {
  switch (status) {
    case "answered": return "success";
    case "pending": return "warning";
    case "deferred": return "info";
    case "dismissed": return "neutral";
  }
}

function PendingQuestionAnswer(props: {
  question: AssistantQuestion;
  disabled: boolean;
  disabledReason?: string;
  answer: string;
  onAnswerInput: (questionId: string, value: string) => void;
  onAnswer: (question: AssistantQuestion, answerText?: string) => void;
}) {
  return (
    <div class={stylex.attrs(assistantUtilityStyles.mt3, assistantUtilityStyles.flex,
      assistantUtilityStyles.flexCol, assistantUtilityStyles.gap2).class}>
      <div class={stylex.attrs(assistantUtilityStyles.grid, assistantUtilityStyles.gap2).class}>
        <For each={getAssistantQuestionDefaultChoices()}>
          {(choice) => (
            <ActionButton
              tooltip={choice.description}
              disabled={props.disabled}
              disabledReason={props.disabledReason}
              icon={choice.recommended
                ? <Check class={stylex.attrs(assistantUtilityStyles.h4, assistantUtilityStyles.w4).class} />
                : undefined}
              variant={choice.recommended ? "default" : "secondary"}
              class={stylex.attrs(assistantUtilityStyles.justifyStart).class}
              onClick={() => props.onAnswer(props.question, choice.answerText)}
            >
              {choice.label}
            </ActionButton>
          )}
        </For>
      </div>
      <Textarea
        rows="3"
        disabled={props.disabled}
        value={props.answer}
        onKeyDown={submitOnEnter(() => props.onAnswer(props.question))}
        onInput={(event) => props.onAnswerInput(props.question.id, event.currentTarget.value)}
        placeholder="Answer this question."
      />
      <ActionButton
        tooltip="Send answer to assistant"
        disabled={props.disabled}
        disabledReason={props.disabledReason}
        icon={<Save class={stylex.attrs(assistantUtilityStyles.h4, assistantUtilityStyles.w4).class} />}
        onClick={() => props.onAnswer(props.question)}
      >
        Answer
      </ActionButton>
    </div>
  );
}

function QuestionCard(props: {
  question: AssistantQuestion;
  disabled: boolean;
  disabledReason?: string;
  answer: string;
  onAnswerInput: (questionId: string, value: string) => void;
  onAnswer: (question: AssistantQuestion, answerText?: string) => void;
  fileLinks?: FileLinkConfig;
}) {
  return (
    <article class={stylex.attrs(
      assistantUtilityStyles.borderL2,
      assistantUtilityStyles.py3,
      assistantUtilityStyles.pl4,
      assistantUtilityStyles.pr2,
      props.question.status === "answered"
        ? assistantPanelStyles.borderEmerald
        : props.question.status === "pending"
          ? assistantPanelStyles.borderAmber
          : props.question.status === "deferred"
            ? assistantPanelStyles.borderSky
            : assistantPanelStyles.borderSlate
    ).class}>
      <div class={stylex.attrs(assistantUtilityStyles.text075, assistantUtilityStyles.fontSemibold,
        assistantUtilityStyles.textForeground).class}>
        <FileLinkedText text={props.question.prompt} fileLinks={props.fileLinks} />
      </div>
      <div class={stylex.attrs(assistantUtilityStyles.mt1, assistantUtilityStyles.flex,
        assistantUtilityStyles.flexWrap, assistantUtilityStyles.itemsCenter, assistantUtilityStyles.gap2,
        assistantUtilityStyles.text0575, assistantUtilityStyles.uppercase, assistantUtilityStyles.tracking014,
        assistantUtilityStyles.textMuted).class}>
        <StatusChip tone={questionStatusTone(props.question.status)}>{props.question.status}</StatusChip>
        <span>{formatShortTimestamp(props.question.askedAt)}</span>
      </div>
      <Show when={props.question.status === "pending"}>
        <PendingQuestionAnswer
          question={props.question}
          disabled={props.disabled}
          disabledReason={props.disabledReason}
          answer={props.answer}
          onAnswerInput={props.onAnswerInput}
          onAnswer={props.onAnswer}
        />
      </Show>
      <Show when={props.question.answerText}>
        {(answer) => (
          <div class={stylex.attrs(assistantUtilityStyles.mt3, assistantUtilityStyles.text0675,
            assistantUtilityStyles.leading5, assistantUtilityStyles.textMuted).class}>
            <FileLinkedText text={answer()} fileLinks={props.fileLinks} />
          </div>
        )}
      </Show>
    </article>
  );
}

export function QuestionColumn(props: {
  title: string;
  emptyMessage: string;
  questions: AssistantQuestion[];
  disabled: boolean;
  disabledReason?: string;
  questionAnswers: Record<string, string>;
  onAnswerInput: (questionId: string, value: string) => void;
  onAnswer: (question: AssistantQuestion, answerText?: string) => void;
  fileLinks?: FileLinkConfig;
}) {
  return (
    <section class={stylex.attrs(assistantUtilityStyles.flex, assistantUtilityStyles.minH0,
      assistantUtilityStyles.flexCol).class}>
      <div class={stylex.attrs(assistantUtilityStyles.mb3, assistantUtilityStyles.text0585,
        assistantUtilityStyles.fontSemibold, assistantUtilityStyles.uppercase, assistantUtilityStyles.tracking018,
        assistantUtilityStyles.textMuted).class}>
        {props.title}
      </div>
      <VirtualList
        class={stylex.attrs(assistantUtilityStyles.minH0, assistantUtilityStyles.flex1,
          assistantUtilityStyles.pr2).class}
        contentClass={stylex.attrs(assistantUtilityStyles.wFull).class}
        itemClass={stylex.attrs(assistantUtilityStyles.pb3).class}
        items={props.questions}
        getKey={(question) => question.id}
        estimateSize={220}
        pagination={{ kind: "forward", initialCount: 60, batchSize: 60 }}
        empty={
          <div class={stylex.attrs(assistantUtilityStyles.borderL2, assistantUtilityStyles.borderDashed,
            assistantUtilityStyles.borderBorder, assistantUtilityStyles.py3, assistantUtilityStyles.pl4,
            assistantUtilityStyles.text0675, assistantUtilityStyles.leading5,
            assistantUtilityStyles.textMuted).class}>
            {props.emptyMessage}
          </div>
        }
      >
        {(question) => (
          <QuestionCard
            question={question}
            disabled={props.disabled}
            disabledReason={props.disabledReason}
            answer={props.questionAnswers[question.id] ?? ""}
            onAnswerInput={props.onAnswerInput}
            onAnswer={props.onAnswer}
            fileLinks={props.fileLinks}
          />
        )}
      </VirtualList>
    </section>
  );
}
