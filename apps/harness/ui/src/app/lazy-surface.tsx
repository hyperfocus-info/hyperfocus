import { ErrorBoundary, Suspense, lazy, type Component } from "solid-js";
import { Button } from "../components/primitives/button";

/** Keep optional workspaces out of the shell, with an owned failure boundary. */
export function lazySurface<Props extends object>(label: string, load: () => Promise<{ default: Component<Props> }>): Component<Props> {
  const Surface = lazy(load);
  return (props) => (
    <ErrorBoundary fallback={
      <div role="alert">
        <p>{label} could not load. Your project state is still available.</p>
        <Button tooltip={`Reload to retry ${label}`} onClick={() => window.location.reload()}>Reload to retry</Button>
      </div>
    }>
      <Suspense fallback={<p role="status">Loading {label}…</p>}>
        <Surface {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}
