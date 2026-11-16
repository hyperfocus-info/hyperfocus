import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

const floating = ['anchorRect', 'anchorRef', 'matchWidth', 'mount', 'offset', 'open', 'placement', 'role', 'viewportPadding'];
const popover = ['contextTarget', 'trigger', 'autoFocus', 'open', 'defaultOpen', 'portal', 'contentRole', 'triggerHasPopup', 'placement', 'align', 'contentClass', 'onContentKeyDown', 'onOpenChange'];
const select = ['icon', 'tooltip', 'hideWhenSingleOption', 'contentClass', 'dataAttributes', 'invalid', 'placement', 'align', 'searchable', 'searchThreshold', 'searchPlaceholder', 'tags', 'loading', 'emptyMessage', 'onSearch', 'onCreate', 'createLabel', 'changeEventValue'];
const settingsWorkspace = ['sections', 'activeSection', 'onSectionChange', 'query', 'onQueryChange', 'onClose'];
const ui = {
  Button: ['tooltip', 'tooltipDisabled', 'icon', 'onMouseEnter'],
  Input: ['min', 'max', 'step'],
  FileInput: ['buttonLabel'],
  FormActions: [],
  // Terminal presentation slots, not feature state or command relay props.
  PanelHeader: ['actions', 'context', 'icon'],
  SettingsWorkspace: settingsWorkspace,
  Dialog: ['open', 'onClose', 'footer'],
  Tooltip: ['content', 'delay', 'placement', 'contentClass', 'mount', 'renderTrigger', 'triggerTestId'],
  FloatingLayer: floating,
  Popover: popover,
  MenuItem: ['onSelect', 'tone'],
  SelectControl: select,
  FavoriteSelectControl: [...select, 'favoriteValues', 'onToggleFavorite'],
  ChatTranscript: ['messages', 'emptyMessage', 'estimateMessageHeight', 'overscan', 'stickToEnd', 'streamRenderIntervalMs', 'maxRetainedMessages', 'hasPrevious', 'previousLabel', 'onRequestPrevious', 'onStreamContentApplied'],
  CoachmarkTour: ['open', 'initialStep'],
  DockingWorkbench: ['apiRef', 'layout', 'presets', 'onSavePreset', 'onApplyPreset'],
};

