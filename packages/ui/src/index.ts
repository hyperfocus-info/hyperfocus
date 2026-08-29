export { ChatComposer, type ChatComposerProps, type ComposerOption } from "./composer/chat-composer";export {
  ActionMenu,
  MenuItem,
  type ActionMenuProps,
  type ActionMenuTriggerState,
  type MenuItemProps,
} from "./primitives/action-menu";
export { Button } from "./primitives/button";
export { ButtonGroup, type ButtonGroupItem } from "./primitives/button-group";
export {
  CoachmarkTour,
  canContinueCoachmark,
  type CoachmarkCloseReason,
  type CoachmarkStep,
} from "./primitives/coachmark-tour";
export { Dialog } from "./primitives/dialog";
export { installDomTooltips } from "./primitives/dom-tooltip";
export {
  EmptyState,
  PanelHeader,
  PanelSection,
  PanelSurface,
  type EmptyStateProps,
  type PanelHeaderProps,
  type PanelSectionProps,
  type PanelSurfaceProps,
} from "./primitives/panel";
export { Popover, type PopoverState } from "./primitives/popover";
export {
  SegmentedControl,
  type SegmentedControlOption,
  type SegmentedControlProps,
} from "./primitives/segmented-control";
export { StatusChip, type StatusTone } from "./primitives/status-chip";
export {
  Tab,
  TabList,
  TabPanel,
  Tabs,
  type TabListProps,
  type TabPanelProps,
  type TabProps,
  type TabsActivationMode,
  type TabsOrientation,
  type TabsProps,
} from "./primitives/tabs";
export { Toaster, createToastStore, type ToastMessage } from "./primitives/toast";
export { TreeItem, TreeRoot, type TreeItemProps, type TreeRootProps } from "./primitives/tree";
export { Tooltip } from "./primitives/tooltip";export {
  filterPreferences,
  normalizePreferenceValue,
  normalizePreferenceValues,
  type PreferenceControl,
  type PreferenceDefinition,
  type PreferenceOption,
  type PreferenceScope,
  type PreferenceSectionDefinition,
  type PreferenceValue,
  type PreferenceValues,
} from "./preferences/model";
export { PreferenceRow, PreferencesSurface } from "./preferences/preferences";
export {
  HYPERFOCUS_SHARED_USER_PREFERENCES_KEY,
  defaultHyperfocusSharedUserPreferences,
  normalizeHyperfocusSharedUserPreferences,
  readHyperfocusSharedUserPreferences,
  writeHyperfocusSharedUserPreferences,
  type HyperfocusSharedUserPreferences,
} from "./preferences/storage";export {
  createSourceDocument,
  type SourceDiagnostic,
  type SourceDocument,
  type SourceDocumentOptions,
  type SourceDocumentSnapshot,
} from "./source-editor/document";
export { SourceEditor } from "./source-editor/source-editor";export { TerminalSurface } from "./terminal/terminal-surface";export { ChatTranscript, type ChatTranscriptProps, type TranscriptMessage } from "./transcript/chat-transcript";export {
  defaultWorkbenchLayout,
  normalizeWorkbenchLayout,
  parseWorkbenchLayout,
  resetWorkbenchPanel,
  resizeWorkbenchPanel,
  serializeWorkbenchLayout,
  toggleWorkbenchPanel,
  workbenchPanelLimits,
  type WorkbenchLayout,
  type WorkbenchPanelId,
} from "./workbench/layout";
export {
  assertPanelLayoutDescriptors,
  normalizePanelGroupLayout,
  resetPanelGroupPanel,
  resizePanelGroupPanel,
  togglePanelGroupPanel,
  type PanelAxis,
  type PanelCollapseMode,
  type PanelGroupLayout,
  type PanelGroupLayoutInput,
  type PanelLayoutDescriptor,
  type PanelLayoutValue,
} from "./workbench/panel-group-layout";
export {
  PanelGroup,
  type PanelDescriptor,
  type PanelGroupLayoutChangeReason,
  type PanelGroupProps,
  type PanelNarrowMode,
  type PanelResizeHandle,
} from "./workbench/panel-group";
export {
  WorkbenchShell,
  type WorkbenchLayoutChangeReason,
  type WorkbenchShellApi,
  type WorkbenchShellProps,
} from "./workbench/workbench";
