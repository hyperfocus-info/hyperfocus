import { For } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import type { SetupState } from "../../../shared/protocol";
import { tutorialDefinitions } from "./tutorial-definitions";
import { Dialog } from "./primitives/dialog";
import { ActionButton } from "./action-button";
import { miscellaneousSurfaceStyles as styles } from "./miscellaneous-surfaces.styles";

type HelpTutorialDialogProps = {
  open: boolean;
  setup: SetupState;
  completedTutorialIds: string[];
  dismissedTutorialIds: string[];
  onClose: () => void;
  onStartTutorial: (tutorialId: string) => void;
};

export function HelpTutorialDialog(props: HelpTutorialDialogProps) {
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      eyebrow="Guided help"
      title="Walkthroughs and setup"
      description="Run a targeted tutorial, then come back to the activation checklist when you need another repair step."
      class={stylex.attrs(styles.dialogWide).class}
    >
      <section {...stylex.attrs(styles.setupSummary)}>
        <div {...stylex.attrs(styles.setupLabel)}>Current setup</div>
        <div {...stylex.attrs(styles.setupCount)}>
          {props.setup.readyRequiredCount}/{props.setup.totalRequiredCount} required checks ready
        </div>
        <div {...stylex.attrs(styles.setupDescription)}>
          Launch mode: {props.setup.launchMode}. Guided help stays local to this browser profile.
        </div>
      </section>

      <div {...stylex.attrs(styles.tutorialGrid)}>
        <For each={tutorialDefinitions}>
          {(tutorial) => {
            const status = () =>
              props.completedTutorialIds.includes(tutorial.id)
                ? "Completed"
                : props.dismissedTutorialIds.includes(tutorial.id)
                ? "Dismissed"
                : "Ready";

            return (
              <article {...stylex.attrs(styles.tutorialCard)}>
                <div {...stylex.attrs(styles.tutorialStatus)}>{status()}</div>
                <h3 {...stylex.attrs(styles.tutorialTitle)}>
                  {tutorial.title}
                </h3>
                <p {...stylex.attrs(styles.tutorialSummary)}>{tutorial.summary}</p>
                <div {...stylex.attrs(styles.tutorialFooter)}>
                  <span {...stylex.attrs(styles.tutorialSteps)}>
                    {tutorial.steps.length} steps
                  </span>
                  <ActionButton tooltip={`Start ${tutorial.title}`} type="button" onClick={() => props.onStartTutorial(tutorial.id)}>
                    Start tutorial
                  </ActionButton>
                </div>
              </article>
            );
          }}
        </For>
      </div>
    </Dialog>
  );
}