// Reviewed controls, row identities and provider injection boundaries. Match an
// actual module and symbol, not a directory/name heuristic. Feature/controller
// props are not generally exempt, including when passed into a registered row.
const contracts: Record<string, Record<string, readonly string[]>> = {
  'solid-js': { For: ['each', 'fallback'], Index: ['each', 'fallback'], Show: ['when', 'fallback', 'keyed'], Switch: ['fallback'], Match: ['when', 'keyed'] },
  'solid-js/web': { Portal: ['mount', 'useShadow', 'isSVG'], Dynamic: ['component'] },
  '@dschz/solid-uplot': { SolidUplot: ['axes'] },
  '@hyperfocus/ui': ui,
  '@hyperfocus/ui/primitives': { Button: ui.Button, Input: ui.Input, PanelHeader: ui.PanelHeader, Dialog: ui.Dialog, Tooltip: ui.Tooltip, FloatingLayer: floating, Popover: popover, MenuItem: ui.MenuItem, SelectControl: select, FavoriteSelectControl: ui.FavoriteSelectControl, CoachmarkTour: ui.CoachmarkTour },
  '@hyperfocus/ui/preferences': { PreferencesSurface: ['values', 'onClose'], SettingsWorkspace: settingsWorkspace },
  'packages/ui/src/preferences/settings-workspace': { SettingsWorkspace: settingsWorkspace },
  '@hyperfocus/ui/task-review': { TaskReviewDialog: ['presentation', 'open', 'onClose'] },
  'packages/ui/src/primitives/floating-layer': { FloatingLayer: floating },
  'packages/ui/src/primitives/popover': { Popover: popover },
  'packages/ui/src/primitives/tooltip': { Tooltip: ui.Tooltip },
  'packages/ui/src/primitives/dialog': { Dialog: ui.Dialog },
  'packages/ui/src/transcript/chat-transcript': { ChatTranscript: ui.ChatTranscript, TranscriptMessageRow: ['streamRenderIntervalMs', 'onStreamContentApplied'] },
  'apps/harness/ui/src/components/primitives/button': { Button: ['tooltip', 'tooltipDisabled', 'tooltipTriggerClass', 'as', 'onMouseEnter'] },
  'apps/harness/ui/src/components/action-button': { ActionButton: ['tooltip', 'tooltipDisabled', 'disabledReason', 'icon', 'wrapperClass', 'ariaBusy', 'dataTourId'] },
  'apps/harness/ui/src/components/primitives/status-chip': { StatusChip: ['tone', 'dot'] },
  'apps/harness/ui/src/components/primitives/textarea': { Textarea: ['rows', 'onKeyUp', 'onSelect'] },
  'apps/harness/ui/src/components/primitives/dialog': { Dialog: ['open', 'onClose', 'eyebrow', 'contentClass', 'footer'] },
  'apps/harness/ui/src/components/primitives/tooltip': { Tooltip: ['content', 'triggerClass', 'side'] },
  'apps/harness/ui/src/components/primitives/primitive-portal': { PrimitivePortal: ['active', 'layer'] },
  'apps/harness/ui/src/components/file-linked-text': { FileLinkedText: ['text', 'fileLinks'] },
  'apps/harness/ui/src/components/markdown-content': { MarkdownContent: ['content', 'tone', 'live', 'liveRenderIntervalMs', 'fileLinks'] },
  'apps/harness/ui/src/store-providers': { HarnessStoreProvider: ['store'] },
  'apps/harness/ui/src/ide/ide-workbench': { IdeWorkbench: ['onToggleWindowMode', 'onRequestClose'] },
  'apps/harness/ui/src/app': { IdeWorkbench: ['onToggleWindowMode', 'onRequestClose'] },
  'apps/harness/ui/src/components/project-sidebar/project-sidebar': { ProjectSidebar: ['compact'] },
  'apps/harness/ui/src/components/background-jobs-panel': { SchedulerWarningContent: ['text'] },
  'apps/harness/ui/src/components/project-switcher-dialog': { ProjectActivityBadges: ['result'] },
  'apps/harness/ui/src/components/project-sidebar/project-sidebar-model': { SortableProjectCard: ['projectId'] },
  'apps/harness/ui/src/components/trace-panel': { TraceBrowserSessionCard: ['session'] },
  'apps/harness/ui/src/components/swarm/swarm-dialog': { HarnessSwarmDialog: ['projectId', 'projectName', 'goal', 'agentRecipientId', 'fetch'] },
  'apps/harness/ui/src/terminal/terminal-history-dialog': { TerminalHistoryRow: ['session', 'onOpen'] },
  'apps/harness/ui/src/terminal/renderers/solid-renderer-prototype': { SolidTerminalRendererPrototype: ['output'] },
  // Pane and renderer resources key (projectId, sessionId), reject stale input
  // and dispose old handles. These are entity/resource inputs, not services.
  // Local XtermRenderer symbols are the two explicit lazySurface adapters.
  'apps/harness/ui/src/terminal/terminal-pane': { TerminalPane: ['session'], XtermRenderer: ['output', 'sessionId', 'projectId', 'sessionCwd'] },
  'apps/harness/ui/src/terminal/terminal-drawer': { CliSessionDrawerPane: ['session'], XtermRenderer: ['output', 'sessionId', 'projectId', 'sessionCwd'] },
  'apps/harness/ui/src/terminal/renderers/xterm-renderer': { XtermRenderer: ['output', 'sessionId', 'projectId', 'sessionCwd'] },
  'apps/harness/ui/src/components/assistants/assistant-todos-tab': { AssistantTodoActions: ['todo'], AssistantTodoMetadata: ['todo'] },
  'apps/harness/ui/src/components/assistants/question-column': { PendingQuestionAnswer: ['question'], QuestionCard: ['question'] },
  'apps/harness/ui/src/components/notification-inbox/view': { NotificationKindIcon: ['notification'] },
  'apps/harness/ui/src/components/notification-inbox/response-forms': { NotificationResponse: ['notification'] },
  'apps/harness/ui/src/components/project-sidebar/project-sidebar-view': { ProjectRow: ['project'], ProjectThreadRow: ['project', 'thread'] },
  'apps/harness/ui/src/components/streamed-tool-block': { DetailBlock: ['mono', 'tone', 'copyTooltip', 'fileLinks'], StreamedToolBlock: ['block', 'fileLinks'] },
  'apps/harness/ui/src/components/trace-panel/trace-panel-support': { TraceJobRunSummary: ['run', 'fileLinks'] },
  'packages/ui/src/preferences/preferences': { PreferenceControl: ['definition'] },
  'packages/ui/src/task-review/task-review': { StableItems: ['items', 'fallback'], TaskReviewFacts: ['facts'] },
  'apps/pad-pilot/scripts/synaesthetic-evaluator/dashboard/run-actions': { RunActions: ['run'] },
  'apps/pad-pilot/ui/src/components/elements/modal': { Modal: ['open', 'onClose'] },
  'apps/pad-pilot/ui/src/components/elements/drawer': { Drawer: ['open', 'onOpenChange'] },
  'apps/pad-pilot/ui/src/components/ai-settings/ai-settings-content': { AiSettingsContent: ['open'] },
  'apps/pad-pilot/ui/src/components/elements/file-upload-dropzone': { FileUploadInput: ['accept', 'multiple'] },
  'apps/pad-pilot/ui/src/components/elements/floating-layer': { FloatingLayer: floating },
  'apps/pad-pilot/ui/src/components/elements/tooltip': { Tooltip: ['content', 'placement'] },
  'apps/pad-pilot/ui/src/components/elements/selection/searchable-combobox': { SearchableCombobox: ['selectedId', 'searchLabel'] },
  'apps/pad-pilot/ui/src/modules/fx/components/fx-node-card': { FxNodeCard: ['chainId', 'nodeId'] },
  'apps/pad-pilot/ui/src/modules/fx/fx-drag': { FxNodeDropZone: ['chainId', 'nodeId'] },
  'apps/pad-pilot/ui/src/modules/fx/components/fx-node-rack': { FxNodeRack: ['chainId', 'nodeId'] },
  'apps/pad-pilot/ui/src/padpilot/index': { 'PadPilot.DraggableCard': ['isPlaceholder', 'subtitle'], 'PadPilot.Button': ['icon', 'tooltip'], 'PadPilot.ButtonGroup.Item': ['tooltip'], 'PadPilot.Modal': ['open', 'onClose'] },
  'apps/harness/ui/src/components/primitives/virtual-list': { VirtualList: ['items', 'estimateSize', 'overscan', 'onScroll', 'onRangeChange', 'getItemKey', 'renderItem', 'pagination', 'handle', 'reverse', 'stickToEnd', 'debug'] },
  'apps/engine-editor/website/examples/books/src/client/components': {
    Pick: ['favoriteKey', 'onCreate', 'createLabel'], Form: ['submit'], Empty: ['action'], Metric: ['detail'], Table: ['rows', 'columns', 'readableCells'],
  },
  'apps/engine-editor/website/examples/books/src/client/time/period-control': { PeriodControl: ['book', 'today', 'asOf', 'allowTime', 'dateOnlyExcluded', 'comparison', 'onComparisonChange'] },
  'apps/engine-editor/website/examples/books/src/client/entity-editor': { SetupForm: ['kind', 'accountTypes', 'bank', 'contactKind'], SetupDraft: ['kind', 'initialName', 'accountTypes', 'bank', 'contactKind'] },
  'apps/engine-editor/website/examples/books/src/client/entity-pick': { EntityPick: ['onCreated'] },
  "apps/engine-editor/website/examples/books/src/client/documents/document-editor": { DocumentDraft: ['initialKind'] },
  "apps/engine-editor/website/examples/books/src/client/transactions/entry-editor": { EntryDraft: ['correction', 'initialAccountId'], EntryDetailDraft: ['entry'] },
  'apps/engine-editor/website/examples/books/src/client/entity-maintenance': { MaintenanceForm: ['kind', 'entityId'] },
  'apps/engine-editor/website/examples/books/src/client/reconciliation/editor': { ReconciliationDraft: ['accountId'] },
  'apps/engine-editor/website/examples/books/src/client/items/item-editor': { ItemDraft: ['item'] },
  "apps/engine-editor/website/examples/books/src/client/documents/sales-receipts": { SalesReceiptDetailDraft: ['receipt'] },
  "apps/engine-editor/website/examples/books/src/client/documents/document-credits": { DocumentCredits: ['doc'], CreditReversal: ['documentId'] },
  "apps/engine-editor/website/examples/books/src/client/documents/document-payments": { DocumentPayment: ['doc'] },
  "apps/engine-editor/website/examples/books/src/client/documents/documents": { DocumentCorrection: ['doc'], DocumentDetailContent: ['doc'] },
  'apps/engine-editor/website/examples/books/src/client/custom-reports/preview': { SnapshotPreview: ['snapshot'] },
  "apps/engine-editor/website/examples/books/src/client/documents/document-evidence": { DocumentEvidencePanel: ['documentId'], EntryEvidence: ['entryId'], EvidencePanel: ['target'], EvidenceItem: ['target'] },
  'apps/engine-editor/website/examples/books/src/client/import-recovery/report': { ImportReport: ['initialGroup'] },
  "apps/engine-editor/website/examples/books/src/client/documents/sales-settlement": { SalesReceiptSettlement: ['initialReceiptId'] },
  'apps/engine-editor/website/examples/books/src/client/reconciliation/dated-correction': { DatedCorrection: ['entry'] },
  'apps/engine-editor/website/examples/books/src/client/learn/exercise': { PracticeExercise: ['lesson'] },
  // ProposeExits keys account/position within its mounted session; a replaced
  // identity resets fields and rejects the old command's navigation completion.
  'apps/engine-editor/website/examples/trade-bot/src/client/exit-updates': { ExitComparison: ['signal'], ProposeExits: ['position'] },
  'apps/engine-editor/website/src/client/extensions/fields': { ExtensionFields: ['fields'] },
  'apps/engine-editor/website/src/client/extensions/collection': { RecordEditor: ['fields'] },
  'apps/engine-editor/website/src/client/extensions/removal-review': { RemovalReview: ['navigationBlocked'] },
  'apps/engine-editor/website/src/client/commerce-fields': { CommerceField: ['path'] },
  'apps/engine-editor/src/components/selection-inspector': {
    SelectionInspector: ['project', 'selection'], AddComponentForm: ['components'], BehaviorComponentCard: ['component'],
    SpecializedComponentFields: ['component'], AudioComponentFields: ['component'],
    ComponentSelectField: ['componentId'], ComponentValueField: ['componentId', 'fieldKey'],
    SelectValueField: ['componentId', 'fieldKey'], NumberValueField: ['componentId', 'fieldKey'],
    BooleanValueField: ['componentId', 'fieldKey'], BehaviorField: ['componentId'], ActionButton: ['data'],
  },
  'apps/engine-editor/src/components/assets/asset-inspector': { AudioPreview: ['asset', 'audition'], AudioAssetLink: ['asset', 'target'], AssetAction: ['item'] },
  'apps/engine-editor/src/components/assets/asset-image-preview': { AssetImagePreview: ['asset'] },
  'apps/engine-editor/src/components/assets/delivery/controls': { AssetDeliveryControls: ['asset'] },
  'apps/engine-editor/src/components/editor-action-menu': { EditorActionMenu: ['items'] },
  'apps/engine-editor/src/components/scene3d/object-inspector-fields': { ObjectVectorField: ['values'], ObjectNumberField: ['min', 'max'] },
  'apps/engine-editor/src/components/scene3d/color-swatch': { ColorSwatch: ['color'] },
  'apps/engine-editor/src/motion/media/blend-ui/fields': { BlendChoice: ['set'] },
  'apps/engine-editor/src/motion/media/blend-ui/landmarks': { LandmarkCanvas: ['width', 'height'] },
  'apps/engine-editor/src/motion/score/ui/fields': { Choice: ['set'] },
  'apps/engine-editor/src/motion/scene3d/editor-3d-video-workbench': { NumberField: ['min'] },
  'apps/engine-editor/src/editor-ai-panel': { EditorAiLauncher: ['host'] },
  // Host API registration releases on disposal; retained open handles are inert.
  'apps/engine-editor/src/character-voice/voice-tool': { CharacterVoiceTool: ['register'] },
  'apps/engine-editor/src/scene3d/combat/fields': { CombatTextField: ['max', 'integer'] },
  'apps/engine-editor/src/scene3d/combat/audio-controls/effects': { CombatAudioEffects: ['audio', 'busy'] },
  'apps/engine-editor/src/scene3d/combat/audio-controls/transitions': { CombatMusicTransitions: ['transition', 'busy'] },
  'apps/engine-editor/src/scene3d/combat/audio-controls/playlist': { CombatMusicPlaylist: ['busy'] },
  'apps/engine-editor/src/scene3d/combat/audio-controls/takes': { CombatAudioTakes: ['busy'] },
  'apps/engine-editor/src/scene3d/combat/audio-controls/musical-metadata': { CombatMusicTrackMetadata: ['busy'] },
  'apps/engine-editor/src/scene3d/combat/interactions/kit-fields': { WeaponKitFields: ['busy'] },
};

