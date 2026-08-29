/** @jsxImportSource solid-js */
import { createSignal, For, Show, type JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { ChevronDown, Eye, EyeOff } from "lucide-solid";
import { ActionButton } from "../action-button";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";
import { Tooltip } from "../primitives/tooltip";
import { preferenceStyles } from "./preferences.styles";

export function PreferenceSection(props: { title: string; description: string; children: JSX.Element }) {
  return (
    <section class={stylex.attrs(preferenceStyles.grid, preferenceStyles.minWidth0, preferenceStyles.gap3).class}>
      <div class={stylex.attrs(preferenceStyles.minWidth0, preferenceStyles.borderBottom, preferenceStyles.borderDefault, preferenceStyles.paddingBottom3).class}>
        <h3 class={stylex.attrs(preferenceStyles.truncate, preferenceStyles.fontDisplay, preferenceStyles.textLg, preferenceStyles.fontSemibold, preferenceStyles.colorMuted).class}>{props.title}</h3>
        <p class={stylex.attrs(preferenceStyles.marginTop1, preferenceStyles.wrapText, preferenceStyles.textXs, preferenceStyles.leading5, preferenceStyles.colorMuted).class}>{props.description}</p>
      </div>
      <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap3).class}>{props.children}</div>
    </section>
  );
}

export function PreferenceRow(props: {
  id?: string;
  title: string;
  description: string;
  children: JSX.Element;
  layout?: "default" | "wide-label";
}) {
  return (
    <section
      id={props.id}
      data-test-preference-row={props.id}
      class={stylex.attrs(
        preferenceStyles.grid,
        preferenceStyles.minWidth0,
        preferenceStyles.gap3,
        preferenceStyles.overflowHidden,
        preferenceStyles.roundedXl,
        preferenceStyles.border,
        preferenceStyles.borderDefault,
        preferenceStyles.backgroundWhite55,
        preferenceStyles.padding4,
        props.layout === "wide-label" ? preferenceStyles.mdGridColumnsPreferenceWideLabel : preferenceStyles.mdGridColumnsPreference
      ).class}
    >
      <div class={stylex.attrs(preferenceStyles.minWidth0).class}>
        <h4 class={stylex.attrs(preferenceStyles.truncate, preferenceStyles.text0585, preferenceStyles.fontSemibold, preferenceStyles.tracking018, preferenceStyles.colorMuted).class}>{props.title}</h4>
        <p class={stylex.attrs(preferenceStyles.marginTop1, preferenceStyles.wrapText, preferenceStyles.text0675, preferenceStyles.leading5, preferenceStyles.colorMuted).class}>{props.description}</p>
      </div>
      <div class={stylex.attrs(preferenceStyles.minWidth0).class}>{props.children}</div>
    </section>
  );
}

export function PreferenceToggle(props: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label class={stylex.attrs(preferenceStyles.inlineFlex, preferenceStyles.minHeight9, preferenceStyles.cursorPointer, preferenceStyles.itemsCenter, preferenceStyles.justifyBetween, preferenceStyles.gap3, preferenceStyles.roundedXl, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundPanelStrong, preferenceStyles.paddingInline3, preferenceStyles.paddingBlock2, preferenceStyles.transition, preferenceStyles.hoverBackgroundSoftAccent).class}>
      <span class={stylex.attrs(preferenceStyles.textXs, preferenceStyles.fontMedium, preferenceStyles.colorForeground).class}>{props.label}</span>
      <input
        class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4, preferenceStyles.accentColor).class}
        type="checkbox"
        checked={props.checked}
        onInput={(event) => props.onChange(event.currentTarget.checked)}
      />
    </label>
  );
}

