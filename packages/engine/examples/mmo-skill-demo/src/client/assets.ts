import { loadImageAssets, type AssetLoadSnapshot } from "@hyperfocus/engine/assets/loader";

export type ClientImages = Record<string, HTMLImageElement | null>;

export type LoadImagesOptions = {
  onSnapshot?: (snapshot: AssetLoadSnapshot) => void;
};

export function loadImages(entries: Record<string, string>, options: LoadImagesOptions = {}): Promise<ClientImages> {
  return loadImageAssets(entries, {
    label: "Loading world art",
    concurrency: 8,
    decoding: "async",
    loading: "eager",
    allowFailure: true,
    labelFor: (id) => id.replace(/[-_]/g, " "),
    onSnapshot: options.onSnapshot
  });
}

export function hash(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = Math.imul(31, h) + value.charCodeAt(i);
  return h;
}
