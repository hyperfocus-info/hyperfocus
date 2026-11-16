import * as stylex from "@stylexjs/stylex";
import { createSignal, For, onCleanup, onMount } from "solid-js";
import { render } from "solid-js/web";
import { FormActions } from "../../../src/form/form-actions";
import { FormField } from "../../../src/form/form";
import { FileInput, Input } from "../../../src/form/input";
import { SettingsWorkspace } from "../../../src/preferences/settings-workspace";
import { PreferencesSurface } from "../../../src/preferences/preferences";
import { Button, PrimaryActionScope } from "../../../src/primitives/button";
import { Dialog } from "../../../src/primitives/dialog";
import { SelectControl } from "../../../src/primitives/selection/select-control";
import { attachGameModal } from "../../../src/game-menu/modal";
import "../../../src/stylex-entry.css";
import { MenuFixture } from './menu-fixture';

const styles = stylex.create({
  root: { display: "flex", fontWeight: 700, height: "100dvh", minHeight: 0, },
  content: { gap: "1rem", display: "grid", minWidth: 0 },
});

function Fixture() {
  const [section, setSection] = createSignal("general");
  const [query, setQuery] = createSignal("");
  const [value, setValue] = createSignal("month");
  const [outer, setOuter] = createSignal(false);
  const [inner, setInner] = createSignal(false);
  const [capturing, setCapturing] = createSignal(true);
  const [nativeCapturing, setNativeCapturing] = createSignal(true);
  const [nativeVeto, setNativeVeto] = createSignal(false);
  const [nativeCancels, setNativeCancels] = createSignal(0);
  const [nativeRequests, setNativeRequests] = createSignal(0);
  let native!: HTMLDialogElement;
  let modal: ReturnType<typeof attachGameModal> | undefined;
  onMount(() => { modal = attachGameModal({ dialog: native, onRequestClose: () => setNativeRequests(count => count + 1) }); });
  onCleanup(() => modal?.dispose());
  return <main {...stylex.attrs(styles.root)}>
    <SettingsWorkspace sections={[{ id: "general", label: "General" }, { id: "advanced", label: "Advanced" }]}
      activeSection={section()} onSectionChange={setSection} query={query()} onQueryChange={setQuery} onClose={() => {}}>
      <div {...stylex.attrs(styles.content)}>
        <FormActions aria-label="Report actions">
          <FormField label="Name"><Input aria-label="Name" value="Ordinary text" /></FormField>
          <FormField label="Reporting period with a deliberately wrapping label" description="Help text stays below the control without shifting the adjacent action.">
            <SelectControl ariaLabel="Reporting period" size="md" value={value()} options={[{ value: "month", label: "This month" }, { value: "year", label: "This year" }]} onChange={setValue} />
          </FormField>
          <Button justificationForNoTooltip="Visible action label" id="report-action">Generate report</Button>
        </FormActions>
        <FormField label="Import songs"><FileInput aria-label="Import songs" multiple accept="audio/*" buttonLabel="Browse songs" /></FormField>
        <Button justificationForNoTooltip="Visible action label" id="open-details" onClick={() => setOuter(true)}>Open details</Button>
        <Button justificationForNoTooltip="Visible action label" id="open-native" onClick={() => { setNativeCapturing(true); modal?.open(); }}>Open native dialog</Button>
        <For each={Array.from({ length: 12 }, (_, index) => index)}>{index => <FormField label={`Setting ${index + 1}`}><Input aria-label={`Setting ${index + 1}`} value="Value" /></FormField>}</For>
        <Button justificationForNoTooltip="Visible action label" id="last-setting">Last setting</Button>
      </div>
    </SettingsWorkspace>
    <Dialog open={outer()} title="Details" onClose={() => setOuter(false)}>
      <Button justificationForNoTooltip="Visible action label" id="open-confirmation" onClick={() => { setCapturing(true); setInner(true); }}>Review change</Button>
      <Dialog open={inner()} title="Confirm change" onClose={() => setInner(false)}>
        <Input aria-label="Confirmation note" value="Keep my draft" data-binding-state={capturing() ? "capturing" : "idle"}
          onKeyDown={event => { if (event.key === "Escape" && capturing()) { event.preventDefault(); setCapturing(false); } }} />
      </Dialog>
    </Dialog>
    <dialog ref={native} aria-label="Native dialog" data-native-cancels={nativeCancels()} data-native-requests={nativeRequests()}
      onCancel={event => { setNativeCancels(count => count + 1); if (nativeVeto()) event.preventDefault(); }}>
      <Input aria-label="Native binding" value="Mod+k" data-binding-state={nativeCapturing() ? "capturing" : "idle"}
        onKeyDown={event => { if (event.key === "Escape" && nativeCapturing()) { event.preventDefault(); setNativeCapturing(false); } }} />
      <label><input type="checkbox" aria-label="Keep native dialog open" checked={nativeVeto()} onChange={event => setNativeVeto(event.currentTarget.checked)} />Keep native dialog open</label>
      <SelectControl ariaLabel="Native period" value={value()} options={[{ value: "month", label: "This month" }, { value: "year", label: "This year" }]} onChange={setValue} />
    </dialog>
  </main>;
}

const controlStyles = stylex.create({
  root: { padding: "1rem", gap: "1rem", marginInline: "auto", display: "grid", maxWidth: "40rem", },
  actions: { gap: "1rem", display: "flex", flexWrap: "wrap" },
  preferences: { height: "28rem", minHeight: 0, minWidth: 0 },
});

function ControlFixture() {
  const [open, setOpen] = createSignal(false);
  const [saveError, setSaveError] = createSignal<string>();
  return <main {...stylex.attrs(controlStyles.root)}>
    <Button id="hover-help" tooltip="Review this explanation without keeping the pointer over its trigger." aria-describedby="existing-help">Help</Button>
    <p id="existing-help">Existing control description.</p>
    <div {...stylex.attrs(controlStyles.actions)}>
      <For each={["Save primary", "Import primary"]}>{label => <Button variant="primary" justificationForNoTooltip="Deliberate negative fixture">{label}</Button>}</For>
      <Button id="open-tooltip-review" justificationForNoTooltip="Visible action label" onClick={() => setOpen(true)}>Open review</Button>
    </div>
    <div {...stylex.attrs(controlStyles.preferences)}><PrimaryActionScope active={false}>
      <PreferencesSurface sections={[{ id: "general", title: "General", description: "Project preferences" }]}
        definitions={[{ id: "project-name", sectionId: "general", scope: "project", title: "Project name", description: "Name shown in navigation.", defaultValue: "Sample", control: { kind: "text" } }]}
        values={{ "project-name": "Sample" }} onChange={() => {}} onSave={() => setSaveError("Storage is unavailable. Try again.")} saveError={saveError()} />
    </PrimaryActionScope></div>
    <Dialog open={open()} title="Review controls" onClose={() => setOpen(false)}>
      <Button id="nested-tooltip-help" tooltip="Escape closes this explanation before the review dialog." aria-describedby="review-help">Review help</Button>
      <p id="review-help">Review the change before confirming.</p>
      <Button variant="primary" justificationForNoTooltip="Visible action label">Confirm review</Button>
    </Dialog>
  </main>;
}

const root = document.getElementById("root");
if (root) render(() => new URLSearchParams(location.search).has('context-menu') ? <MenuFixture /> : new URLSearchParams(location.search).has("controls") ? <ControlFixture /> : <Fixture />, root);
