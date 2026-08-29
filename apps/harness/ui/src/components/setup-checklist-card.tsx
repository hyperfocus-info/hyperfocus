import { createSignal, For, Show } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import type { SetupAction, SetupCheck } from "@hyperfocus/ai-core/protocol";
import { ActionButton } from "./action-button";
import { miscellaneousSurfaceStyles as styles } from "./miscellaneous-surfaces.styles";

const checkCardClass = stylex.attrs(styles.checkCard).class ?? "";
const readyCheckClass = stylex.attrs(styles.checkReady).class ?? "";
const unsupportedCheckClass = stylex.attrs(styles.checkUnsupported).class ?? "";
const warningCheckClass = stylex.attrs(styles.checkWarning).class ?? "";
const actionRequiredCheckClass = stylex.attrs(styles.checkActionRequired).class ?? "";

type SetupChecklistCardProps = {
  checks: SetupCheck[];
  readyRequiredCount: number;
  totalRequiredCount: number;
  onAction: (action: SetupAction) => void;
  onDismiss?: () => void;
  onOpenHelp?: () => void;
};

export function SetupChecklistCard(props: SetupChecklistCardProps) {
  const [showDetails, setShowDetails] = createSignal(false);
  const allRequiredReady = () => props.totalRequiredCount > 0 && props.readyRequiredCount >= props.totalRequiredCount;
  const orderedChecks = () =>
    [...props.checks].sort((left, right) => {
      const leftPriority = getPriority(left);
      const rightPriority = getPriority(right);
      return leftPriority === rightPriority ? left.title.localeCompare(right.title) : leftPriority - rightPriority;
    });

  return (
    <section {...stylex.attrs(styles.activationCard)}>
      <div {...stylex.attrs(styles.activationHeader)}>
        <div {...stylex.attrs(styles.stackSm)}>
          <div {...stylex.attrs(styles.activationEyebrow)}>Activation center</div>
          <div {...stylex.attrs(styles.activationCount)}>
            Required checks ready: {props.readyRequiredCount}/{props.totalRequiredCount}
          </div>
          <p {...stylex.attrs(styles.activationDescription)}>
            {allRequiredReady()
              ? "Ready to start. Optional integrations can be configured now or later."
              : "Fix the blocking items below, or run a guided walkthrough for help."}
          </p>
        </div>
        <div {...stylex.attrs(styles.wrapActions)}>
          <Show when={props.onOpenHelp}>
            <ActionButton tooltip="Open guided help and tutorials" type="button" variant="secondary" onClick={props.onOpenHelp}>
              ? Help
            </ActionButton>
          </Show>
          <Show when={allRequiredReady()}>
            <ActionButton tooltip={showDetails() ? "Hide optional setup details" : "Configure optional integrations"} type="button" variant="secondary" onClick={() => setShowDetails((current) => !current)}>
              {showDetails() ? "Hide details" : "Set up more tools"}
            </ActionButton>
          </Show>
          <Show when={props.onDismiss}>
            <ActionButton tooltip="Hide setup checklist" type="button" variant="ghost" onClick={props.onDismiss}>
              Hide
            </ActionButton>
          </Show>
        </div>
      </div>

      <Show when={!allRequiredReady() || showDetails()}>
        <div {...stylex.attrs(styles.checksGrid)}>
          <For each={orderedChecks()}>
          {(check) => (
            <article class={`${checkCardClass} ${check.status === "ready" ? readyCheckClass : check.status === "unsupported" ? unsupportedCheckClass : check.status === "warning" ? warningCheckClass : actionRequiredCheckClass}`}>
              <div {...stylex.attrs(styles.checkLayout)}>
                <div {...stylex.attrs(styles.stackXs)}>
                  <div {...stylex.attrs(styles.checkMetaRow)}>
                    <span {...stylex.attrs(styles.checkMeta)}>
                      {check.requiredForFirstTask ? "Required" : "Optional"}
                    </span>
                    <span {...stylex.attrs(styles.checkMeta)}>
                      {check.status}
                    </span>
                  </div>
                  <div {...stylex.attrs(styles.checkTitle)}>{check.title}</div>
                  <div {...stylex.attrs(styles.checkSummary)}>{check.summary}</div>
                  <Show when={check.detail}>
                    <div {...stylex.attrs(styles.checkDetail)}>{check.detail}</div>
                  </Show>
                </div>
                <div {...stylex.attrs(styles.wrapActions)}>
                  <Show when={check.primaryAction}>
                    {(action) => (
                      <ActionButton tooltip={action().label} type="button" onClick={() => props.onAction(action())}>
                        {action().label}
                      </ActionButton>
                    )}
                  </Show>
                  <Show when={check.secondaryAction}>
                    {(action) => (
                      <ActionButton tooltip={action().label} type="button" variant="secondary" onClick={() => props.onAction(action())}>
                        {action().label}
                      </ActionButton>
                    )}
                  </Show>
                </div>
              </div>
            </article>
          )}
          </For>
        </div>
      </Show>
    </section>
  );
}

function getPriority(check: SetupCheck) {
  if (check.requiredForFirstTask && check.status === "action-required") {
    return 0;
  }

  if (check.requiredForFirstTask && check.status === "warning") {
    return 1;
  }

  if (check.requiredForFirstTask) {
    return 2;
  }

  if (check.status === "unsupported") {
    return 4;
  }

  return 3;
}