export function SegmentedControl<T extends string | number>(props: {
  ariaLabel: string;
  value: T;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  onChange: (value: T) => void;
}) {
  const optionClass = stylex.attrs(
    preferenceStyles.minHeight8,
    preferenceStyles.minWidth0,
    preferenceStyles.truncate,
    preferenceStyles.roundedLg,
    preferenceStyles.paddingInline2,
    preferenceStyles.textXs,
    preferenceStyles.fontMedium,
    preferenceStyles.colorMuted,
    preferenceStyles.transition,
    preferenceStyles.hoverBackgroundSoftAccent,
    preferenceStyles.hoverColorForeground,
    preferenceStyles.cursorDisabled,
    preferenceStyles.disabledFaded
  ).class;
  const selectedOptionClass = stylex.attrs(
    preferenceStyles.minHeight8,
    preferenceStyles.minWidth0,
    preferenceStyles.truncate,
    preferenceStyles.roundedLg,
    preferenceStyles.paddingInline2,
    preferenceStyles.textXs,
    preferenceStyles.fontMedium,
    preferenceStyles.colorMuted,
    preferenceStyles.transition,
    preferenceStyles.hoverBackgroundSoftAccent,
    preferenceStyles.hoverColorForeground,
    preferenceStyles.cursorDisabled,
    preferenceStyles.disabledFaded,
    preferenceStyles.segmentSelected
  ).class;

  return (
    <div role="group" aria-label={props.ariaLabel} class={stylex.attrs(preferenceStyles.grid, preferenceStyles.roundedXl, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundPanelStrong, preferenceStyles.padding1).class} style={{ "grid-template-columns": `repeat(${props.options.length}, minmax(0, 1fr))` }}>
      <For each={props.options}>
        {(option) => (
          <button
            type="button"
            class={props.value === option.value ? selectedOptionClass : optionClass}
            disabled={option.disabled}
            aria-pressed={props.value === option.value}
            onClick={() => props.onChange(option.value)}
          >
            {option.label}
          </button>
        )}
      </For>
    </div>
  );
}

export function RangeControl(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  tooltip?: string;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const clamp = (value: number) => Math.max(props.min, Math.min(props.max, props.step ? Math.round(value / props.step) * props.step : Math.round(value)));
  const formatValue = (value: number) => props.formatValue?.(value) ?? String(value);
  const label = () => <span class={stylex.attrs(preferenceStyles.minWidth0, preferenceStyles.truncate, preferenceStyles.text0585, preferenceStyles.fontSemibold, preferenceStyles.tracking018, preferenceStyles.colorMuted).class}>{props.label}</span>;

  return (
    <label class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class}>
      <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.minWidth0, preferenceStyles.itemsCenter, preferenceStyles.justifyBetween, preferenceStyles.gap3, preferenceStyles.textXs).class}>
        <Show when={props.tooltip} fallback={label()}>
          {(tooltip) => (
            <Tooltip content={tooltip()} triggerClass={stylex.attrs(preferenceStyles.minWidth0).class}>
              {label()}
            </Tooltip>
          )}
        </Show>
        <span class={stylex.attrs(preferenceStyles.shrink0, preferenceStyles.roundedLg, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundWhite70, preferenceStyles.paddingInline2, preferenceStyles.paddingBlock1, preferenceStyles.fontSemibold, preferenceStyles.colorForeground).class}>
          {formatValue(props.value)}
          {props.suffix}
        </span>
      </div>
      <input
        aria-label={props.label}
        class={stylex.attrs(preferenceStyles.widthFull, preferenceStyles.accentColor).class}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onInput={(event) => props.onChange(clamp(Number(event.currentTarget.value)))}
      />
      <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.justifyBetween, preferenceStyles.text065, preferenceStyles.colorMuted).class}>
        <span>
          {formatValue(props.min)}
          {props.suffix}
        </span>
        <span>
          {formatValue(props.max)}
          {props.suffix}
        </span>
      </div>
    </label>
  );
}

