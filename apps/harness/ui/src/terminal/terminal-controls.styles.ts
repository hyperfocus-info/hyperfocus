import * as stylex from '@stylexjs/stylex';
import { tokens } from '@hyperfocus/ui/tokens.stylex';

/** Session lists and search retain names/input before secondary actions. */
export const terminalControlStyles = stylex.create({
  search: { padding: tokens.space2, gap: tokens.space2, alignItems: 'center', display: 'flex', flexWrap: 'wrap', maxWidth: '100%', minWidth: 0, },
  input: { flexBasis: '12rem',
 flexGrow: '1',
 flexShrink: '1',
 height: 'auto',
 minHeight: '44px',
 minWidth: 0,
 width: '100%', },
  actions: { gap: tokens.space1, display: 'flex', flexShrink: 0, },
  target: { height: 'auto', minHeight: '44px', minWidth: '44px', width: 'auto', },
  row: { flexWrap: 'wrap', minWidth: 0 },
  select: { outline: { default: null, ':focus-visible': '2px solid var(--ring)' },
 flexBasis: '12rem',
 flexGrow: '1',
 flexShrink: '1',
 outlineOffset: '-2px',
 minHeight: '44px', },
  name: { fontSize: tokens.fontControl, lineHeight: 1.5, overflowWrap: 'anywhere', whiteSpace: 'normal', },
  metadata: { fontSize: tokens.fontCaption, letterSpacing: 'normal', lineHeight: 1.5, textTransform: 'none', whiteSpace: 'normal', },
  controls: { gap: tokens.space1, display: 'flex', flexShrink: 0, marginInlineStart: 'auto', },
});
