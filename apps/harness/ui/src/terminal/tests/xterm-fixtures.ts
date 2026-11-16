// Constructible foreign-API adapters return ordinary factory-owned objects.
type LinkProvider = {
  provideLinks: (line: number, callback: (links: { activate: (event: MouseEvent) => void }[] | undefined) => void) => void;
};

function createTerminalDouble() {
  const writes: string[] = [];
  const addons: unknown[] = [];
  let data = (_input: string) => {};
  let key = (_event: KeyboardEvent) => true;
  let selection = () => {};
  let links: LinkProvider | undefined;
  const terminal = {
    cols: 80, rows: 24, options: {}, writes, resets: 0, disposed: false, addons,
    get data() { return data; },
    get key() { return key; },
    get selection() { return selection; },
    get links() { return links; },
    buffer: { active: { getLine: () => ({ translateToString: () => "src/file.ts:2" }) } },
    open() {},
    loadAddon(addon: unknown) { addons.push(addon); },
    registerLinkProvider(provider: LinkProvider) { links = provider; },
    attachCustomKeyEventHandler(callback: typeof key) { key = callback; },
    onData(callback: typeof data) { data = callback; },
    onSelectionChange(callback: typeof selection) { selection = callback; },
    getSelection() { return "selected"; },
    selectAll() {},
    reset() { terminal.resets++; },
    write(text: string) { writes.push(text); },
    dispose() { terminal.disposed = true; },
  };
  return terminal;
}

export const terminals: ReturnType<typeof createTerminalDouble>[] = [];
export function FakeTerminal() {
  const terminal = createTerminalDouble();
  terminals.push(terminal);
  return terminal;
}

export function FakeFit() { return { fit() {} }; }
export function FakeSearch() { return { findNext() { return true; }, findPrevious() { return true; } }; }
export function FakeSerialize() { return { serialize() { return "buffer"; } }; }
export function FakeLinks() { return {}; }
export const webglAddons = new Set<unknown>();
export function FakeWebgl() {
  const addon = {};
  webglAddons.add(addon);
  return addon;
}

function createResizeObserverDouble(callback: () => void) {
  const observer = {
    disconnected: false, callback,
    observe() {},
    disconnect() { observer.disconnected = true; },
  };
  return observer;
}

export const resizeObservers: ReturnType<typeof createResizeObserverDouble>[] = [];
export function FakeResizeObserver(callback: () => void) {
  const observer = createResizeObserverDouble(callback);
  resizeObservers.push(observer);
  return observer;
}
