import { createMemo, splitProps } from "solid-js";
import * as stylex from '@stylexjs/stylex';
import { Button } from "../button";
import { SelectControl, type SelectControlProps } from "./select-control";

export type FavoriteSelectControlProps<Value extends string = string> = Omit<SelectControlProps<Value>, "optionAction"> & {
  favoriteValues: readonly string[];
  onToggleFavorite: (value: Value) => void;
};
const favoriteTag = "__hf_favorite";
const styles = stylex.create({ favorite: { color: 'var(--hf-color-favorite, #b78300)' } });

/** Each favorite is a sibling action in an accessible option grid; it never selects or closes. */
export function FavoriteSelectControl<Value extends string>(props: FavoriteSelectControlProps<Value>) {
  const [local, select] = splitProps(props, ["favoriteValues", "onToggleFavorite", "options", "tags"]);
  const favorites = createMemo(() => new Set(local.favoriteValues));
  const options = createMemo(() => local.options.map(option => ({ ...option, tags: [...(option.tags ?? []), ...(favorites().has(option.value) ? [favoriteTag] : [])] })));
  const tags = createMemo(() => [
    { id: favoriteTag, label: "Favorites" },
    ...(local.tags ?? [...new Set(local.options.flatMap(option => option.tags ?? []))].map(id => ({ id, label: id }))),
  ]);
  return <SelectControl {...select} options={options()} tags={tags()} optionAction={option => {
    const favorite = () => favorites().has(option().value);
    const label = () => `${favorite() ? "Unfavorite" : "Favorite"} ${option().label}`;
    return <Button data-hf-contextual-action class={favorite() ? stylex.attrs(styles.favorite).class : undefined} size="icon" variant="ghost" disabled={props.disabled || option().disabled || !option().value} aria-label={label()} aria-pressed={favorite()} tooltip={label()} onClick={() => local.onToggleFavorite(option().value)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill={favorite() ? "currentColor" : "none"} stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/></svg>
    </Button>;
  }}/>;
}
