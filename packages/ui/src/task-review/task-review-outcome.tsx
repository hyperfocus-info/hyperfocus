import * as stylex from "@stylexjs/stylex";
import { Show } from "solid-js";
import { Button } from "../primitives/button";
import { Disclosure } from "../primitives/disclosure/disclosure";
import { StatusChip } from "../primitives/status-chip";
import { tokens } from "../theme/tokens.stylex";
import { typography } from "../theme/typography";
import { StableItems, TaskReviewFacts } from "./task-review";

/** Display data only; hosts resolve artifact identity and verify its contents. */
export type TaskReviewOutcomeModel = {
  summary: string;
  facts: readonly { label: string; value: string }[];
  sections: readonly {
    id: string;
    title: string;
    items: readonly {
      id: string;
      label: string;
      status?: string;
      detail?: string;
      facts: readonly { label: string; value: string }[];
      artifacts: readonly { id: string; label: string; unavailable?: boolean }[];
    }[];
  }[];
};

const styles = stylex.create({
  stack: { gap: tokens.space3, display: "grid", minWidth: 0, },
  item: { gap: tokens.space2, paddingBlock: tokens.space2, display: "grid", minWidth: 0, },
  row: { gap: tokens.space2, alignItems: "center", display: "flex", flexWrap: "wrap", minWidth: 0, },
  heading: { margin: 0, overflowWrap: "anywhere", minWidth: 0 },
  copy: { margin: 0, color: tokens.muted, overflowWrap: "anywhere" },
});

export function TaskReviewOutcome(props: { outcome: TaskReviewOutcomeModel; busy?: boolean; onInspect: (id: string) => void }) {
  return <Disclosure title="Outcome analysis">
    <section aria-label="Outcome analysis" data-test-task-review-outcome="" {...stylex.attrs(styles.stack)}>
      <p {...stylex.attrs(styles.heading, typography.body)}>{props.outcome.summary}</p>
      <TaskReviewFacts facts={props.outcome.facts} />
      <StableItems items={props.outcome.sections}>{section => <Disclosure title={`${section().title} (${section().items.length})`}>
        <div data-outcome-section={section().id} {...stylex.attrs(styles.stack)}>
          <StableItems items={section().items} fallback={<p {...stylex.attrs(styles.copy, typography.body)}>No {section().title.toLowerCase()} recorded yet.</p>}>{item => <article data-outcome-item={item().id} {...stylex.attrs(styles.item)}>
            <div {...stylex.attrs(styles.row)}>
              <h3 {...stylex.attrs(styles.heading, typography.emphasis)}>{item().label}</h3>
              <Show when={item().status}><StatusChip>{item().status}</StatusChip></Show>
            </div>
            <Show when={item().detail}><p {...stylex.attrs(styles.copy, typography.body)}>{item().detail}</p></Show>
            <TaskReviewFacts facts={item().facts} />
            <Show when={item().artifacts.length}><div aria-label="Evidence artifacts" {...stylex.attrs(styles.row)}>
              <StableItems items={item().artifacts}>{artifact => <Button variant="secondary" size="small" disabled={props.busy || artifact().unavailable} tooltip={artifact().unavailable ? "This evidence artifact is not retained in this run" : `Inspect ${artifact().label}`} onClick={() => props.onInspect(artifact().id)}>{artifact().label}{artifact().unavailable ? " (unavailable)" : ""}</Button>}</StableItems>
            </div></Show>
          </article>}</StableItems>
        </div>
      </Disclosure>}</StableItems>
    </section>
  </Disclosure>;
}
