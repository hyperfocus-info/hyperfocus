import { For, Show, createMemo, type JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { qualityCoverage, qualityRules, type QualityReport, type QualityTrace } from "@hyperfocus/ai-core/quality";
import { Disclosure } from "../primitives/disclosure/disclosure";
import { typography } from "../theme/typography";
import { tokens } from "../theme/tokens.stylex";

const styles = stylex.create({
  section: { overflowWrap: "anywhere", minWidth: 0, },
  list: { margin: 0, padding: 0, gap: tokens.space2, listStyle: "none", display: "grid", },
  row: { paddingBlock: tokens.space2, borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: tokens.borderWidth, minWidth: 0 },
  text: { margin: 0, overflowWrap: "anywhere", whiteSpace: "pre-wrap", },
  muted: { color: tokens.muted },
  error: { color: tokens.danger },
  heading: { margin: 0 },
  overview: { gap: tokens.space2, display: "grid", marginBottom: tokens.space3 },
});

type RuleResult = QualityReport["rules"][number];
function requirementTitle(rule: RuleResult) {
  return qualityRules.find(definition => definition.id === rule.id && definition.version === rule.version)?.title
    ?? rule.id.split(".").at(-1)!.replaceAll("-", " ").replace(/^./, letter => letter.toUpperCase());
}
function requirementState(rule: RuleResult) {
  return rule.status === "PASSED" ? "Passed" : rule.status === "FAILED" ? "Failed"
    : rule.category === "qualitative" ? "Review required" : "Not verified";
}
function requirementSummary(rule: RuleResult) {
  if (rule.status === "FAILED") return rule.unresolvedReason;
  if (rule.category === "qualitative") return "A person still needs to review the result against the approved design.";
  switch (rule.status) {
    case "NOT SELECTED": return "This requirement was omitted from the work. Include it before accepting the change.";
    case "NOT LOADED": return "The worker's required instructions could not be confirmed.";
    case "NOT PROPAGATED": return "A delegated worker did not receive all required instructions.";
    case "UNKNOWN": return "The available evidence does not establish this requirement.";
    default: return "This requirement still needs verification.";
  }
}

/** Both hosts render the same persisted evidence, never a fabricated status list. */
export function QualityReview(props: { trace: QualityTrace; stale?: boolean; renderEvidence?: (reference: string) => JSX.Element }) {
  const report = createMemo(() => qualityCoverage(props.trace));
  const pending = createMemo(() => report().rules.filter(rule => rule.eligibility !== "no" && rule.status !== "PASSED")
    .sort((a, b) => Number(b.status === "FAILED") - Number(a.status === "FAILED") || Number(b.severity === "blocking") - Number(a.severity === "blocking")));
  const passed = createMemo(() => report().rules.filter(rule => rule.status === "PASSED"));
  const headline = () => props.stale ? "Verification is out of date"
    : report().acceptance === "BLOCKED" ? "Verification incomplete"
    : report().acceptance === "REVIEW REQUIRED" ? "Human review required" : "Required checks passed";
  const nextStep = () => props.stale ? "Verify the current change again before relying on these results."
    : report().counts.failed ? "Resolve the failed checks below, then verify the change again."
    : report().acceptance === "BLOCKED" ? "Complete the missing checks below before treating this change as verified."
    : report().acceptance === "REVIEW REQUIRED" ? "Review the result against the requirements below. Automated checks do not establish approval."
    : "Inspect the result and the recorded scope before deciding whether it meets your needs.";
  const requirement = (rule: RuleResult) => <li {...stylex.attrs(styles.row)} data-quality-requirement={rule.id}>
    <h4 {...stylex.attrs(styles.heading, typography.emphasis)}>{requirementTitle(rule)} · {requirementState(rule)}</h4>
    <Show when={rule.unresolvedReason}><p {...stylex.attrs(styles.text, rule.status === "FAILED" ? styles.error : undefined)}>{requirementSummary(rule)}</p></Show>
    <Disclosure title="Technical evidence">
      <p {...stylex.attrs(styles.text, styles.muted)}>Rule {rule.id} · {rule.status}</p>
      <Show when={rule.unresolvedReason}><p {...stylex.attrs(styles.text)}>{rule.unresolvedReason}</p></Show>
      <p {...stylex.attrs(styles.text)}>{rule.eligibilityRationale}</p>
      <p {...stylex.attrs(styles.text)}>Selected: {rule.selected ? "yes" : "no"} · Loaded: {rule.loaded} · Propagation: {rule.propagation.length ? rule.propagation.every(child => child.passed) ? "preserved" : "missing" : "no delegated workers"}</p>
      <For each={rule.verifiers}>{verifier => <p {...stylex.attrs(styles.text)}>{verifier.id}: {verifier.result}. {verifier.reason}</p>}</For>
      <p {...stylex.attrs(styles.text, styles.muted)}>Contract: {rule.source} · version {rule.version}</p>
      <For each={rule.evidenceRefs}>{reference => <p {...stylex.attrs(styles.text, styles.muted)}>Evidence: {props.renderEvidence?.(reference) ?? reference}</p>}</For>
    </Disclosure>
  </li>;
  return <section aria-label="Quality verification" data-quality-task={props.trace.taskId} {...stylex.attrs(styles.section, typography.body)}>
    <Disclosure title={`Quality verification · ${headline()}`}>
      <div {...stylex.attrs(styles.overview)}>
        <p {...stylex.attrs(styles.text, typography.emphasis)} data-quality-next-step="">{nextStep()}</p>
        <p {...stylex.attrs(styles.text, styles.muted)}>{report().counts.passed} passed · {report().counts.failed} failed · {report().counts.unverified} not verified</p>
        <Show when={props.stale}><p {...stylex.attrs(styles.text, styles.error)}>The change has been edited. These results describe an earlier version.</p></Show>
      </div>
      <Show when={pending().length}><ul {...stylex.attrs(styles.list)} data-quality-pending=""><For each={pending()}>{requirement}</For></ul></Show>
      <Show when={passed().length}><Disclosure title={`Passed checks (${passed().length})`}><ul {...stylex.attrs(styles.list)}><For each={passed()}>{requirement}</For></ul></Disclosure></Show>
      <Disclosure title="Technical evidence for this task">
        <p {...stylex.attrs(styles.text, styles.muted)}>Task {report().taskId} · {props.stale ? "STALE" : report().state} · {report().acceptance}</p>
        <ol><For each={report().events}>{event => <li {...stylex.attrs(styles.text)}>{event.agentId} · {event.stage} · {event.outcome}: {event.reason}</li>}</For></ol>
        <For each={report().limitations}>{limit => <p {...stylex.attrs(styles.text, styles.muted)}>{limit}</p>}</For>
      </Disclosure>
    </Disclosure>
  </section>;
}
