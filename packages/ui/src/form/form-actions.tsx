import * as stylex from "@stylexjs/stylex";
import { children, createContext, For, splitProps, type JSX } from "solid-js";
import { tokens } from "../theme/tokens.stylex";

export const FormActionsContext = createContext(false);
const styles = stylex.create({
  root: {
    columnGap: tokens.space3,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 12rem), 1fr))",
    rowGap: tokens.space1,
    minWidth: 0,
  },
  slot: { gridRow: "span 3", display: "grid", gridTemplateRows: "subgrid", minWidth: 0, },
  control: { gridRow: "2", alignSelf: "center", display: "grid", minWidth: 0, },
});

/** Labeled fields share label/control/help tracks; actions occupy the control track. */
export function FormActions(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, rest] = splitProps(props, ["children", "class"]);
  return <div {...rest} {...stylex.attrs(styles.root)} classList={{ [local.class ?? ""]: Boolean(local.class) }} data-ui-form-actions="">
    <FormActionsContext.Provider value={true}>
      <FormActionSlots>{local.children}</FormActionSlots>
    </FormActionsContext.Provider>
  </div>;
}

function FormActionSlots(props: { children: JSX.Element }) {
  const resolved = children(() => props.children);
  return <For each={resolved.toArray()}>{child => {
    const field = child instanceof HTMLElement && child.hasAttribute("data-ui-field");
    return <div {...stylex.attrs(styles.slot)}>{field ? child : <div {...stylex.attrs(styles.control)}>{child}</div>}</div>;
  }}</For>;
}
