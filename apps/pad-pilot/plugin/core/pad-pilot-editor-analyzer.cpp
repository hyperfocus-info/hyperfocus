#include "core/pad-pilot-editor-internal.h"

using namespace padpilot::editor_detail;

void PadPilotEditor::beginAnalyzerMidiDrag() {
  auto targetFile = juce::File::getSpecialLocation(juce::File::tempDirectory)
                        .getChildFile("padpilot-analyzer-" + juce::Uuid().toString() + ".mid");
  juce::String errorMessage;
  if (!processor_.writeAnalyzerMidiFile(targetFile.getFullPathName().toStdString(), errorMessage)) {
    statusLabel_.setText(errorMessage.isNotEmpty() ? errorMessage : "Analyzer MIDI export failed.", juce::dontSendNotification);
    statusLabel_.setVisible(true);
    return;
  }

  beginMidiDragForFile(targetFile, "Unable to start analyzer MIDI drag.");
}

void PadPilotEditor::beginMidiDragFromBytes(const juce::String& filename, const juce::String& midiBase64) {
  if (filename.length() > kMaxMidiFilenameChars ||
      static_cast<std::size_t>(midiBase64.length()) > kMaxMidiPayloadBase64Chars) {
    statusLabel_.setText("Generated MIDI payload exceeded its size limit.", juce::dontSendNotification);
    statusLabel_.setVisible(true);
    return;
  }

  std::string bytes;
  if (!padpilot::proto::base64ToBytes(midiBase64.toStdString(), &bytes) || bytes.empty() ||
      bytes.size() > kMaxMidiPayloadBytes) {
    statusLabel_.setText("Generated MIDI payload is invalid.", juce::dontSendNotification);
    statusLabel_.setVisible(true);
    return;
  }
  juce::MemoryInputStream midiInput(bytes.data(), bytes.size(), false);
  juce::MidiFile midiFile;
  if (!midiFile.readFrom(midiInput)) {
    statusLabel_.setText("Generated MIDI payload is not a valid MIDI file.", juce::dontSendNotification);
    statusLabel_.setVisible(true);
    return;
  }

  auto safeFilename = juce::File::createLegalFileName(filename.isNotEmpty() ? filename : "padpilot-generated.mid");
  if (!safeFilename.endsWithIgnoreCase(".mid")) {
    safeFilename += ".mid";
  }

  auto targetFile = juce::File::getSpecialLocation(juce::File::tempDirectory)
                        .getChildFile("padpilot-generated-" + juce::Uuid().toString() + "-" + safeFilename);
  if (!targetFile.replaceWithData(bytes.data(), bytes.size())) {
    statusLabel_.setText("Generated MIDI drag file could not be written.", juce::dontSendNotification);
    statusLabel_.setVisible(true);
    return;
  }

  beginMidiDragForFile(targetFile, "Unable to start generated MIDI drag.");
}

void PadPilotEditor::beginMidiDragForFile(const juce::File& targetFile, const juce::String& failureMessage) {
  analyzerDragMidiFile_ = targetFile;
  const juce::StringArray files { analyzerDragMidiFile_.getFullPathName() };
  auto safeThis = juce::Component::SafePointer<PadPilotEditor>(this);
  const auto dragStarted = juce::DragAndDropContainer::performExternalDragDropOfFiles(
      files,
      false,
      this,
      [safeThis]() {
        juce::MessageManager::callAsync([safeThis]() {
          if (safeThis == nullptr) {
            return;
          }
          safeThis->endAnalyzerEditorCollapse();
        });
      });

  if (!dragStarted) {
    analyzerDragMidiFile_.deleteFile();
    statusLabel_.setText(failureMessage, juce::dontSendNotification);
    statusLabel_.setVisible(true);
    return;
  }

  beginAnalyzerEditorCollapse();
}

void PadPilotEditor::beginAnalyzerMidiSave() {
  auto initialDirectory = juce::File::getSpecialLocation(juce::File::userDocumentsDirectory);
  analyzerMidiSaveChooser_ = std::make_unique<juce::FileChooser>(
      "Save analyzer MIDI",
      initialDirectory.getChildFile("padpilot-analyzer.mid"),
      "*.mid");
  auto safeThis = juce::Component::SafePointer<PadPilotEditor>(this);
  analyzerMidiSaveChooser_->launchAsync(
      juce::FileBrowserComponent::saveMode | juce::FileBrowserComponent::canSelectFiles | juce::FileBrowserComponent::warnAboutOverwriting,
      [safeThis](const juce::FileChooser& chooser) {
        if (safeThis == nullptr || safeThis->shuttingDown_) {
          return;
        }
        const auto selected = chooser.getResult();
        if (!selected.getFullPathName().isNotEmpty()) {
          return;
        }

        juce::String errorMessage;
        if (!safeThis->processor_.writeAnalyzerMidiFile(selected.getFullPathName().toStdString(), errorMessage)) {
          safeThis->statusLabel_.setText(
              errorMessage.isNotEmpty() ? errorMessage : "Analyzer MIDI save failed.",
              juce::dontSendNotification);
          safeThis->statusLabel_.setVisible(true);
        }
      });
}

void PadPilotEditor::beginAnalyzerEditorCollapse() {
  if (analyzerCollapseActive_) {
    return;
  }

  analyzerCollapseActive_ = true;
  analyzerExpandedBounds_ = getBounds();
  setResizeLimits(400, 0, 1600, 1000);
  if (browser_ != nullptr) {
    browser_->setVisible(false);
  }
  if (loadingOverlay_ != nullptr) {
    loadingOverlay_->setVisible(false);
  }
  statusLabel_.setText("MIDI drag active...", juce::dontSendNotification);
  statusLabel_.setVisible(true);

  const auto width = juce::jmax(1, analyzerExpandedBounds_.getWidth());
  setSize(width, 0);
  if (getHeight() > 0) {
    setSize(width, 28);
  }
}

void PadPilotEditor::endAnalyzerEditorCollapse() {
  if (!analyzerCollapseActive_) {
    return;
  }

  analyzerCollapseActive_ = false;
  const auto restoreWidth = juce::jmax(400, analyzerExpandedBounds_.getWidth());
  const auto restoreHeight = juce::jmax(250, analyzerExpandedBounds_.getHeight());
  setResizeLimits(400, 250, 1600, 1000);
  setSize(restoreWidth, restoreHeight);
  if (browser_ != nullptr && webUiLoaded_) {
    browser_->setVisible(true);
  }
  statusLabel_.setVisible(!webUiLoaded_);
  if (analyzerDragMidiFile_.existsAsFile()) {
    analyzerDragMidiFile_.deleteFile();
  }
}

