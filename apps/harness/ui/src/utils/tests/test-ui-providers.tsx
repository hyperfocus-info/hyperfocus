/** @jsxImportSource solid-js */
import { render } from "solid-js/web";
import { UiStateProviders } from "../../store-providers";
import { getActiveHarnessStore } from "../../harness-store";
import { getActiveToastStore } from "../../toast-store";

declare global {
  var __padPilotUiProvidersMounted: boolean | undefined;
}

export function mountTestUiProviders() {
  if (globalThis.__padPilotUiProvidersMounted && getActiveHarnessStore() && getActiveToastStore()) {
    return;
  }

  const root = document.createElement("div");
  render(
    () => (
      <UiStateProviders>
        <div />
      </UiStateProviders>
    ),
    root
  );
  globalThis.__padPilotUiProvidersMounted = true;
}
