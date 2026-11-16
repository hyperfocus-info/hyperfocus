import { expect, test } from 'bun:test';
import { collectStandards } from './policy';
import { dropdownSpreadFixture } from './boundary-fixtures';

const props = (file: string, source: string) => collectStandards(file, source).filter(item => item.rule === 'no-prop-drilling');

test.each([
  ['apps/example/src/view.tsx', '@hyperfocus/ui', 'PanelHeader', 'actions={props.actions} context={props.context} icon={props.icon}'],
  ['apps/example/src/view.tsx', '@hyperfocus/ui', 'SelectControl', 'changeEventValue={props.mode}'],
  ['apps/example/src/view.tsx', '@hyperfocus/ui', 'Button', 'tooltip={props.text} onMouseEnter={props.hover}'],
  ['apps/example/src/view.tsx', '@hyperfocus/ui', 'Input', 'min={props.min} max={props.max} step={props.step}'],
  ['apps/example/src/view.tsx', '@hyperfocus/ui', 'Dialog', 'open={props.open} onClose={props.close} footer={props.footer}'],
  ['apps/example/src/view.tsx', '@hyperfocus/ui', 'Tooltip', 'content={props.text} delay={props.delay}'],
  ['apps/pad-pilot/ui/src/components/elements/tooltip.tsx', '@hyperfocus/ui/primitives', 'Tooltip', 'placement={props.placement} contentClass={props.skin} mount={props.outlet} renderTrigger={props.renderTrigger}'],
  ['apps/example/src/view.tsx', '@hyperfocus/ui/primitives', 'FloatingLayer', 'anchorRef={props.anchor} matchWidth={props.width} offset={props.offset} open={props.open} placement={props.placement} role={props.role} viewportPadding={props.padding}'],
  ['packages/ui/src/primitives/action-menu.tsx', './popover', 'Popover', 'open={props.open} defaultOpen={props.defaultOpen} portal={props.portal} onOpenChange={props.changed}'],
  ['packages/ui/src/primitives/status-chip.tsx', './tooltip', 'Tooltip', 'content={props.tooltip}'],
  ['apps/example/src/view.tsx', '@hyperfocus/ui/preferences', 'PreferencesSurface', 'values={props.values}'],
  ['apps/example/src/view.tsx', '@hyperfocus/ui/task-review', 'TaskReviewDialog', 'presentation={props.presentation} onClose={props.close}'],
  ['apps/harness/ui/src/app.tsx', './ide/ide-workbench', 'IdeWorkbench', 'onToggleWindowMode={props.popOut} onRequestClose={props.close}'],
  ['apps/harness/ui/src/components/background-jobs-panel.tsx', './background-jobs-panel', 'SchedulerWarningContent', 'text={props.text}'],
  ['apps/harness/ui/src/components/project-switcher-dialog.tsx', './project-switcher-dialog', 'ProjectActivityBadges', 'result={props.result}'],
  ['apps/harness/ui/src/components/project-sidebar/project-sidebar-view.tsx', './project-sidebar-model', 'SortableProjectCard', 'projectId={props.id}'],
  ['apps/harness/ui/src/components/trace-panel.tsx', './trace-panel', 'TraceBrowserSessionCard', 'session={props.row}'],
  ['apps/harness/ui/src/components/swarm/swarm-launcher.tsx', './swarm-dialog', 'HarnessSwarmDialog', 'projectId={props.id} projectName={props.name} goal={props.goal} agentRecipientId={props.recipient} fetch={props.fetch}'],
  ['apps/pad-pilot/scripts/synaesthetic-evaluator/dashboard/library-view.tsx', './run-actions', 'RunActions', 'run={props.run}'],
  ['apps/pad-pilot/ui/src/components/create-module-modal.tsx', './elements/modal', 'Modal', 'open={props.open} onClose={props.close}'],
  ['apps/pad-pilot/ui/src/components/global-settings-drawer.tsx', './elements/drawer', 'Drawer', 'open={props.open} onOpenChange={props.changed}'],
  ['apps/pad-pilot/ui/src/components/elements/file-upload-dropzone.tsx', './file-upload-dropzone', 'FileUploadInput', 'accept={props.accept} multiple={props.multiple}'],
  ['apps/pad-pilot/ui/src/modules/generator/components/generator-dashboard.tsx', '../../../components/elements/floating-layer', 'FloatingLayer', 'anchorRef={props.anchor} open={props.open}'],
  ['apps/pad-pilot/ui/src/modules/generator/components/generator-dashboard.tsx', '../../../components/elements/tooltip', 'Tooltip', 'content={props.content} placement={props.placement}'],
  ['apps/pad-pilot/ui/src/modules/fx/components/fx-select-field.tsx', '../../../components/elements/selection/searchable-combobox', 'SearchableCombobox', 'selectedId={props.value} searchLabel={props.label}'],
  ['apps/pad-pilot/ui/src/modules/fx/components/fx-node-lane.tsx', './fx-node-card', 'FxNodeCard', 'chainId={props.chain} nodeId={props.node}'],
  ['apps/pad-pilot/ui/src/modules/fx/components/fx-node-card.tsx', '../fx-drag', 'FxNodeDropZone', 'chainId={props.chain} nodeId={props.node}'],
  ['apps/pad-pilot/ui/src/modules/fx/components/fx-node-card.tsx', './fx-node-rack', 'FxNodeRack', 'chainId={props.chain} nodeId={props.node}'],
  ['packages/ui/src/primitives/action-menu.tsx', './popover', 'Popover', 'contextTarget={props.contextTarget}'],
  ['packages/ui/src/transcript/chat-transcript.tsx', './chat-transcript', 'TranscriptMessageRow', 'streamRenderIntervalMs={props.interval} onStreamContentApplied={props.applied}'],
  ['packages/ui/src/task-review/task-review-outcome.tsx', './task-review', 'TaskReviewFacts', 'facts={props.facts}'],
  ['apps/harness/ui/src/app.tsx', './components/project-sidebar/project-sidebar', 'ProjectSidebar', 'compact={props.compact}'],
  ['apps/harness/ui/src/terminal/terminal-history-dialog.tsx', './terminal-history-dialog', 'TerminalHistoryRow', 'session={props.row} onOpen={props.close}'],
  ['apps/harness/ui/src/terminal/terminal-pane.tsx', './renderers/solid-renderer-prototype', 'SolidTerminalRendererPrototype', 'output={props.output}'],
  ['apps/harness/ui/src/terminal/terminal-split-layout.tsx', './terminal-pane', 'TerminalPane', 'session={props.row}'],
  ['apps/harness/ui/src/terminal/terminal-drawer.tsx', './terminal-drawer', 'CliSessionDrawerPane', 'session={props.row}'],
  ['apps/harness/ui/src/terminal/terminal-pane.tsx', './renderers/xterm-renderer', 'XtermRenderer', 'output={props.output} sessionId={props.id} projectId={props.project} sessionCwd={props.cwd}'],
  ['apps/pad-pilot/ui/src/components/global-settings-drawer.tsx', './ai-settings/ai-settings-content', 'AiSettingsContent', 'open={props.open}'],
  ['apps/engine-editor/website/examples/books/src/client/entity-pick.tsx', './entity-editor', 'SetupForm', 'kind={props.kind} accountTypes={props.types} bank={props.bank} contactKind={props.contactKind}'],
  ["apps/engine-editor/website/examples/books/src/client/documents/documents.tsx", './document-credits', 'DocumentCredits', 'doc={props.doc}'],
  ["apps/engine-editor/website/examples/books/src/client/documents/documents.tsx", './document-payments', 'DocumentPayment', 'doc={props.doc}'],
  ["apps/engine-editor/website/examples/books/src/client/documents/documents.tsx", './documents', 'DocumentCorrection', 'doc={props.doc}'],
  ['apps/engine-editor/website/examples/books/src/client/custom-reports/publish.tsx', './preview', 'SnapshotPreview', 'snapshot={props.snapshot}'],
  ['apps/engine-editor/src/components/selection-inspector.tsx', './selection-inspector', 'ComponentValueField', 'componentId={props.id} fieldKey={props.key}'],
  ['apps/engine-editor/src/components/assets/asset-inspector.tsx', './asset-image-preview.tsx', 'AssetImagePreview', 'asset={props.asset}'],
  ['apps/engine-editor/src/components/assets/asset-inspector.tsx', './asset-inspector', 'AudioPreview', 'asset={props.asset} audition={props.audition}'],
  ['apps/engine-editor/src/components/assets/asset-inspector.tsx', './asset-inspector', 'AudioAssetLink', 'asset={props.asset} target={props.target}'],
  ['apps/engine-editor/src/components/assets/asset-inspector.tsx', './delivery/controls.tsx', 'AssetDeliveryControls', 'asset={props.asset}'],
  ['apps/engine-editor/src/components/selection-inspector.tsx', './editor-action-menu.tsx', 'EditorActionMenu', 'items={props.items}'],
  ['apps/engine-editor/src/components/scene3d/object-inspector.tsx', './object-inspector-fields.tsx', 'ObjectVectorField', 'values={props.values}'],
  ['apps/engine-editor/src/components/scene3d/object-inspector-fields.tsx', './object-inspector-fields', 'ObjectNumberField', 'min={props.min} max={props.max}'],
  ['apps/engine-editor/src/components/scene3d/material-inspector.tsx', './color-swatch.tsx', 'ColorSwatch', 'color={props.color}'],
  ['apps/engine-editor/src/motion/media/blend-ui/controls.tsx', './fields.tsx', 'BlendChoice', 'set={props.set}'],
  ['apps/engine-editor/src/motion/score/ui/fields.tsx', './fields', 'Choice', 'set={props.set}'],
  ['apps/engine-editor/src/motion/scene3d/editor-3d-video-workbench.tsx', './editor-3d-video-workbench', 'NumberField', 'min={props.min}'],
  ['apps/engine-editor/src/scene3d/combat/fields.tsx', './fields', 'CombatTextField', 'max={props.max} integer={props.integer}'],
  ["apps/engine-editor/website/examples/books/src/client/documents/document-credits.tsx", './document-credits', 'CreditReversal', 'documentId={props.id}'],
  ["apps/engine-editor/website/examples/books/src/client/documents/documents.tsx", './document-evidence', 'DocumentEvidencePanel', 'documentId={props.id}'],
  ["apps/engine-editor/website/examples/books/src/client/transactions/entry-editor.tsx", "../documents/document-evidence", 'EntryEvidence', 'entryId={props.id}'],
  ["apps/engine-editor/website/examples/books/src/client/documents/document-evidence.tsx", './document-evidence', 'EvidenceItem', 'target={props.target}'],
  ["apps/engine-editor/website/examples/books/src/client/imports/import-dialog.tsx", "../import-recovery/report", 'ImportReport', 'initialGroup={props.group}'],
  ["apps/engine-editor/website/examples/books/src/client/documents/sales-receipts.tsx", './sales-settlement', 'SalesReceiptSettlement', 'initialReceiptId={props.id}'],
  ["apps/engine-editor/website/examples/books/src/client/transactions/entry-editor.tsx", "../reconciliation/dated-correction", 'DatedCorrection', 'entry={props.entry}'],
  ['apps/engine-editor/website/examples/books/src/client/learn/learning-center.tsx', './exercise', 'PracticeExercise', 'lesson={props.lesson}'],
  ['apps/engine-editor/website/examples/trade-bot/src/client/inbox.tsx', './exit-updates', 'ExitComparison', 'signal={props.row}'],
  ['apps/engine-editor/website/examples/trade-bot/src/client/overview.tsx', './exit-updates', 'ProposeExits', 'position={props.row}'],
  ['apps/engine-editor/src/editor-shell-view.tsx', './character-voice/voice-tool', 'CharacterVoiceTool', 'register={props.register}'],
  ['apps/engine-editor/website/src/client/extensions/form.tsx', './fields', 'ExtensionFields', 'fields={props.fields}'],
  ['apps/engine-editor/website/src/client/extensions/collection.tsx', './collection', 'RecordEditor', 'fields={props.fields}'],
  ['apps/engine-editor/website/src/client/extensions/bindings.tsx', './removal-review', 'RemovalReview', 'navigationBlocked={props.disabled}'],
  ['apps/engine-editor/src/motion/media/blend-ui/landmarks.tsx', './landmarks', 'LandmarkCanvas', 'width={props.width} height={props.height}'],
  ['apps/engine-editor/src/editor-ai-panel.tsx', './editor-ai-panel', 'EditorAiLauncher', 'host={props.outlet}'],
  ['apps/engine-editor/src/scene3d/combat/audio.tsx', './audio-controls/effects.tsx', 'CombatAudioEffects', 'audio={props.audio} busy={props.busy}'],
  ['apps/engine-editor/src/scene3d/combat/audio.tsx', './audio-controls/transitions.tsx', 'CombatMusicTransitions', 'transition={props.transition} busy={props.busy}'],
  ['apps/engine-editor/src/scene3d/combat/audio.tsx', './audio-controls/playlist.tsx', 'CombatMusicPlaylist', 'busy={props.busy}'],
  ['apps/engine-editor/src/scene3d/combat/audio.tsx', './audio-controls/takes.tsx', 'CombatAudioTakes', 'busy={props.busy}'],
  ['apps/engine-editor/src/scene3d/combat/audio-controls/playlist.tsx', './musical-metadata.tsx', 'CombatMusicTrackMetadata', 'busy={props.busy}'],
  ['apps/engine-editor/src/scene3d/combat/interactions/inspector.tsx', './kit-fields.tsx', 'WeaponKitFields', 'busy={props.busy}'],
  ["apps/engine-editor/website/examples/books/src/client/documents/document-editor.tsx", './document-editor', 'DocumentDraft', 'initialKind={props.kind}'],
  ["apps/engine-editor/website/examples/books/src/client/transactions/entry-editor.tsx", './entry-editor', 'EntryDraft', 'correction={props.entry} initialAccountId={props.id}'],
  ["apps/engine-editor/website/examples/books/src/client/documents/documents.tsx", './documents', 'DocumentDetailContent', 'doc={props.doc}'],
  ["apps/engine-editor/website/examples/books/src/client/documents/sales-settlement.tsx", "../entity-pick", 'EntityPick', 'onCreated={props.created}'],
  ['apps/example/src/view.tsx', '@dschz/solid-uplot', 'SolidUplot', 'axes={[{label: props.unit}]}'],
  ['apps/engine-editor/website/src/client/commerce-fields.tsx', './commerce-fields', 'CommerceField', 'path={[...props.path, props.key]}'],
  ["apps/engine-editor/website/examples/books/src/client/documents/document-evidence.tsx", './document-evidence', 'EvidencePanel', 'target={{entryId: props.id}}'],
  ['apps/engine-editor/src/components/selection-inspector.tsx', './selection-inspector', 'ActionButton', 'data={{componentId: props.id}}'],
  ['apps/engine-editor/src/components/assets/asset-inspector.tsx', './asset-inspector', 'AssetAction', 'item={{label: props.label, data: {assetId: props.id}}}'],
])('precise %s -> %s/%s contract', (file, module, component, attributes) => {
  const mount = (extra: string) => `import { ${component} as Control } from '${module}'; function Parent(props: Props) { return <Control ${attributes} ${extra}/>; }`;
  expect(props(file, mount(''))).toEqual([]);
  for (const attribute of ['workspace', 'selection', 'currentScope', 'refresh', 'controller', 'store']) {
    expect(props(file, mount(`${attribute}={props.dependency}`))).toHaveLength(1);
  }
  expect(props(file, mount('unreviewed={props.extra}'))).toHaveLength(1);
  expect(props(file, mount('{...props}'))).toHaveLength(1);
});

