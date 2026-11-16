import { Show, createMemo, createUniqueId } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { backgroundJobShellDefinitionSchema } from "@hyperfocus/ai-core/protocol";
import { DialogField, DialogFormSection, DialogInlineNote } from "../primitives/form-layout";
import { Input } from "@hyperfocus/ui";
import { Textarea } from "../primitives/textarea";
import { Button } from "../primitives/button";
import { backgroundJobsStyles as styles } from "../background-jobs.styles";

export type ShellTaskValues = { executable: string; argsText: string; preservedArgs?: string[]; cwd: string; envRefsText: string; timeoutSeconds: string; networkAccess: boolean };

export function shellTaskDefinition(value: ShellTaskValues) {
  const envRefs = value.envRefsText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  return { kind: "shell" as const, executable: value.executable.trim(), args: value.preservedArgs ?? (value.argsText === "" ? [] : value.argsText.split(/\r?\n/)), cwd: value.cwd.trim() || undefined, envRefs: envRefs.length ? envRefs : undefined, timeoutSeconds: Number(value.timeoutSeconds), networkAccess: value.networkAccess };
}

export function shellTaskErrors(value: ShellTaskValues) {
  const result = backgroundJobShellDefinitionSchema.safeParse(shellTaskDefinition(value));
  const errors: Partial<Record<"executable" | "args" | "cwd" | "envRefs" | "timeoutSeconds", string>> = {};
  if (result.success) return errors;
  const messages = { executable: "Enter an executable of 1–1,024 characters.", args: "Use at most 64 arguments, each at most 4,096 characters.", cwd: "Use a working directory of at most 4,096 characters.", envRefs: "Use at most 32 environment names, each at most 128 characters.", timeoutSeconds: "Enter a whole number from 1 to 86,400 seconds." };
  for (const key of ["executable", "args", "cwd", "envRefs", "timeoutSeconds"] as const) {
    if (result.error.issues.some(issue => issue.path[0] === key)) errors[key] = messages[key];
  }
  return errors;
}

export function ShellJobFields(props: ShellTaskValues & {
  onExecutableInput: (value: string) => void; onArgsInput: (value: string) => void;
  onCwdInput: (value: string) => void; onEnvRefsInput: (value: string) => void;
  onTimeoutInput: (value: string) => void; onNetworkAccessInput: (value: boolean) => void;
  onPreservedArgsInput: (value: string[]) => void;
}) {
  const id = createUniqueId(); const errors = createMemo(() => shellTaskErrors(props));
  const multilineArgument = () => props.preservedArgs?.some(arg => /[\r\n]/.test(arg));
  const labels = { executable: "Executable", cwd: "Working directory", args: "Args, one per line", envRefs: "Env refs, one per line", timeoutSeconds: "Timeout seconds" };
  const errorProps = (key: keyof ReturnType<typeof shellTaskErrors>) => ({ "aria-label": labels[key], "aria-invalid": Boolean(errors()[key]) || undefined, "aria-describedby": errors()[key] ? `${id}-${key}` : undefined });
  const ErrorNote = (note: { field: keyof ReturnType<typeof shellTaskErrors> }) => <Show when={errors()[note.field]}>{message => <span id={`${id}-${note.field}`} role="alert"><DialogInlineNote tone="danger">{message()}</DialogInlineNote></span>}</Show>;
  return <DialogFormSection title="Shell job" description="Arguments are passed directly to the executable; shell quoting and expansion are not applied.">
    <div class={stylex.attrs(styles.shellGrid).class}>
      <DialogField label="Executable"><Input {...errorProps("executable")} value={props.executable} onInput={event => props.onExecutableInput(event.currentTarget.value)} placeholder="bun" /><ErrorNote field="executable" /></DialogField>
      <DialogField label="Working directory"><Input {...errorProps("cwd")} value={props.cwd} onInput={event => props.onCwdInput(event.currentTarget.value)} placeholder="Project root when empty" /><ErrorNote field="cwd" /></DialogField>
      <div><DialogField label="Args, one per line"><Textarea {...errorProps("args")} readOnly={multilineArgument()} rows="6" value={props.argsText} onInput={event => props.onArgsInput(event.currentTarget.value)} placeholder="run&#10;test" /><span class={stylex.attrs(styles.networkHelp).class}>Each line is one argument. Spaces and blank lines are preserved.</span><ErrorNote field="args" /></DialogField>
        <Show when={props.argsText === ""}><label class={stylex.attrs(styles.networkLabel).class}><input type="checkbox" checked={props.preservedArgs?.length === 1 && props.preservedArgs[0] === ""} onChange={event => props.onPreservedArgsInput(event.currentTarget.checked ? [""] : [])} /><span class={stylex.attrs(styles.networkCopy, styles.networkHelp).class}>Pass one empty argument</span></label></Show>
        <Show when={multilineArgument()}><DialogInlineNote>Existing arguments include a line break inside one argument. They will be preserved exactly. This editor can replace them with one argument per line.</DialogInlineNote><Button tooltip="Clear existing arguments before entering replacements" variant="secondary" onClick={() => props.onArgsInput("")}>Replace arguments</Button></Show>
      </div>
      <DialogField label="Env refs, one per line"><Textarea {...errorProps("envRefs")} rows="6" value={props.envRefsText} onInput={event => props.onEnvRefsInput(event.currentTarget.value)} placeholder="BUILD_TOKEN" /><span class={stylex.attrs(styles.networkHelp).class}>Names only, not secret values. The host resolves these names when the task runs.</span><ErrorNote field="envRefs" /></DialogField>
      <DialogField label="Timeout seconds"><Input {...errorProps("timeoutSeconds")} type="number" min="1" max="86400" step="1" value={props.timeoutSeconds} onInput={event => props.onTimeoutInput(event.currentTarget.value)} /><ErrorNote field="timeoutSeconds" /></DialogField>
      <label class={stylex.attrs(styles.networkLabel).class}><input class={stylex.attrs(styles.marginTopXs).class} type="checkbox" checked={props.networkAccess} onInput={event => props.onNetworkAccessInput(event.currentTarget.checked)} /><div class={stylex.attrs(styles.networkCopy).class}><div class={stylex.attrs(styles.networkTitle).class}>Allow network access</div><div class={stylex.attrs(styles.networkHelp).class}>Marks task unsafe. Leave off for repo-local commands.</div></div></label>
    </div>
  </DialogFormSection>;
}
