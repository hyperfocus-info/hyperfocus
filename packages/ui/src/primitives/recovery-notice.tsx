import * as stylex from '@stylexjs/stylex';
import type { JSX } from 'solid-js';
import { Button } from './button';
import { tokens } from '../theme/tokens.stylex';

const styles = stylex.create({
  root: { padding: tokens.space3, borderColor: tokens.danger, borderRadius: tokens.radius, borderStyle: 'solid', borderWidth: tokens.borderWidth, gap: tokens.space3, alignItems: 'center', backgroundColor: tokens.panel, color: tokens.foreground, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', minWidth: 0, },
  message: { flexBasis: '20rem', flexGrow: 1, flexShrink: 1, overflowWrap: 'anywhere', minWidth: 0, },
  actions: { gap: tokens.space2, alignItems: 'center', display: 'flex', flexWrap: 'wrap', },
});

/** Hosts retain unsaved data separately from visibility. Dismiss must only close
 * presentation: it must not flush storage, retry the failed action, or discard data. */
export function RecoveryNotice(props: { message: JSX.Element; onDismiss: () => void; children?: JSX.Element }) {
  return <div role="alert" {...stylex.attrs(styles.root)}>
    <span {...stylex.attrs(styles.message)}>{props.message}</span>
    <div {...stylex.attrs(styles.actions)}>{props.children}<Button variant="ghost" justificationForNoTooltip="Dismiss this message without changing your data." onClick={() => props.onDismiss()}>Dismiss</Button></div>
  </div>;
}
