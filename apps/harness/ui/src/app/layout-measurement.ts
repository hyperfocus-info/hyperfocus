export function shouldCollapseTabStrip(navElement: HTMLElement) {
  const tabItems = Array.from(navElement.children);
  const firstTabTop = tabItems[0]?.getBoundingClientRect().top ?? 0;
  const hasWrappedTabs = tabItems.some((tabItem) => tabItem.getBoundingClientRect().top > firstTabTop + 1);
  return hasWrappedTabs || navElement.scrollWidth > navElement.clientWidth + 1;
}

export function measureTabStripMinimumWidth(navElement: HTMLElement) {
  const tabWidths = Array.from(navElement.children).reduce((total, tabItem) => total + Math.max(tabItem.getBoundingClientRect().width, tabItem.scrollWidth), 0);
  const computedStyle = window.getComputedStyle(navElement);
  const gap = Number.parseFloat(computedStyle.columnGap || computedStyle.gap) || 0;
  const padding = (Number.parseFloat(computedStyle.paddingLeft) || 0) + (Number.parseFloat(computedStyle.paddingRight) || 0);
  return tabWidths + Math.max(0, navElement.children.length - 1) * gap + padding;
}

export function isProjectSwitcherInputFocused() {
  const activeElement = document.activeElement;
  return activeElement instanceof HTMLElement && activeElement.dataset.projectSwitcherInput === "true";
}

export function isResizeObserverLoopError(message: string) {
  return message === "ResizeObserver loop completed with undelivered notifications." || message === "ResizeObserver loop limit exceeded";
}
