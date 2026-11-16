import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { CheckboxField } from "@hyperfocus/ui";
import type { WorkspaceProjectState } from "@hyperfocus/ai-core/protocol";
import { getThreadCleanupCandidates, parseThreadCleanupDuration } from "../lib/thread-cleanup";
import { Button } from "./primitives/button";
import { Dialog } from "./primitives/dialog";
import { Input } from "@hyperfocus/ui";
import { miscellaneousSurfaceStyles as styles } from "./miscellaneous-surfaces.styles";

type ThreadCleanupDialogProps = {
  open: boolean;
  projects: WorkspaceProjectState[];
  activeProjectId?: string;
  onClose: () => void;
  onSubmit: (input: { projectIds?: string[]; olderThanMs: number }) => void;
};

export function ThreadCleanupDialog(props: ThreadCleanupDialogProps) {
  const initialActiveProjectId =
    props.activeProjectId && props.projects.some((project) => project.id === props.activeProjectId) ? props.activeProjectId : undefined;
  const [duration, setDuration] = createSignal("30d");
  const [allProjects, setAllProjects] = createSignal(!initialActiveProjectId);
  const [selectedProjectIds, setSelectedProjectIds] = createSignal<string[]>(initialActiveProjectId ? [initialActiveProjectId] : []);
  const parsedDuration = createMemo(() => parseThreadCleanupDuration(duration()));
  const durationError = createMemo(() => {
    const parsed = parsedDuration();
    return parsed.ok ? undefined : parsed.reason;
  });
  const effectiveProjectIds = createMemo(() => (allProjects() ? undefined : selectedProjectIds()));
  const candidates = createMemo(() => {
    const parsed = parsedDuration();
    return parsed.ok ? getThreadCleanupCandidates(props.projects, effectiveProjectIds(), parsed.ms, new Date()) : [];
  });
  const selectedCount = createMemo(() => (allProjects() ? props.projects.length : selectedProjectIds().length));
  const submitDisabled = createMemo(() => !parsedDuration().ok || selectedCount() === 0 || candidates().length === 0);
  const unavailableReason = () => durationError() ?? (selectedCount() === 0 ? "Select at least one project." : candidates().length === 0 ? "No inactive threads match this age and project selection." : undefined);

  createEffect(() => {
    if (!props.open) {
      return;
    }
    const activeProjectId = props.activeProjectId;
    if (activeProjectId && props.projects.some((project) => project.id === activeProjectId)) {
      setAllProjects(false);
      setSelectedProjectIds([activeProjectId]);
      return;
    }
    setAllProjects(true);
    setSelectedProjectIds([]);
  });

  function toggleProject(projectId: string) {
    setAllProjects(false);
    setSelectedProjectIds((current) =>
      current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId]
    );
  }

  function submit() {
    const parsed = parsedDuration();
    if (!parsed.ok || submitDisabled()) {
      return;
    }
    props.onSubmit({ projectIds: effectiveProjectIds(), olderThanMs: parsed.ms });
    props.onClose();
  }

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title="Clean up old threads"
      description="Archive inactive user threads older than the selected age."
      contentClass={stylex.attrs(styles.cleanupDialogContent).class}
      footer={
        <>
          <Button tooltip="Close thread cleanup without archiving" variant="secondary" onClick={props.onClose}>
            Cancel
          </Button>
          <Button tooltip={unavailableReason() ?? "Archive old inactive threads"} disabled={submitDisabled()} onClick={submit}>
            Archive old threads
          </Button>
        </>
      }
    >
      <div data-test-thread-cleanup-dialog="" {...stylex.attrs(styles.cleanupStack)}>
        <label {...stylex.attrs(styles.cleanupField)}>
          Older than
          <Input
            value={duration()}
            placeholder="30d"
            aria-invalid={Boolean(durationError())}
            aria-describedby="cleanup-duration-help"
            onInput={(event: InputEvent & { currentTarget: HTMLInputElement }) => setDuration(event.currentTarget.value)}
          />
        </label>
        <div id="cleanup-duration-help" {...stylex.attrs(durationError() ? styles.cleanupError : styles.cleanupHint)} role={durationError() ? "alert" : undefined}>{durationError() ?? "Use days (30d), weeks (2w), hours (12h), or minutes (90m)."}</div>

        <div {...stylex.attrs(styles.cleanupProjects)}>
          <div {...stylex.attrs(styles.cleanupProjectTitle)}>Projects</div>
          <CheckboxField label="All projects">
            <input
              type="checkbox"
              checked={allProjects()}
              onChange={(event) => {
                setAllProjects(event.currentTarget.checked);
                if (event.currentTarget.checked) {
                  setSelectedProjectIds([]);
                }
              }}
            />
          </CheckboxField>
          <div {...stylex.attrs(styles.cleanupProjectList)}>
            <For each={props.projects}>
              {(project) => (
                <CheckboxField label={project.name}>
                  <input
                    type="checkbox"
                    checked={!allProjects() && selectedProjectIds().includes(project.id)}
                    disabled={allProjects()}
                    onChange={() => toggleProject(project.id)}
                  />
                </CheckboxField>
              )}
            </For>
          </div>
        </div>

        <div {...stylex.attrs(styles.cleanupSummary)}>
          <div {...stylex.attrs(styles.cleanupSummaryTitle)}>{candidates().length} threads match</div>
          <div>Active and final remaining threads are skipped</div>
          <Show when={unavailableReason()}><p role="status">{unavailableReason()}</p></Show>
        </div>
      </div>
    </Dialog>
  );
}
