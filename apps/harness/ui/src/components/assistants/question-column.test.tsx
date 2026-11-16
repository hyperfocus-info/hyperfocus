/** @jsxImportSource solid-js */
import { expect, it } from "bun:test";
import { createSignal } from "solid-js";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../../utils/tests/test-harness";
import { QuestionColumn } from "./question-column";

createUiTest("Assistant question answers", () => {
  it("names the answer and blocks blank keyboard submission while retaining suggested responses", () => {
    const answers: Array<string | undefined> = [];
    const [draft, setDraft] = createSignal("");
    render(() => <QuestionColumn title="Pending questions" emptyMessage="No questions" disabled={false}
      questions={[{ id: "question", assistantId: "assistant", prompt: "Which recovery?", status: "pending", linkedTodoIds: [], askedAt: "2026-09-21T12:00:00Z" }]}
      questionAnswers={{ question: draft() }} onAnswerInput={(_id, value) => setDraft(value)} onAnswer={(_question, value) => answers.push(value ?? draft())} />);
    const input = screen.getByRole("textbox", { name: "Answer: Which recovery?" });
    const send = screen.getByRole("button", { name: "Send answer to assistant" });
    expect(input.closest('[data-test-virtual-list]')).toBeNull();
    expect(send.hasAttribute("disabled")).toBe(true);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(answers).toHaveLength(0);
    fireEvent.input(input, { target: { value: "Retry the current workspace" } });
    expect(send.hasAttribute("disabled")).toBe(false);
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(answers).toHaveLength(0);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(answers).toEqual(["Retry the current workspace"]);
    fireEvent.click(screen.getByRole("button", { name: /Let assistant proceed/ }));
    expect(answers).toHaveLength(2);
  });
  it("retains virtualization for a long question history", () => {
    render(() => <QuestionColumn title="Resolved questions" emptyMessage="No questions" disabled={false}
      questions={Array.from({ length: 100 }, (_, index) => ({ id: `question-${index}`, assistantId: "assistant", prompt: `Question ${index}`, status: "answered", linkedTodoIds: [], askedAt: "2026-09-21T12:00:00Z" }))}
      questionAnswers={{}} onAnswerInput={() => {}} onAnswer={() => {}} />);
    expect(document.querySelector('[data-test-virtual-list]')).not.toBeNull();
    expect(document.querySelectorAll("article").length).toBeLessThan(100);
  });
});
