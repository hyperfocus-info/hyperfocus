import { FavoriteSelectControl, type SelectControlProps } from "@hyperfocus/ui";
import { Show, createMemo, createSignal, onCleanup } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { getModelCapability, harnessStore } from "../../harness-store";
import { pushToast } from "../../toast-store";

const STORAGE_KEY = "harness.favorite-models";
const CHANGE_EVENT = "harness-favorite-models-changed";
const styles = stylex.create({ root: { display: "inline-flex", flexShrink: 0, maxWidth: "100%", minWidth: 0, width: "min(14rem, 100%)", } });

function readFavorites(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  } catch { return []; }
}

/** Model choices share browser-local favorites; runtime availability still owns the catalog. */
export function ModelSelect(props: SelectControlProps<string>) {
  const [favorites, setFavorites] = createSignal(readFavorites());
  const refresh = () => setFavorites(readFavorites());
  const onStorage = (event: StorageEvent) => { if (!event.key || event.key === STORAGE_KEY) refresh(); };
  window.addEventListener(CHANGE_EVENT, refresh);
  window.addEventListener("storage", onStorage);
  onCleanup(() => { window.removeEventListener(CHANGE_EVENT, refresh); window.removeEventListener("storage", onStorage); });
  const options = createMemo(() => props.options.map(option => ({
    ...option,
    tags: getModelCapability(harnessStore.state, option.value)?.tags ?? [],
  })));
  const tags = createMemo(() => [...new Set(options().flatMap(option => option.tags))].sort().map(id => ({ id, label: id })));
  const toggle = (value: string) => {
    if (!value) return;
    const current = readFavorites();
    const next = current.includes(value) ? current.filter(entry => entry !== value) : [...current, value];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      pushToast("Could not save favorite model", "Browser storage is unavailable. Try again after enabling storage.", "error");
    }
  };
  return <Show when={!props.hideWhenSingleOption || props.options.length > 1}><span {...stylex.attrs(styles.root)}><FavoriteSelectControl {...props} options={options()} tags={tags()} favoriteValues={favorites()} onToggleFavorite={toggle} /></span></Show>;
}
