import * as stylex from "@stylexjs/stylex";
import { ActionButton } from "../action-button";
import { chatUtilityStyles } from "../chat-panel.utilities";
import { Dialog } from "../primitives/dialog";
import { useChatPanel } from "./state/panel-context";

export function ChatSetupDialog() {
  const controller = useChatPanel();
  const {
    handleCancelNonGitPreflight, handleDisableDirtyGitCheck, handleInitGitBaseline, state,
  } = controller;
  return <Dialog
        open={Boolean(state.blockingNonGitPreflight)}
        title="Git setup required"
        eyebrow="Preflight"
        description="Dirty-git protection cannot verify this folder because it is not a git repository."
        onClose={handleCancelNonGitPreflight}
        footer={
          <>
            <ActionButton tooltip="Initialize git and commit the current folder baseline" type="button" onClick={handleInitGitBaseline}>
              Initialize Git and commit baseline
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
          <p>Initialize Git creates a repository and commits the current folder as its baseline. Disable check turns off dirty-git protection and retries this run.</p>
        </div>
      </Dialog>;
}
