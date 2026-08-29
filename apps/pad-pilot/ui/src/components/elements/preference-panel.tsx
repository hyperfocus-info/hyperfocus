import { Show, splitProps, type JSX } from "solid-js";
import { joinElementClasses as joinClasses } from "./element-helpers";
import styles from "./preference-panel.stylex";

export type PreferencePanelClassNames = {
  body?: string;
  header?: string;
  root?: string;
  section?: string;
  sectionHeader?: string;
};

/**
 * Props for PreferencePanel.
 */
export type PreferencePanelProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "children" | "title"> & {
  /** Optional heading text rendered above settings content. */
  title?: string;
  /** Optional secondary copy rendered under the heading. */
  description?: string;
  /** Panel content. */
  children: JSX.Element;
  /** Optional slot-level classes for internal parts. */
  classNames?: PreferencePanelClassNames;
};

/**
 * Props for a PreferencePanel section.
 */
export type PreferencePanelSectionProps = JSX.HTMLAttributes<HTMLDivElement> & {
  /** Section heading. */
  title: string;
  /** Optional helper copy for the section. */
  description?: string;
  /** Section body. */
  children: JSX.Element;
};

/** PreferencePanel renders a structured settings surface distinct from edge-drawer behavior. */
function PreferencePanelRoot(props: PreferencePanelProps) {
  const [local, others] = splitProps(props, ["children", "class", "classNames", "description", "title"]);

  return (
    <div {...others} class={joinClasses(styles.root, local.class, local.classNames?.root)}>
      <Show when={local.title || local.description}>
        <header class={joinClasses(styles.header, local.classNames?.header)}>
          <Show when={local.title}>
            <h3 class={styles["header-h3"]}>{local.title}</h3>
          </Show>
          <Show when={local.description}>
            <p class={styles["header-p"]}>{local.description}</p>
          </Show>
        </header>
      </Show>
      <div class={joinClasses(styles.body, local.classNames?.body)}>{local.children}</div>
    </div>
  );
}

function PreferencePanelSection(props: PreferencePanelSectionProps) {
  const [local, others] = splitProps(props, ["children", "class", "description", "title"]);

  return (
    <div
      {...others}
      class={joinClasses(styles.section, local.class)}
      data-preference-section="true"
    >
      <header class={styles["section-header"]}>
        <h4 class={styles["section-header-h4"]}>{local.title}</h4>
        <Show when={local.description}>
          <p class={styles["section-header-p"]}>{local.description}</p>
        </Show>
      </header>
      {local.children}
    </div>
  );
}

type PreferencePanelComponent = ((props: PreferencePanelProps) => JSX.Element) & {
  Section: typeof PreferencePanelSection;
};

export const PreferencePanel = PreferencePanelRoot as PreferencePanelComponent;

PreferencePanel.Section = PreferencePanelSection;
