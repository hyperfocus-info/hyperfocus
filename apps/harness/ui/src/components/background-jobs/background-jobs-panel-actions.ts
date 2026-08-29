import { createRequestId, type BackgroundJob, type BackgroundJobRun, type BulkOperationAction, type BulkOperationTarget } from "@hyperfocus/ai-core/protocol";
import { pushToast } from "../../toast-store";
import type { ContextMenuAction } from "../primitives/context-menu";
import type { BackgroundJobsPanelModel, RunListItem } from "../background-jobs-panel";

function toggleId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id];
}

function isInteractiveSelectionTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("button,a,input,textarea,select,[role='menuitem'],[data-selection-ignore]"));
}

function mergeRangeSelection(ids: string[], visibleIds: string[], anchorId: string, targetId: string) {
  const anchorIndex = visibleIds.indexOf(anchorId);
  const targetIndex = visibleIds.indexOf(targetId);
  if (anchorIndex === -1 || targetIndex === -1) return ids.includes(targetId) ? ids : [...ids, targetId];
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return [...new Set([...ids, ...visibleIds.slice(start, end + 1)])];
}

function formatBulkActionLabel(action: BulkOperationAction) {
  if (action === "run-now") return "run now";
  if (action === "bootstrap-retry") return "bootstrap retry";
  return action;
}

function runListItemRun(item: RunListItem) {
  return item.kind === "project-chat" ? item.entry.run : item.run;
}

