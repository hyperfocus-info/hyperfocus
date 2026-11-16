import { render } from "solid-js/web";
import * as stylex from "@stylexjs/stylex";
import { App } from "./app";
import "./global-styles";
import { UiStateProviders } from "./store-providers";
import { lazySurface } from "./app/lazy-surface";

const SwarmPage = lazySurface("swarm workspace", async () => ({ default: (await import("./components/swarm/swarm-page")).SwarmPage }));

export function mountApp(root: HTMLElement) {
  return render(
    () => (
      <UiStateProviders>
        <div {...stylex.attrs(styles.scope)} data-test-harness-stylex-scope="">
          {location.pathname === "/swarm" ? <SwarmPage /> : <App />}
        </div>
      </UiStateProviders>
    ),
    root
  );
}

const styles = stylex.create({
  scope: {
    display: "contents"
  }
});