test('terminal lazy adapters retain only reviewed renderer identity inputs', () => {
  for (const file of ['terminal-pane', 'terminal-drawer']) {
    const source = `const XtermRenderer = lazySurface('terminal', load); function Pane(props: Props) { return <>
      <XtermRenderer sessionId={props.id} projectId={props.project} sessionCwd={props.cwd}/>
      <XtermRenderer controller={props.controller} store={props.store}/>
      <UnknownRenderer sessionId={props.id}/></>; }`;
    expect(props(`apps/harness/ui/src/terminal/${file}.tsx`, source)).toHaveLength(3);
    expect(props('apps/example/src/view.tsx', source)).toHaveLength(6);
  }
});

test('nested named imports preserve the actual public object and member path', () => {
  const file = 'apps/pad-pilot/ui/src/modules/fx/components/fx-node-card.tsx';
  const source = `import { PadPilot as UI } from '../../../padpilot/index'; function Card(props: Props) { return <>
    <UI.DraggableCard isPlaceholder={props.placeholder} subtitle={props.subtitle}/>
    <UI.Button tooltip={props.tooltip} icon={props.icon}/><UI.ButtonGroup.Item tooltip={props.tooltip}/>
    <UI.DraggableCard controller={props.controller}/><UI.Unknown subtitle={props.subtitle}/></>; }`;
  expect(props(file, source)).toHaveLength(2);
});