export function createBackgroundJobSelectionActions(
  model: BackgroundJobsPanelModel,
  openJobDetails: (job: BackgroundJob) => void,
) {
  const {
    runtime, jobs, runListItems, setSelectedJobIds, setSelectedRunIds,
    jobSelectionAnchorId, setJobSelectionAnchorId, runSelectionAnchorId, setRunSelectionAnchorId,
  } = model;
  function clearPendingSelectionTimer() {
    if (runtime.pendingSelectionTimer) {
      clearTimeout(runtime.pendingSelectionTimer);
      runtime.pendingSelectionTimer = undefined;
    }
    if (!runtime.consumedDelayedSelection) {
      runtime.pendingSelectionKind = undefined;
      runtime.pendingSelectionId = undefined;
    }
  }
  
  function scheduleDelayedSelection(kind: "job" | "run", id: string, event: PointerEvent) {
    if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || isInteractiveSelectionTarget(event.target)) {
      return;
    }
    clearPendingSelectionTimer();
    runtime.pendingSelectionKind = kind;
    runtime.pendingSelectionId = id;
    runtime.pendingSelectionTimer = setTimeout(() => {
      runtime.pendingSelectionTimer = undefined;
      runtime.consumedDelayedSelection = true;
      if (kind === "job") {
        setSelectedRunIds([]);
        setSelectedJobIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
        setJobSelectionAnchorId(id);
        return;
      }
      setSelectedJobIds([]);
      setSelectedRunIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
      setRunSelectionAnchorId(id);
    }, 250);
  }
  
  function consumeDelayedSelection(kind: "job" | "run", id: string) {
    if (!runtime.consumedDelayedSelection || runtime.pendingSelectionKind !== kind || runtime.pendingSelectionId !== id) {
      return false;
    }
    runtime.consumedDelayedSelection = false;
    runtime.pendingSelectionKind = undefined;
    runtime.pendingSelectionId = undefined;
    return true;
  }
  
  function selectJobWithMouse(job: BackgroundJob, event: MouseEvent) {
    setSelectedRunIds([]);
    const visibleIds = jobs().map((entry) => entry.id);
    if (event.shiftKey) {
      const anchorId = jobSelectionAnchorId() ?? job.id;
      setSelectedJobIds((ids) => mergeRangeSelection(ids, visibleIds, anchorId, job.id));
      setJobSelectionAnchorId(anchorId);
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      setSelectedJobIds((ids) => toggleId(ids, job.id));
      setJobSelectionAnchorId(job.id);
      return;
    }
    setSelectedJobIds([job.id]);
    setJobSelectionAnchorId(job.id);
  }
  
  function selectRunWithMouse(run: BackgroundJobRun, event: MouseEvent) {
    setSelectedJobIds([]);
    const visibleIds = runListItems()
      .filter((item) => item.kind === "background")
      .map((item) => runListItemRun(item).id);
    if (event.shiftKey) {
      const anchorId = runSelectionAnchorId() ?? run.id;
      setSelectedRunIds((ids) => mergeRangeSelection(ids, visibleIds, anchorId, run.id));
      setRunSelectionAnchorId(anchorId);
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      setSelectedRunIds((ids) => toggleId(ids, run.id));
      setRunSelectionAnchorId(run.id);
      return;
    }
    setSelectedRunIds([run.id]);
    setRunSelectionAnchorId(run.id);
  }
  
  function handleJobCardClick(job: BackgroundJob, event: MouseEvent) {
    if (consumeDelayedSelection("job", job.id)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      selectJobWithMouse(job, event);
      return;
    }
    openJobDetails(job);
  }
  
  function handleRunListClick(item: RunListItem, event: MouseEvent, openRunItem: () => void) {
    const run = item.kind === "background" ? item.run : undefined;
    if (run && consumeDelayedSelection("run", run.id)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (run && (event.shiftKey || event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      selectRunWithMouse(run, event);
      return;
    }
    openRunItem();
  }
  return { clearPendingSelectionTimer, scheduleDelayedSelection, handleJobCardClick, handleRunListClick };
}

export function createBackgroundJobBulkActions(model: BackgroundJobsPanelModel) {
  const {
    sendCommand, executionPaused, executionPauseReason, selectedJobIdSet, selectedRunIdSet,
    selectedJobs, selectedBackgroundRuns, setSelectedJobIds, setSelectedRunIds,
    setJobSelectionAnchorId, setRunSelectionAnchorId, setContextMenu,
  } = model;
  function openJobBulkContextMenu(job: BackgroundJob, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const selected = selectedJobIdSet().has(job.id) ? selectedJobs() : [job];
    if (!selectedJobIdSet().has(job.id)) {
      setSelectedRunIds([]);
      setSelectedJobIds([job.id]);
      setJobSelectionAnchorId(job.id);
    }
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      label: selected.length > 1 ? "Bulk job actions" : "Job actions",
      actions: createJobBulkActions(selected)
    });
  }
  
  function openRunBulkContextMenu(item: RunListItem, event: MouseEvent) {
    if (item.kind !== "background") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const selected = selectedRunIdSet().has(item.run.id) ? selectedBackgroundRuns() : [item.run];
    if (!selectedRunIdSet().has(item.run.id)) {
      setSelectedJobIds([]);
      setSelectedRunIds([item.run.id]);
      setRunSelectionAnchorId(item.run.id);
    }
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      label: selected.length > 1 ? "Bulk run actions" : "Run actions",
      actions: createRunBulkActions(selected)
    });
  }
  
  function sendBulkOperation(action: BulkOperationAction, targets: BulkOperationTarget[]) {
    if (targets.length === 0) {
      return;
    }
    sendCommand({
      type: "bulk-operation.apply",
      requestId: createRequestId(),
      payload: {
        operationId: createRequestId(),
        action,
        targets
      }
    });
    pushToast("Bulk action sent", `${targets.length} item${targets.length === 1 ? "" : "s"} queued for ${formatBulkActionLabel(action)}.`, "info");
  }
  
  function createJobBulkActions(items: BackgroundJob[]): ContextMenuAction[] {
    const targets = items.map(jobBulkTarget);
    return [
      {
        id: "run-now",
        label: `Run now (${items.length})`,
        disabled: executionPaused(),
        disabledReason: executionPauseReason,
        onSelect: () => sendBulkOperation("run-now", targets)
      },
      {
        id: "pause",
        label: `Pause (${items.length})`,
        onSelect: () => sendBulkOperation("pause", targets)
      },
      {
        id: "resume",
        label: `Resume (${items.length})`,
        onSelect: () => sendBulkOperation("resume", targets)
      },
      {
        id: "delete",
        label: `Delete (${items.length})`,
        onSelect: () => sendBulkOperation("delete", targets)
      }
    ];
  }
  
  function createRunBulkActions(items: BackgroundJobRun[]): ContextMenuAction[] {
    const targets = items.map(runBulkTarget);
    return [
      {
        id: "stop",
        label: `Stop (${items.length})`,
        onSelect: () => sendBulkOperation("stop", targets)
      },
      {
        id: "retry",
        label: `Retry (${items.length})`,
        disabled: executionPaused(),
        disabledReason: executionPauseReason,
        onSelect: () => sendBulkOperation("retry", targets)
      },
      {
        id: "approve",
        label: `Approve (${items.length})`,
        disabled: executionPaused(),
        disabledReason: executionPauseReason,
        onSelect: () => sendBulkOperation("approve", targets)
      },
      {
        id: "reject",
        label: `Reject (${items.length})`,
        onSelect: () => sendBulkOperation("reject", targets)
      }
    ];
  }
  
  function jobBulkTarget(job: BackgroundJob): BulkOperationTarget {
    return {
      kind: "background-job",
      projectId: job.projectId,
      jobId: job.id
    };
  }
  
  function runBulkTarget(run: BackgroundJobRun): BulkOperationTarget {
    return {
      kind: "background-run",
      projectId: run.projectId,
      runId: run.id
    };
  }
  return { openJobBulkContextMenu, openRunBulkContextMenu, sendBulkOperation, jobBulkTarget, runBulkTarget };
}
