import * as stylex from "@stylexjs/stylex";
import { type JSX } from "solid-js";
import { tokens } from "../theme/tokens.stylex";
import { normalizeWorkbenchLayout, type WorkbenchLayout } from "./layout";

export function WorkbenchShell(props: { layout?: Partial<WorkbenchLayout>; activityBar?: JSX.Element; sidebar?: JSX.Element; main: JSX.Element; inspector?: JSX.Element; bottomPanel?: JSX.Element; statusBar?: JSX.Element }) {
  const layout = () => normalizeWorkbenchLayout(props.layout ?? {});
  const columns = () => `${props.activityBar ? "3rem " : ""}${layout().sidebarCollapsed || !props.sidebar ? "" : `${layout().sidebarSize}px `}minmax(0,1fr)${layout().inspectorCollapsed || !props.inspector ? "" : ` ${layout().inspectorSize}px`}`;
  const rows = () => `minmax(0,1fr)${layout().bottomCollapsed || !props.bottomPanel ? "" : ` ${layout().bottomSize}px`}${props.statusBar ? " 1.6rem" : ""}`;
  return (
    <div {...stylex.attrs(styles.root)} style={{ "grid-template-columns": columns(), "grid-template-rows": rows() }} data-test-workbench-shell="">
      {props.activityBar && <aside {...stylex.attrs(styles.activity)}>{props.activityBar}</aside>}
      {!layout().sidebarCollapsed && props.sidebar && <aside {...stylex.attrs(styles.sidebar)}>{props.sidebar}</aside>}
      <main {...stylex.attrs(styles.main)}>{props.main}</main>
      {!layout().inspectorCollapsed && props.inspector && <aside {...stylex.attrs(styles.inspector)}>{props.inspector}</aside>}
      {!layout().bottomCollapsed && props.bottomPanel && <section {...stylex.attrs(styles.bottom)}>{props.bottomPanel}</section>}
      {props.statusBar && <footer {...stylex.attrs(styles.status)}>{props.statusBar}</footer>}
    </div>
  );
}

const styles = stylex.create({
  root: { overflow: "hidden", backgroundColor: tokens.background, color: tokens.foreground, display: "grid", height: "100%", minHeight: 0, minWidth: 0, width: "100%", },
  activity: { borderColor: tokens.border,
 borderStyle: "solid",
 overflow: "hidden",
 gridRowEnd: '-1',
 gridRowStart: '1',
 borderBottomWidth: '0',
 borderLeftWidth: '0',
 borderRightWidth: '1px',
 borderTopWidth: '0',
 minHeight: 0, },
  sidebar: { borderColor: tokens.border,
 borderStyle: "solid",
 overflow: "auto",
 borderBottomWidth: '0',
 borderLeftWidth: '0',
 borderRightWidth: '1px',
 borderTopWidth: '0',
 minHeight: 0, },
  main: { overflow: "hidden", minHeight: 0, minWidth: 0, },
  inspector: { borderColor: tokens.border,
 borderStyle: "solid",
 overflow: "auto",
 borderBottomWidth: '0',
 borderLeftWidth: '1px',
 borderRightWidth: '0',
 borderTopWidth: '0',
 minHeight: 0, },
  bottom: { borderColor: tokens.border,
 borderStyle: "solid",
 overflow: "auto",
 gridColumnEnd: '-1',
 gridColumnStart: '1',
 borderBottomWidth: '0',
 borderLeftWidth: '0',
 borderRightWidth: '0',
 borderTopWidth: '1px',
 minHeight: 0, },
  status: { paddingInline: "0.6rem",
 alignItems: "center",
 backgroundColor: tokens.panelRaised,
 display: "flex",
 fontSize: "0.68rem",
 gridColumnEnd: '-1',
 gridColumnStart: '1', }
});

