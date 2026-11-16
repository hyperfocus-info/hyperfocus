import * as stylex from "@stylexjs/stylex";
import type { SolidMarkdownComponents } from "solid-markdown";
import { tokens } from "../theme/tokens.stylex";
import { typography } from "../theme/typography";

const styles = stylex.create({
  block: { marginBottom: { default: tokens.space3, ":last-child": 0 }, marginTop: 0, minWidth: 0, },
  heading: { overflowWrap: "anywhere", marginBottom: tokens.space2, marginTop: tokens.space4, },
  list: { paddingInlineStart: tokens.space6 },
  unordered: { listStyleType: "disc" },
  ordered: { listStyleType: "decimal" },
  item: { marginBlock: tokens.space1 },
  quote: { marginInline: 0, borderInlineStartColor: tokens.borderStrong, borderInlineStartStyle: "solid", borderInlineStartWidth: tokens.borderWidth, color: tokens.muted, paddingInlineStart: tokens.space3, },
  scroll: { outline: { default: "none", ":focus-visible": `2px solid ${tokens.focus}` }, outlineOffset: "-2px", maxWidth: "100%", minWidth: 0, overflowX: "auto", },
  pre: { padding: tokens.space3, borderRadius: tokens.radiusSmall, backgroundColor: tokens.panelRaised, fontFamily: tokens.fontMono, overflowWrap: "normal", whiteSpace: "pre", },
  code: { fontFamily: tokens.fontMono, fontSize: "inherit" },
  inlineCode: { borderRadius: tokens.radiusSmall, paddingInline: tokens.space1, backgroundColor: tokens.panelRaised, overflowWrap: "anywhere", whiteSpace: "break-spaces", },
  table: { borderCollapse: "collapse", minWidth: "100%", width: "max-content" },
  cell: { padding: tokens.space2, overflowWrap: "anywhere", textAlign: "start", verticalAlign: "top", borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: tokens.borderWidth, maxWidth: "24rem", },
  tableHeader: { backgroundColor: tokens.panelRaised },
  link: { outline: { default: "none", ":focus-visible": `2px solid ${tokens.focus}` }, textDecoration: "underline", color: tokens.accent, textUnderlineOffset: "0.15em", },
  image: { height: "auto", maxWidth: "100%", },
  rule: { borderWidth: 0, marginBlock: tokens.space4, borderTopColor: tokens.border, borderTopStyle: "solid", borderTopWidth: tokens.borderWidth, },
});

/** Bounded rich text defaults for conversation messages, not a second Markdown engine. */
export const transcriptMarkdownComponents: SolidMarkdownComponents = {
  h1: props => <h1 {...stylex.attrs(typography.section, styles.heading)}>{props.children}</h1>,
  h2: props => <h2 {...stylex.attrs(typography.section, styles.heading)}>{props.children}</h2>,
  h3: props => <h3 {...stylex.attrs(typography.emphasis, styles.heading)}>{props.children}</h3>,
  h4: props => <h4 {...stylex.attrs(typography.emphasis, styles.heading)}>{props.children}</h4>,
  h5: props => <h5 {...stylex.attrs(typography.control, styles.heading)}>{props.children}</h5>,
  h6: props => <h6 {...stylex.attrs(typography.control, styles.heading)}>{props.children}</h6>,
  p: props => <p {...stylex.attrs(styles.block)}>{props.children}</p>,
  ul: props => <ul {...stylex.attrs(styles.block, styles.list, styles.unordered)}>{props.children}</ul>,
  ol: props => <ol start={props.start} {...stylex.attrs(styles.block, styles.list, styles.ordered)}>{props.children}</ol>,
  li: props => <li {...stylex.attrs(styles.item)}>{props.children}</li>,
  blockquote: props => <blockquote {...stylex.attrs(styles.block, styles.quote)}>{props.children}</blockquote>,
  pre: props => <pre tabindex="0" aria-label="Code block" {...stylex.attrs(typography.body, styles.block, styles.scroll, styles.pre)}>{props.children}</pre>,
  code: props => <code {...stylex.attrs(styles.code, props.inline && styles.inlineCode)}>{props.children}</code>,
  table: props => <div tabindex="0" role="region" aria-label="Message table" {...stylex.attrs(styles.block, styles.scroll)}><table {...stylex.attrs(styles.table)}>{props.children}</table></div>,
  th: props => <th {...stylex.attrs(typography.control, styles.cell, styles.tableHeader)}>{props.children}</th>,
  td: props => <td {...stylex.attrs(styles.cell)}>{props.children}</td>,
  a: props => <a href={props.href} title={props.title} target="_blank" rel="noopener noreferrer" {...stylex.attrs(styles.link)}>{props.children}</a>,
  img: props => <img src={props.src} alt={props.alt ?? ""} title={props.title} loading="lazy" {...stylex.attrs(styles.image)} />,
  hr: () => <hr {...stylex.attrs(styles.rule)} />,
};
