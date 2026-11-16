import * as stylex from '@stylexjs/stylex';
import type { JSX } from 'solid-js';
import { tokens } from '../../theme/tokens.stylex';

export interface DisclosureProps {
  title: string;
  children: JSX.Element;
  defaultOpen?: boolean;
}

export const disclosureStyles = stylex.create({
  root: { fontSize: tokens.fontControl, overflowWrap: 'anywhere', borderTopColor: tokens.border, borderTopStyle: 'solid', borderTopWidth: tokens.borderWidth, minWidth: 0, },
  summary: { borderRadius: tokens.radiusSmall, outline: { default: 'none', ':focus-visible': `2px solid ${tokens.focus}` }, paddingBlock: tokens.space2, paddingInline: tokens.space2, alignContent: 'center', backgroundColor: { default: 'transparent', ':hover': tokens.selection }, boxSizing: 'border-box', cursor: 'pointer', fontWeight: 600, outlineOffset: 2, minHeight: 44, },
  content: { paddingBlock: tokens.space3, minWidth: 0 },
});

/** Native disclosure retains browser keyboard behavior and hides closed descendants. */
export function Disclosure(props: DisclosureProps) {
  const initiallyOpen = props.defaultOpen;
  return <details open={initiallyOpen} {...stylex.attrs(disclosureStyles.root)}>
    <summary {...stylex.attrs(disclosureStyles.summary)}>{props.title}</summary>
    <div {...stylex.attrs(disclosureStyles.content)}>{props.children}</div>
  </details>;
}
