import { createEffect, createSignal, onCleanup, type JSX } from "solid-js";
import { createComponent } from "solid-js/web";
import * as stylex from "@stylexjs/stylex";
import { createCoalescedText } from "@hyperfocus/ui/transcript";
// Bun's test runtime selects solid-markdown's Node/SSR export even though the
// Happy DOM test harness renders a client tree. Use the package's client build
// explicitly; browser bundles resolve to the same implementation.
import { SolidMarkdown } from "../../../node_modules/solid-markdown/dist/index.js";
import type { SolidMarkdownComponents } from "solid-markdown";
import type { Element, Properties } from "hast";
import type {
  ChatFileLinkContext,
  ChatFileTarget,
} from "../lib/chat-file-links";
import { resolveChatFileTarget } from "../lib/chat-file-links";
import {
  createMarkdownRehypePlugins,
  loadMarkdownHighlighter,
  type MarkdownHighlighter,
  markdownRemarkPlugins,
  classifyLinkHref,
  extractTextContent,
  findFirstChildElement,
  getCodeLanguage,
  getElementClassNames,
  normalizeAllowedHref,
} from "../lib/markdown";
import { cn } from "../lib/utils";
import { markdownStyles } from "./markdown-content.styles";
import { CopyTextButton } from "./primitives/copy-text-button";

export type MarkdownContentProps = {
  content: string | (() => string);
  tone?: "default" | "muted" | "danger" | "warning";
  size?: "body" | "compact";
  live?: boolean;
  liveRenderIntervalMs?: number;
  class?: string;
  fileLinks?: ChatFileLinkContext & {
    onOpenFile: (target: ChatFileTarget) => void;
  };
};

type MarkdownComponentProps<T> = T extends (props: infer P) => unknown
  ? P
  : never;
type AnchorProps = MarkdownComponentProps<
  Exclude<
    NonNullable<SolidMarkdownComponents["a"]>,
    keyof JSX.IntrinsicElements
  >
>;
type ImageProps = MarkdownComponentProps<
  Exclude<
    NonNullable<SolidMarkdownComponents["img"]>,
    keyof JSX.IntrinsicElements
  >
>;
type TableProps = MarkdownComponentProps<
  Exclude<
    NonNullable<SolidMarkdownComponents["table"]>,
    keyof JSX.IntrinsicElements
  >
>;
type PreProps = MarkdownComponentProps<
  Exclude<
    NonNullable<SolidMarkdownComponents["pre"]>,
    keyof JSX.IntrinsicElements
  >
>;
type CodeProps = MarkdownComponentProps<
  Exclude<
    NonNullable<SolidMarkdownComponents["code"]>,
    keyof JSX.IntrinsicElements
  >
>;

