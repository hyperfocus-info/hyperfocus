import { createEffect, createMemo, createSignal, createUniqueId, onCleanup, onMount } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { Activity, BrainCircuit, CalendarClock, Clock3, Dices, FileText, Gauge, Grid3X3, LockKeyhole, LockKeyholeOpen, Monitor, Moon, Music2, Scale, Send, Settings2, Smile, Sun, Thermometer, Trash2, UserRound, WandSparkles } from "lucide-solid";
import { FloatingLayer } from "../../../components/elements/floating-layer";
import { Tooltip } from "../../../components/elements/tooltip";
import { PadPilot } from "../../../padpilot/index";
import type { SearchableComboboxItem } from "../../../components/elements/searchable-combobox";
import { resolveSearchableComboboxItemId } from "../../../components/elements/searchable-combobox-utils";
import { clamp01, clamp01Or } from "../../../utils/math";
import {
  buildRandomSuggestion,
  buildMagicSuggestion,
  createEmptyGeneratorFields,
  createUnlockedGeneratorFields,
  DEFAULT_GENERATOR_ADVANCED_SETTINGS,
  GENERATOR_FIELD_KEYS,
  GENERATOR_LENGTH_OPTIONS,
  GENERATOR_OPTION_GROUPS,
  GENERATOR_RANGE_KEYS,
  resetGeneratorDropdowns,
  type GeneratorDashboardFields,
  type GeneratorFieldKey,
  type GeneratorLengthBars,
  type GeneratorLockKey,
  type GeneratorRangeKey,
} from "../utils/generator-options";
import styles from "./generator-dashboard.module.css";

export interface GeneratorDashboardProps {
  /** Disables generation while local model work is in flight. */
  disabled?: boolean;
  initialState?: Partial<GeneratorDashboardState>;
  /** Reports the resolved visual theme so sibling panels can stay in sync. */
  onThemeChange?: (theme: "dark" | "light") => void;
  onStateChange?: (state: GeneratorDashboardState) => void;
  /** Called with optional prompt fields when generation starts. */
  onGenerate: (fields: GeneratorDashboardFields & {
    magicProvenance?: {
      chaos: number;
      reroll: number;
      suggestedFields: Partial<Record<GeneratorFieldKey, boolean>>;
    };
  }) => void;
}

export type GeneratorDashboardState = {
  fields: GeneratorDashboardFields;
  locked: Record<GeneratorLockKey, boolean>;
  manualFields: Record<GeneratorFieldKey, boolean>;
  queries: Record<GeneratorFieldKey, string>;
  rerollSeed: number;
  suggestedFields: Record<GeneratorFieldKey, boolean>;
};

type SelectorConfig = {
  icon?: typeof Activity;
  key: GeneratorFieldKey;
  label: string;
  placeholder: string;
  tooltip: string;
};

const selectors = [
  { icon: Music2, key: "genre", label: "Genre", placeholder: "Search genre...", tooltip: "Primary musical world for rhythm, instrumentation, tempo bias, and the strongest factor-graph influence. Filled genres are preserved by Magic Suggestion." },
  { icon: Smile, key: "mood", label: "Mood / Vibe", placeholder: "Search mood...", tooltip: "Emotional color that gently bends the graph without overriding a chosen genre. Use it to shade empty fields toward compatible eras, patterns, and modes." },
  { icon: CalendarClock, key: "era", label: "Era", placeholder: "Search era...", tooltip: "Production period and sound-design reference. Era affects instrument/program choices, rhythmic density, and which genres or modes feel native." },
  { icon: BrainCircuit, key: "complexity", label: "Complexity", placeholder: "Search complexity...", tooltip: "Arrangement grammar for the generated pattern, such as sparse motifs, call-and-response, dense harmony, or polyrhythmic movement." },
  { icon: Scale, key: "scaleKey", label: "Scale / Mode", placeholder: "Search mode or type F# Dorian...", tooltip: "Harmonic mode with optional key, for example F# Dorian. Genre still owns rhythm and pattern; mode primarily affects interval choices and melodic/chord color." },
] satisfies SelectorConfig[];

type AdvancedSliderConfig = {
  icon: typeof Activity;
  key: GeneratorRangeKey;
  label: string;
  tooltip: string;
};

