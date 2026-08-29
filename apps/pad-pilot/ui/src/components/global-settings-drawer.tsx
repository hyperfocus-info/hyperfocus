import { createEffect, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { Bot, Gamepad2 } from "lucide-solid";
import { PadPilot } from "../padpilot/index";
import {
  GENERATOR_AI_MODEL_OPTIONS,
  GENERATOR_AI_PROVIDER_OPTIONS,
  normalizeGeneratorAiSettings,
} from "../modules/generator/utils/generator-options";
import {
  loadGeneratorAiSettings,
  saveGeneratorAiSettings,
} from "../modules/generator/utils/generator-ai-settings";
import { resolveSearchableComboboxItemId } from "./elements/searchable-combobox-utils";
import styles from "./global-settings-drawer.stylex";

export type GlobalSettingsDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenControllerPreferences: () => void;
};

/** GlobalSettingsDrawer owns PadPilot-wide user preferences that are not module-local state. */
export function GlobalSettingsDrawer(props: GlobalSettingsDrawerProps) {
  const [settings, setSettings] = createStore(loadGeneratorAiSettings());
  const [providerOpen, setProviderOpen] = createSignal(false);
  const [modelOpen, setModelOpen] = createSignal(false);
  const [providerQuery, setProviderQuery] = createSignal("Cursor");
  const [modelQuery, setModelQuery] = createSignal(settings.model);

  createEffect(() => {
    saveGeneratorAiSettings(settings);
    setProviderQuery(GENERATOR_AI_PROVIDER_OPTIONS.find((item) => item.id === settings.provider)?.label ?? "Cursor");
    setModelQuery(settings.model);
  });

  return (
    <PadPilot.Drawer
      open={props.open}
      onOpenChange={props.onOpenChange}
      edge="right"
      title="Settings"
      description="Global preferences shared across PadPilot modules."
      showScrim
      size="md"
    >
      <PadPilot.PreferencePanel
        title="Agent"
        description="Controls the model profile used by PadPilot.askAgent for module text-generation requests."
      >
        <PadPilot.PreferencePanel.Section
          title="Agent Bridge"
          description="Cursor is the only exposed provider. In dev mode modules use the local Codex CLI route; the model profile maps to Codex CLI model, reasoning, and fast-tier settings."
        >
          <div class={styles["section-body"]}>
            <div class={styles["setting-row"]}>
              <span class={styles["setting-row-span"]}>AI Provider</span>
              <PadPilot.SearchableCombobox
                emptyText="No providers"
                items={GENERATOR_AI_PROVIDER_OPTIONS}
                onOpenChange={setProviderOpen}
                onQueryChange={setProviderQuery}
                onSelect={() => setSettings("provider", "cursor")}
                open={providerOpen()}
                placeholder="Provider"
                query={providerQuery()}
                searchLabel="AI Provider"
                selectedId={settings.provider}
                toggleLabel="AI provider: chooses which global generation bridge receives MIDI template requests."
              />
            </div>
            <div class={styles["setting-row"]}>
              <span class={styles["setting-row-span"]}>Model</span>
              <PadPilot.SearchableCombobox
                emptyText="No models"
                items={GENERATOR_AI_MODEL_OPTIONS}
                onOpenChange={setModelOpen}
                onQueryChange={setModelQuery}
                onSelect={(id) => {
                  const item = GENERATOR_AI_MODEL_OPTIONS.find((option) => option.id === id);
                  setSettings(normalizeGeneratorAiSettings({ ...settings, model: item?.label ?? settings.model }));
                }}
                open={modelOpen()}
                placeholder="Model"
                query={modelQuery()}
                searchLabel="Model"
                selectedId={resolveSearchableComboboxItemId(GENERATOR_AI_MODEL_OPTIONS, settings.model)}
                toggleLabel="Model: selects the Codex CLI model profile. The default 5.5 low fast profile maps to GPT-5.5, low reasoning, and fast-tier preference."
              />
            </div>
          </div>
        </PadPilot.PreferencePanel.Section>
      </PadPilot.PreferencePanel>
      <PadPilot.PreferencePanel
        title="Controllers"
        description="Controller routing and custom layout setup lives in the existing preferences modal."
      >
        <PadPilot.PreferencePanel.Section title="Controller Preferences">
          <PadPilot.Button
            class={styles["controller-button"]}
            icon={<Gamepad2 size={14} />}
            onClick={() => {
              props.onOpenChange(false);
              props.onOpenControllerPreferences();
            }}
            tooltip="Open controller preferences"
            variant="secondary"
          >
            Controller Preferences
          </PadPilot.Button>
        </PadPilot.PreferencePanel.Section>
      </PadPilot.PreferencePanel>
      <PadPilot.PreferencePanel
        title="Provider Status"
        description="Dev builds can call Codex CLI through the local marketplace dev route before module-specific fallbacks run."
      >
        <PadPilot.PreferencePanel.Section title="Active Generator Bridge">
          <div class={styles["section-body"]}>
            <PadPilot.Button icon={<Bot size={14} />} tooltip="Current generator bridge" variant="ghost">
              Cursor / {settings.model}
            </PadPilot.Button>
          </div>
        </PadPilot.PreferencePanel.Section>
      </PadPilot.PreferencePanel>
    </PadPilot.Drawer>
  );
}
