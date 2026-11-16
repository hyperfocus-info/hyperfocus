import type { Locator, Page } from 'playwright';
export function rosterRecordButton(pane: Locator, surface: string, index: number) {
    const list = pane.locator('[data-test-left-pane-body] [data-test-virtual-list]').first();
    const ordinal = String(index + 1).padStart(3, '0');
    return surface === 'Projects'
        ? list.locator(`[data-project-id="roster-project-${index}"]`).getByRole('button', { name: new RegExp(`^(Switch to Workspace ${ordinal} customer release|Workspace ${ordinal} customer release is active)$`) })
        : list.getByRole('button', { name: new RegExp(surface === 'Jobs' ? `^Select Review ${ordinal}` : surface === 'Runs' ? `^Open run details for Review ${ordinal}` : `^Reviewer ${ordinal}`) });
}
/** Scroll the actual virtual viewport; selection must still pass pointer hit-testing. */
export async function selectRosterRecord(options: {
    page: Page;
    pane: Locator;
    surface: string;
    index: number;
}) {
    const { page, pane, surface, index } = options;
    const list = pane.locator('[data-test-left-pane-body] [data-test-virtual-list]').first();
    const row = rosterRecordButton(pane, surface, index);
    await list.evaluate(element => { element.scrollTop = 0; });
    for (let attempt = 0; attempt < 320; attempt += 1) {
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        if (await row.count()) {
            await row.click();
            return;
        }
        await list.evaluate(element => { element.scrollTop += Math.max(100, element.clientHeight * 0.8); });
    }
    throw new Error(`${surface}: record ${index + 1} was unreachable by scrolling`);
}
export async function visibleRecordHeight(row: Locator) {
    return row.evaluate(element => {
        const rect = element.getBoundingClientRect();
        let top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            if (/auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowY)) {
                const bounds = parent.getBoundingClientRect();
                top = Math.max(top, bounds.top);
                bottom = Math.min(bottom, bounds.bottom);
            }
        }
        return { height: rect.height, visible: Math.max(0, bottom - top) };
    });
}