const advancedSliders = [
  { icon: Activity, key: "creativity", label: "Creativity", tooltip: "Controls metric displacement, harmonic tension inside the selected genre ceiling, and texture surprise. Higher values should bend the style without turning every genre into complex chords." },
  { icon: Thermometer, key: "temperature", label: "Temperature", tooltip: "Controls sampling sharpness for local model instructions and fallback pattern intensity. Lower values are stable and literal; higher values make the output more exploratory." },
  { icon: Grid3X3, key: "density", label: "Density", tooltip: "Controls note and rhythm occupancy. Low density leaves more space; high density favors busier drums, thicker accompaniment, and more active melodic fragments." },
  { icon: UserRound, key: "humanize", label: "Humanize", tooltip: "Controls timing looseness and performance feel. Low values are tight and grid-like; high values bias toward swung, pushed, or pulled note placement." },
] satisfies AdvancedSliderConfig[];

const lengthSliderOptions = GENERATOR_LENGTH_OPTIONS;
const lengthSliderValues = lengthSliderOptions.map((option) => option.value);
const lengthTooltip = "Sets the generated MIDI loop length. Choices are fixed to 2, 4, 8, 16, or 32 bars; 4 bars is the default and exported MIDI files are padded to the selected boundary.";
const themeModes = ["system", "light", "dark"] as const;
const themeIcons = {
  dark: Moon,
  light: Sun,
  system: Monitor,
} as const;
const themeLabels = {
  dark: "Theme: dark",
  light: "Theme: light",
  system: "Theme: system",
} as const;
const GENERATOR_CHAOS_STORAGE_KEY = "padpilot.generator.chaos-risk";
const GENERATOR_THEME_STORAGE_KEY = "padpilot.generator.theme-mode";

const comboboxClasses = {
  field: styles["combo-field"],
  input: styles["combo-input"],
  item: styles["combo-item"],
  list: styles["combo-list"],
  searchIcon: styles["combo-search-icon"],
  toggle: styles["combo-toggle"],
};

function emptyFields() {
  return createEmptyGeneratorFields();
}

function loadChaosRisk() {
  if (typeof window === "undefined") {
    return 0.18;
  }
  const stored = window.localStorage.getItem(GENERATOR_CHAOS_STORAGE_KEY);
  if (stored === null) {
    return 0.18;
  }
  const value = Number(stored);
  return clamp01Or(value, 0.18);
}

function loadThemeMode() {
  if (typeof window === "undefined") {
    return "system";
  }
  const value = window.localStorage.getItem(GENERATOR_THEME_STORAGE_KEY);
  return themeModes.includes(value as (typeof themeModes)[number]) ? value as (typeof themeModes)[number] : "system";
}

function findItem(items: SearchableComboboxItem[], id: string) {
  return items.find((item) => item.id === id) ?? null;
}

function nearestLengthBars(value: number) {
  const fallback = DEFAULT_GENERATOR_ADVANCED_SETTINGS.lengthBars;
  return lengthSliderValues.reduce<GeneratorLengthBars>((nearest, option) =>
    Math.abs(option - value) < Math.abs(nearest - value) ? option : nearest,
    fallback,
  );
}

function lengthTickStyle(value: number) {
  const min = 2;
  const max = 32;
  return { left: `${((value - min) / (max - min)) * 100}%` };
}

function percentValue(value: number) {
  return `${Math.round(value * 100)}%`;
}

