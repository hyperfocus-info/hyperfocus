import { type SetStoreFunction, produce } from "solid-js/store";

/**
 * Applies an imperative `produce()` recipe to a Solid store setter.
 *
 * Use this for nested store updates instead of repeating object spreads.
 * This helper is only for `createStore()` setters.
 */
export function updateStore<T extends object>(setStore: SetStoreFunction<T>, recipe: (draft: T) => void) {
  setStore(produce(recipe));
}