const spreads: Record<string, Record<string, string>> = {
  // The outer SelectControl mounts its controlled implementation when visible.
  'packages/ui/src/primitives/selection/select-control': { SelectControlContent: 'SelectControl' },
  // These wrappers key their draft implementation by the documented Books
  // editor identity. They do not transport workspace or report dependencies.
  "apps/engine-editor/website/examples/books/src/client/documents/document-editor": { DocumentDraft: 'DocumentEditor' },
  "apps/engine-editor/website/examples/books/src/client/documents/documents": { DocumentDetailContent: 'DocumentDetail' },
  'apps/engine-editor/website/examples/books/src/client/entity-editor': { SetupDraft: 'SetupForm' },
  'apps/engine-editor/website/examples/books/src/client/entity-maintenance': { MaintenanceForm: 'EntityMaintenance' },
  "apps/engine-editor/website/examples/books/src/client/transactions/entry-editor": { EntryDraft: 'EntryEditor', EntryDetailDraft: 'EntryDetail' },
  'apps/engine-editor/website/examples/books/src/client/items/item-editor': { ItemDraft: 'ItemEditor' },
  'apps/engine-editor/website/examples/books/src/client/reconciliation/editor': { ReconciliationDraft: 'ReconciliationEditor' },
  "apps/engine-editor/website/examples/books/src/client/documents/sales-receipts": { SalesReceiptDetailDraft: 'SalesReceiptDetail' },
  'apps/engine-editor/website/examples/books/src/client/components': { TablePage: 'Table' },
  // CommerceLeaf is the stateless value renderer of CommerceField. Both read
  // commerce from its scoped owner; only field path/key/value cross this branch.
  'apps/engine-editor/website/src/client/commerce-fields': { CommerceLeaf: 'CommerceField' },
  'apps/engine-editor/src/app/input-map-editor': { InputMapContent: 'InputMapEditor' },
};