/** GeneratorDashboard renders the optional prompt controls and suggestion action. */
export function GeneratorDashboard(props: GeneratorDashboardProps) {
  const initialFields = () => ({ ...emptyFields(), ...props.initialState?.fields });
  const [fields, setFields] = createStore<GeneratorDashboardFields>(initialFields());
  const [locked, setLocked] = createStore({ ...createUnlockedGeneratorFields(), ...props.initialState?.locked });
  const [manualFields, setManualFields] = createStore<Record<GeneratorFieldKey, boolean>>(props.initialState?.manualFields ?? {
    complexity: false,
    era: false,
    genre: false,
    mood: false,
    scaleKey: false,
  });
  const [queries, setQueries] = createStore<Record<GeneratorFieldKey, string>>(props.initialState?.queries ?? {
    complexity: initialFields().complexity,
    era: initialFields().era,
    genre: initialFields().genre,
    mood: initialFields().mood,
    scaleKey: initialFields().scaleKey,
  });
  const [suggestedFields, setSuggestedFields] = createStore<Record<GeneratorFieldKey, boolean>>(props.initialState?.suggestedFields ?? {
    complexity: false,
    era: false,
    genre: false,
    mood: false,
    scaleKey: false,
  });
  const [open, setOpen] = createStore<Record<GeneratorFieldKey, boolean>>({
    complexity: false,
    era: false,
    genre: false,
    mood: false,
    scaleKey: false,
  });
  const [chaosRisk, setChaosRisk] = createSignal(loadChaosRisk());
  const [rerollSeed, setRerollSeed] = createSignal(props.initialState?.rerollSeed ?? 0);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [themeMode, setThemeMode] = createSignal<(typeof themeModes)[number]>(loadThemeMode());
  const [systemTheme, setSystemTheme] = createSignal<"dark" | "light">("light");
  const themeIcon = createMemo(() => themeIcons[themeMode()]);
  const themeLabel = createMemo(() => themeLabels[themeMode()]);
  const resolvedTheme = createMemo(() => themeMode() === "system" ? systemTheme() : themeMode() as "dark" | "light");
  const settingsPopoverId = createUniqueId();
  let settingsAnchor: HTMLButtonElement | undefined;
  let lastStateSignature = "";
  let lastInitialStateSignature = JSON.stringify(props.initialState ?? {});

  const emitStateChange = () => props.onStateChange?.({
    fields: { ...fields },
    locked: { ...locked },
    manualFields: { ...manualFields },
    queries: { ...queries },
    rerollSeed: rerollSeed(),
    suggestedFields: { ...suggestedFields },
  });

  createEffect(() => {
    const initialStateSignature = JSON.stringify(props.initialState ?? {});
    if (initialStateSignature === lastInitialStateSignature) {
      return;
    }
    lastInitialStateSignature = initialStateSignature;
    const nextFields = { ...emptyFields(), ...props.initialState?.fields };
    setFields(reconcile(nextFields));
    setLocked(reconcile({ ...createUnlockedGeneratorFields(), ...props.initialState?.locked }));
    setManualFields(reconcile(props.initialState?.manualFields ?? {
      complexity: false,
      era: false,
      genre: false,
      mood: false,
      scaleKey: false,
    }));
    setQueries(reconcile(props.initialState?.queries ?? {
      complexity: nextFields.complexity,
      era: nextFields.era,
      genre: nextFields.genre,
      mood: nextFields.mood,
      scaleKey: nextFields.scaleKey,
    }));
    setSuggestedFields(reconcile(props.initialState?.suggestedFields ?? {
      complexity: false,
      era: false,
      genre: false,
      mood: false,
      scaleKey: false,
    }));
    setRerollSeed(props.initialState?.rerollSeed ?? 0);
  });

  createEffect(() => {
    const signature = JSON.stringify({
      fields,
      locked,
      manualFields,
      queries,
      rerollSeed: rerollSeed(),
      suggestedFields,
    });
    if (signature === lastStateSignature) {
      return;
    }
    lastStateSignature = signature;
    emitStateChange();
  });

  createEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(GENERATOR_CHAOS_STORAGE_KEY, String(chaosRisk()));
  });

  createEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(GENERATOR_THEME_STORAGE_KEY, themeMode());
  });

  onMount(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => setSystemTheme(query.matches ? "dark" : "light");
    syncSystemTheme();
    query.addEventListener("change", syncSystemTheme);
    onCleanup(() => query.removeEventListener("change", syncSystemTheme));
  });

  createEffect(() => {
    props.onThemeChange?.(resolvedTheme());
  });

  createEffect(() => {
    if (!settingsOpen() || typeof document === "undefined") {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        setSettingsOpen(false);
        return;
      }
      if (settingsAnchor?.contains(target) || document.getElementById(settingsPopoverId)?.contains(target)) {
        return;
      }
      setSettingsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    onCleanup(() => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    });
  });

  const syncField = (key: GeneratorFieldKey, value: string, suggested = false, manual = !suggested && value.trim().length > 0) => {
    setFields(key, value);
    setManualFields(key, manual);
    setQueries(key, value);
    setOpen(key, false);
    setSuggestedFields(key, suggested);
  };

  const applyFieldSnapshot = (next: GeneratorDashboardFields, suggestedKeys: Partial<Record<GeneratorFieldKey, boolean>> = {}) => {
    for (const selector of selectors) {
      syncField(selector.key, next[selector.key], suggestedKeys[selector.key] ?? false);
    }
    for (const key of GENERATOR_RANGE_KEYS) {
      setFields(key, next[key]);
    }
    setFields("lengthBars", nearestLengthBars(next.lengthBars));
  };

  const selectItem = (key: GeneratorFieldKey, id: string) => {
    const item = findItem(GENERATOR_OPTION_GROUPS[key], id);
    if (!item) {
      return;
    }
    syncField(key, item.label);
  };

  const applyMagic = () => {
    const reroll = rerollSeed() + 1;
    setRerollSeed(reroll);
    const suggestionInput = { ...fields };
    const avoid: Partial<Record<GeneratorFieldKey, string>> = {};
    for (const selector of selectors) {
      if (!manualFields[selector.key] && !locked[selector.key]) {
        if (fields[selector.key]) {
          avoid[selector.key] = fields[selector.key];
        }
        suggestionInput[selector.key] = "";
      }
    }
    const next = buildMagicSuggestion(suggestionInput, locked, { avoid, chaos: chaosRisk(), reroll });
    applyFieldSnapshot(next, Object.fromEntries(selectors.map((selector) => [
      selector.key,
      !locked[selector.key] && (!suggestionInput[selector.key] || suggestedFields[selector.key]),
    ])) as Partial<Record<GeneratorFieldKey, boolean>>);
  };

  const applyRandom = () => {
    applyFieldSnapshot(buildRandomSuggestion(fields, locked));
  };

  const resetDropdowns = () => {
    setRerollSeed(0);
    const before = JSON.stringify(fields);
    const next = resetGeneratorDropdowns(fields, locked);
    applyFieldSnapshot(next);
    if (before === JSON.stringify(next) && Object.values(locked).some(Boolean)) {
      setLocked(createUnlockedGeneratorFields());
    }
  };

  const selectedId = (key: GeneratorFieldKey) =>
    resolveSearchableComboboxItemId(GENERATOR_OPTION_GROUPS[key], fields[key]);

  const toggleLock = (key: GeneratorLockKey) => {
    setLocked(key, (value) => !value);
  };

  const applyKeySnapshot = (key: GeneratorLockKey, next: GeneratorDashboardFields, suggested = false) => {
    if (locked[key]) {
      return;
    }
    if (key === "lengthBars") {
      setFields("lengthBars", nearestLengthBars(next.lengthBars));
      return;
    }
    if (GENERATOR_RANGE_KEYS.includes(key as GeneratorRangeKey)) {
      setFields(key as GeneratorRangeKey, next[key as GeneratorRangeKey]);
      return;
    }
    syncField(key as GeneratorFieldKey, next[key as GeneratorFieldKey], suggested);
  };

  const suggestKey = (key: GeneratorLockKey) => {
    const reroll = rerollSeed() + 1;
    setRerollSeed(reroll);
    const suggestionInput = { ...fields };
    const avoid: Partial<Record<GeneratorFieldKey, string>> = {};
    if (GENERATOR_FIELD_KEYS.includes(key as GeneratorFieldKey)) {
      if (fields[key as GeneratorFieldKey]) {
        avoid[key as GeneratorFieldKey] = fields[key as GeneratorFieldKey];
      }
      suggestionInput[key as GeneratorFieldKey] = "";
    }
    applyKeySnapshot(key, buildMagicSuggestion(suggestionInput, locked, { avoid, chaos: chaosRisk(), reroll }), true);
  };

  const randomizeKey = (key: GeneratorLockKey) => {
    applyKeySnapshot(key, buildRandomSuggestion(fields, locked));
  };

  const setLengthBars = (value: number) => {
    setFields("lengthBars", nearestLengthBars(value));
  };

  const cycleTheme = () => {
    const currentIndex = themeModes.indexOf(themeMode());
    setThemeMode(themeModes[(currentIndex + 1) % themeModes.length] ?? "system");
  };

  const lockButton = (key: GeneratorLockKey, label: string) => (
    <PadPilot.Button
      aria-pressed={locked[key]}
      class={`${styles["row-action-button"]} ${styles["lock-button"]}`}
      disabled={props.disabled}
      icon={locked[key] ? LockKeyhole : LockKeyholeOpen}
      onClick={() => toggleLock(key)}
      size="sm"
      tooltip={locked[key] ? `Unlock ${label}` : `Lock ${label}`}
      variant="ghost"
    />
  );

  const rowActions = (key: GeneratorLockKey, label: string) => (
    <div class={styles["row-actions"]}>
      <PadPilot.Button
        class={styles["row-action-button"]}
        disabled={props.disabled || locked[key]}
        icon={WandSparkles}
        onClick={() => suggestKey(key)}
        size="sm"
        tooltip={`Suggest ${label}`}
        variant="ghost"
      />
      <PadPilot.Button
        class={styles["row-action-button"]}
        disabled={props.disabled || locked[key]}
        icon={Dices}
        onClick={() => randomizeKey(key)}
        size="sm"
        tooltip={`Randomize ${label}`}
        variant="ghost"
      />
      {lockButton(key, label)}
    </div>
  );

  const sliderRow = (config: AdvancedSliderConfig) => (
    <div class={`${styles["control-row"]} ${styles["slider-row"]}`}>
      <Tooltip content={config.tooltip} placement="bottom" class={styles["label-tooltip"]}>
        <span class={styles["row-label"]}>
          <config.icon size={15} aria-hidden="true" />
          {config.label}
        </span>
      </Tooltip>
      <div class={`${styles["row-control"]} ${styles["slider-control"]}`}>
        <span class={styles["slider-frame"]}>
          <PadPilot.Slider
            aria-label={config.label}
            class={styles.slider}
            label=""
            disabled={props.disabled}
            max={1}
            min={0}
            onChange={(value) => setFields(config.key, clamp01(value))}
            orientation="horizontal"
            value={fields[config.key]}
            width={520}
          />
        </span>
        <span class={styles["value-readout"]}>{percentValue(fields[config.key])}</span>
      </div>
      {rowActions(config.key, config.label)}
    </div>
  );

  return (
    <section class={styles.dashboard} data-theme={resolvedTheme()} data-theme-mode={themeMode()} aria-label="Generator dashboard">
      <div class={styles.header}>
        <div class={styles["title-group"]}>
          <h2>Generator<span>.</span></h2>
        </div>
        <div class={styles["top-tools"]}>
          <div class={styles["action-buttons"]} aria-label="Generator actions">
            <PadPilot.Button
              class={styles["home-button"]}
              disabled={props.disabled}
              icon={Trash2}
              onClick={resetDropdowns}
              tooltip="Clear / Reset"
            />
            <PadPilot.Button
              class={styles["home-button"]}
              disabled={props.disabled}
              icon={WandSparkles}
              onClick={applyMagic}
              tooltip="Suggest"
            />
            <PadPilot.Button
              class={styles["home-button"]}
              disabled={props.disabled}
              icon={Dices}
              onClick={applyRandom}
              tooltip="Random"
            />
            <PadPilot.Button
              class={`${styles["home-button"]} ${styles["generate-button"]}`}
              disabled={props.disabled}
              icon={Send}
              onClick={() => props.onGenerate({
                ...fields,
                magicProvenance: {
                  chaos: chaosRisk(),
                  reroll: rerollSeed(),
                  suggestedFields: { ...suggestedFields },
                },
              })}
              tooltip="Generate / Send"
            />
          </div>
          <PadPilot.Button
            ref={(element) => {
              settingsAnchor = element;
            }}
            aria-expanded={settingsOpen()}
            aria-haspopup="dialog"
            class={styles["top-tool-button"]}
            icon={Settings2}
            onClick={(event) => {
              event.stopPropagation();
              setSettingsOpen((value) => !value);
            }}
            size="sm"
            tooltip="Generator settings"
            variant="ghost"
          />
        </div>
      </div>
      <FloatingLayer
        anchorRef={() => settingsAnchor}
        class={styles["settings-popover"]}
        id={settingsPopoverId}
        offset={10}
        open={settingsOpen()}
        placement="bottom"
        role="dialog"
      >
        <div class={styles["settings-content"]} data-theme={resolvedTheme()} aria-label="Generator settings">
          <div class={styles["settings-heading"]}>
            <Settings2 size={15} aria-hidden="true" />
            <span>Generator Settings</span>
          </div>
          <div class={styles["settings-row"]}>
            <span class={styles["risk-label"]}>
              {(() => {
                const ThemeIcon = themeIcon();
                return <ThemeIcon size={15} aria-hidden="true" />;
              })()}
              {themeLabel()}
            </span>
            <PadPilot.Button
              class={styles["settings-button"]}
              icon={themeIcon()}
              onClick={cycleTheme}
              size="sm"
              tooltip={themeLabel()}
              variant="ghost"
            />
          </div>
          <div class={styles["risk-control"]}>
            <span class={styles["risk-label"]}>
              <Gauge size={15} aria-hidden="true" />
              Chaos / Risk
            </span>
            <div class={styles["slider-control"]}>
              <span class={styles["slider-frame"]}>
                <PadPilot.Slider
                  aria-label="Chaos/Risk"
                  class={styles.slider}
                  label=""
                  disabled={props.disabled}
                  max={1}
                  min={0}
                  onChange={(value) => setChaosRisk(clamp01(value))}
                  orientation="horizontal"
                  value={chaosRisk()}
                  width={260}
                />
              </span>
              <span class={styles["value-readout"]}>{percentValue(chaosRisk())}</span>
            </div>
          </div>
        </div>
      </FloatingLayer>
      <div class={styles["control-stack"]}>
        {selectors.map((selector) => (
          <div class={styles["control-row"]}>
            <Tooltip content={selector.tooltip} placement="bottom" class={styles["label-tooltip"]}>
              <span class={styles["row-label"]}>
                {selector.icon ? <selector.icon size={15} aria-hidden="true" /> : null}
                {selector.label}
              </span>
            </Tooltip>
            <div class={styles["row-control"]}>
              <PadPilot.SearchableCombobox
                class={styles.combobox}
                classNames={comboboxClasses}
                emptyText="No matches"
                disabled={props.disabled}
                items={GENERATOR_OPTION_GROUPS[selector.key]}
                onOpenChange={(value) => setOpen(selector.key, props.disabled ? false : value)}
                onQueryChange={(value) => {
                  if (props.disabled) return;
                  setQueries(selector.key, value);
                  setFields(selector.key, value.trim());
                  setManualFields(selector.key, value.trim().length > 0);
                  setSuggestedFields(selector.key, false);
                }}
                onSelect={(id) => selectItem(selector.key, id)}
                open={open[selector.key]}
                placeholder={selector.placeholder}
                query={queries[selector.key]}
                searchLabel={selector.label}
                selectedId={selectedId(selector.key)}
                toggleLabel={`Browse ${selector.label} options`}
              />
            </div>
            {rowActions(selector.key, selector.label)}
          </div>
        ))}
      </div>
      <div class={styles["control-stack"]}>
        {advancedSliders.slice(0, 2).map(sliderRow)}
        <div class={`${styles["control-row"]} ${styles["slider-row"]}`}>
          <Tooltip content={lengthTooltip} placement="bottom" class={styles["label-tooltip"]}>
            <span class={`${styles["row-label"]} ${styles["length-label"]}`}>
              <Clock3 size={15} aria-hidden="true" />
              Bar Length
            </span>
          </Tooltip>
          <div class={`${styles["row-control"]} ${styles["slider-control"]} ${styles["length-control"]}`}>
            <span class={styles["slider-frame"]}>
              <PadPilot.Slider
                aria-label="Bar Length"
                class={styles.slider}
                label=""
                disabled={props.disabled}
                max={32}
                min={2}
                onChange={setLengthBars}
                orientation="horizontal"
                snapValues={lengthSliderValues}
                value={fields.lengthBars}
                width={520}
              />
              <span class={styles["length-ticks"]} aria-hidden="true">
                {lengthSliderOptions.map((option) => (
                  <span style={lengthTickStyle(option.value)}>{option.value}</span>
                ))}
              </span>
            </span>
            <span class={styles["value-readout"]}>{`${fields.lengthBars} BARS`}</span>
          </div>
          {rowActions("lengthBars", "Bar Length")}
        </div>
        {advancedSliders.slice(2).map(sliderRow)}
      </div>
      <div class={styles["notes-row"]}>
        <PadPilot.TextAreaField
          class={styles["notes-field"]}
          labelIcon={FileText}
          label="Extra Description Notes"
          disabled={props.disabled}
          onInput={(event) => setFields("notes", event.currentTarget.value)}
          placeholder="Add any extra context, references, or instructions..."
          value={fields.notes}
        />
      </div>
    </section>
  );
}
