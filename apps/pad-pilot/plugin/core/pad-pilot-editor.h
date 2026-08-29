#pragma once

#include <optional>
#include <thread>
#include <unordered_map>

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_gui_extra/juce_gui_extra.h>

#include "runtime/managed-file-store.h"
#include "runtime/runtime-types.h"

class PadPilotAudioProcessor;

class PadPilotEditor final : public juce::AudioProcessorEditor,
                             private juce::FileDragAndDropTarget,
                             private juce::Timer {
 public:
  explicit PadPilotEditor(PadPilotAudioProcessor& processor);
  ~PadPilotEditor() override;

  void paint(juce::Graphics& graphics) override;
  void resized() override;
  void parentHierarchyChanged() override;
  void visibilityChanged() override;
  bool isInterestedInFileDrag(const juce::StringArray& files) override;
  void filesDropped(const juce::StringArray& files, int x, int y) override;

 private:
  struct BridgeBrowser;
  struct LoadingOverlay;
  struct AuthorizedFileImport {
    double expiresAtMs {0.0};
    juce::String canonicalPath;
  };
  struct PendingFileImport {
    std::string category;
    juce::MemoryBlock data;
    std::uint64_t expectedBytes {0};
    double lastActivityMs {0.0};
    std::uint64_t maxBytes {0};
    juce::String mimeType;
    juce::String sourceName;
  };
  juce::WebBrowserComponent::Options makeBrowserOptions();

  void activateWebUiIfShowing();
  void ensureBrowserCreated();
  void releaseBrowser();
  bool delegateUnhandledShortcut(const juce::var& payload);
  juce::String mapWebViewPoint(const juce::var& request) const;
  bool onBrowserNavigate(const juce::String& newURL);
  void onBrowserPageFinishedLoading(const juce::String& loadedURL);
  bool onBrowserNetworkError(const juce::String& errorInfo);
  void timerCallback() override;
  void resetPublishedRealtimeState();
  void sendStateToWebUi();
  void sendRealtimeStateToWebUi();
  void sendHostSyncFrameToWebUi();
  void sendNavigationFrameToWebUi();
  void sendActiveModuleStateFrameToWebUi(bool force = false);
  void sendInputStateFrameToWebUi(bool force = false);
  void sendVisualizerFrameToWebUi();
  void sendCapabilityFrameToWebUi(bool force = false);
  void sendRuntimeDiagnosticsToWebUi();
  void handleBridgeMessage(const juce::var& message);
  void loadWebUi();
  void beginAnalyzerMidiDrag();
  void beginMidiDragFromBytes(const juce::String& filename, const juce::String& midiBase64);
  void beginMidiDragForFile(const juce::File& targetFile, const juce::String& failureMessage);
  void beginAnalyzerMidiSave();
  void beginAnalyzerEditorCollapse();
  void endAnalyzerEditorCollapse();
  bool isSupportedSampleFile(const juce::String& path) const;
  bool shouldHandleRecutSampleInput() const;
  void publishImportedSample(const padpilot::ManagedFileRecord& file);
  juce::String beginFileImport(const juce::String& requestJson);
  void pruneExpiredFileImports();
  juce::String appendFileImport(const juce::String& importId, const juce::String& payloadBase64);
  juce::String finishFileImport(const juce::String& importId);
  juce::String cancelFileImport(const juce::String& importId);
  juce::String importFilePath(const juce::String& requestJson);
  void authorizeFileImportPath(const juce::File& file);
  std::optional<juce::String> consumeAuthorizedFileImportPath(const juce::String& path);
  void pruneExpiredAuthorizedFileImports();

  PadPilotAudioProcessor& processor_;
  std::unique_ptr<BridgeBrowser> browser_;
  std::unique_ptr<LoadingOverlay> loadingOverlay_;
  juce::Label statusLabel_;
  std::unique_ptr<juce::FileChooser> moduleBundleChooser_ {};
  std::unique_ptr<juce::FileChooser> hostFilePickerChooser_ {};
  std::unique_ptr<juce::FileChooser> analyzerMidiSaveChooser_ {};
  std::jthread stageUpdateThread_ {};
  bool stageUpdateInProgress_ {false};
  bool shuttingDown_ {false};
  bool webUiLoadStarted_ {false};
  bool webUiLoaded_ {false};
  bool webView2Supported_ {true};
  bool diagnosticsVisible_ {false};
  bool analyzerCollapseActive_ {false};
  int ticksSinceLoad_ {0};
  juce::String lastPublishedActiveModuleStatePayload_;
  juce::String lastPublishedInputStatePayload_;
  juce::String lastPublishedCapabilityFramePayload_;
  juce::String stagedUpdateStatePath_;
  juce::Rectangle<int> analyzerExpandedBounds_;
  juce::File analyzerDragMidiFile_;
  std::uint32_t samplePathSelectionSequence_ {0};
  std::unordered_map<std::string, PendingFileImport> pendingFileImports_;
  std::unordered_map<std::string, AuthorizedFileImport> authorizedFileImports_;
};