export function PasswordKeyInput(props: {
  label: string;
  value: string;
  placeholder: string;
  status: string;
  testStatus?: "idle" | "pending" | "ready" | "failed";
  testMessage?: string;
  testMessageId?: string;
  onInput: (value: string) => void;
  onTest: () => void;
}) {
  const [visible, setVisible] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;
  const providerStatusClass = stylex.attrs(
    preferenceStyles.roundedLg,
    preferenceStyles.border,
    preferenceStyles.paddingInline2,
    preferenceStyles.paddingBlock1,
    preferenceStyles.providerStatusIdle
  ).class;
  const providerReadyClass = stylex.attrs(
    preferenceStyles.roundedLg,
    preferenceStyles.border,
    preferenceStyles.paddingInline2,
    preferenceStyles.paddingBlock1,
    preferenceStyles.providerStatusReady
  ).class;
  const providerFailedClass = stylex.attrs(
    preferenceStyles.roundedLg,
    preferenceStyles.border,
    preferenceStyles.paddingInline2,
    preferenceStyles.paddingBlock1,
    preferenceStyles.providerStatusFailed
  ).class;

  return (
    <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class}>
      <label class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap1).class}>
        <span class={stylex.attrs(preferenceStyles.text0585, preferenceStyles.fontSemibold, preferenceStyles.tracking018, preferenceStyles.colorMuted).class}>{props.label}</span>
        <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.gap2).class}>
          <div class={stylex.attrs(preferenceStyles.relative, preferenceStyles.minWidth0, preferenceStyles.flex1).class}>
            <Input
              ref={inputRef}
              class={stylex.attrs(preferenceStyles.paddingRight10).class}
              type={visible() ? "text" : "password"}
              value={props.value}
              placeholder={props.placeholder}
              onInput={(event) => props.onInput(event.currentTarget.value)}
            />
            <ActionButton
              tooltip={visible() ? "Hide API key" : "Show API key"}
              ariaLabel={visible() ? `Hide ${props.label}` : `Show ${props.label}`}
              variant="ghost"
              size="icon"
              class={stylex.attrs(preferenceStyles.absolute, preferenceStyles.right1, preferenceStyles.top1, preferenceStyles.height7, preferenceStyles.width7).class}
              icon={visible() ? <EyeOff class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} /> : <Eye class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} />}
              onClick={() => {
                setVisible((current) => {
                  const next = !current;
                  if (inputRef) {
                    inputRef.type = next ? "text" : "password";
                  }
                  return next;
                });
              }}
            />
          </div>
          <ActionButton
            tooltip={`Test ${props.label}`}
            disabled={props.testStatus === "pending"}
            disabledReason="Connection test already running."
            variant="secondary"
            onClick={props.onTest}
          >
            Test
          </ActionButton>
        </div>
      </label>
      <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.flexWrap, preferenceStyles.itemsCenter, preferenceStyles.gap2, preferenceStyles.text07).class}>
        <span
          class={props.testStatus === "ready" ? providerReadyClass : props.testStatus === "failed" ? providerFailedClass : providerStatusClass}
        >
          {props.status}
        </span>
        <span data-provider-test-message={props.testMessageId} class={stylex.attrs(preferenceStyles.minWidth0, preferenceStyles.colorMuted).class}>
          {props.testMessage}
        </span>
      </div>
    </div>
  );
}

export function AdvancedDisclosure(props: { title: string; description?: string; children: JSX.Element }) {
  const contentId = `advanced-preferences-${++advancedDisclosureSequence}`;
  const disclosureIconClass = stylex.attrs(
    preferenceStyles.height4,
    preferenceStyles.width4,
    preferenceStyles.shrink0,
    preferenceStyles.colorMuted,
    preferenceStyles.transition
  ).class;
  return (
    <details class={stylex.attrs(preferenceStyles.roundedXl, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundWhite45).class}>
      <summary
        role="button"
        class={stylex.attrs(preferenceStyles.flex, preferenceStyles.heightAuto, preferenceStyles.widthFull, preferenceStyles.cursorPointer, preferenceStyles.justifyBetween, preferenceStyles.roundedXl, preferenceStyles.paddingInline4, preferenceStyles.paddingBlock3, preferenceStyles.textLeft).class}
        aria-controls={contentId}
      >
        <span class={stylex.attrs(preferenceStyles.minWidth0).class}>
          <span class={stylex.attrs(preferenceStyles.block, preferenceStyles.truncate, preferenceStyles.text0585, preferenceStyles.fontSemibold, preferenceStyles.tracking018, preferenceStyles.colorMuted).class}>{props.title}</span>
          <Show when={props.description}>
            <span class={stylex.attrs(preferenceStyles.marginTop1, preferenceStyles.block, preferenceStyles.truncate, preferenceStyles.text0675, preferenceStyles.leading5, preferenceStyles.colorMuted).class}>{props.description}</span>
          </Show>
        </span>
        <ChevronDown
          class={disclosureIconClass}
        />
      </summary>
      <div id={contentId} class={stylex.attrs(preferenceStyles.borderTop, preferenceStyles.borderDefault, preferenceStyles.padding4).class}>{props.children}</div>
    </details>
  );
}

let advancedDisclosureSequence = 0;
