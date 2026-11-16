import { expect, test } from 'bun:test';
import { dockDropPosition } from './dock-drop';
import { createDockLayout, moveDockPanel } from './dock-layout';
test('drop intent has one closest edge or a central group destination at every scale', () => {
  for (const size of [320, 800, 1600]) {
    expect(dockDropPosition(size / 2, size / 2, size, size)).toBe('center');
    expect(dockDropPosition(2, size / 2, size, size)).toBe('left');
    expect(dockDropPosition(size - 2, size / 2, size, size)).toBe('right');
    expect(dockDropPosition(size / 2, 2, size, size)).toBe('top');
    expect(dockDropPosition(size / 2, size - 2, size, size)).toBe('bottom');
  }
});
test('moving a sole tab to its own edge leaves the layout intact', () => {
  const layout = createDockLayout(['only']);
  expect(moveDockPanel(layout, 'only', layout.root.id, 'right')).toBe(layout);
});
