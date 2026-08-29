export const FACTORY_MODULE_API_VERSION = "0.1.0";
export const FACTORY_MODULE_VERSION = "1.0.0";
export const FACTORY_MODULE_STATE_SCHEMA_VERSION = 1;

export const factoryModuleCatalog = [
  {
    id: "fx",
    name: "FX",
    uiEntry: "builtin://factory/fx",
    capabilities: ["fx-graph", "fx-visualizer", "automation"],
  },
  {
    id: "recut",
    name: "Recut",
    uiEntry: "builtin://factory/recut",
    capabilities: ["sample-source", "sample-analysis", "slice-playback", "haptics"],
  },
  {
    id: "generator",
    name: "Generator",
    uiEntry: "builtin://factory/generator",
    capabilities: ["midi-export", "host-tempo"],
  },
  {
    id: "editor",
    name: "Editor",
    uiEntry: "builtin://factory/editor",
    capabilities: [
      "module-state",
      "controller-input",
      "midi-output",
      "keyboard-output",
      "automation",
    ],
  },
  {
    id: "performance",
    name: "Performance",
    uiEntry: "builtin://factory/performance",
    capabilities: [
      "module-state",
      "controller-input",
      "midi-output",
      "keyboard-output",
      "automation",
    ],
  },
  {
    id: "analyzer",
    name: "Analyzer",
    uiEntry: "builtin://factory/analyzer",
    capabilities: ["analyzer-feed", "analyzer-session", "midi-export"],
  },
] as const;

type FactoryModuleDefinition = typeof factoryModuleCatalog[number];

export type FactoryModuleId = typeof factoryModuleCatalog[number]["id"];

export function getFactoryModule(moduleId: string) {
  const definition = factoryModuleCatalog.find((module) => module.id === moduleId);
  if (!definition) {
    throw new Error(`Unknown factory Module: ${moduleId}`);
  }
  return definition;
}

export function createFactoryModuleSummary(definition: FactoryModuleDefinition) {
  return {
    id: definition.id,
    name: definition.name,
    version: FACTORY_MODULE_VERSION,
    capabilities: [...definition.capabilities],
    loadStatus: "ready",
    uiEntryPath: definition.uiEntry,
  };
}

export function createFactoryModuleManifest(definition: FactoryModuleDefinition) {
  return {
    id: definition.id,
    name: definition.name,
    version: FACTORY_MODULE_VERSION,
    moduleApiVersion: FACTORY_MODULE_API_VERSION,
    uiEntry: definition.uiEntry,
    stateSchemaVersion: FACTORY_MODULE_STATE_SCHEMA_VERSION,
    capabilities: [...definition.capabilities],
    minHostVersion: FACTORY_MODULE_API_VERSION,
  };
}
