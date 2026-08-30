import { Match, Show, Switch, type JSX } from "solid-js";
import { Knob } from "../../../components/elements/knob";
import { Toggle } from "../../../components/elements/toggle";
import { ToggleButton } from "../../../components/elements/toggle-button";
import { FxSelectField } from "./fx-select-field";
import {
  type AnyNodeConfig,
  type FxNodeControlDefinition,
  type FxNodeControlValue,
} from "../node-registry/types";
import {
  buildTimingSyncControlKey,
  clampTimingSyncDivisionIndex,
  getTimingSyncLabel,
} from "../timing-sync";
import styles from "../styles/fx-node-registry.stylex";

export function resolveFxControls<TConfig>(
  controls: readonly FxNodeControlDefinition<TConfig>[],
  keys: readonly string[],
) {
  return keys.flatMap((key) => {
    const control = controls.find((entry) => entry.key === key);
    return control ? [control] : [];
  });
}

export function formatFxControlValue(
  control: FxNodeControlDefinition<AnyNodeConfig>,
  value: number,
) {
  const formatted = Number(value).toFixed(control.max && control.max > 10 ? 0 : 2);
  return control.unit ? `${formatted} ${control.unit}`.trim() : formatted;
}

export function renderFxControlField<TConfig>(
  control: FxNodeControlDefinition<TConfig>,
  config: TConfig,
  updateControl: (key: string, value: FxNodeControlValue, commit: boolean) => void,
  options: { size?: number; testId?: string } = {},
) {
  const value = () => control.getValue(config);
  const timingSync = () => control.timingSync;
  const syncEnabled = () => timingSync()?.getSyncEnabled(config) ?? false;
  const maximumDivisionIndex = () => timingSync()?.maximumDivisionIndex ?? 19;
  const divisionIndex = () => clampTimingSyncDivisionIndex(
    timingSync()?.getDivisionIndex(config) ?? 0,
    maximumDivisionIndex(),
  );
  const size = options.size ?? 50;
  const stopControlEvent: JSX.EventHandlerUnion<HTMLElement, Event> = (event) => event.stopPropagation();
  return (
    <div data-no-drag onClick={stopControlEvent} onPointerDown={stopControlEvent}>
      <Switch>
        <Match when={control.kind === "toggle"}>
          <Toggle
            label={control.label}
            value={Boolean(value())}
            onChange={(next) => updateControl(control.key, next, true)}
          />
        </Match>
        <Match when={control.kind === "select"}>
          <FxSelectField
            label={control.label}
            value={String(value())}
            options={control.options ?? []}
            onChange={(next) => updateControl(control.key, next, true)}
          />
        </Match>
        <Match when={control.kind !== "toggle" && control.kind !== "select"}>
          <Show
            when={timingSync()}
            fallback={
              <Knob
                data-testid={options.testId}
                label={control.label}
                min={control.min ?? 0}
                max={control.max ?? 1}
                step={control.step}
                value={Number(value())}
                defaultValue={Number(value())}
                onChange={(next) => updateControl(control.key, next, false)}
                onCommit={(next) => updateControl(control.key, next, true)}
                valueFormatter={(next) => formatFxControlValue(control as FxNodeControlDefinition<AnyNodeConfig>, next)}
                manualInput
                size={size}
              />
            }
          >
            <div class={styles["timing-control"]} data-no-drag onClick={stopControlEvent} onPointerDown={stopControlEvent}>
              <Knob
                data-testid={options.testId}
                label={control.label}
                min={syncEnabled() ? 0 : (control.min ?? 0)}
                max={syncEnabled() ? maximumDivisionIndex() : (control.max ?? 1)}
                step={syncEnabled() ? 1 : control.step}
                value={syncEnabled() ? divisionIndex() : Number(value())}
                defaultValue={syncEnabled() ? divisionIndex() : Number(value())}
                onChange={(next) =>
                  updateControl(syncEnabled() ? buildTimingSyncControlKey(control.key, "division") : control.key, next, false)
                }
                onCommit={(next) =>
                  updateControl(syncEnabled() ? buildTimingSyncControlKey(control.key, "division") : control.key, next, true)
                }
                valueFormatter={(next) =>
                  syncEnabled() ? getTimingSyncLabel(next) : formatFxControlValue(control as FxNodeControlDefinition<AnyNodeConfig>, next)
                }
                manualInput={!syncEnabled()}
                size={size}
              />
              <ToggleButton
                class={`${styles["timing-sync-toggle"]} ${syncEnabled() ? styles["timing-sync-toggle-on"] : ""}`.trim()}
                variant="ghost"
                value={syncEnabled()}
                data-no-drag
                onClick={() => {
                  updateControl(buildTimingSyncControlKey(control.key, "enabled"), !syncEnabled(), true);
                }}
                onPointerDown={stopControlEvent}
              >
                <span>Sync</span>
                <span class={styles["timing-sync-toggle-thumb"]} />
              </ToggleButton>
            </div>
          </Show>
        </Match>
      </Switch>
    </div>
  );
}
