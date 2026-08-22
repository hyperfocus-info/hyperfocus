import * as stylex from "@stylexjs/stylex";
import { cn } from "../../lib/utils";

export function Separator(props: { class?: string }) {
  return <div data-test-separator="" class={cn(stylex.attrs(styles.root).class, props.class)} />;
}

const styles = stylex.create({
  root: { backgroundColor: "var(--border)", height: "1px", width: "100%" }
});
