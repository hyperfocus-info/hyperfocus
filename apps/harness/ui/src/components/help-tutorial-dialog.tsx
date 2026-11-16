import { For } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { Disclosure } from "@hyperfocus/ui";
import type { SetupState } from "@hyperfocus/ai-core/protocol";
import { tutorialDefinitions } from "./tutorial-definitions";
import { Dialog } from "./primitives/dialog";
import { ActionButton } from "./action-button";
import { miscellaneousSurfaceStyles as styles } from "./miscellaneous-surfaces.styles";

type HelpTutorialDialogProps = {
  open: boolean;
  setup: SetupState;
  completedTutorialIds: string[];
  dismissedTutorialIds: string[];
  satisfiedTutorialIds: string[];
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
      description="Choose a walkthrough. Progress stays in this browser."
      class={stylex.attrs(styles.dialogWide).class}
    >
      <div {...stylex.attrs(styles.tutorialGrid)}>
        <For each={tutorialDefinitions}>
          {(tutorial) => {
            const status = () =>
              props.completedTutorialIds.includes(tutorial.id)
                ? "Completed"
                : props.satisfiedTutorialIds.includes(tutorial.id)
                ? "Goal reached"
                : props.dismissedTutorialIds.includes(tutorial.id)
                ? "Dismissed"
                : "Available";

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
                  <ActionButton tooltip={`${status() === "Completed" ? "Restart" : "Start"} ${tutorial.title}`} type="button" onClick={() => props.onStartTutorial(tutorial.id)}>
                    {status() === "Completed" ? "Restart tutorial" : "Start tutorial"}
                  </ActionButton>
                </div>
              </article>
            );
          }}
        </For>
      </div>
      <Disclosure title={`Setup: ${props.setup.readyRequiredCount}/${props.setup.totalRequiredCount} required checks ready`}>
        <p {...stylex.attrs(styles.setupDescription)}>Launch mode: {props.setup.launchMode}. Return to the activation checklist for setup repairs.</p>
      </Disclosure>
    </Dialog>
  );
}

