import { typography } from "@hyperfocus/ui";
import { For, Show, createMemo, createSignal } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { createRequestId, type MemoryEntry } from "@hyperfocus/ai-core/protocol";
import { ArrowDown, ArrowUp } from "lucide-solid";
import { harnessStore } from "../harness-store";
import { formatShortTimestamp } from "../lib/time-format";
import { ActionButton } from "../components/action-button";
import { chatPanelStyles as styles } from "../components/chat-panel.styles";
import { chatUtilityStyles } from "../components/chat-panel.utilities";
import { MarkdownContent, type MarkdownContentProps } from "../components/markdown-content";
import { Button } from "../components/primitives/button";
import { Textarea } from "../components/primitives/textarea";
import { VirtualList } from "../components/primitives/virtual-list";
import { buildMemoryAudit, isSemanticMemoryTag, parseSemanticMemoryTags } from "./memory-model";
import { Disclosure, Input, SelectControl, TagPicker } from "@hyperfocus/ui";

type MemoryPaneProps = {
  projectId: string;
  entries: readonly MemoryEntry[];
  fileLinks?: MarkdownContentProps["fileLinks"];
};

export function MemoryPane(props: MemoryPaneProps) {
  const sendCommand = harnessStore.actions.sendCommand;
  const [title, setTitle] = createSignal("");
  const [summary, setSummary] = createSignal("");
  const [tagsDraft, setTagsDraft] = createSignal("");
  const [validationMessage, setValidationMessage] = createSignal<string>();
  const [deleteArmedMemoryId, setDeleteArmedMemoryId] = createSignal<string>();
  const audit = createMemo(() => buildMemoryAudit(props.entries));
  const [query, setQuery] = createSignal("");
  const [selectedTags, setSelectedTags] = createSignal<string[]>([]);
  const [status, setStatus] = createSignal("all");
  const [pinnedOnly, setPinnedOnly] = createSignal(false);
  const tagOptions = createMemo(() => [...new Set(props.entries.flatMap(entry => entry.tags))].sort().map(value => ({ value, label: value })));
  const visibleEntries = createMemo(() => props.entries.filter(entry =>
    (status() === "all" || entry.status === status()) && (!pinnedOnly() || entry.pinned)
    && selectedTags().every(tag => entry.tags.includes(tag))
    && `${entry.title} ${entry.summary} ${entry.tags.join(" ")}`.toLowerCase().includes(query().trim().toLowerCase())));
  const filtered = () => Boolean(query().trim() || selectedTags().length || status() !== "all" || pinnedOnly());
  const clearFilters = () => { setQuery(""); setSelectedTags([]); setStatus("all"); setPinnedOnly(false); };

  function handleCreateMemory(event: SubmitEvent) {
    event.preventDefault();
    const tags = parseSemanticMemoryTags(tagsDraft());
    if (!title().trim() || !summary().trim()) {
      setValidationMessage("Add a title and a focused note.");
      return;
    }
    if (tags.length === 0 || tags.some((tag) => !isSemanticMemoryTag(tag))) {
      setValidationMessage("Add at least one semantic tag such as feature:frontend-refactor.");
      return;
    }
    if (tags.length > 12) {
      setValidationMessage("Use no more than 12 focused semantic tags.");
      return;
    }

    sendCommand({
      type: "memory.create",
      requestId: createRequestId(),
      payload: {
        projectId: props.projectId,
        title: title().trim(),
        summary: summary().trim(),
        tags
      }
    });
    setTitle("");
    setSummary("");
    setTagsDraft("");
    setValidationMessage(undefined);
  }

  function handleUpdateMemory(entryId: string, patch: { pinned?: boolean; status?: "active" | "archived" }) {
    setDeleteArmedMemoryId(undefined);
    sendCommand({
      type: "memory.update",
      requestId: createRequestId(),
      payload: { memoryEntryId: entryId, ...patch }
    });
  }

  function handleReorderMemory(entryId: string, direction: "up" | "down") {
    setDeleteArmedMemoryId(undefined);
    sendCommand({
      type: "memory.reorder",
      requestId: createRequestId(),
      payload: { projectId: props.projectId, memoryEntryId: entryId, direction }
    });
  }

  function handleDeleteMemory(entryId: string) {
    if (deleteArmedMemoryId() !== entryId) {
      setDeleteArmedMemoryId(entryId);
      return;
    }
    setDeleteArmedMemoryId(undefined);
    sendCommand({
      type: "memory.delete",
      requestId: createRequestId(),
      payload: { memoryEntryId: entryId }
    });
  }

  return (
    <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.minH0, chatUtilityStyles.flex1, chatUtilityStyles.flexCol, chatUtilityStyles.gap3).class}>
      <section class={stylex.attrs(chatUtilityStyles.roundedLg, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite55, chatUtilityStyles.p4).class} aria-label="Memory audit">
        <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexWrap, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyBetween, chatUtilityStyles.gap3).class}>
          <div>
            <div class={stylex.attrs(typography.caption, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking016em, chatUtilityStyles.textVariableAccentStrong).class}>Intentional project notes</div>
            <div class={stylex.attrs(chatUtilityStyles.pt2, typography.body, chatUtilityStyles.textVariableMuted).class}>
              Tool-capable Pi sessions pull matching notes explicitly. Notes are never inserted into prompts automatically.
            </div>
          </div>
        </div>
        <div class={stylex.attrs(chatUtilityStyles.pt2, typography.body, chatUtilityStyles.textVariableMuted).class}>
          {audit().activeCount} active / {audit().archivedCount} archived / {audit().neverRetrievedCount} never retrieved / {audit().staleCount} stale / {audit().cleanupCandidateIds.length} cleanup candidates
        </div>
      </section>

      <Disclosure title="Add a focused note">
      <form class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap3, chatUtilityStyles.roundedLg, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite55, chatUtilityStyles.p4).class} onSubmit={handleCreateMemory}>
        <label class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap1, typography.body, chatUtilityStyles.fontSemibold).class}>
          Note title
          <Input value={title()} maxlength={120} onInput={(event) => setTitle(event.currentTarget.value)} />
        </label>
        <label class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap1, typography.body, chatUtilityStyles.fontSemibold).class}>
          Focused context
          <Textarea value={summary()} maxlength={600} rows="4" onInput={(event) => setSummary(event.currentTarget.value)} />
        </label>
        <label class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap1, typography.body, chatUtilityStyles.fontSemibold).class}>
          Semantic tags
          <Input placeholder="feature:frontend-refactor, area:harness" value={tagsDraft()} onInput={(event) => setTagsDraft(event.currentTarget.value)} />
        </label>
        <TagPicker ariaLabel="Choose existing semantic tags" options={tagOptions()} value={parseSemanticMemoryTags(tagsDraft())} onChange={values => setTagsDraft(values.join(", "))} />
        <Show when={validationMessage()}>
          <div role="alert" class={stylex.attrs(typography.body, chatUtilityStyles.textVariableWarningStrong).class}>{validationMessage()}</div>
        </Show>
        <div>
          <Button type="submit" tooltip="Save this project note">Save note</Button>
        </div>
      </form>
      </Disclosure>

      <section aria-label="Filter project notes" class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexWrap, chatUtilityStyles.gap2).class}>
        <Input aria-label="Search project notes" placeholder="Search notes" value={query()} onInput={event => setQuery(event.currentTarget.value)} />
        <TagPicker ariaLabel="Filter notes by semantic tags" options={tagOptions()} value={selectedTags()} onChange={setSelectedTags} />
        <SelectControl ariaLabel="Note status" value={status()} onChange={setStatus} options={[{ value: "all", label: "All notes" }, { value: "active", label: "Active" }, { value: "archived", label: "Archived" }]} />
        <Button variant={pinnedOnly() ? "default" : "secondary"} aria-label="Show pinned notes only" tooltip="Show pinned notes only" aria-pressed={pinnedOnly()} onClick={() => setPinnedOnly(value => !value)}>Pinned</Button>
        <Show when={filtered()}><Button variant="secondary" aria-label="Clear note filters" tooltip="Clear note filters" onClick={clearFilters}>Clear filters</Button></Show>
      </section>
      <Show when={filtered() && visibleEntries().length === 0}><p role="status">No notes match these filters.</p></Show>
      <VirtualList
        class={stylex.attrs(chatUtilityStyles.flex1, chatUtilityStyles.minH0, chatUtilityStyles.pr2).class}
        contentClass={stylex.attrs(styles.virtualContent).class}
        itemClass={stylex.attrs(styles.virtualItem).class}
        items={visibleEntries()}
        getKey={(entry) => entry.id}
        estimateSize={220}
        pagination={{ kind: "reverse", initialCount: 80, batchSize: 80 }}
        empty={
          <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.minH56, chatUtilityStyles.flex1, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyCenter, chatUtilityStyles.roundedLg, chatUtilityStyles.border, chatUtilityStyles.borderDashed, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite40, chatUtilityStyles.p8, chatUtilityStyles.textCenter, typography.body, chatUtilityStyles.textVariableMuted).class}>
            {filtered() ? "Clear filters to see more project notes." : "No project notes yet. Add one only when durable context is worth retrieving later."}
          </div>
        }
      >
        {(entry) => (
          <article class={stylex.attrs(chatUtilityStyles.rounded135rem, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite55, chatUtilityStyles.p4).class}>
            <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyBetween, chatUtilityStyles.gap3).class}>
              <div>
                <div class={stylex.attrs(typography.caption, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking016em, chatUtilityStyles.textVariableAccentStrong).class}>{entry.kind}</div>
                <div class={stylex.attrs(chatUtilityStyles.fontSemibold).class}>{entry.title}</div>
              </div>
              <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexWrap, chatUtilityStyles.itemsCenter, chatUtilityStyles.gap2).class}>
                <ActionButton tooltip="Move note earlier in retrieval priority" disabled={filtered() || props.entries[0]?.id === entry.id} disabledReason={filtered() ? "Clear filters to reorder notes" : "Already highest priority note"} icon={<ArrowUp class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />} size="icon" variant="secondary" ariaLabel="Move memory up" onClick={() => handleReorderMemory(entry.id, "up")} />
                <ActionButton tooltip="Move note later in retrieval priority" disabled={filtered() || props.entries.at(-1)?.id === entry.id} disabledReason={filtered() ? "Clear filters to reorder notes" : "Already lowest priority note"} icon={<ArrowDown class={stylex.attrs(chatUtilityStyles.h35, chatUtilityStyles.w35).class} />} size="icon" variant="secondary" ariaLabel="Move memory down" onClick={() => handleReorderMemory(entry.id, "down")} />
                <ActionButton tooltip={entry.pinned ? "Unpin project note" : "Pin project note"} size="sm" variant="secondary" onClick={() => handleUpdateMemory(entry.id, { pinned: !entry.pinned })}>{entry.pinned ? "Unpin" : "Pin"}</ActionButton>
                <ActionButton tooltip={entry.status === "active" ? "Archive project note" : "Restore project note"} size="sm" variant="secondary" onClick={() => handleUpdateMemory(entry.id, { status: entry.status === "active" ? "archived" : "active" })}>{entry.status === "active" ? "Archive" : "Restore"}</ActionButton>
                <ActionButton tooltip="Permanently delete this memory entry" size="sm" variant="secondary" onClick={() => handleDeleteMemory(entry.id)}>{deleteArmedMemoryId() === entry.id ? "Confirm delete" : "Delete"}</ActionButton>
              </div>
            </div>
            <div class={stylex.attrs(chatUtilityStyles.pt2, chatUtilityStyles.textVariableMuted).class}>
              priority {entry.priority} / {entry.confidence} / {entry.freshness} / hits {entry.hitCount} / last used {formatShortTimestamp(entry.lastHitAt)}
            </div>
            <Show when={entry.tags.length > 0}>
              <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexWrap, chatUtilityStyles.gap2, chatUtilityStyles.pt2, typography.caption, chatUtilityStyles.textVariableAccentStrong).class}>
                <For each={entry.tags}>{(tag) => <Button variant={selectedTags().includes(tag) ? "default" : "secondary"} aria-label={`Filter notes by ${tag}`} tooltip={`Filter notes by ${tag}`} aria-pressed={selectedTags().includes(tag)} onClick={() => setSelectedTags(values => values.includes(tag) ? values.filter(value => value !== tag) : [...values, tag])}>{tag}</Button>}</For>
              </div>
            </Show>
            <div class={stylex.attrs(chatUtilityStyles.pt2).class}>
              <MarkdownContent content={() => entry.summary} size="compact" fileLinks={props.fileLinks} />
            </div>
            <Show when={entry.evidence}>
              <div class={stylex.attrs(chatUtilityStyles.pt2).class}>
                <MarkdownContent content={() => entry.evidence ?? ""} size="compact" tone="muted" fileLinks={props.fileLinks} />
              </div>
            </Show>
          </article>
        )}
      </VirtualList>
    </div>
  );
}