const importedSpreads = [
  { file: 'apps/harness/ui/src/components/models/model-select', owner: 'ModelSelect', module: '@hyperfocus/ui', name: 'FavoriteSelectControl', property: undefined },
  { file: 'apps/harness/ui/src/components/primitives/dropdown', owner: 'DropdownControl', module: '@hyperfocus/ui', name: 'Button', property: 'dataAttributes' },
];

export function boundaryKey(file: string, target: { module: string; name: string } | undefined, localName: string) {
  if (target && !target.module.startsWith('.')) return { module: target.module, name: target.name };
  const owner = target ? path.resolve(path.dirname(file), target.module) : path.resolve(file);
  return { module: path.relative(root, owner).replaceAll('\\', '/').replace(/\.[cm]?[jt]sx?$/, ''), name: target?.name ?? localName };
}

export function controlAttributes(file: string, target: { module: string; name: string } | undefined, localName = '') {
  const key = boundaryKey(file, target, localName);
  return key ? contracts[key.module]?.[key.name] ?? [] : [];
}

export function controlAllowsSpread(file: string, target: { module: string; name: string } | undefined, localName: string, owner: string | undefined, property?: string) {
  const key = boundaryKey(file, target, localName);
  const caller = boundaryKey(file, undefined, owner ?? '');
  if (!key || !caller || !owner) return false;
  if (key.module === caller.module && property === undefined && spreads[caller.module]?.[key.name] === owner) return true;
  return importedSpreads.some(contract => contract.file === caller.module && contract.owner === owner
    && contract.module === key.module && contract.name === key.name && contract.property === property);
}
