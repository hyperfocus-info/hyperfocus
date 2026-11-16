/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import type { ClientCommand } from "@hyperfocus/ai-core/protocol";
import { harnessStore } from "../../../harness-store";
import { createUiTest } from "../../../utils/tests/test-harness";
import { clearBrowserStateForTests, seedHarnessStoreForTests } from "../../../utils/tests/store-test-utils";
import { createHarnessStateFixture, createViewProjectFixture } from "../../../utils/tests/test-fixtures";
import { BackgroundJobEditorDialog } from "../../background-job-editor-dialog";
import { shellTaskDefinition, shellTaskErrors } from "../../background-jobs/shell-task-fields";

const shell = { executable: "bun", argsText: "", cwd: "", envRefsText: "", timeoutSeconds: "600", networkAccess: false };
function setup(options: { missingProject?: boolean; missingMode?: boolean; args?: string[] } = {}) {
  const project = createViewProjectFixture({ id: "target", projectModes: [] });
  seedHarnessStoreForTests(createHarnessStateFixture({ workspace: { projects: options.missingProject ? [] : [project], activeProjectId: project.id } }));
  const commands: ClientCommand[] = [];
  harnessStore.actions.setCommandDispatcher(command => {
    commands.push(command);
    if (command.type === "background-job.schedule.preview") harnessStore.applyServerEvent({ type: "background-job-schedule.preview", requestId: command.requestId, payload: { input: "1h", schedule: { type: "interval", intervalSeconds: 3600, nextRunAt: "2026-09-23T12:00:00Z", sourceText: "1h" } } });
  });
  harnessStore.openBackgroundJobEditor({ source: "create", projectId: project.id, kind: options.missingMode ? "ai-routine" : "shell", name: "Checks", description: "", scheduleInput: "1h", timezone: "UTC", aiPrompt: "Review", aiModeId: options.missingMode ? "removed" : "", shellExecutable: "bun", shellArgsText: options.args?.join("\n") ?? "run\ntest", shellArgs: options.args, shellCwd: "", shellEnvRefsText: "", shellTimeoutSeconds: 600, shellNetworkAccess: false });
  render(() => <BackgroundJobEditorDialog />);
  return commands;
}