const staticMarkdownComponents: SolidMarkdownComponents = {
  h1(headingProps) {
    return <h1 id={headingProps.id} class={stylex.attrs(markdownStyles.heading, markdownStyles.heading1).class}>{headingProps.children}</h1>;
  },
  h2(headingProps) {
    return <h2 id={headingProps.id} class={stylex.attrs(markdownStyles.heading, markdownStyles.heading2).class}>{headingProps.children}</h2>;
  },
  h3(headingProps) {
    return <h3 id={headingProps.id} class={stylex.attrs(markdownStyles.heading, markdownStyles.heading3).class}>{headingProps.children}</h3>;
  },
  h4(headingProps) {
    return <h4 id={headingProps.id} class={stylex.attrs(markdownStyles.heading).class}>{headingProps.children}</h4>;
  },
  h5(headingProps) {
    return <h5 id={headingProps.id} class={stylex.attrs(markdownStyles.heading).class}>{headingProps.children}</h5>;
  },
  h6(headingProps) {
    return <h6 id={headingProps.id} class={stylex.attrs(markdownStyles.heading).class}>{headingProps.children}</h6>;
  },
  p(paragraphProps) {
    return <p class={stylex.attrs(markdownStyles.paragraph).class}>{paragraphProps.children}</p>;
  },
  ul(listProps) {
    return (
      <ul class={stylex.attrs(
        markdownStyles.blockSpacing,
        markdownStyles.list,
        listProps.depth > 0 ? markdownStyles.nestedList : undefined,
      ).class}>
        {listProps.children}
      </ul>
    );
  },
  ol(listProps) {
    return (
      <ol
        start={listProps.start}
        reversed={listProps.reversed}
        class={stylex.attrs(
          markdownStyles.blockSpacing,
          markdownStyles.list,
          listProps.depth > 0 ? markdownStyles.nestedList : undefined,
        ).class}
      >
        {listProps.children}
      </ol>
    );
  },
  li(listItemProps) {
    const taskItem = getElementClassNames(listItemProps.node.properties).includes("task-list-item");
    return (
      <li
        value={listItemProps.value}
        data-task-list-item={taskItem ? "" : undefined}
        class={stylex.attrs(
          listItemProps.index > 0 ? markdownStyles.listItemSibling : undefined,
          taskItem ? markdownStyles.taskListItem : undefined,
        ).class}
      >
        {listItemProps.children}
      </li>
    );
  },
  blockquote(blockquoteProps) {
    return (
      <blockquote class={stylex.attrs(markdownStyles.blockSpacing, markdownStyles.blockquote).class}>
        {blockquoteProps.children}
      </blockquote>
    );
  },
  hr() {
    return <hr class={stylex.attrs(markdownStyles.blockSpacing, markdownStyles.horizontalRule).class} />;
  },
  img(imageProps: ImageProps) {
    const description = [
      imageProps.alt,
      typeof imageProps.src === "string" ? imageProps.src : undefined,
    ].filter(Boolean).join(" | ");
    return (
      <span
        class={stylex.attrs(markdownStyles.imagePlaceholder).class}
        role="img"
        aria-label={imageProps.alt || "Image omitted"}
      >
        Image omitted{description ? `: ${description}` : ""}
      </span>
    );
  },
  table(tableProps: TableProps) {
    return (
      <div
        data-test-markdown-table-scroll=""
        class={stylex.attrs(markdownStyles.blockSpacing, markdownStyles.tableScroll).class}
      >
        <table class={stylex.attrs(markdownStyles.table).class}>{tableProps.children}</table>
      </div>
    );
  },
  tr(rowProps) {
    return <tr class={stylex.attrs(markdownStyles.tableRow).class}>{rowProps.children}</tr>;
  },
  th(cellProps) {
    return <th class={stylex.attrs(markdownStyles.tableCell, markdownStyles.tableHeader).class}>{cellProps.children}</th>;
  },
  td(cellProps) {
    return <td class={stylex.attrs(markdownStyles.tableCell).class}>{cellProps.children}</td>;
  },
  input(inputProps) {
    const disabled = Boolean(inputProps.disabled);
    return (
      <input
        type={inputProps.type}
        checked={inputProps.checked}
        disabled={disabled}
        class={stylex.attrs(
          markdownStyles.checkbox,
          disabled ? markdownStyles.disabledCheckbox : undefined,
        ).class}
      />
    );
  },
  section(sectionProps) {
    const footnotes = getElementClassNames(sectionProps.node.properties).includes("footnotes");
    return (
      <section
        data-footnotes={footnotes ? "" : undefined}
        aria-label={sectionProps["aria-label"]}
        class={footnotes ? stylex.attrs(markdownStyles.footnotes).class : undefined}
      >
        {sectionProps.children}
      </section>
    );
  },
  pre(preProps: PreProps) {
    const codeElement = findFirstChildElement(preProps.node, "code");
    const codeText = extractTextContent(codeElement ?? preProps.node);
    const language = getCodeLanguage(codeElement)?.toUpperCase() ?? "TEXT";
    return (
      <div
        data-test-markdown-code-block=""
        class={stylex.attrs(markdownStyles.blockSpacing, markdownStyles.codeBlock).class}
      >
        <div class={stylex.attrs(markdownStyles.codeHeader).class}>
          <span class={stylex.attrs(markdownStyles.codeLanguage).class}>{language}</span>
          <CopyTextButton
            value={codeText}
            tooltip="Copy code block"
            copiedTitle="Code copied"
            copiedDescription="Code block copied to clipboard."
            disabledReason="No code to copy"
            size="sm"
            variant="secondary"
            ariaLabel="Copy code block"
          >
            Copy
          </CopyTextButton>
        </div>
        <pre class={stylex.attrs(markdownStyles.codePre).class}>{preProps.children}</pre>
      </div>
    );
  },
  code(codeProps: CodeProps) {
    const classNames = getClassAttr(codeProps.node.properties);
    if (codeProps.inline) {
      return (
        <code
          data-test-markdown-inline-code=""
          class={cn(stylex.attrs(markdownStyles.inlineCode).class, classNames)}
        >
          {codeProps.children}
        </code>
      );
    }
    return (
      <code
        data-test-markdown-code-content=""
        class={cn(stylex.attrs(markdownStyles.codeContent).class, classNames)}
      >
        {codeProps.children}
      </code>
    );
  },
  span(spanProps) {
    const classNames = getElementClassNames(spanProps.node.properties);
    return (
      <span class={cn(classNames.join(" ") || undefined, syntaxTokenClass(classNames))}>
        {spanProps.children}
      </span>
    );
  },
};

