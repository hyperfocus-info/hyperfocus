import { createEffect, onCleanup } from "solid-js";
import { useModuleScope } from "../../padpilot/provider";

/**
 * Props for Style.
 */
export type StyleProps = {
  /** Raw CSS text that will be scope-prefixed */
  css?: string;
  /** Alternate source of CSS text passed as children */
  children?: string;
};

export const scopeCss = (cssText: string, scopeId: string) => {
  const scope = `[data-pp-module-scope="${scopeId}"]`;
  const scopedRules = cssText.replace(/(^|})\s*([^@{}][^{]+)\s*\{/g, (_full, boundary: string, selectors: string) => {
    const scopedSelectors = selectors
      .split(",")
      .map((selector) => `${scope} ${selector.trim()}`)
      .join(", ");
    return `${boundary} ${scopedSelectors} {`;
  });

  return scopedRules;
};

/**
 * Style injects scoped CSS into the active module container.
 */
export function Style(props: StyleProps) {
  const { container, scopeId } = useModuleScope();

  createEffect(() => {
    const target = container();
    const css = props.css ?? props.children ?? "";
    if (!target || !css.trim()) return;

    const styleTag = document.createElement("style");
    styleTag.setAttribute("data-pp-style-scope", scopeId);
    styleTag.textContent = scopeCss(css, scopeId);
    target.prepend(styleTag);

    onCleanup(() => styleTag.remove());
  });

  return null;
}
