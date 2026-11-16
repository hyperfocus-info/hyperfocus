import { isModuleDefinitionShape } from "./module-definition-shape";
import { z } from "zod";
import type { PadPilotRegisterModuleStateCodec } from "@hyperfocus/pad-pilot/module-ui-contract";
import { Show, type Component } from "solid-js";
import { Dynamic } from "solid-js/web";
import { registerModuleStateCodec } from "./proto/registry";
import { PadPilot } from "./padpilot/index";
import { createFactoryModuleManifest, getFactoryModule } from "@hyperfocus/pad-pilot/factory-modules";
import {
  definePadPilotModule as definePublicPadPilotModule,
  type PadPilotInstalledModuleSummary,
  type PadPilotModuleDefinition as PublicPadPilotModuleDefinition,
} from "@hyperfocus/pad-pilot/module-ui-contract";
import {
  definePadPilotModuleManifest,
  type PadPilotModuleManifest,
} from "@hyperfocus/pad-pilot/module-manifest";

export type InstalledModuleSummary = PadPilotInstalledModuleSummary;

export type { PadPilotModuleManifest };

export type PadPilotModuleDefinition = PublicPadPilotModuleDefinition<Component>;

type PadPilotModuleRuntime = {
  createStarterModuleComponent: (manifest: PadPilotModuleManifest) => Component;
  definePadPilotModule: (definition: PadPilotModuleDefinition) => PadPilotModuleDefinition;
  registerModuleStateCodec: PadPilotRegisterModuleStateCodec;
};

const registeredEntries = new Set<string>();

function createFactoryModuleDefinition(
  manifest: PadPilotModuleManifest,
  ComponentImpl: Component,
) {
  return definePadPilotModule({
    manifest,
    Component: ComponentImpl,
  });
}

const builtinLoaders: Record<string, () => Promise<PadPilotModuleDefinition>> = {
  "builtin://factory/analyzer": async () => {
    const { AnalyzerModule } = await import("./modules/analyzer/analyzer-module");
    return createFactoryModuleDefinition(
      createFactoryModuleManifest(getFactoryModule("analyzer")),
      AnalyzerModule,
    );
  },
  "builtin://factory/editor": async () => {
    const { EditorModule } = await import("./modules/editor/editor-module");
    return createFactoryModuleDefinition(
      createFactoryModuleManifest(getFactoryModule("editor")),
      EditorModule,
    );
  },
  "builtin://factory/fx": async () => {
    const { FxModule } = await import("./modules/fx/fx-module");
    return createFactoryModuleDefinition(
      createFactoryModuleManifest(getFactoryModule("fx")),
      FxModule,
    );
  },
  "builtin://factory/generator": async () => {
    const { GeneratorModule } = await import("./modules/generator");
    return createFactoryModuleDefinition(
      createFactoryModuleManifest(getFactoryModule("generator")),
      GeneratorModule,
    );
  },
  "builtin://factory/performance": async () => {
    const { PerformanceModule } = await import("./modules/performance/performance-module");
    return createFactoryModuleDefinition(
      createFactoryModuleManifest(getFactoryModule("performance")),
      PerformanceModule,
    );
  },
  "builtin://factory/recut": async () => {
    const { RecutModule } = await import("./modules/recut/recut-module");
    return createFactoryModuleDefinition(
      createFactoryModuleManifest(getFactoryModule("recut")),
      RecutModule,
    );
  },
};

export function definePadPilotModule(definition: PadPilotModuleDefinition) {
  return definePublicPadPilotModule(definition);
}

function normalizeManifest(
  summary: InstalledModuleSummary,
  definition: Partial<PadPilotModuleDefinition>,
) {
  const manifest = definition.manifest;
  if (manifest?.id && manifest.id !== summary.id) {
    throw new Error(`Module "${summary.id}" tried to register as "${manifest.id}".`);
  }
  if (manifest?.version && summary.version && manifest.version !== summary.version) {
    throw new Error(`Module "${summary.id}" bundle version does not match its installed version.`);
  }
  if (manifest?.capabilities && summary.capabilities) {
    const bundled = [...manifest.capabilities].sort().join("\n");
    const installed = [...summary.capabilities].sort().join("\n");
    if (bundled !== installed) {
      throw new Error(`Module "${summary.id}" capabilities do not match its installed manifest.`);
    }
  }
  return definePadPilotModuleManifest({
    id: summary.id,
    name: summary.name,
    version: summary.version ?? manifest?.version ?? "0.1.0",
    moduleApiVersion: manifest?.moduleApiVersion ?? "0.1.0",
    uiEntry: manifest?.uiEntry ?? summary.uiEntryPath ?? "",
    scriptEntry: manifest?.scriptEntry ?? summary.scriptEntryPath,
    stateSchemaVersion: manifest?.stateSchemaVersion ?? 1,
    capabilities: summary.capabilities ?? manifest?.capabilities ?? [],
    minHostVersion: manifest?.minHostVersion ?? "0.1.0",
    assets: manifest?.assets ?? {},
    migrations: manifest?.migrations ?? [],
  });
}

function normalizeModuleDefinition(
  summary: InstalledModuleSummary,
  exportedValue: unknown,
) {
  if (!isModuleDefinitionShape(exportedValue)) throw new Error(`Module "${summary.id}" did not export a PadPilot module definition.`);
  const candidate = exportedValue;
  if (typeof candidate?.Component !== "function") {
    throw new Error(`Module "${summary.id}" did not export a PadPilot module definition.`);
  }
  if (candidate.register !== undefined && typeof candidate.register !== "function") {
    throw new Error(`Module "${summary.id}" exported an invalid registration hook.`);
  }

  return {
    manifest: normalizeManifest(summary, candidate),
    register: candidate.register,
    Component: candidate.Component,
  };
}

