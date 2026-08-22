import { mock } from "bun:test";
import { fileURLToPath } from "node:url";

if (process.env.HARNESS_TEST_SKIP_UI_PRELOAD !== "1") {
  const [{ GlobalRegistrator }, { SolidPlugin }, solidWeb] = await Promise.all([
    import("@happy-dom/global-registrator"),
    import("@dschz/bun-plugin-solid"),
    import("solid-js/web/dist/web.js")
  ]);
  const globalState = globalThis as typeof globalThis & { __padPilotHappyDomRegistered?: boolean };

  if (!globalState.__padPilotHappyDomRegistered) {
    GlobalRegistrator.register();
    globalState.__padPilotHappyDomRegistered = true;
  }

  const solidWebPath = fileURLToPath(import.meta.resolve("solid-js/web/dist/web.js"));
  await Bun.plugin({
    name: "solid-js-web-dom-alias",
    setup(build) {
      build.onResolve({ filter: /^solid-js\/web$/ }, () => ({ path: solidWebPath }));
    }
  });

  await Bun.plugin(
    SolidPlugin({
      generate: "dom",
      hydratable: false,
      sourceMaps: "inline",
      debug: false
    })
  );

  mock.module("solid-js/web", () => solidWeb);
  mock.module("solid-js/web/dist/server.js", () => solidWeb);
  mock.module("@stylexjs/stylex", () => {
    const create = (definitions: Record<string, unknown>) => Object.fromEntries(
      Object.keys(definitions).map((key) => [key, { __stylexTestClass: key }])
    );
    const attrs = (...styles: Array<{ __stylexTestClass?: string } | false | null | undefined>) => ({
      class: styles.flatMap((style) => style && style.__stylexTestClass ? [style.__stylexTestClass] : []).join(" ")
    });
    const defineVars = (variables: Record<string, unknown>) => Object.fromEntries(
      Object.keys(variables).map((key) => [key, `--hyperfocus-${key}`])
    );
    return { default: { create, attrs, defineVars }, create, attrs, defineVars };
  });

  (globalThis as typeof globalThis & { __padPilotDisablePortals?: boolean }).__padPilotDisablePortals = true;
}