test('framework namespaces have exact flow contracts; provider suffixes and UI directories confer no exemption', () => {
  const source = `import * as Solid from 'solid-js'; import { Unknown } from '@hyperfocus/ui';
    import { Feature } from '../../../packages/ui/src/feature'; function Parent(props: Props) { return <>
    <Solid.For each={props.rows}/><Solid.Show when={props.open}/><Scope.Provider value={props.scope}/>
    <Scope.Provider controller={props.controller}/><Unknown selection={props.selection}/>
    <Feature store={props.store}/><Solid.For workspace={props.workspace}/><scope.Provider controller={props.controller}/></>; }`;
  expect(props('apps/example/src/view.tsx', source)).toHaveLength(5);
});

test('ordinary domain actions and resource injection remain findings at reviewed rendering boundaries', () => {
  expect(props('apps/harness/ui/src/components/background-jobs-panel.tsx',
    'function NextRunContent(props: Props) { return <SchedulerWarningContent text={props.text} retry={props.retry}/>; }')).toHaveLength(1);
  expect(props('apps/harness/ui/src/components/swarm/swarm-launcher.tsx',
    "import { HarnessSwarmDialog } from './swarm-dialog'; function Launcher(props: Props) { return <HarnessSwarmDialog controller={props.controller} session={props.session}/>; }")).toHaveLength(2);
});

