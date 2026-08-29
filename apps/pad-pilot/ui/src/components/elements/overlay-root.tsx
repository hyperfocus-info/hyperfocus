import { onMount } from "solid-js";

export const PAD_PILOT_OVERLAY_ROOT_ID = "padpilot-overlay-root";

export function ensureOverlayRoot() {
  let root = document.getElementById(PAD_PILOT_OVERLAY_ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = PAD_PILOT_OVERLAY_ROOT_ID;
    document.body.append(root);
  }

  return root;
}

export function OverlayRoot() {
  onMount(() => {
    ensureOverlayRoot();
  });

  return <div id={PAD_PILOT_OVERLAY_ROOT_ID} />;
}
