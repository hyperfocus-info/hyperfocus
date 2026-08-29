import { mock } from "bun:test";
import { SolidPlugin } from "bun-plugin-solid";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import h from "solid-js/h";
import { Fragment } from "solid-js/h/jsx-runtime";

mock.module("@stylexjs/stylex", () => {
  const classNames = (...styles: Array<{ __stylexTestClass?: string } | false | null | undefined>) =>
    styles.flatMap((style) => style && style.__stylexTestClass ? [style.__stylexTestClass] : []).join(" ");
  const create = (definitions: Record<string, unknown>) => Object.fromEntries(
    Object.keys(definitions).map((key) => [key, { __stylexTestClass: key }])
  );
  const attrs = (...styles: Array<{ __stylexTestClass?: string } | false | null | undefined>) => ({
    class: classNames(...styles)
  });
  const props = (...styles: Array<{ __stylexTestClass?: string } | false | null | undefined>) => ({
    className: classNames(...styles)
  });
  const defineVars = (variables: Record<string, unknown>) => Object.fromEntries(
    Object.keys(variables).map((key) => [key, `--pad-pilot-${key}`])
  );
  const keyframes = () => "stylex-test-keyframes";

  return {
    default: { create, attrs, props, defineVars, keyframes },
    create,
    attrs,
    props,
    defineVars,
    keyframes
  };
});

// Use the real Solid transform for Bun tests so context and fine-grained updates
// behave like the app, not the hyperscript compatibility runtime.
Bun.plugin(SolidPlugin());

const globalState = globalThis as typeof globalThis & { __padPilotHappyDomRegistered?: boolean };

if (!globalState.__padPilotHappyDomRegistered) {
  GlobalRegistrator.register();
  globalState.__padPilotHappyDomRegistered = true;
}

(globalThis as { React?: { createElement: typeof h; Fragment: typeof Fragment } }).React = {
  createElement: h,
  Fragment
};
