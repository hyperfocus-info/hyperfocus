import * as stylex from '@stylexjs/stylex';
import type { JSX } from 'solid-js';
import { tokens } from '../theme/tokens.stylex';

const styles = stylex.create({
  root: { flex: '1', gap: tokens.space3, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, minWidth: 0, },
  compact: { gap: tokens.space2 },
  header: { flexShrink: 0, minWidth: 0 },
  transcript: { flex: '1', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, },
  composer: { flexShrink: 0, minWidth: 0 },
});

/** Shared project-chat geometry; hosts own conversation state and command controls. */
export function ProjectChatLayout(props: { header: JSX.Element; transcript: JSX.Element; composer: JSX.Element; status?: JSX.Element; compact?: boolean }) {
  return <div {...stylex.attrs(styles.root, props.compact && styles.compact)} data-project-chat-layout>
    <div {...stylex.attrs(styles.header)}>{props.header}</div>
    <div {...stylex.attrs(styles.transcript)}>{props.transcript}</div>
    {props.status}
    <div {...stylex.attrs(styles.composer)}>{props.composer}</div>
  </div>;
}
