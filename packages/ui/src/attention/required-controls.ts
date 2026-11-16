/** Self-contained browser evaluator. Host supplies required controls for the active task. */
export function inspectRequiredControls(selectors: string[]) {
  const violations: { ruleId: string; detail: string }[] = [];
  const boxes: { selector: string; left: number; right: number; top: number; bottom: number }[] = [];
  for (const selector of selectors) {
    const elements = [...document.querySelectorAll<HTMLElement>(selector)].filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
    if (!elements.length) { violations.push({ ruleId: "ui.responsive.no-unintended-overflow", detail: `Required action missing: ${selector}` }); continue; }
    for (const element of elements) {
      const box = element.getBoundingClientRect(), style = getComputedStyle(element);
      let clipped = box.width < 24 || box.height < 24 || box.left < -1 || box.right > innerWidth + 1 || box.top < -1 || box.bottom > innerHeight + 1;
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const bounds = ancestor.getBoundingClientRect(), overflow = getComputedStyle(ancestor);
        if (/hidden|clip/.test(overflow.overflowX) && (box.left < bounds.left - 1 || box.right > bounds.right + 1)) clipped = true;
        if (/hidden|clip/.test(overflow.overflowY) && (box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1)) clipped = true;
      }
      const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      if (clipped || !top || !element.contains(top) || style.pointerEvents === "none" || !element.textContent?.trim() && !element.getAttribute("aria-label")) violations.push({ ruleId: "ui.responsive.no-unintended-overflow", detail: `Required action clipped, covered or unnamed: ${selector}` });
      boxes.push({ selector, left: box.left, right: box.right, top: box.top, bottom: box.bottom });
    }
  }
  for (let index = 0; index < boxes.length; index++) for (const other of boxes.slice(index + 1)) {
    const box = boxes[index]!;
    if (Math.min(box.right, other.right) - Math.max(box.left, other.left) > 2 && Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) > 2) violations.push({ ruleId: "ui.responsive.no-unintended-overflow", detail: `Required actions overlap: ${box.selector}, ${other.selector}` });
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) violations.push({ ruleId: "ui.responsive.no-unintended-overflow", detail: "Page has unintended horizontal overflow." });
  return { passed: violations.length === 0, violations, viewport: { width: innerWidth, height: innerHeight }, boxes };
}
