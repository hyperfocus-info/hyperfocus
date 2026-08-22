import { render } from "solid-js/web";
import * as stylex from "@stylexjs/stylex";
import { App } from "./app";
import { UiStateProviders } from "./store-providers";
import "./legacy.css";
import "../../../../packages/ui/src/stylex-entry.css";

export function mountApp(root: HTMLElement) {
  return render(
    () => (
      <UiStateProviders>
        <div {...stylex.attrs(styles.scope)} data-test-harness-stylex-scope="">
          <App />
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
