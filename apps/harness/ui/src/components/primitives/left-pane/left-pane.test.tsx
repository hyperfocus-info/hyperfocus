/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from 'bun:test';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import { createUiTest } from '../../../utils/tests/test-harness';
import { clearOverlayStackForTests } from '../overlay-stack';
import { LeftPaneSearchMenu } from '../left-pane';

createUiTest('LeftPaneSearchMenu', () => {
  beforeEach(clearOverlayStackForTests);
  it('opens filter groups by keyboard, exposes selection and returns focus after choosing', async () => {
    let selected = '';
    render(() => <LeftPaneSearchMenu ariaLabel="Filter jobs" tooltip="Filter jobs" items={[
      { kind: 'submenu', label: 'Status', icon: null, items: [
        { kind: 'option', label: 'All jobs', icon: null, selected: true, onSelect: () => { selected = 'all'; } },
        { kind: 'option', label: 'Unavailable', icon: null, disabled: true, onSelect: () => { selected = 'disabled'; } },
        { kind: 'option', label: 'Failed jobs', icon: null, onSelect: () => { selected = 'failed'; } },
      ] },
    ]} />);
    const trigger = screen.getByRole('button', { name: 'Filter jobs' });
    fireEvent.click(trigger);
    await Promise.resolve();
    const group = screen.getByRole('button', { name: 'Status' });
    expect(document.activeElement).toBe(group);
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(group.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'All jobs' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Unavailable' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Failed jobs' }));
    expect(selected).toBe('failed');
    expect(screen.queryByRole('button', { name: 'Status' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    await Promise.resolve();
    expect(screen.getByRole('button', { name: 'Status' }).getAttribute('aria-expanded')).toBe('false');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    await Promise.resolve();
    const outside = document.createElement('button');
    document.body.append(outside);
    trigger.focus();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    outside.focus();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