createUiTest("Scheduled task data and draft recovery", () => {
  beforeEach(clearBrowserStateForTests);
  it("preserves exact argument boundaries and flags protocol limits", () => {
    expect(shellTaskDefinition({ ...shell, argsText: "--message\n  retain  \n" }).args).toEqual(["--message", "  retain  ", ""]);
    expect(shellTaskDefinition(shell).args).toEqual([]);
    expect(shellTaskErrors({ ...shell, argsText: Array(65).fill("arg").join("\n") }).args).toContain("64");
    expect(shellTaskErrors({ ...shell, argsText: "x".repeat(4097) }).args).toContain("4,096");
  });
  it("validates whole timeout values without converting drafts", () => {
    for (const value of ["", "0", "-1", "1.5", "86401", "NaN"]) expect(Boolean(shellTaskErrors({ ...shell, timeoutSeconds: value }).timeoutSeconds)).toBe(true);
    for (const value of ["1", "86400"]) expect(shellTaskErrors({ ...shell, timeoutSeconds: value }).timeoutSeconds).toBeUndefined();
    setup(); const field = screen.getByLabelText("Timeout seconds");
    fireEvent.input(field, { target: { value: "" } });
    expect(field).toHaveProperty("value", "");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    fireEvent.input(field, { target: { value: "30" } });
    expect(field.hasAttribute("aria-invalid")).toBe(false);
  });
  it("links environment limits to the field and retains invalid text", () => {
    setup(); const field = screen.getByLabelText("Env refs, one per line"); const value = Array(33).fill("TOKEN").join("\n");
    fireEvent.input(field, { target: { value } });
    expect(field).toHaveProperty("value", value);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(field.getAttribute("aria-describedby")!)?.textContent).toContain("32");
    expect(shellTaskErrors({ ...shell, envRefsText: "x".repeat(129) }).envRefs).toContain("128");
  });
  it("protects a changed task when closing and permits explicit discard", () => {
    setup(); fireEvent.input(screen.getByLabelText("Name"), { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(harnessStore.state.backgroundJobEditorOpen).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "Changed");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(harnessStore.state.backgroundJobEditorOpen).toBe(false);
  });
  it("blocks a removed project without resetting the task", () => {
    setup({ missingProject: true });
    expect(screen.getByRole("button", { name: "Select background job project" }).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("button", { name: "Save task" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "Checks");
  });
  it("allows recovery from a missing mode through an explicit default selection", () => {
    setup({ missingMode: true });
    const mode = screen.getByRole("button", { name: "Select background job mode" });
    expect(mode.getAttribute("aria-invalid")).toBe("true");
    fireEvent.click(mode); fireEvent.click(screen.getByRole("option", { name: /Project default/ }));
    expect(mode.hasAttribute("aria-invalid")).toBe(false);
  });
  it("submits exact arguments through the actual save command", async () => {
    const commands = setup();
    fireEvent.input(screen.getByLabelText("Args, one per line"), { target: { value: "--message\n  text  \n" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save task" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Save task" }));
    const saved = commands.find(command => command.type === "background-job.save");
    expect(saved?.type === "background-job.save" && saved.payload.job.definition.kind === "shell" ? saved.payload.job.definition.args : undefined).toEqual(["--message", "  text  ", ""]);
  });
  it("requires explicit template replacement while preserving name and schedule", () => {
    setup();
    harnessStore.replaceStateForTests({ ...harnessStore.state, backgroundJobs: { ...harnessStore.state.backgroundJobs, templates: [{ id: "build", label: "Build checks", description: "Verify builds", kind: "shell", definition: { kind: "shell", executable: "bun", args: ["run", "build"], timeoutSeconds: 300 } }] } });
    fireEvent.input(screen.getByLabelText("Args, one per line"), { target: { value: "run\ncustom" } });
    const select = () => { fireEvent.click(screen.getByRole("button", { name: "Select background job template" })); fireEvent.click(screen.getByRole("option", { name: /Build checks/ })); };
    select(); expect(screen.getByLabelText("Args, one per line")).toHaveProperty("value", "run\ncustom");
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("button", { name: "Select background job template" }).getAttribute("data-select-value")).toBe("");
    select(); fireEvent.click(screen.getByRole("button", { name: "Apply template" }));
    expect(screen.getByLabelText("Args, one per line")).toHaveProperty("value", "run\nbuild");
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "Checks");
    expect(screen.getByLabelText("Schedule")).toHaveProperty("value", "1h");
  });
  it("does not replace typed fields when workspace catalogs refresh", () => {
    setup(); fireEvent.input(screen.getByLabelText("Name"), { target: { value: "Retained task" } });
    harnessStore.replaceStateForTests({ ...harnessStore.state, workspace: { ...harnessStore.state.workspace, projects: [] } });
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "Retained task");
    expect(screen.getByRole("button", { name: "Select background job project" }).getAttribute("aria-invalid")).toBe("true");
  });
  it("round trips a single empty argument and offers an explicit zero-argument choice", async () => {
    const commands = setup({ args: [""] });
    const choice = screen.getByRole("checkbox", { name: "Pass one empty argument" });
    if (!(choice instanceof HTMLInputElement)) throw new Error("Expected HTMLInputElement fixture");
    expect(choice.checked).toBe(true);
    fireEvent.click(choice); expect(choice.checked).toBe(false);
    fireEvent.click(choice); expect(choice.checked).toBe(true);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save task" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Save task" }));
    const saved = commands.find(command => command.type === "background-job.save");
    expect(saved?.type === "background-job.save" && saved.payload.job.definition.kind === "shell" ? saved.payload.job.definition.args : undefined).toEqual([""]);
  });
  it("retains embedded newlines until explicit argument replacement", () => {
    const args = ["line one\nline two", ""];
    setup({ args }); const field = screen.getByLabelText("Args, one per line");
    if (!(field instanceof HTMLTextAreaElement)) throw new Error("Expected HTMLTextAreaElement fixture");
    expect(field.readOnly).toBe(true);
    expect(shellTaskDefinition({ ...shell, preservedArgs: args }).args).toEqual(args);
    fireEvent.click(screen.getByRole("button", { name: "Replace arguments" }));
    expect(field.readOnly).toBe(false); expect(field.value).toBe("");
  });
});