export function MarkdownContent(props: MarkdownContentProps) {
  const readContent = () =>
    typeof props.content === "function" ? props.content() : props.content;
  const content = createCoalescedText(readContent, {
    enabled: () => Boolean(props.live),
    intervalMs: () => props.liveRenderIntervalMs
  });
  const [highlighter, setHighlighter] = createSignal<MarkdownHighlighter>();
  createEffect(() => {
    if (props.live || !/(?:^|\n) {0,3}(?:`{3,}|~{3,})\S/.test(content())) return;
    let disposed = false;
    onCleanup(() => { disposed = true; });
    void loadMarkdownHighlighter().then(plugin => {
      if (!disposed) setHighlighter(() => plugin);
    }).catch(() => {
      // Code and copy actions remain available when optional highlighting fails.
    });
  });

  const components: SolidMarkdownComponents = {
    ...staticMarkdownComponents,
    a(anchorProps: AnchorProps) {
      const fileTarget = resolveMarkdownFileTarget(
        anchorProps.node,
        anchorProps.href,
        props.fileLinks,
      );
      if (fileTarget) {
        return (
          <button
            type="button"
            data-test-chat-file-link=""
            class={
              stylex.attrs(markdownStyles.link, markdownStyles.fileLink).class
            }
            onClick={(event) =>
              handleFileLinkClick(event, fileTarget, props.fileLinks)
            }
          >
            {anchorProps.children}
          </button>
        );
      }

      const href = normalizeAllowedHref(anchorProps.href);
      const linkKind = classifyLinkHref(href);

      if (!href || linkKind === "invalid") {
        return (
          <span class={stylex.attrs(markdownStyles.invalidLink).class}>
            {anchorProps.children}
          </span>
        );
      }

      return (
        <a
          href={href}
          target={linkKind === "hash" ? undefined : "_blank"}
          rel={linkKind === "hash" ? undefined : "noopener noreferrer"}
          class={stylex.attrs(markdownStyles.link).class}
        >
          {anchorProps.children}
        </a>
      );
    },
  };

  const markdownProps = {
    get children() {
      return content();
    },
    get class() {
      return cn(
        stylex.attrs(
          markdownStyles.root,
          props.size === "compact"
            ? markdownStyles.compact
            : markdownStyles.body,
          props.tone === "muted"
            ? markdownStyles.toneMuted
            : props.tone === "danger"
              ? markdownStyles.toneDanger
              : props.tone === "warning"
                ? markdownStyles.toneWarning
                : markdownStyles.toneDefault,
        ).class,
        props.class,
      );
    },
    skipHtml: true,
    remarkPlugins: markdownRemarkPlugins,
    get rehypePlugins() {
      return createMarkdownRehypePlugins({
        live: props.live,
        fileLinks: props.fileLinks,
        highlighter: highlighter(),
      });
    },
    get renderingStrategy() {
      return props.live ? ("reconcile" as const) : ("memo" as const);
    },
    components,
  };

  return createComponent(SolidMarkdown, markdownProps);
}

function getClassAttr(properties: Properties | undefined) {
  const classNames = getElementClassNames(properties);
  return classNames.length > 0 ? classNames.join(" ") : undefined;
}

function syntaxTokenClass(classNames: string[]) {
  if (classNames.includes("hljs-meta")) {
    return stylex.attrs(markdownStyles.syntaxMeta).class;
  }
  if (
    classNames.includes("hljs-built_in") ||
    (classNames.includes("hljs-title") && classNames.includes("class_"))
  ) {
    return stylex.attrs(markdownStyles.syntaxTitle).class;
  }
  if (classNames.includes("hljs-class")) {
    return stylex.attrs(markdownStyles.syntaxClassScope).class;
  }
  if (
    classNames.includes("hljs-comment") ||
    classNames.includes("hljs-quote")
  ) {
    return stylex.attrs(markdownStyles.syntaxComment).class;
  }
  if (
    classNames.some((className) =>
      [
        "hljs-keyword",
        "hljs-selector-tag",
        "hljs-literal",
        "hljs-section",
        "hljs-doctag",
        "hljs-type",
      ].includes(className),
    )
  ) {
    return stylex.attrs(markdownStyles.syntaxKeyword).class;
  }
  if (classNames.includes("hljs-title")) {
    return stylex.attrs(markdownStyles.syntaxTitleCandidate).class;
  }
  if (
    classNames.some((className) =>
      [
        "hljs-string",
        "hljs-attr",
        "hljs-template-tag",
        "hljs-template-variable",
      ].includes(className),
    )
  ) {
    return stylex.attrs(markdownStyles.syntaxString).class;
  }
  if (
    classNames.some((className) =>
      [
        "hljs-number",
        "hljs-symbol",
        "hljs-bullet",
        "hljs-variable",
        "hljs-addition",
      ].includes(className),
    )
  ) {
    return stylex.attrs(markdownStyles.syntaxNumber).class;
  }
  return undefined;
}

function resolveMarkdownFileTarget(
  node: Element | undefined,
  href: string | null | undefined,
  fileLinks: MarkdownContentProps["fileLinks"],
) {
  if (!fileLinks) {
    return undefined;
  }

  const path = getStringProperty(node?.properties, "dataHarnessFilePath");
  if (path) {
    return {
      path,
      line: getNumberProperty(node?.properties, "dataHarnessFileLine"),
      column: getNumberProperty(node?.properties, "dataHarnessFileColumn"),
    };
  }

  return resolveChatFileTarget(href ?? undefined, fileLinks);
}

function handleFileLinkClick(
  event: MouseEvent,
  target: ChatFileTarget,
  fileLinks: MarkdownContentProps["fileLinks"],
) {
  event.preventDefault();
  event.stopPropagation();
  if (!fileLinks || (!event.ctrlKey && !event.metaKey)) {
    return;
  }
  fileLinks.onOpenFile(target);
}

function getStringProperty(properties: Properties | undefined, key: string) {
  const value = properties?.[key];
  return typeof value === "string" ? value : undefined;
}

function getNumberProperty(properties: Properties | undefined, key: string) {
  const value = getStringProperty(properties, key);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
