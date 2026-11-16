const paths = {
  close: 'M5 5l14 14 M19 5L5 19',
  left: 'M3 4h18v16H3Z M11 4v16 M6 12h2',
  right: 'M3 4h18v16H3Z M13 4v16 M16 12h2',
  top: 'M3 4h18v16H3Z M3 12h18 M11 8h2',
  bottom: 'M3 4h18v16H3Z M3 12h18 M11 16h2',
};

export function DockMenuIcon(props: { kind: keyof typeof paths }) {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-dock-menu-icon={props.kind}><path d={paths[props.kind]}/></svg>;
}
