import * as stylex from "@stylexjs/stylex";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { Button } from "../../src/primitives/button";
import { ActionMenu, MenuItem } from "../../src/primitives/action-menu";
import { SelectControl } from "../../src/primitives/selection/select-control";
import { CheckboxField, FormField, FormGrid } from "../../src/form/form";
import { Input } from "../../src/form/input";
import { tokens } from "../../src/theme/tokens.stylex";
import { typography } from "../../src/theme/typography";
import "../../src/stylex-entry.css";

const styles = stylex.create({
  page: {
    padding: { default: tokens.space8, "@media (max-width: 600px)": tokens.space4 },
    backgroundColor: tokens.background,
 color: tokens.foreground,
 minHeight: "100dvh",
  },
  content: { gap: tokens.space8, marginInline: "auto", display: "grid", maxWidth: "64rem", minWidth: 0, },
  header: { gap: tokens.space4, alignItems: "start", display: "flex", flexWrap: "wrap", justifyContent: "space-between", },
  copy: { gap: tokens.space2, display: "grid", maxWidth: "44rem", minWidth: 0, },
  heading: { margin: 0 },
  muted: { margin: 0, color: tokens.muted, },
  section: { gap: tokens.space4, display: "grid", borderTopColor: tokens.border, borderTopStyle: "solid", borderTopWidth: tokens.borderWidth, minWidth: 0, paddingTop: tokens.space6, },
  row: { gap: tokens.space3, alignItems: "center", display: "flex", flexWrap: "wrap", minWidth: 0, },
  long: { maxWidth: "22rem", minWidth: 0 },
  status: { margin: 0, color: tokens.success, },
});

function Showcase() {
  const [light, setLight] = createSignal(false);
  const [selection, setSelection] = createSignal("local");
  const [action, setAction] = createSignal("No action selected");
  const toggleTheme = () => {
    setLight(!light());
    document.documentElement.dataset.hfTheme = light() ? "light" : "dark";
  };
  return (
    <main {...stylex.attrs(styles.page, typography.body)}>
      <div {...stylex.attrs(styles.content)}>
        <header {...stylex.attrs(styles.header)}>
          <div {...stylex.attrs(styles.copy)}>
            <p {...stylex.attrs(typography.metadata, styles.muted)}>Hyperfocus · UI reference</p>
            <h1 {...stylex.attrs(typography.page, styles.heading)}>Controls that fit the task</h1>
            <p {...stylex.attrs(styles.muted)}>Real shared controls, supported states, and difficult content. Resize the window and navigate with the keyboard.</p>
          </div>
          <Button variant="secondary" onClick={toggleTheme} justificationForNoTooltip="Visible theme action">{light() ? "Use dark theme" : "Use light theme"}</Button>
        </header>

        <section {...stylex.attrs(styles.section)} aria-labelledby="actions-heading">
          <div {...stylex.attrs(styles.copy)}>
            <h2 id="actions-heading" {...stylex.attrs(typography.section, styles.heading)}>Action hierarchy</h2>
            <p {...stylex.attrs(styles.muted)}>One primary action; supporting and destructive actions retain distinct roles.</p>
          </div>
          <div {...stylex.attrs(styles.row)}>
            <Button id="primary-action" justificationForNoTooltip="Self-describing action">Create project</Button>
            <Button variant="secondary" justificationForNoTooltip="Self-describing action">Open project</Button>
            <Button variant="ghost" justificationForNoTooltip="Self-describing action">Learn more</Button>
            <Button variant="danger" justificationForNoTooltip="Demonstrates danger state">Delete draft</Button>
          </div>
          <div {...stylex.attrs(styles.row)}>
            <Button size="small" variant="secondary" justificationForNoTooltip="Self-describing compact action">Compact control</Button>
            <Button disabled variant="secondary" justificationForNoTooltip="Disabled reference">Unavailable</Button>
            <Button disabled aria-busy="true" justificationForNoTooltip="Loading status is visible">Creating project…</Button>
          </div>
          <div {...stylex.attrs(styles.long)}>
            <Button id="long-action" variant="secondary" justificationForNoTooltip="Complete long label stays visible">Projektkonfiguration wiederherstellen und Arbeitsbereichseinstellungen übernehmen</Button>
          </div>
        </section>

        <section {...stylex.attrs(styles.section)} aria-labelledby="fields-heading">
          <h2 id="fields-heading" {...stylex.attrs(typography.section, styles.heading)}>Clear labels and recovery</h2>
          <FormGrid>
            <FormField label="Project name" description="Choose a name you will recognize later.">
              <Input aria-label="Project name" placeholder="Untitled project" />
            </FormField>
            <FormField label="Project location" error={<span id="location-error">This folder is unavailable. Choose a different location.</span>}>
              <Input aria-label="Project location" aria-invalid="true" aria-describedby="location-error" value="/unavailable/projects" />
            </FormField>
            <FormField label="Managed workspace" description="Your organization manages this setting.">
              <Input aria-label="Managed workspace" value="Team workspace" disabled />
            </FormField>
            <FormField label="A long localized field label that must remain readable at every supported width" description="Donaudampfschifffahrtsgesellschaftskapitänsarbeitsplatzkonfiguration">
              <Input aria-label="Long value" value="Very-long-project-name-without-a-natural-place-to-break" size="small" />
            </FormField>
          </FormGrid>
        </section>

        <section {...stylex.attrs(styles.section)} aria-labelledby="selection-heading">
          <CheckboxField label="Require confirmation" description="The whole labeled row toggles the native control."><input type="checkbox" /></CheckboxField>
          <h2 id="selection-heading" {...stylex.attrs(typography.section, styles.heading)}>Selection and secondary actions</h2>
          <FormGrid>
            <div {...stylex.attrs(styles.copy)}>
              <SelectControl ariaLabel="Workspace" value={selection()} onChange={setSelection} options={[
                { value: "local", label: "Local workspace", description: "Projects on this computer" },
                { value: "shared", label: "Shared workspace", description: "Projects shared with your team" },
                { value: "archived", label: "Archived workspace", description: "Unavailable while the archive is offline", disabled: true },
              ]} />
              <p id="selection-status" {...stylex.attrs(typography.metadata, styles.muted)}>Selected: {selection()}</p>
            </div>
            <div {...stylex.attrs(styles.copy)}>
              <SelectControl ariaLabel="Search project list" value="project-1" onChange={(value) => setAction(value)} options={Array.from({ length: 40 }, (_, index) => ({ value: `project-${index + 1}`, label: `Project ${index + 1}`, description: "Searchable project collection" }))} />
              <p {...stylex.attrs(typography.metadata, styles.muted)}>Search 40 projects</p>
            </div>
          </FormGrid>
          <div {...stylex.attrs(styles.row)}>
            <ActionMenu ariaLabel="Project actions" trigger={(state) => (
              <Button variant="secondary" onClick={state.toggle} aria-haspopup="menu" aria-expanded={state.open()} aria-controls={state.menuId} justificationForNoTooltip="Visible menu label">More actions</Button>
            )}>
              <MenuItem onSelect={() => setAction("Project duplicated")}>Duplicate project</MenuItem>
              <MenuItem disabled onSelect={() => {}}>Export unavailable</MenuItem>
              <MenuItem onSelect={() => setAction("Project archived")}>Archive project</MenuItem>
            </ActionMenu>
            <p role="status" {...stylex.attrs(typography.metadata, styles.status)}>{action()}</p>
          </div>
        </section>
      </div>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Showcase root is missing");
render(() => <Showcase />, root);
