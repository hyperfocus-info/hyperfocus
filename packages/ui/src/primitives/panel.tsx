import * as stylex from "@stylexjs/stylex";
import { Show, splitProps, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { tokens } from "../theme/tokens.stylex";
import { sharedStyles } from "../theme/styles";
import { typography } from "../theme/typography";

type HeadingElement = "h1" | "h2" | "h3" | "h4";

export type PanelSurfaceProps = JSX.HTMLAttributes<HTMLDivElement>;

export type PanelHeaderProps = Omit<JSX.HTMLAttributes<HTMLElement>, "title"> & {
  title: JSX.Element;
  description?: JSX.Element;
  context?: JSX.Element;
  icon?: JSX.Element;
  variant?: "panel" | "view";
  actions?: JSX.Element;
  headingAs?: HeadingElement;
};

export type PanelSectionProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "title"> & {
  heading?: JSX.Element;
  headingAs?: HeadingElement;
  actions?: JSX.Element;
};

export type EmptyStateProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "title"> & {
  title: JSX.Element;
  description?: JSX.Element;
  icon?: JSX.Element;
  actions?: JSX.Element;
};

const styles = stylex.create({
  surface: {
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
  },
  header: {
    gap: tokens.space3,
    paddingBlock: tokens.space2,
    paddingInline: tokens.space3,
    alignItems: "center",
    display: "flex",
    flexBasis: "auto",
    flexGrow: 0,
    flexShrink: 0,
    flexWrap: "wrap",
    justifyContent: "space-between",
    borderBottomColor: tokens.border,
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
    minHeight: "2.75rem",
  },
  viewHeader: { gap: tokens.space3, paddingInline: 0, alignItems: "center", marginBlockEnd: tokens.space4, paddingBlockEnd: tokens.space3, paddingBlockStart: 0, },
  viewTitle: { fontFamily: "var(--hf-font-heading, var(--hf-font-ui))", fontSize: tokens.fontPage, fontWeight: 550, letterSpacing: "-0.025em", lineHeight: 1.25, },
  context: { margin: 0, color: tokens.muted, fontSize: tokens.fontCaption, lineHeight: 1.5, },
  titleRow: { gap: tokens.space3, alignItems: "center", display: "flex", minWidth: 0, },
  viewIcon: { alignItems: "center", color: tokens.accentStrong, display: "inline-flex", flexShrink: 0, },
  headerCopy: { gap: tokens.space1,
 display: "grid",
 flexBasis: '10rem',
 flexGrow: '1',
 flexShrink: '1',
 overflowWrap: "anywhere",
 minWidth: 0, },
  heading: {
    margin: 0,
    color: tokens.foreground,
  },
  description: {
    margin: 0,
    color: tokens.muted,
  },
  actions: {
    gap: tokens.space1,
    alignItems: "center",
    display: "flex",
    flexBasis: "auto",
    flexGrow: 0,
    flexShrink: 0,
    flexWrap: "wrap",
    maxWidth: "100%",
    minWidth: 0,
  },
  section: {
    padding: tokens.space3,
    gap: tokens.space2,
    display: "grid",
    minWidth: 0,
  },
  sectionHeader: {
    gap: tokens.space2,
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    minWidth: 0,
  },
  sectionHeading: {
    margin: 0,
    color: tokens.foreground,
    overflowWrap: "anywhere",
  },
  empty: {
    padding: tokens.space4,
    gap: tokens.space2,
    alignContent: "center",
    color: tokens.foreground,
    display: "grid",
    justifyItems: "center",
    overflowWrap: "anywhere",
    textAlign: "center",
    minWidth: 0,
  },
  emptyIcon: { color: tokens.muted, fontSize: "1.5rem", lineHeight: 1 },
  emptyDescription: {
    margin: 0,
    color: tokens.muted,
    maxWidth: "32rem",
  },
  emptyActions: { gap: tokens.space2, alignItems: "center", display: "flex", flexWrap: "wrap", justifyContent: "center", },
});

export function PanelSurface(props: PanelSurfaceProps) {
  const [local, rest] = splitProps(props, ["children", "class"]);
  return (
    <div
      {...rest}
      {...stylex.attrs(styles.surface, sharedStyles.surface)}
      classList={{ [local.class ?? ""]: Boolean(local.class) }}
      data-panel-surface=""
    >
      {local.children}
    </div>
  );
}

export function PanelHeader(props: PanelHeaderProps) {
  const [local, rest] = splitProps(props, ["title", "description", "context", "icon", "variant", "actions", "headingAs", "children", "class"]);
  return (
    <header
      {...rest}
      {...stylex.attrs(styles.header, local.variant === "view" && styles.viewHeader)}
      classList={{ [local.class ?? ""]: Boolean(local.class) }}
      data-panel-header=""
      data-view-header={local.variant === "view" ? "" : undefined}
    >
      <div {...stylex.attrs(styles.headerCopy)}>
        <Show when={local.context}><p {...stylex.attrs(styles.context)}>{local.context}</p></Show>
        <div {...stylex.attrs(styles.titleRow)}><Show when={local.icon}><span {...stylex.attrs(styles.viewIcon)} aria-hidden="true">{local.icon}</span></Show><Dynamic component={local.headingAs ?? "h2"} {...stylex.attrs(typography.section, styles.heading, local.variant === "view" && styles.viewTitle)}>{local.title}</Dynamic></div>
        <Show when={local.description}><p {...stylex.attrs(typography.caption, styles.description)}>{local.description}</p></Show>
        {local.children}
      </div>
      <Show when={local.actions}><div {...stylex.attrs(styles.actions)}>{local.actions}</div></Show>
    </header>
  );
}

export function PanelSection(props: PanelSectionProps) {
  const [local, rest] = splitProps(props, ["heading", "headingAs", "actions", "children", "class"]);
  return (
    <div
      {...rest}
      {...stylex.attrs(styles.section)}
      classList={{ [local.class ?? ""]: Boolean(local.class) }}
      data-panel-section=""
    >
      <Show when={local.heading || local.actions}>
        <div {...stylex.attrs(styles.sectionHeader)}>
          <Show when={local.heading}>
            <Dynamic component={local.headingAs ?? "h3"} {...stylex.attrs(typography.emphasis, styles.sectionHeading)}>{local.heading}</Dynamic>
          </Show>
          <Show when={local.actions}><div {...stylex.attrs(styles.actions)}>{local.actions}</div></Show>
        </div>
      </Show>
      {local.children}
    </div>
  );
}

export function EmptyState(props: EmptyStateProps) {
  const [local, rest] = splitProps(props, ["title", "description", "icon", "actions", "children", "class"]);
  return (
    <div
      {...rest}
      {...stylex.attrs(styles.empty)}
      classList={{ [local.class ?? ""]: Boolean(local.class) }}
      data-empty-state=""
    >
      <Show when={local.icon}><div {...stylex.attrs(styles.emptyIcon)} aria-hidden="true">{local.icon}</div></Show>
      <strong {...stylex.attrs(typography.emphasis)}>{local.title}</strong>
      <Show when={local.description}><p {...stylex.attrs(typography.body, styles.emptyDescription)}>{local.description}</p></Show>
      {local.children}
      <Show when={local.actions}><div {...stylex.attrs(styles.emptyActions)}>{local.actions}</div></Show>
    </div>
  );
}
