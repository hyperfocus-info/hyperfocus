import * as stylex from "@stylexjs/stylex";
import { ActionButton, ActionStatus } from "../action-button";
import { Dialog } from "../primitives/dialog";
import { chatUtilityStyles } from "../chat-panel.utilities";
import type { ChatPanelController } from "../chat-panel";

export function ChatSetupDialog(props: { controller: ChatPanelController }) {
  const {
    handleCancelNonGitPreflight, handleDisableDirtyGitCheck, handleInitGitBaseline, state,
  } = props.controller;
  return <Dialog
        open={Boolean(state.blockingNonGitPreflight)}
        title="Git setup required"
        eyebrow="Preflight"
        description="Dirty-git protection cannot verify this folder because it is not a git repository."
        onClose={handleCancelNonGitPreflight}
        footer={
          <>
            <ActionButton tooltip="Initialize git and commit the current folder baseline" type="button" onClick={handleInitGitBaseline}>
              Init Git
            </ActionButton>
            <ActionButton tooltip="Disable dirty-git protection and retry this run" type="button" variant="secondary" onClick={handleDisableDirtyGitCheck}>
              Disable check and continue
            </ActionButton>
            <ActionButton tooltip="Cancel this run" type="button" variant="ghost" onClick={handleCancelNonGitPreflight}>
              Cancel
            </ActionButton>
          </>
        }
      >
        <div class={stylex.attrs(chatUtilityStyles.spaceY2, chatUtilityStyles.textXs, chatUtilityStyles.leading6, chatUtilityStyles.textVariableMuted).class}>
          <p>{state.blockingNonGitPreflight?.preflight.repairSummary}</p>
          <p>{state.blockingNonGitPreflight?.preflight.repairDetail}</p>
        </div>
      </Dialog>;
}

