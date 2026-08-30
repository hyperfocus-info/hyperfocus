export {
  MAX_AUTOMATION_PARAMETER_ID_BYTES,
  isValidAutomationParameterId,
} from "./automation-identity";
export {
  FACTORY_MODULE_API_VERSION,
  FACTORY_MODULE_STATE_SCHEMA_VERSION,
  FACTORY_MODULE_VERSION,
  createFactoryModuleManifest,
  createFactoryModuleSummary,
  factoryModuleCatalog,
  getFactoryModule,
  type FactoryModuleId,
} from "./factory-modules";
export { PADPILOT_FILE_IMPORT_MAX_BYTES } from "./file-import";
export { PADPILOT_HOST_SURFACE_VERSION } from "./host-surface";
export type {
  PadPilotAccessor,
  PadPilotAgentProvider,
  PadPilotAgentRequest,
  PadPilotAgentResponse,
  PadPilotAgentSource,
  PadPilotAnalyzerFeedFrame,
  PadPilotAnalyzerFeedNoteEvent,
  PadPilotAnalyzerKeyMatch,
  PadPilotCloseableSubscription,
  PadPilotControllerLayoutKind,
  PadPilotFxAutomationBinding,
  PadPilotGamepadState,
  PadPilotHostFileImportOptions,
  PadPilotHostFilePickOptions,
  PadPilotHostImportedFile,
  PadPilotInputDeviceState,
  PadPilotModuleHostSurface,
  PadPilotProducerActions,
  PadPilotProducerActionsOptions,
  PadPilotProducerMidiEvent,
  PadPilotServiceHostSurface,
  PadPilotStateUpdater,
  PadPilotUnsubscribe,
} from "./host-surface";
export {
  PADPILOT_MANIFEST_MAX_BYTES,
  PADPILOT_MANIFEST_MAX_CAPABILITIES,
  PADPILOT_MANIFEST_MAX_ENTRY_BYTES,
  PADPILOT_MANIFEST_MAX_NAME_BYTES,
  PADPILOT_MANIFEST_MAX_SCHEMA_VERSION,
  PADPILOT_MANIFEST_MAX_VERSION_BYTES,
  definePadPilotModuleManifest,
  padPilotModuleManifestSchema,
  validatePadPilotModuleManifest,
  type PadPilotModuleManifest,
  type ResolvedPadPilotModuleManifest,
} from "./module-manifest";
export {
  definePadPilotModule,
  type PadPilotInstalledModuleSummary,
  type PadPilotModuleDefinition,
  type PadPilotModuleRegistrationContext,
  type PadPilotModuleStateCodec,
} from "./module-ui-contract";
export {
  MAX_CAPABILITY_HANDLE_BYTES,
  MAX_CAPABILITY_ID_BYTES,
  MAX_MODULE_ID_BYTES,
  canonicalModuleId,
  createCapabilityHandle,
  isValidCapabilityId,
  isValidModuleId,
  moduleIdAliases,
  parseCapabilityHandle,
  resolveSelectedCapabilityModuleId,
} from "./module-identity";
export { compareSemVer, isSemVerInRange, parseSemVer } from "./semver";
export {
  PADPILOT_SCRIPT_AUDIO_COMMANDS,
  registerPadPilotScriptModule,
  type PadPilotScriptAction,
  type PadPilotScriptAudioCommandName,
  type PadPilotScriptInputEvent,
  type PadPilotScriptModule,
} from "./script-contract";