async function importExternalModule(summary: InstalledModuleSummary) {
  if (!summary.uiEntryPath) {
    throw new Error(`Module "${summary.id}" is missing a UI entry path.`);
  }
  if (process.env.PADPILOT_ALLOW_UNSAFE_EXTERNAL_MODULE_UI !== "true") {
    throw new Error(
      `Module "${summary.id}" has a custom UI bundle. External UI execution is disabled until it can run in a sandboxed Module realm.`,
    );
  }
  return import(summary.uiEntryPath);
}

function createTrustedStarterDefinition(summary: InstalledModuleSummary) {
  const manifest = definePadPilotModuleManifest({
    id: summary.id,
    name: summary.name,
    version: summary.version ?? "0.1.0",
    moduleApiVersion: "0.1.0",
    uiEntry: "ui/ui-entry.js",
    scriptEntry: summary.scriptEntryPath ? "script/module.js" : undefined,
    stateSchemaVersion: 1,
    capabilities: summary.capabilities ?? ["module-state", "script-runtime"],
    minHostVersion: "0.1.0",
  });
  return definePadPilotModule({
    manifest,
    Component: createStarterModuleComponent(manifest),
  });
}

function registerIfNeeded(summary: InstalledModuleSummary, definition: PadPilotModuleDefinition) {
  const registrationKey = summary.uiEntryPath ?? summary.id;
  if (!definition.register || registeredEntries.has(registrationKey)) {
    return definition;
  }

  definition.register({
    module: summary,
    registerModuleStateCodec(moduleId, codec, read) {
      if (moduleId !== summary.id) {
        throw new Error(`Module "${summary.id}" cannot register state for "${moduleId}".`);
      }
      return registerModuleStateCodec(summary.id, codec, read);
    },
  });
  registeredEntries.add(registrationKey);
  return definition;
}

export async function loadPadPilotModule(summary: InstalledModuleSummary) {
  if (!summary.uiEntryPath) {
    throw new Error(`Module "${summary.id}" is missing a bundle entry.`);
  }

  if (summary.uiEntryPath.startsWith("builtin://starter/")) {
    return createTrustedStarterDefinition(summary);
  }

  const builtinLoader = builtinLoaders[summary.uiEntryPath];
  if (!builtinLoader && process.env.PADPILOT_ALLOW_UNSAFE_EXTERNAL_MODULE_UI !== "true") {
    return createTrustedStarterDefinition(summary);
  }
  const loaded = builtinLoader ? await builtinLoader() : await importExternalModule(summary);
  const exportedValue = "default" in loaded ? loaded.default : loaded;
  return registerIfNeeded(summary, normalizeModuleDefinition(summary, exportedValue));
}

export function createStarterModuleComponent(manifest: PadPilotModuleManifest) {
  const StarterModule: Component = () => {
    const [state, setState] = PadPilot.hooks.useModuleState<{ notes: string }>(manifest.id, {
      notes: "",
    }, value => z.object({ notes: z.string() }).parse(value));

    return (
      <section class="module-runtime-starter">
        <h2>{manifest.name}</h2>
        <p>{`${manifest.id} v${manifest.version}`}</p>
        <PadPilot.TextAreaField
          label="Module notes"
          value={state().notes}
          onInput={(event) => setState({ notes: event.currentTarget.value })}
        />
        <p>Starter bundle loaded through PadPilot module runtime.</p>
      </section>
    );
  };

  return StarterModule;
}

export function MissingModuleView(props: {
  error?: unknown;
  module: InstalledModuleSummary;
}) {
  const status = () => props.error ? "load-error" : props.module.loadStatus ?? "missing";
  const sanitizedError = () => {
    if (props.error instanceof Error && props.error.message.trim()) {
      return props.error.message.trim();
    }
    return props.module.loadErrorMessage?.trim() ?? "";
  };

  return (
    <section class="module-runtime-missing">
      <h2>{props.module.name}</h2>
      <Show when={status() === "missing"}>
        <p>{`Module bundle missing for ${props.module.id}. PadPilot kept module state and presets.`}</p>
      </Show>
      <Show when={status() === "load-error"}>
        <p>{`Module bundle failed to load for ${props.module.id}. PadPilot kept module state and presets.`}</p>
      </Show>
      <Show when={status() === "install-error"}>
        <p>{`Module install failed for ${props.module.id}.`}</p>
      </Show>
      <Show when={status() === "incompatible-host"}>
        <p>{`Module ${props.module.id} requires a newer PadPilot host.`}</p>
      </Show>
      <Show when={props.module.expectedModuleVersion || props.module.resolvedModuleVersion}>
        <p>{`Expected ${props.module.expectedModuleVersion ?? "unknown"}; resolved ${props.module.resolvedModuleVersion ?? "none"}.`}</p>
      </Show>
      <Show when={props.module.uiEntryPath}>
        <p>{`Entry: ${props.module.uiEntryPath}`}</p>
      </Show>
      <Show when={sanitizedError()}>
        <p>{sanitizedError()}</p>
      </Show>
    </section>
  );
}

export function ModuleRuntimeView(props: {
  definition?: PadPilotModuleDefinition;
}) {
  return <Dynamic component={props.definition?.Component} />;
}

const moduleRuntime: PadPilotModuleRuntime = {
  createStarterModuleComponent,
  definePadPilotModule,
  registerModuleStateCodec,
};

declare global {
  interface Window {
    __padpilotModuleRuntime?: PadPilotModuleRuntime;
  }
}

if (typeof window !== "undefined") {
  window.__padpilotModuleRuntime = moduleRuntime;
}

// Foreign modules expose executable hooks. Check callable boundaries before invoking them.
