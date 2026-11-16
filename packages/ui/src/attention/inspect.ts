/** Self-contained so hosts can serialize this function into their browser runner. */
export function inspectAttention({ requireBranding = true, maxModalScreens = 1.5 }: { requireBranding?: boolean; maxModalScreens?: number } = {}) {
  const visible = (element: Element) => {
    // ARIA affects assistive exposure, not whether pixels (for example file labels) render.
    if (element.closest('[hidden]')) return false;
    for (let details = element.parentElement?.closest('details:not([open])'); details; details = details.parentElement?.closest('details:not([open])')) {
      if (![...details.children].find(child => child.tagName === 'SUMMARY')?.contains(element)) return false;
    }
    const style = getComputedStyle(element);
    // Clipping is not inherited; accessible-only wrappers hide their descendants too.
    for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
      const clipping = ancestor === element ? style : getComputedStyle(ancestor);
      if (clipping.clip.replace(/\s/g, '') === 'rect(0px,0px,0px,0px)' || clipping.clipPath === 'inset(50%)') return false;
    }
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  };
  const name = (element: Element) => element.getAttribute('aria-label') || (element.getAttribute('aria-labelledby') ?? '').split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ').trim() || element.textContent?.trim() || element.getAttribute('title') || '';
  const overlays = [...document.querySelectorAll('dialog[open],[role="dialog"][aria-modal="true"]')].filter(visible);
  const root = overlays.at(-1) ?? document;
  const primary = [...root.querySelectorAll('[data-ui-primary]')].filter(visible);
  const buttons = [...root.querySelectorAll('button,[role="button"]')].filter(visible);
  const homes = [...document.querySelectorAll('[data-ui-home]')].filter(visible);
  const violations: { rule: string; detail: string }[] = [];
  if (primary.length > 1) violations.push({ rule: 'primary', detail: primary.map(name).join(', ') });
  for (const button of buttons) {
    if (getComputedStyle(button).cursor !== 'pointer') violations.push({ rule: 'cursor', detail: name(button) || button.tagName });
    if (!name(button)) violations.push({ rule: 'accessible-name', detail: button.outerHTML.slice(0, 180) });
    const box=button.getBoundingClientRect(), walker=document.createTreeWalker(button,NodeFilter.SHOW_TEXT);
    for(let text=walker.nextNode();text;text=walker.nextNode()) {
      const parent=text.parentElement;
      if(!text.textContent?.trim()||!parent||!visible(parent)||parent.closest('svg,[role="tooltip"],[aria-hidden="true"]')||getComputedStyle(parent).position==='absolute')continue;
      const range=document.createRange();range.selectNodeContents(text);const bounds=range.getBoundingClientRect();
      if(bounds.height>0&&(bounds.top<box.top-3||bounds.bottom>box.bottom+3)) {violations.push({rule:'control-text-bounds',detail:name(button)});break;}
    }
  }
  for (const home of homes) if (!home.matches('a[href],button,[role="button"][tabindex="0"]')) violations.push({ rule: 'home', detail: name(home) });
  const controls = [...root.querySelectorAll('input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),textarea,select,[role="combobox"],[data-select-value]')].filter(visible);
  for (const control of controls) {
    const weight = getComputedStyle(control.querySelector('[data-ui-select-value]') ?? control).fontWeight;
    if (weight === 'bold' || Number(weight) > 500) violations.push({ rule: 'input-weight', detail: `${name(control) || control.getAttribute('placeholder') || control.tagName}: ${weight}` });
  }
  const navbars = [...document.querySelectorAll('[data-ui-navbar],header')].filter(element => visible(element) && (element.hasAttribute('data-ui-navbar') || element.querySelector('[data-ui-home]')));
  for (const navbar of navbars) {
    const actions = [...navbar.querySelectorAll('button,a[href],[role="menuitem"]')].filter(visible);
    for(const trigger of [...actions]) {
      const id=trigger.getAttribute('aria-controls');
      const menu=id?document.getElementById(id):null;
      if(menu?.getAttribute('role')==='menu'&&visible(menu))actions.push(...[...menu.querySelectorAll('[role="menuitem"]')].filter(visible));
    }
    const seen = new Set<string>();
    for (const action of new Set(actions)) {
      const label = (action.getAttribute('data-ui-action') || name(action)).toLowerCase().replace(/[⌘⌃▾▼…]/g, '').trim();
      const id = /^(?:app )?(?:settings|preferences)$/.test(label) ? 'settings' : label;
      if (id && seen.has(id)) violations.push({ rule: 'navigation-duplicate', detail: id });
      seen.add(id);
    }
    for (const copy of [...navbar.querySelectorAll('small,p,[data-ui-nav-subtext],[role="status"]')].filter(visible)) {
      if (copy.textContent?.trim()) violations.push({ rule: 'navigation-copy', detail: copy.textContent.trim().slice(0, 120) });
    }
    for (const home of homes.filter(home => navbar.contains(home))) {
      const lines = [...home.querySelectorAll('*')].filter(element => visible(element) && !element.children.length && element.textContent?.trim() && !element.closest('svg')).map(element => element.getBoundingClientRect());
      if (lines.some((line, index) => lines.slice(index + 1).some(other => Math.abs(line.top - other.top) >= Math.min(line.height, other.height)))) violations.push({ rule: 'navigation-copy', detail: 'Home control contains a second line of copy' });
    }
  }
  const modalMeasurements = overlays.map(dialog => {
    const box = dialog.getBoundingClientRect();
    const scrollers = [...dialog.querySelectorAll('*')].filter(element => visible(element) && /auto|scroll/.test(getComputedStyle(element).overflowY));
    // Each scroll owner contributes only its own hidden extent. Stack vertical
    // siblings; parallel columns contribute the tallest reading path, not their sum.
    const excess = (parent: Element): number => {
      const children = scrollers.filter(element => parent.contains(element) && element !== parent && !scrollers.some(other => other !== parent && other !== element && parent.contains(other) && other.contains(element)));
      const rows = children.map(element => ({box: element.getBoundingClientRect(), extra: excess(element)})).sort((a,b) => a.box.bottom-b.box.bottom);
      // Longest non-overlapping reading path. A spanning parallel column must not
      // merge two stacked siblings into one group and discard their combined extent.
      const totals = [0];
      for (let index=0; index<rows.length; index++) {
        const row=rows[index]!;
        let previous=index-1;
        while(previous>=0 && rows[previous]!.box.bottom>row.box.top+1)previous--;
        totals.push(Math.max(totals[index]!,totals[previous+1]!+row.extra));
      }
      return Math.max(0,/auto|scroll/.test(getComputedStyle(parent).overflowY) ? parent.scrollHeight-parent.clientHeight : 0)+totals.at(-1)!;
    };
    const scrollExcess = excess(dialog);
    const contentHeight = box.height + scrollExcess;
    const title = name(dialog);
    for (const boundary of [dialog,...dialog.querySelectorAll('*')].filter(visible)) {
      if (boundary.matches('input,textarea,select,svg,svg *')) continue;
      const style=getComputedStyle(boundary);
      // Ellipsis is intentional only on a text leaf, never on a wrapper hiding controls.
      const textEllipsis=style.textOverflow==='ellipsis' && boundary.childElementCount===0;
      const horizontal=/hidden|clip/.test(style.overflowX) && !textEllipsis && boundary.scrollWidth>boundary.clientWidth+2;
      const vertical=/hidden|clip/.test(style.overflowY) && boundary.scrollHeight>boundary.clientHeight+2;
      if (horizontal || vertical) {
        violations.push({rule:'modal-clipping',detail:`${title}: content extends beyond a non-scrolling ${boundary===dialog?'shell':'wrapper'}`});
        break;
      }
    }
    if (box.top < -1 || box.bottom > innerHeight + 1 || box.left < -1 || box.right > innerWidth + 1) violations.push({ rule: 'modal-bounds', detail: title });
    if (box.height > innerHeight * .9 + 2) violations.push({ rule: 'modal-height', detail: `${title}: ${Math.round(box.height)}px exceeds 90% of viewport` });
    if (contentHeight > innerHeight * maxModalScreens + 2) violations.push({ rule: 'modal-content', detail: `${title}: ${Math.round(contentHeight)}px; use a view or split the task` });
    if (/^(?:(?:app|application|user) )?(settings|preferences)$/i.test(title)) violations.push({ rule: 'settings-view', detail: 'App settings belong in a workspace view' });
    return { title, height: box.height, contentHeight };
  });
  const fieldSelector = '[data-ui-field],[data-test-form-field]';
  const rows = new Set([...document.querySelectorAll('[data-ui-form-actions]')].filter(visible));
  for (const field of [...root.querySelectorAll(fieldSelector)].filter(visible)) {
    const parent = field.parentElement;
    if (parent && getComputedStyle(parent).display === 'flex' && getComputedStyle(parent).flexDirection === 'row' && parent.querySelector('button')) rows.add(parent);
  }
  for (const row of rows) {
    const items = [...row.children].filter(visible).flatMap(child => {
      const control = child.matches('button,input,select,[role="combobox"]') ? child : child.querySelector('input:not([type="hidden"]),select,[role="combobox"],button');
      return control && visible(control) ? [{label:name(control),box:control.getBoundingClientRect()}] : [];
    });
    for (let index=0;index<items.length;index++) for (const other of items.slice(index+1)) {
      const item=items[index]!;
      const overlap=Math.min(item.box.bottom,other.box.bottom)-Math.max(item.box.top,other.box.top);
      if(overlap>Math.min(item.box.height,other.box.height)*.25 && Math.abs(item.box.top+item.box.height/2-other.box.top-other.box.height/2)>3) violations.push({rule:'form-alignment',detail:`${item.label || 'Field'} / ${other.label || 'Action'}`});
    }
  }
  for (const file of [...root.querySelectorAll('[data-ui-file-input]')].filter(visible)) {
    const button=file.querySelector('[data-ui-file-button]'), label=file.querySelector('[data-ui-file-name]');
    if(!button||!label||!visible(label))continue;
    const a=button.getBoundingClientRect(),b=label.getBoundingClientRect();
    if(Math.abs(a.top+a.height/2-b.top-b.height/2)>3)violations.push({rule:'file-alignment',detail:name(file)||'File chooser'});
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) violations.push({ rule: 'overflow', detail: `${document.documentElement.scrollWidth} > ${innerWidth}` });
  if (requireBranding) {
    for (const [rule, selector] of [['favicon', 'link[rel~="icon"][href]'], ['manifest', 'link[rel="manifest"][href]'], ['og-title', 'meta[property="og:title"][content]'], ['og-description', 'meta[property="og:description"][content]']] as const) if (!document.querySelector(selector)) violations.push({ rule, detail: 'Missing document metadata' });
  }
  return { passed: violations.length === 0, primaryCount: primary.length, buttonCount: buttons.length, homeCount: homes.length, activeView: overlays.length ? 'dialog' : 'document', viewport: { width: innerWidth, height: innerHeight }, modalMeasurements, violations };
}