test('the declared inspector identity boundary is precise to its owning implementation', () => {
  const source = `import { SelectionInspector } from './components/selection-inspector'; function Shell(props: Props) {
    return <SelectionInspector project={props.project} selection={props.selection} controller={props.controller}/>; }`;
  expect(props('apps/engine-editor/src/editor-shell-view.tsx', source)).toHaveLength(1);
  expect(props('apps/example/src/view.tsx', source)).toHaveLength(3);
});

test('control spreads require the exact caller, target and parameter payload', () => {
  const model = "import { FavoriteSelectControl } from '@hyperfocus/ui'; function ModelSelect(props: Props) { return <FavoriteSelectControl {...props}/>; }";
  expect(props('apps/harness/ui/src/components/models/model-select.tsx', model)).toEqual([]);
  expect(props('apps/example/src/view.tsx', model)).toHaveLength(1);
  const file = 'apps/harness/ui/src/components/primitives/dropdown.tsx';
  expect(props(file, dropdownSpreadFixture('props.dataAttributes'))).toEqual([]);
  expect(props(file, dropdownSpreadFixture('props'))).toHaveLength(1);
  expect(props(file, dropdownSpreadFixture('props.feature'))).toHaveLength(1);
  expect(props('apps/example/src/view.tsx', dropdownSpreadFixture('props.dataAttributes'))).toHaveLength(1);
  expect(props('packages/ui/src/primitives/selection/select-control.tsx',
    'function SelectControl(props: Props) { const model = props.controller; return <SelectControlContent {...model}/>; }')).toHaveLength(1);
  const controlFile = 'packages/ui/src/primitives/selection/select-control.tsx';
  expect(props(controlFile,
    'type Props = { controller: Controller }; function SelectControl(props: Props) { return <SelectControlContent {...props}/>; }')).toHaveLength(1);
  expect(props(controlFile,
    'function SelectControlContent(props: { workspace: Workspace }) { return null; } function SelectControl(props: Parameters<typeof SelectControlContent>[0]) { return <SelectControlContent {...props}/>; }')).toHaveLength(1);
});

