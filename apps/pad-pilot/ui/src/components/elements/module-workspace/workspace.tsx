import * as stylex from "@stylexjs/stylex";
import { Show, splitProps, type JSX } from "solid-js";
import { styles } from "../styles/module-workspace.stylex";

type Props = JSX.HTMLAttributes<HTMLElement> & {
  header?: JSX.Element;
  footer?: JSX.Element;
  /** Only this named content region scrolls. Custom split workspaces opt out. */
  scroll?: boolean;
  bodyClass?: string;
};

/** A Module owns one viewport, with stationary chrome and bounded content. */
export function ModuleWorkspace(props: Props) {
  const [local, rest] = splitProps(props, ["header", "footer", "children", "class", "bodyClass", "scroll"]);
  return <section {...rest} data-pp-module-workspace class={`${stylex.attrs(styles.root).class} ${local.class ?? ""}`}>
    <Show when={local.header}><header {...stylex.attrs(styles.header)}>{local.header}</header></Show>
    <div data-pp-module-content class={`${stylex.attrs(styles.body, local.scroll !== false && styles.scroll).class} ${local.bodyClass ?? ""}`}>
      {local.children}
    </div>
    <Show when={local.footer}><footer {...stylex.attrs(styles.footer)}>{local.footer}</footer></Show>
  </section>;
}
