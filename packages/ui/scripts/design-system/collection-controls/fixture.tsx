import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { TagPicker } from "../../../src/primitives/selection/tag-picker";
import { FavoriteSelectControl } from "../../../src/primitives/selection/favorite-select-control";
import "../../../src/stylex-entry.css";

function Fixture() {
  const options = Array.from({ length: 18 }, (_, index) => ({ value: `sound-${index}`, label: `Sound ${index} with a complete descriptive label` }));
  const [tags, setTags] = createSignal(["sound-0"]);
  const [value, setValue] = createSignal("sound-17");
  const [favorites, setFavorites] = createSignal<string[]>([]);
  return <main>
    <h1>Collection controls</h1>
    <TagPicker ariaLabel="Sound tags" value={tags()} options={options} onChange={setTags} />
    <p>Choose an audio clip</p>
    <FavoriteSelectControl ariaLabel="Audio clip" value={value()} options={options} onChange={setValue} favoriteValues={favorites()} onToggleFavorite={id => setFavorites(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])} />
  </main>;
}
const root = document.getElementById("root");
if (root) render(() => <Fixture />, root);