test.each([
  ['packages/ui/src/primitives/selection/select-control.tsx', 'SelectControl', 'SelectControlContent'],
  ["apps/engine-editor/website/examples/books/src/client/documents/document-editor.tsx", 'DocumentEditor', 'DocumentDraft'],
  ["apps/engine-editor/website/examples/books/src/client/documents/documents.tsx", 'DocumentDetail', 'DocumentDetailContent'],
  ['apps/engine-editor/website/examples/books/src/client/entity-editor.tsx', 'SetupForm', 'SetupDraft'],
  ['apps/engine-editor/website/examples/books/src/client/entity-maintenance.tsx', 'EntityMaintenance', 'MaintenanceForm'],
  ["apps/engine-editor/website/examples/books/src/client/transactions/entry-editor.tsx", 'EntryEditor', 'EntryDraft'],
  ["apps/engine-editor/website/examples/books/src/client/transactions/entry-editor.tsx", 'EntryDetail', 'EntryDetailDraft'],
  ['apps/engine-editor/website/examples/books/src/client/items/item-editor.tsx', 'ItemEditor', 'ItemDraft'],
  ['apps/engine-editor/website/examples/books/src/client/reconciliation/editor.tsx', 'ReconciliationEditor', 'ReconciliationDraft'],
  ["apps/engine-editor/website/examples/books/src/client/documents/sales-receipts.tsx", 'SalesReceiptDetail', 'SalesReceiptDetailDraft'],
  ['apps/engine-editor/website/examples/books/src/client/components.tsx', 'Table', 'TablePage'],
  ['apps/engine-editor/website/src/client/commerce-fields.tsx', 'CommerceField', 'CommerceLeaf'],
  ['apps/engine-editor/src/app/input-map-editor.tsx', 'InputMapEditor', 'InputMapContent'],
])('spread contract requires its exact owner and implementation: %s', (file, owner, implementation) => {
  const mount = (name: string) => `function ${name}(props: Props) { return <${implementation} {...props}/>; }`;
  expect(props(file, mount(owner))).toEqual([]);
  expect(props(file, mount('OtherFeature'))).toHaveLength(1);
  expect(props('apps/example/src/feature.tsx', mount(owner))).toHaveLength(1);
  expect(props(file, `function ${owner}(props: Props) { return <OtherFeature {...props}/>; }`)).toHaveLength(1);
});
