#include "runtime/recut-runtime.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <functional>
#include <limits>
#include <numeric>
#include <utility>

#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_cryptography/juce_cryptography.h>
#include <juce_dsp/juce_dsp.h>

#include "runtime/backend-log.h"
#include "runtime/base64.h"
#include "runtime/finite-math.h"
#include "runtime/managed-file-store.h"
#include "runtime/storage-path-safety.h"

namespace {
using padpilot::finiteClamped;

constexpr float kMinConfidence = 0.08f;
constexpr std::uint32_t kAnalysisWindowSize = 1024;
constexpr std::uint32_t kAnalysisHopSize = 256;
constexpr std::uint32_t kPeakBins = 2048;
constexpr std::uint32_t kMinimumSliceSpacing = 512;
constexpr float kDefaultFadeMs = 4.0f;
constexpr float kReleaseFadeMs = 8.0f;
constexpr float kAutoMinAdmissionRatio = 0.10f;
constexpr float kAutoMaxAdmissionRatio = 0.75f;
constexpr std::size_t kBucketCount = 16;
constexpr std::uint64_t kMaxDecodedAudioBytes = 256ULL * 1024ULL * 1024ULL;
constexpr std::array<const char*, 4> kFaceButtons {"X", "Y", "A", "B"};
constexpr std::size_t kMaxFaceButtonBytes = 16;
constexpr std::size_t kMaxChokeGroupNameBytes = 64;
constexpr std::size_t kMaxSampleHandleBytes = 256;
constexpr std::size_t kMaxSourceNameBytes = 255;
constexpr std::uint32_t kMaxAccentHue = 360;
constexpr float kMaxMarkerFadeMs = 1000.0f;
constexpr float kMaxMarkerNudgeFrames = 1000000.0f;

bool isValidAnalysisMode(const int value) {
  return value >= static_cast<int>(padpilot::capability::SAMPLE_ANALYSIS_MODE_AUTO) &&
         value <= static_cast<int>(padpilot::capability::SAMPLE_ANALYSIS_MODE_CUSTOM);
}

bool isValidBpmSource(const int value) {
  return value >= static_cast<int>(padpilot::capability::SAMPLE_BPM_SOURCE_NONE) &&
         value <= static_cast<int>(padpilot::capability::SAMPLE_BPM_SOURCE_USER);
}

bool isValidEditType(const int value) {
  return value >= static_cast<int>(padpilot::capability::SLICE_EDIT_TYPE_UNKNOWN) &&
         value <= static_cast<int>(padpilot::capability::SLICE_EDIT_TYPE_REGENERATE_SLICES);
}

template <typename Marker>
bool isValidSliceMarker(const Marker& marker, const std::uint64_t sourceLength = 0) {
  if (!std::isfinite(marker.confidence()) || !std::isfinite(marker.fade_ms()) ||
      marker.start_frame() > marker.end_frame() ||
      marker.transient_frame() < marker.start_frame() ||
      marker.transient_frame() > marker.end_frame() ||
      marker.pad_index() >= padpilot::RecutRuntime::kMaxSlices ||
      marker.choke_group_id() >= padpilot::RecutRuntime::kMaxSlices) {
    return false;
  }
  return sourceLength == 0 ||
         (marker.start_frame() < sourceLength &&
          marker.end_frame() < sourceLength &&
          marker.transient_frame() < sourceLength);
}

template <typename Assignment>
bool isValidPadAssignment(const Assignment& assignment) {
  return assignment.pad_index() < padpilot::RecutRuntime::kMaxSlices &&
         assignment.bank() < 4 &&
         assignment.slice_index() < padpilot::RecutRuntime::kMaxSlices &&
         assignment.choke_group_id() < padpilot::RecutRuntime::kMaxSlices &&
         assignment.face_button().size() <= kMaxFaceButtonBytes;
}

template <typename Group>
bool isValidChokeGroup(const Group& group) {
  return group.id() < padpilot::RecutRuntime::kMaxSlices &&
         group.name().size() <= kMaxChokeGroupNameBytes;
}

float clampOptionalBpm(const float value, const float fallback = 0.0f) {
  if (!std::isfinite(value)) {
    return fallback;
  }
  return value > 0.0f ? std::clamp(value, 20.0f, 400.0f) : 0.0f;
}

template <typename SourceMarker, typename DestinationMarker>
void copySliceMarker(const SourceMarker& source,
                     DestinationMarker* destination,
                     const std::uint64_t sourceLength = 0) {
  const auto maxFrame = sourceLength == 0
      ? std::numeric_limits<std::uint32_t>::max()
      : static_cast<std::uint32_t>(std::min<std::uint64_t>(
            sourceLength - 1,
            std::numeric_limits<std::uint32_t>::max()));
  const auto startFrame = std::min(source.start_frame(), maxFrame);
  const auto endFrame = std::max(startFrame, std::min(source.end_frame(), maxFrame));
  destination->set_start_frame(startFrame);
  destination->set_end_frame(endFrame);
  destination->set_transient_frame(std::clamp(source.transient_frame(), startFrame, endFrame));
  destination->set_confidence(finiteClamped(source.confidence(), 0.0f, 1.0f, 0.0f));
  destination->set_pad_index(source.pad_index());
  destination->set_choke_group_id(source.choke_group_id());
  destination->set_fade_ms(finiteClamped(source.fade_ms(), 0.0f, kMaxMarkerFadeMs, kDefaultFadeMs));
  destination->set_snap_exact(source.snap_exact());
}

void copyMutableAnalysisSettings(const padpilot::recut::RecutModuleState& source,
                                 padpilot::recut::RecutModuleState* destination) {
  destination->set_analysis_mode(source.analysis_mode());
  destination->set_bpm_value(source.bpm_value());
  destination->set_bpm_source(source.bpm_source());
  destination->set_bpm_confidence(source.bpm_confidence());
  destination->set_bpm_suggested_value(source.bpm_suggested_value());
  destination->set_bpm_suggested_confidence(source.bpm_suggested_confidence());
  destination->set_density(source.density());
  destination->set_manual_edit_revision(source.manual_edit_revision());
  destination->set_project_bpm_snapshot(source.project_bpm_snapshot());
  destination->mutable_choke_groups()->CopyFrom(source.choke_groups());
}

void copyMutableLoadState(const padpilot::recut::RecutModuleState& source,
                          padpilot::recut::RecutModuleState* destination) {
  copyMutableAnalysisSettings(source, destination);
  destination->clear_slice_markers();
  for (const auto& marker : source.slice_markers()) {
    copySliceMarker(marker, destination->add_slice_markers(), destination->length_frames());
  }
  destination->mutable_pad_assignments()->CopyFrom(source.pad_assignments());
}

bool isValidAnalysisRequest(const padpilot::capability::SampleAnalysisRequest& request,
                            const std::uint64_t sourceLength) {
  if (!isValidAnalysisMode(static_cast<int>(request.analysis_mode())) ||
      !std::isfinite(request.density()) ||
      !std::isfinite(request.requested_bpm()) ||
      !std::isfinite(request.project_bpm()) ||
      request.manual_markers_size() > static_cast<int>(padpilot::RecutRuntime::kMaxSlices) ||
      request.max_slice_count() > padpilot::RecutRuntime::kMaxSlices) {
    return false;
  }
  return std::all_of(
      request.manual_markers().begin(),
      request.manual_markers().end(),
      [sourceLength](const auto& marker) { return isValidSliceMarker(marker, sourceLength); });
}

bool isValidPlaybackState(const padpilot::capability::SlicePlaybackState& state,
                          const std::uint64_t sourceLength) {
  if (state.sample_handle().size() > kMaxSampleHandleBytes ||
      !isValidAnalysisMode(static_cast<int>(state.analysis_mode())) ||
      !isValidBpmSource(static_cast<int>(state.bpm_source())) ||
      !std::isfinite(state.pitch_semitones()) ||
      !std::isfinite(state.gain_db()) ||
      !std::isfinite(state.grain_size_ms()) ||
      !std::isfinite(state.grain_density()) ||
      !std::isfinite(state.density()) ||
      !std::isfinite(state.bpm_value()) ||
      !std::isfinite(state.bpm_confidence()) ||
      !std::isfinite(state.bpm_suggested_value()) ||
      !std::isfinite(state.bpm_suggested_confidence()) ||
      !std::isfinite(state.project_bpm()) ||
      state.slice_markers_size() > static_cast<int>(padpilot::RecutRuntime::kMaxSlices) ||
      state.pad_assignments_size() > static_cast<int>(padpilot::RecutRuntime::kMaxSlices) ||
      state.choke_groups_size() > static_cast<int>(padpilot::RecutRuntime::kMaxSlices)) {
    return false;
  }
  return std::all_of(
             state.slice_markers().begin(),
             state.slice_markers().end(),
             [sourceLength](const auto& marker) { return isValidSliceMarker(marker, sourceLength); }) &&
         std::all_of(
             state.pad_assignments().begin(),
             state.pad_assignments().end(),
             [](const auto& assignment) { return isValidPadAssignment(assignment); }) &&
         std::all_of(
             state.choke_groups().begin(),
             state.choke_groups().end(),
             [](const auto& group) { return isValidChokeGroup(group); });
}

bool isValidPersistedState(const padpilot::recut::RecutModuleState& state) {
  if (state.schema_version() != 1 ||
      state.source_name().size() > kMaxSourceNameBytes ||
      !isValidAnalysisMode(static_cast<int>(state.analysis_mode())) ||
      !isValidBpmSource(static_cast<int>(state.bpm_source())) ||
      !std::isfinite(state.pitch_semitones()) ||
      !std::isfinite(state.gain_db()) ||
      !std::isfinite(state.grain_size_ms()) ||
      !std::isfinite(state.grain_density()) ||
      !std::isfinite(state.density()) ||
      !std::isfinite(state.bpm_value()) ||
      !std::isfinite(state.bpm_confidence()) ||
      !std::isfinite(state.bpm_suggested_value()) ||
      !std::isfinite(state.bpm_suggested_confidence()) ||
      !std::isfinite(state.project_bpm_snapshot()) ||
      state.slice_markers_size() > static_cast<int>(padpilot::RecutRuntime::kMaxSlices) ||
      state.pad_assignments_size() > static_cast<int>(padpilot::RecutRuntime::kMaxSlices) ||
      state.choke_groups_size() > static_cast<int>(padpilot::RecutRuntime::kMaxSlices)) {
    return false;
  }
  return std::all_of(
             state.slice_markers().begin(),
             state.slice_markers().end(),
             [&state](const auto& marker) { return isValidSliceMarker(marker, state.length_frames()); }) &&
         std::all_of(
             state.pad_assignments().begin(),
             state.pad_assignments().end(),
             [](const auto& assignment) { return isValidPadAssignment(assignment); }) &&
         std::all_of(
             state.choke_groups().begin(),
             state.choke_groups().end(),
             [](const auto& group) { return isValidChokeGroup(group); });
}

void sanitizePersistedState(padpilot::recut::RecutModuleState* state) {
  state->set_pitch_semitones(finiteClamped(state->pitch_semitones(), -48.0f, 48.0f, 0.0f));
  state->set_gain_db(finiteClamped(state->gain_db(), -96.0f, 24.0f, 0.0f));
  state->set_grain_size_ms(finiteClamped(state->grain_size_ms(), 1.0f, 1000.0f, 28.0f));
  state->set_grain_density(finiteClamped(state->grain_density(), 0.0f, 1.0f, 0.62f));
  state->set_density(finiteClamped(state->density(), 0.0f, 1.0f, 0.5f));
  state->set_bpm_value(clampOptionalBpm(state->bpm_value()));
  state->set_bpm_confidence(finiteClamped(state->bpm_confidence(), 0.0f, 1.0f, 0.0f));
  state->set_bpm_suggested_value(clampOptionalBpm(state->bpm_suggested_value()));
  state->set_bpm_suggested_confidence(
      finiteClamped(state->bpm_suggested_confidence(), 0.0f, 1.0f, 0.0f));
  state->set_project_bpm_snapshot(clampOptionalBpm(state->project_bpm_snapshot(), 120.0f));
  for (auto& marker : *state->mutable_slice_markers()) {
    marker.set_confidence(finiteClamped(marker.confidence(), 0.0f, 1.0f, 0.0f));
    marker.set_fade_ms(finiteClamped(marker.fade_ms(), 0.0f, kMaxMarkerFadeMs, kDefaultFadeMs));
  }
  for (auto& group : *state->mutable_choke_groups()) {
    group.set_accent_hue(std::min(group.accent_hue(), kMaxAccentHue));
  }
  if (state->source_path().empty()) {
    state->set_loaded(false);
  }
}

std::size_t targetSliceCountForDensity(const padpilot::recut::RecutAnalysisMode mode, float density) {
  const auto clampedDensity = finiteClamped(density, 0.0f, 1.0f, 0.5f);
  if (mode == padpilot::recut::RECUT_ANALYSIS_MODE_BPM) {
    if (clampedDensity >= 0.75f) {
      return 16;
    }
    if (clampedDensity >= 0.25f) {
      return 8;
    }
    return 4;
  }

  return static_cast<std::size_t>(kBucketCount);
}

float medianOfValues(std::vector<float> values) {
  if (values.empty()) {
    return 0.0f;
  }
  const auto middle = values.begin() + static_cast<std::ptrdiff_t>(values.size() / 2);
  std::nth_element(values.begin(), middle, values.end());
  return *middle;
}

float neighborhoodMedian(const std::vector<float>& values, std::size_t index, std::size_t radius) {
  if (values.empty()) {
    return 0.0f;
  }
  const auto start = index > radius ? index - radius : 0U;
  const auto end = std::min(values.size(), index + radius + 1);
  return medianOfValues(std::vector<float>(values.begin() + static_cast<std::ptrdiff_t>(start), values.begin() + static_cast<std::ptrdiff_t>(end)));
}

float autoAdmissionThreshold(const std::vector<padpilot::RecutRuntime::TransientCandidate>& candidates, float density) {
  if (candidates.empty()) {
    return std::numeric_limits<float>::infinity();
  }
  std::vector<float> intensities;
  intensities.reserve(candidates.size());
  for (const auto& candidate : candidates) {
    intensities.push_back(candidate.intensity);
  }
  std::sort(intensities.begin(), intensities.end(), std::greater<float>());
  const auto keepRatio = kAutoMinAdmissionRatio + juce::jlimit(0.0f, 1.0f, density) * (kAutoMaxAdmissionRatio - kAutoMinAdmissionRatio);
  const auto keepCount = std::max<std::size_t>(1, std::min<std::size_t>(intensities.size(), static_cast<std::size_t>(std::ceil(static_cast<double>(intensities.size()) * keepRatio))));
  return intensities[keepCount - 1];
}

std::vector<std::uint32_t> assignSparsePadIndices(const std::size_t count) {
  std::vector<std::uint32_t> padIndices;
  padIndices.reserve(count);
  if (count == 0) {
    return padIndices;
  }
  if (count == 1) {
    padIndices.push_back(0);
    return padIndices;
  }
  for (std::size_t index = 0; index < count; ++index) {
    const auto remaining = count - index - 1;
    const auto suggested = static_cast<std::uint32_t>(std::lround((static_cast<double>(index) * 15.0) / static_cast<double>(count - 1)));
    const auto lowerBound = index == 0 ? 0U : padIndices[index - 1] + 1;
    const auto upperBound = static_cast<std::uint32_t>(15 - remaining);
    padIndices.push_back(juce::jlimit(lowerBound, upperBound, suggested));
  }
  return padIndices;
}

bool isCandidateValidWithNeighbors(const std::vector<std::pair<std::size_t, padpilot::RecutRuntime::TransientCandidate>>& selections,
                                   const std::size_t slotIndex,
                                   const padpilot::RecutRuntime::TransientCandidate& candidate,
                                   const std::uint32_t closeThreshold) {
  std::vector<std::pair<std::size_t, padpilot::RecutRuntime::TransientCandidate>> updated;
  updated.reserve(selections.size());
  for (const auto& selection : selections) {
    if (selection.first != slotIndex) {
      updated.push_back(selection);
    }
  }
  updated.push_back({slotIndex, candidate});
  std::sort(updated.begin(), updated.end(), [](const auto& left, const auto& right) {
    return left.second.frame < right.second.frame;
  });
  const auto it = std::find_if(updated.begin(), updated.end(), [&](const auto& selection) { return selection.first == slotIndex; });
  if (it == updated.end()) {
    return false;
  }
  if (it != updated.begin()) {
    const auto& previous = *(it - 1);
    if (candidate.frame - previous.second.frame < closeThreshold) {
      return false;
    }
  }
  if (it + 1 != updated.end()) {
    const auto& next = *(it + 1);
    if (next.second.frame - candidate.frame < closeThreshold) {
      return false;
    }
  }
  return true;
}

padpilot::RecutRuntime::TransientCandidate findBorrowCandidate(
    const std::size_t bucketIndex,
    const std::vector<float>& bucketCenters,
    const std::vector<padpilot::RecutRuntime::TransientCandidate>& candidates,
    const std::vector<std::uint32_t>& usedFrames) {
  for (std::size_t radius = 1; radius < kBucketCount; ++radius) {
    std::vector<padpilot::RecutRuntime::TransientCandidate> ring;
    for (const auto& candidate : candidates) {
      if (std::find(usedFrames.begin(), usedFrames.end(), candidate.frame) != usedFrames.end()) {
        continue;
      }
      if (static_cast<std::size_t>(std::abs(static_cast<int>(candidate.bucketIndex) - static_cast<int>(bucketIndex))) == radius) {
        ring.push_back(candidate);
      }
    }
    if (ring.empty()) {
      continue;
    }
    std::sort(ring.begin(), ring.end(), [&](const auto& left, const auto& right) {
      if (left.intensity != right.intensity) {
        return left.intensity > right.intensity;
      }
      const auto leftDistance = std::abs(static_cast<float>(left.frame) - bucketCenters[bucketIndex]);
      const auto rightDistance = std::abs(static_cast<float>(right.frame) - bucketCenters[bucketIndex]);
      if (leftDistance != rightDistance) {
        return leftDistance < rightDistance;
      }
      return left.frame < right.frame;
    });
    return ring.front();
  }
  return {};
}

padpilot::capability::SampleSliceMarker toSampleSliceMarker(const padpilot::recut::SliceMarker& slice) {
  padpilot::capability::SampleSliceMarker marker;
  marker.set_start_frame(slice.start_frame());
  marker.set_end_frame(slice.end_frame());
  marker.set_transient_frame(slice.transient_frame());
  marker.set_confidence(slice.confidence());
  marker.set_pad_index(slice.pad_index());
  marker.set_choke_group_id(slice.choke_group_id());
  marker.set_fade_ms(slice.fade_ms());
  marker.set_snap_exact(slice.snap_exact());
  return marker;
}

padpilot::capability::SamplePadAssignment toSamplePadAssignment(const padpilot::recut::PadAssignment& assignment) {
  padpilot::capability::SamplePadAssignment sampleAssignment;
  sampleAssignment.set_pad_index(assignment.pad_index());
  sampleAssignment.set_bank(assignment.bank());
  sampleAssignment.set_face_button(assignment.face_button());
  sampleAssignment.set_slice_index(assignment.slice_index());
  sampleAssignment.set_choke_group_id(assignment.choke_group_id());
  sampleAssignment.set_is_empty(assignment.is_empty());
  return sampleAssignment;
}
}  // namespace

namespace padpilot {

bool RecutRuntime::isValidDecodedAudioMetadata(std::uint64_t channels,
                                               std::uint64_t frames,
                                               double sampleRate) noexcept {
  if (channels == 0 || channels > kMaxDecodedChannels || frames == 0 ||
      frames > static_cast<std::uint64_t>(std::numeric_limits<int>::max()) ||
      !std::isfinite(sampleRate) || sampleRate < kMinDecodedSampleRate ||
      sampleRate > kMaxDecodedSampleRate) {
    return false;
  }
  const auto maxDecodedFrames = kMaxDecodedAudioBytes / (sizeof(float) * (channels + 1));
  return frames <= maxDecodedFrames;
}

RecutRuntime::RecutRuntime(std::string managedMediaRootPath)
    : managedMediaRootPath_(std::move(managedMediaRootPath)),
      loaderThread_([this] { sourceLoaderLoop(); }) {}

RecutRuntime::~RecutRuntime() {
  release();
  {
    const std::lock_guard lock(loaderMutex_);
    loaderStopping_ = true;
    pendingSourceLoad_.reset();
  }
  loaderCondition_.notify_one();
  if (loaderThread_.joinable()) {
    loaderThread_.join();
  }

  publishedSource_.store(nullptr, std::memory_order_seq_cst);
  const std::lock_guard lock(stateMutex_);
  sourceOwner_.reset();
  retiredSources_.clear();
}

void RecutRuntime::prepare(double sampleRate, int samplesPerBlock, LockFreeQueue<HapticCommand, 256>& hapticQueue) {
  running_.store(false, std::memory_order_release);
  while (activeAudioReaders_.load(std::memory_order_acquire) != 0 ||
         activeQueueWriters_.load(std::memory_order_acquire) != 0) {
    std::this_thread::yield();
  }
  sampleRate_.store(std::max(1.0, sampleRate), std::memory_order_release);
  blockSize_.store(std::max(0, samplesPerBlock), std::memory_order_release);
  for (std::size_t index = 0; index < grainWindow_.size(); ++index) {
    const auto phase = static_cast<float>(index) /
                       static_cast<float>(grainWindow_.size() - 1);
    grainWindow_[index] = 0.5f - 0.5f * std::cos(
        phase * juce::MathConstants<float>::twoPi);
  }
  hapticQueue_.store(&hapticQueue, std::memory_order_release);
  resetPlaybackState();
  running_.store(true, std::memory_order_release);
}

void RecutRuntime::release() {
  running_.store(false, std::memory_order_release);
  while (activeAudioReaders_.load(std::memory_order_acquire) != 0 ||
         activeQueueWriters_.load(std::memory_order_acquire) != 0) {
    std::this_thread::yield();
  }
  loadGeneration_.fetch_add(1, std::memory_order_acq_rel);
  {
    const std::lock_guard lock(loaderMutex_);
    pendingSourceLoad_.reset();
  }
  publishSnapshot(nullptr);
  resetPlaybackState();
  hapticQueue_.store(nullptr, std::memory_order_release);
}

void RecutRuntime::setStreamActive(bool active) {
  streamActive_.store(active, std::memory_order_release);
}

bool RecutRuntime::isStreamActive() const noexcept {
  return streamActive_.load(std::memory_order_acquire);
}

bool RecutRuntime::loadSourceAsync(const std::string& path,
                                   const std::string& sourceName,
                                   const std::string& sourceContentId) {
  return enqueueSourceLoad(path, sourceName, sourceContentId);
}

bool RecutRuntime::enqueueSourceLoad(
    const std::string& path,
    const std::string& sourceName,
    const std::string& sourceContentId,
    std::optional<padpilot::recut::RecutModuleState> restoredState) {
  const auto file = juce::File(path);
  appendBackendLog(
      "recut-runtime",
      "loadSourceAsync path=" + path +
          " sourceName=" + sourceName +
          " sourceContentId=" + sourceContentId);
  if (!file.existsAsFile() && !restoredState.has_value()) {
    appendBackendLog("recut-runtime", "loadSourceAsync missing file path=" + path);
    return false;
  }
  if (file.existsAsFile() &&
      (file.getSize() <= 0 || static_cast<std::uint64_t>(file.getSize()) > ManagedFileStore::kDefaultMaxImportBytes)) {
    appendBackendLog(
        "recut-runtime",
        "loadSourceAsync rejected source size path=" + path + " size=" + std::to_string(file.getSize()));
    return false;
  }

  const auto generation = loadGeneration_.fetch_add(1, std::memory_order_acq_rel) + 1;

  auto placeholder = std::make_shared<LoadedSource>();
  if (restoredState.has_value()) {
    placeholder->state = *restoredState;
  } else if (const auto previous = snapshot()) {
    placeholder->state = previous->state;
  } else {
    placeholder->state = padpilot::proto::createDefaultRecutState();
  }
  placeholder->state.set_loaded(false);
  placeholder->state.set_source_path(path);
  placeholder->state.set_source_name(sourceName.empty() ? file.getFileName().toStdString() : sourceName);
  placeholder->state.set_source_content_id(sourceContentId);
  placeholder->analysisProgress = 0.0f;
  publishSnapshot(std::move(placeholder));

  if (!file.existsAsFile()) {
    appendBackendLog("recut-runtime", "loadSourceAsync missing file path=" + path);
    return false;
  }

  {
    const std::lock_guard lock(loaderMutex_);
    if (loaderStopping_) {
      return false;
    }
    pendingSourceLoad_ = SourceLoadRequest {
        path,
        sourceName,
        sourceContentId,
        std::move(restoredState),
        generation,
    };
  }
  loaderCondition_.notify_one();
  return true;
}

void RecutRuntime::sourceLoaderLoop() {
  while (true) {
    std::optional<SourceLoadRequest> request;
    {
      std::unique_lock lock(loaderMutex_);
      loaderCondition_.wait(lock, [this] { return loaderStopping_ || pendingSourceLoad_.has_value(); });
      if (loaderStopping_) {
        return;
      }
      request = std::move(pendingSourceLoad_);
      pendingSourceLoad_.reset();
    }
    processSourceLoad(std::move(*request));
  }
}

void RecutRuntime::processSourceLoad(SourceLoadRequest request) {
  auto loaded = analyzeFile(juce::File(request.path), request.generation);
  if (!loaded || request.generation != loadGeneration_.load(std::memory_order_acquire)) {
    return;
  }

  const auto analyzedState = loaded->state;
  std::uint64_t mergedRevision = 0;
  const auto current = snapshot();
  if (request.restoredState.has_value()) {
    loaded->state = current ? current->state : *request.restoredState;
    loaded->state.set_source_sha256(analyzedState.source_sha256());
    loaded->state.set_sample_rate(analyzedState.sample_rate());
    loaded->state.set_channel_count(analyzedState.channel_count());
    loaded->state.set_length_frames(analyzedState.length_frames());
  } else if (current) {
    copyMutableAnalysisSettings(current->state, &loaded->state);
    rebuildSlices(*loaded);
  }
  if (current) {
    mergedRevision = current->state.revision();
  }

  loaded->state.set_source_path(request.path);
  loaded->state.set_source_name(
      request.sourceName.empty() ? juce::File(request.path).getFileName().toStdString() : request.sourceName);
  loaded->state.set_source_content_id(request.sourceContentId);
  loaded->state.set_loaded(true);
  loaded->analysisProgress = 1.0f;
  if (request.generation != loadGeneration_.load(std::memory_order_acquire)) {
    return;
  }
  if (publishSnapshotForLoad(std::move(loaded), request.generation, mergedRevision)) {
    appendBackendLog("recut-runtime", "loadSourceAsync success path=" + request.path);
  }
}

bool RecutRuntime::loadSource(const padpilot::capability::SampleSourceLoadRequest& request) {
  if (!validateManagedSource(
          request.source_path(),
          request.source_name(),
          request.source_content_id())) {
    appendBackendLog(
        "recut-runtime",
        "loadSource rejected unmanaged or invalid capability path=" + request.source_path());
    return false;
  }
  return loadSourceAsync(request.source_path(), request.source_name(), request.source_content_id());
}

bool RecutRuntime::validateManagedSource(
    const std::string& path,
    const std::string& sourceName,
    const std::string& sourceContentId) const {
  ManagedFileStore managedFiles(managedMediaRootPath_);
  const auto expectedPath = managedFiles.resolveManagedSamplePath(sourceContentId, sourceName);
  if (expectedPath.empty() || juce::File(expectedPath) != juce::File(path)) {
    return false;
  }
  std::string validatedBytes;
  std::string validationError;
  return managedFiles.loadManagedFileBytes(expectedPath, &validatedBytes, validationError);
}

bool RecutRuntime::applyStateFromBytes(const std::string& bytes) {
  padpilot::recut::RecutModuleState state;
  if (!padpilot::proto::parseRecutModuleState(bytes, &state)) {
    return false;
  }
  sanitizePersistedState(&state);
  if (!isValidPersistedState(state)) {
    appendBackendLog("recut-runtime", "applyStateFromBytes rejected malformed persisted state");
    return false;
  }

  auto expectedPath = std::string {};
  if (!state.source_path().empty()) {
    ManagedFileStore managedFiles(managedMediaRootPath_);
    expectedPath = managedFiles.resolveManagedSamplePath(
        state.source_content_id(),
        state.source_name());
    if (expectedPath.empty() || juce::File(expectedPath) != juce::File(state.source_path())) {
      appendBackendLog(
          "recut-runtime",
          "applyStateFromBytes rejected unmanaged path=" + state.source_path());
      return false;
    }
  }

  setPitchSemitones(state.pitch_semitones());
  setGainDb(state.gain_db());
  setStretchEnabled(state.stretch_enabled());
  setGranularEnabled(state.granular_enabled());
  setGrainSizeMs(state.grain_size_ms());
  setGrainDensity(state.grain_density());
  if (state.project_bpm_snapshot() > 0.0f) {
    setProjectBpm(state.project_bpm_snapshot());
  }

  if (!state.source_path().empty()) {
    ManagedFileStore managedFiles(managedMediaRootPath_);
    std::string validatedBytes;
    std::string validationError;
    if (!managedFiles.loadManagedFileBytes(expectedPath, &validatedBytes, validationError)) {
      auto unavailable = std::make_shared<LoadedSource>();
      state.set_loaded(false);
      unavailable->state = state;
      unavailable->analysisProgress = 0.0f;
      publishSnapshot(std::move(unavailable));
      appendBackendLog(
          "recut-runtime",
          "applyStateFromBytes missing managed source path=" + state.source_path() +
              " error=" + validationError);
      return false;
    }
    const auto sourcePath = state.source_path();
    const auto sourceName = state.source_name();
    const auto sourceContentId = state.source_content_id();
    return enqueueSourceLoad(
        sourcePath,
        sourceName,
        sourceContentId,
        std::move(state));
  }

  auto next = std::make_shared<LoadedSource>();
  next->state = state;
  next->analysisProgress = state.loaded() ? 1.0f : 0.0f;
  publishSnapshot(std::move(next));
  return true;
}

std::string RecutRuntime::serializeStateBytes() const {
  auto current = snapshot();
  if (!current) {
    return padpilot::proto::serializeRecutModuleState(padpilot::proto::createDefaultRecutState());
  }

  padpilot::recut::RecutModuleState state;
  state.CopyFrom(current->state);
  state.set_pitch_semitones(pitchSemitones_.load(std::memory_order_acquire));
  state.set_gain_db(gainDb_.load(std::memory_order_acquire));
  state.set_stretch_enabled(stretchEnabled_.load(std::memory_order_acquire));
  state.set_granular_enabled(granularEnabled_.load(std::memory_order_acquire));
  state.set_grain_size_ms(grainSizeMs_.load(std::memory_order_acquire));
  state.set_grain_density(grainDensity_.load(std::memory_order_acquire));
  state.set_loaded(current->state.loaded());
  sanitizePersistedState(&state);
  return padpilot::proto::serializeRecutModuleState(state);
}

std::string RecutRuntime::buildFrameBase64() const {
  auto current = snapshot();
  padpilot::recut::RecutFrame frame;
  frame.set_sequence(current ? current->state.revision() : 0);
  frame.set_loaded(current ? current->state.loaded() : false);
  frame.set_analysis_progress(analysisProgress_.load(std::memory_order_acquire));
  frame.set_analysis_mode(current ? current->state.analysis_mode() : padpilot::recut::RECUT_ANALYSIS_MODE_AUTO);
  frame.set_analysis_revision(current ? current->state.manual_edit_revision() : 0);
  frame.set_completed_analysis_request_id(current ? current->completedAnalysisRequestId : 0);
  frame.set_playhead_frame(playheadFrame_.load(std::memory_order_relaxed));
  frame.set_armed_pad_index(armedPadIndex_.load(std::memory_order_relaxed));
  frame.set_active_slice_index(activeSliceIndex_.load(std::memory_order_relaxed));
  frame.set_last_snap_exact(lastSnapExact_.load(std::memory_order_relaxed));
  frame.set_bpm_value(current ? current->state.bpm_value() : 0.0f);
  frame.set_bpm_source(current ? current->state.bpm_source() : padpilot::recut::RECUT_BPM_SOURCE_NONE);
  frame.set_bpm_confidence(current ? current->state.bpm_confidence() : 0.0f);
  frame.set_bpm_suggested_value(current ? current->state.bpm_suggested_value() : 0.0f);
  frame.set_bpm_suggested_confidence(current ? current->state.bpm_suggested_confidence() : 0.0f);
  frame.set_density(current ? current->state.density() : 0.5f);
  frame.set_project_bpm(projectBpm_.load(std::memory_order_acquire));

  if (current) {
    for (const auto sample : current->media->waveformPeaks) {
      frame.add_waveform_peaks(sample);
    }
    for (const auto transientFrame : current->media->candidateTransientFrames) {
      frame.add_candidate_transients(transientFrame);
    }
    for (const auto& slice : current->state.slice_markers()) {
      *frame.add_slice_markers() = slice;
    }
    for (const auto& assignment : current->state.pad_assignments()) {
      *frame.add_pad_assignments() = assignment;
    }
  }
  const auto voiceState = publishedVoiceState_.load(std::memory_order_acquire);
  for (std::uint32_t padIndex = 0; padIndex < kMaxVoices; ++padIndex) {
    const auto state = (voiceState >> (padIndex * 2U)) & 0x3U;
    if ((state & 0x1U) != 0) frame.add_playing_pad_indices(padIndex);
    if ((state & 0x2U) != 0) frame.add_held_pad_indices(padIndex);
  }

  return padpilot::proto::buildRecutFrameBase64(frame);
}

std::string RecutRuntime::buildSampleEditorFrameBase64() const {
  auto current = snapshot();
  padpilot::capability::SampleEditorFrame frame;
  frame.set_sequence(current ? current->state.revision() : 0);
  frame.set_loaded(current ? current->state.loaded() : false);
  frame.set_analysis_progress(analysisProgress_.load(std::memory_order_acquire));
  frame.set_analysis_mode(current ? static_cast<padpilot::capability::SampleAnalysisMode>(current->state.analysis_mode()) : padpilot::capability::SAMPLE_ANALYSIS_MODE_AUTO);
  frame.set_analysis_revision(current ? current->state.manual_edit_revision() : 0);
  frame.set_completed_analysis_request_id(current ? current->completedAnalysisRequestId : 0);
  frame.set_playhead_frame(playheadFrame_.load(std::memory_order_relaxed));
  frame.set_armed_pad_index(armedPadIndex_.load(std::memory_order_relaxed));
  frame.set_active_slice_index(activeSliceIndex_.load(std::memory_order_relaxed));
  frame.set_last_snap_exact(lastSnapExact_.load(std::memory_order_relaxed));
  frame.set_bpm_value(current ? current->state.bpm_value() : 0.0f);
  frame.set_bpm_source(current ? static_cast<padpilot::capability::SampleBpmSource>(current->state.bpm_source()) : padpilot::capability::SAMPLE_BPM_SOURCE_NONE);
  frame.set_bpm_confidence(current ? current->state.bpm_confidence() : 0.0f);
  frame.set_bpm_suggested_value(current ? current->state.bpm_suggested_value() : 0.0f);
  frame.set_bpm_suggested_confidence(current ? current->state.bpm_suggested_confidence() : 0.0f);
  frame.set_density(current ? current->state.density() : 0.5f);
  frame.set_project_bpm(projectBpm_.load(std::memory_order_acquire));

  if (current) {
    for (const auto sample : current->media->waveformPeaks) {
      frame.add_waveform_peaks(sample);
    }
    for (const auto transientFrame : current->media->candidateTransientFrames) {
      frame.add_candidate_transients(transientFrame);
    }
    for (const auto& slice : current->state.slice_markers()) {
      *frame.add_slice_markers() = toSampleSliceMarker(slice);
    }
    for (const auto& assignment : current->state.pad_assignments()) {
      *frame.add_pad_assignments() = toSamplePadAssignment(assignment);
    }
  }
  const auto voiceState = publishedVoiceState_.load(std::memory_order_acquire);
  for (std::uint32_t padIndex = 0; padIndex < kMaxVoices; ++padIndex) {
    const auto state = (voiceState >> (padIndex * 2U)) & 0x3U;
    if ((state & 0x1U) != 0) frame.add_playing_pad_indices(padIndex);
    if ((state & 0x2U) != 0) frame.add_held_pad_indices(padIndex);
  }

  std::string bytes;
  frame.SerializeToString(&bytes);
  return padpilot::proto::bytesToBase64(bytes);
}

bool RecutRuntime::requestAnalysis(const padpilot::capability::SampleAnalysisRequest& request) {
  const auto current = snapshot();
  const auto sourceLength = current ? current->state.length_frames() : 0;
  if (!isValidAnalysisRequest(request, sourceLength)) {
    appendBackendLog("recut-runtime", "requestAnalysis rejected malformed capability payload");
    return false;
  }

  updateMutableSnapshot([&](LoadedSource& source) {
    source.completedAnalysisRequestId = request.request_id();
    source.state.set_analysis_mode(static_cast<padpilot::recut::RecutAnalysisMode>(request.analysis_mode()));
    source.state.set_density(finiteClamped(request.density(), 0.0f, 1.0f, 0.5f));
    if (request.requested_bpm() > 0.0f) {
      source.state.set_bpm_value(clampOptionalBpm(request.requested_bpm()));
      source.state.set_bpm_source(padpilot::recut::RECUT_BPM_SOURCE_USER);
    }
    if (request.manual_markers_size() > 0) {
      source.state.clear_slice_markers();
      for (const auto& marker : request.manual_markers()) {
        copySliceMarker(marker, source.state.add_slice_markers(), source.state.length_frames());
      }
      source.state.set_analysis_mode(padpilot::recut::RECUT_ANALYSIS_MODE_CUSTOM);
    } else {
      rebuildSlices(source);
    }
  });
  setProjectBpm(
      request.project_bpm() > 0.0f
          ? finiteClamped(request.project_bpm(), 20.0f, 400.0f, 120.0f)
          : projectBpm_.load(std::memory_order_acquire));
  return true;
}

bool RecutRuntime::applyPlaybackState(const padpilot::capability::SlicePlaybackState& state) {
  const auto current = snapshot();
  const auto sourceLength = current ? current->state.length_frames() : 0;
  if (!isValidPlaybackState(state, sourceLength)) {
    appendBackendLog("recut-runtime", "applyPlaybackState rejected malformed capability payload");
    return false;
  }

  setPitchSemitones(state.pitch_semitones());
  setGainDb(state.gain_db());
  setStretchEnabled(state.stretch_enabled());
  setGranularEnabled(state.granular_enabled());
  setGrainSizeMs(state.grain_size_ms());
  setGrainDensity(state.grain_density());
  setProjectBpm(state.project_bpm() > 0.0f ? state.project_bpm() : projectBpm_.load(std::memory_order_acquire));

  updateMutableSnapshot([&](LoadedSource& source) {
    source.state.set_analysis_mode(static_cast<padpilot::recut::RecutAnalysisMode>(state.analysis_mode()));
    source.state.set_density(finiteClamped(state.density(), 0.0f, 1.0f, 0.5f));
    source.state.set_bpm_value(clampOptionalBpm(state.bpm_value()));
    source.state.set_bpm_source(static_cast<padpilot::recut::RecutBpmSource>(state.bpm_source()));
    source.state.set_bpm_confidence(finiteClamped(state.bpm_confidence(), 0.0f, 1.0f, 0.0f));
    source.state.set_bpm_suggested_value(clampOptionalBpm(state.bpm_suggested_value()));
    source.state.set_bpm_suggested_confidence(
        finiteClamped(state.bpm_suggested_confidence(), 0.0f, 1.0f, 0.0f));
    source.state.set_manual_edit_revision(state.manual_edit_revision());
    source.state.set_project_bpm_snapshot(clampOptionalBpm(state.project_bpm()));
    source.state.clear_slice_markers();
    for (const auto& slice : state.slice_markers()) {
      copySliceMarker(slice, source.state.add_slice_markers(), source.state.length_frames());
    }

    source.state.clear_pad_assignments();
    for (const auto& assignment : state.pad_assignments()) {
      auto* padAssignment = source.state.add_pad_assignments();
      padAssignment->set_pad_index(assignment.pad_index());
      padAssignment->set_bank(assignment.bank());
      padAssignment->set_face_button(assignment.face_button());
      padAssignment->set_slice_index(assignment.slice_index());
      padAssignment->set_choke_group_id(assignment.choke_group_id());
      padAssignment->set_is_empty(assignment.is_empty());
    }

    source.state.clear_choke_groups();
    for (const auto& group : state.choke_groups()) {
      auto* chokeGroup = source.state.add_choke_groups();
      chokeGroup->set_id(group.id());
      chokeGroup->set_name(group.name());
      chokeGroup->set_accent_hue(std::min(group.accent_hue(), kMaxAccentHue));
    }
  });
  return true;
}

bool RecutRuntime::triggerPlayback(const padpilot::capability::SlicePlaybackTrigger& trigger) {
  if (trigger.pad_index() >= kMaxSlices ||
      !std::isfinite(trigger.velocity()) ||
      trigger.velocity() < 0.0f ||
      trigger.velocity() > 1.0f) {
    appendBackendLog("recut-runtime", "triggerPlayback rejected malformed capability payload");
    return false;
  }
  if (trigger.pressed()) {
    triggerPad(trigger.pad_index());
    return true;
  }
  releasePad(trigger.pad_index());
  return true;
}

bool RecutRuntime::editSlice(const padpilot::capability::SliceEditIntent& intent) {
  if (!isValidEditType(static_cast<int>(intent.type()))) {
    appendBackendLog("recut-runtime", "editSlice rejected invalid edit type");
    return false;
  }
  switch (intent.type()) {
    case padpilot::capability::SLICE_EDIT_TYPE_REANALYZE:
      reanalyze();
      return true;
    case padpilot::capability::SLICE_EDIT_TYPE_NUDGE_MARKER:
      if (intent.slice_index() >= kMaxSlices || !std::isfinite(intent.delta_frames())) {
        return false;
      }
      nudgeMarker(intent.slice_index(), intent.delta_frames(), intent.fine_mode());
      return true;
    case padpilot::capability::SLICE_EDIT_TYPE_SET_PAD_ASSIGNMENT:
      if (!intent.has_pad_assignment() || !isValidPadAssignment(intent.pad_assignment())) {
        return false;
      }
      setPadAssignment(
          intent.pad_assignment().pad_index(),
          intent.pad_assignment().bank(),
          intent.pad_assignment().face_button(),
          intent.pad_assignment().slice_index(),
          intent.pad_assignment().choke_group_id(),
          intent.pad_assignment().is_empty());
      return true;
    case padpilot::capability::SLICE_EDIT_TYPE_SET_CHOKE_GROUP:
      if (!intent.has_choke_group() || !isValidChokeGroup(intent.choke_group())) {
        return false;
      }
      setChokeGroup(
          intent.choke_group().id(),
          intent.choke_group().name(),
          std::min(intent.choke_group().accent_hue(), kMaxAccentHue));
      return true;
    case padpilot::capability::SLICE_EDIT_TYPE_SET_ANALYSIS_MODE:
      if (!isValidAnalysisMode(static_cast<int>(intent.analysis_mode()))) {
        return false;
      }
      updateMutableSnapshot([&](LoadedSource& source) {
        source.state.set_analysis_mode(static_cast<padpilot::recut::RecutAnalysisMode>(intent.analysis_mode()));
        rebuildSlices(source);
      });
      return true;
    case padpilot::capability::SLICE_EDIT_TYPE_SET_BPM:
      if (!std::isfinite(intent.bpm_value()) || intent.bpm_value() <= 0.0f) {
        return false;
      }
      updateMutableSnapshot([&](LoadedSource& source) {
        source.state.set_bpm_value(finiteClamped(intent.bpm_value(), 20.0f, 400.0f, 120.0f));
        source.state.set_bpm_source(padpilot::recut::RECUT_BPM_SOURCE_USER);
        rebuildSlices(source);
      });
      return true;
    case padpilot::capability::SLICE_EDIT_TYPE_SET_DENSITY:
      if (!std::isfinite(intent.density())) {
        return false;
      }
      updateMutableSnapshot([&](LoadedSource& source) {
        source.state.set_density(finiteClamped(intent.density(), 0.0f, 1.0f, 0.5f));
        rebuildSlices(source);
      });
      return true;
    case padpilot::capability::SLICE_EDIT_TYPE_ADD_MARKER:
    case padpilot::capability::SLICE_EDIT_TYPE_MOVE_MARKER:
    case padpilot::capability::SLICE_EDIT_TYPE_DELETE_MARKER:
    case padpilot::capability::SLICE_EDIT_TYPE_REGENERATE_SLICES:
      reanalyze();
      return true;
    case padpilot::capability::SLICE_EDIT_TYPE_UNKNOWN:
      return false;
  }
  return false;
}

void RecutRuntime::setPitchSemitones(float value) {
  const auto semitones = std::isfinite(value) ? std::clamp(value, -48.0f, 48.0f) : 0.0f;
  pitchSemitones_.store(semitones, std::memory_order_release);
  pitchRatio_.store(midiToRatio(semitones), std::memory_order_release);
}

void RecutRuntime::setGainDb(float value) {
  const auto gainDb = std::isfinite(value) ? std::clamp(value, -96.0f, 24.0f) : 0.0f;
  gainDb_.store(gainDb, std::memory_order_release);
  gainLinear_.store(juce::Decibels::decibelsToGain(gainDb), std::memory_order_release);
}

void RecutRuntime::setStretchEnabled(bool value) {
  stretchEnabled_.store(value, std::memory_order_release);
}

void RecutRuntime::setGranularEnabled(bool value) {
  granularEnabled_.store(value, std::memory_order_release);
}

void RecutRuntime::setGrainSizeMs(float value) {
  grainSizeMs_.store(std::isfinite(value) ? std::clamp(value, 1.0f, 1000.0f) : 28.0f, std::memory_order_release);
}

void RecutRuntime::setGrainDensity(float value) {
  grainDensity_.store(std::isfinite(value) ? std::clamp(value, 0.0f, 1.0f) : 0.62f, std::memory_order_release);
}

void RecutRuntime::setProjectBpm(float value) {
  projectBpm_.store(std::isfinite(value) ? std::clamp(value, 20.0f, 400.0f) : 120.0f, std::memory_order_release);
}

void RecutRuntime::triggerPad(std::uint32_t padIndex) {
  if (padIndex >= kMaxSlices) {
    return;
  }
  activeQueueWriters_.fetch_add(1, std::memory_order_acq_rel);
  struct QueueWriterGuard {
    std::atomic<std::uint32_t>& writers;
    ~QueueWriterGuard() { writers.fetch_sub(1, std::memory_order_release); }
  } writerGuard {activeQueueWriters_};
  if (!running_.load(std::memory_order_acquire)) {
    return;
  }
  if (!pendingTriggers_.push(TriggerCommand {
          padIndex,
          true,
          publishedSourceGeneration_.load(std::memory_order_acquire)})) {
    triggerCommandsDropped_.fetch_add(1, std::memory_order_relaxed);
    return;
  }
  armedPadIndex_.store(padIndex, std::memory_order_release);
}

void RecutRuntime::releasePad(std::uint32_t padIndex) {
  if (padIndex >= kMaxSlices) {
    return;
  }
  activeQueueWriters_.fetch_add(1, std::memory_order_acq_rel);
  struct QueueWriterGuard {
    std::atomic<std::uint32_t>& writers;
    ~QueueWriterGuard() { writers.fetch_sub(1, std::memory_order_release); }
  } writerGuard {activeQueueWriters_};
  if (!running_.load(std::memory_order_acquire)) {
    return;
  }
  if (!pendingTriggers_.push(TriggerCommand {
          padIndex,
          false,
          publishedSourceGeneration_.load(std::memory_order_acquire)})) {
    triggerCommandsDropped_.fetch_add(1, std::memory_order_relaxed);
    return;
  }
}

void RecutRuntime::nudgeMarker(std::uint32_t sliceIndex, float deltaFrames, bool fineMode) {
  if (sliceIndex >= kMaxSlices || !std::isfinite(deltaFrames)) {
    return;
  }
  const auto boundedDelta = std::clamp(deltaFrames, -kMaxMarkerNudgeFrames, kMaxMarkerNudgeFrames);
  updateMutableSnapshot([&](LoadedSource& source) {
    if (sliceIndex >= static_cast<std::uint32_t>(source.state.slice_markers_size())) {
      return;
    }
    auto* slice = source.state.mutable_slice_markers(static_cast<int>(sliceIndex));
    if (slice == nullptr) {
      return;
    }
    const auto requestedStart = static_cast<std::int64_t>(slice->start_frame()) +
                                static_cast<std::int64_t>(std::lround(boundedDelta));
    const auto maxFrame = source.state.length_frames() > 0 ? source.state.length_frames() - 1 : 0;
    const auto safeFrame = clampFrame(requestedStart, maxFrame);
    const auto snappedFrame = fineMode ? findNearestZeroCrossing(source, safeFrame) : safeFrame;
    const auto exact = snappedFrame == safeFrame;
    slice->set_start_frame(static_cast<std::uint32_t>(snappedFrame));
    slice->set_snap_exact(exact);
    slice->set_transient_frame(static_cast<std::uint32_t>(snappedFrame));
    lastSnapExact_.store(exact, std::memory_order_release);
    if (exact) {
      queuePrimaryHaptic(1.0f, 0.5f, 24);
    }
  });
}

void RecutRuntime::setPadAssignment(std::uint32_t padIndex,
                                    std::uint32_t bank,
                                    const std::string& faceButton,
                                    std::uint32_t sliceIndex,
                                    std::uint32_t chokeGroupId,
                                    bool isEmpty) {
  if (padIndex >= kMaxSlices ||
      bank >= 4 ||
      sliceIndex >= kMaxSlices ||
      chokeGroupId >= kMaxSlices ||
      faceButton.size() > kMaxFaceButtonBytes) {
    return;
  }
  updateMutableSnapshot([&](LoadedSource& source) {
    padpilot::recut::PadAssignment* assignment = nullptr;
    for (int index = 0; index < source.state.pad_assignments_size(); ++index) {
      if (source.state.pad_assignments(index).pad_index() == padIndex) {
        assignment = source.state.mutable_pad_assignments(index);
        break;
      }
    }
    if (assignment == nullptr) {
      if (source.state.pad_assignments_size() >= static_cast<int>(kMaxSlices)) {
        return;
      }
      assignment = source.state.add_pad_assignments();
      assignment->set_pad_index(padIndex);
    }
    assignment->set_bank(bank);
    assignment->set_face_button(faceButton);
    assignment->set_is_empty(isEmpty);
    assignment->set_slice_index(isEmpty ? 0U : sliceIndex);
    assignment->set_choke_group_id(chokeGroupId);
  });
}

void RecutRuntime::setChokeGroup(std::uint32_t chokeGroupId, const std::string& name, std::uint32_t accentHue) {
  if (chokeGroupId >= kMaxSlices || name.size() > kMaxChokeGroupNameBytes) {
    return;
  }
  updateMutableSnapshot([&](LoadedSource& source) {
    padpilot::recut::ChokeGroup* group = nullptr;
    for (int index = 0; index < source.state.choke_groups_size(); ++index) {
      if (source.state.choke_groups(index).id() == chokeGroupId) {
        group = source.state.mutable_choke_groups(index);
        break;
      }
    }
    if (group == nullptr) {
      if (source.state.choke_groups_size() >= static_cast<int>(kMaxSlices)) {
        return;
      }
      group = source.state.add_choke_groups();
      group->set_id(chokeGroupId);
    }
    group->set_name(name);
    group->set_accent_hue(std::min(accentHue, kMaxAccentHue));
  });
}

void RecutRuntime::reanalyze() {
  auto current = snapshot();
  if (!current || current->state.source_path().empty()) {
    return;
  }
  loadSourceAsync(current->state.source_path(), current->state.source_name(), current->state.source_content_id());
}

void RecutRuntime::processBlock(juce::AudioBuffer<float>& audioBuffer) {
  activeAudioReaders_.fetch_add(1, std::memory_order_acq_rel);
  struct AudioReaderGuard {
    std::atomic<std::uint32_t>& readers;
    ~AudioReaderGuard() { readers.fetch_sub(1, std::memory_order_release); }
  } readerGuard {activeAudioReaders_};

  if (!running_.load(std::memory_order_acquire)) {
    return;
  }

  const LoadedSource* current = nullptr;
  do {
    current = publishedSource_.load(std::memory_order_seq_cst);
    audioSourceHazard_.store(current, std::memory_order_seq_cst);
  } while (current != publishedSource_.load(std::memory_order_seq_cst));

  if (current == nullptr) {
    TriggerCommand staleTrigger {};
    while (pendingTriggers_.pop(staleTrigger)) {
    }
    audioSourceGeneration_ = 0;
    voices_.fill({});
    publishVoiceState();
    audioSourceHazard_.store(nullptr, std::memory_order_seq_cst);
    return;
  }

  if (audioSourceGeneration_ != current->runtimeGeneration) {
    audioSourceGeneration_ = current->runtimeGeneration;
    voices_.fill({});
    displayVoiceSlot_ = 0;
    publishVoiceState();
  }

  if (!current->state.loaded() || current->media->audioBuffer.getNumSamples() == 0) {
    TriggerCommand staleTrigger {};
    while (pendingTriggers_.pop(staleTrigger)) {
    }
    audioSourceHazard_.store(nullptr, std::memory_order_seq_cst);
    return;
  }

  const auto sampleRate = sampleRate_.load(std::memory_order_relaxed);
  const auto pitchRatio = pitchRatio_.load(std::memory_order_relaxed);
  const auto gainLinear = gainLinear_.load(std::memory_order_relaxed);
  const auto granular = granularEnabled_.load(std::memory_order_relaxed);
  const auto stretch = stretchEnabled_.load(std::memory_order_relaxed);
  const auto grainSamples = framesFromMilliseconds(sampleRate, grainSizeMs_.load(std::memory_order_relaxed));
  const auto releaseFadeFrames = framesFromMilliseconds(sampleRate, kReleaseFadeMs);
  const auto density = finiteClamped(
      grainDensity_.load(std::memory_order_relaxed), 0.0f, 1.0f, 0.62f);
  const auto requestedOverlap = static_cast<std::uint64_t>(
      1 + std::lround(density * static_cast<float>(kGrainsPerVoice - 1)));
  const auto grainOverlap = stretch
      ? std::max<std::uint64_t>(4, requestedOverlap)
      : requestedOverlap;
  const auto grainInterval = std::max<std::uint64_t>(1, grainSamples / grainOverlap);
  const auto grainReadIncrement = static_cast<double>(pitchRatio);

  TriggerCommand trigger {};
  while (pendingTriggers_.pop(trigger)) {
    if (trigger.sourceGeneration != current->runtimeGeneration) {
      continue;
    }
    if (trigger.pressed) {
      startVoice(*current, trigger.padIndex);
    } else {
      for (auto& voice : voices_) {
        if (!voice.active || voice.padIndex != trigger.padIndex) {
          continue;
        }
        voice.held = false;
        voice.releasing = true;
        voice.fadeRemaining = releaseFadeFrames;
      }
    }
  }

  for (auto& voice : voices_) {
    if (voice.active) {
      voice.sourceIncrement = voice.sourceRateRatio * (stretch ? 1.0 : static_cast<double>(pitchRatio));
    }
  }

  const auto outputChannels = audioBuffer.getNumChannels();
  const auto totalSamples = audioBuffer.getNumSamples();
  for (int sampleIndex = 0; sampleIndex < totalSamples; ++sampleIndex) {
    std::array<float, kMaxDecodedChannels> mixed {};
    for (auto& voice : voices_) {
      if (!voice.active) {
        continue;
      }

      float envelope = 1.0f;
      if (voice.releasing && voice.fadeRemaining > 0) {
        envelope *= static_cast<float>(voice.fadeRemaining) / static_cast<float>(releaseFadeFrames);
      }
      envelope *= voice.gain * gainLinear;
      const auto sourceChannels = current->media->audioBuffer.getNumChannels();
      const auto renderedChannels = std::min<int>(outputChannels, static_cast<int>(mixed.size()));
      const auto grainMode = granular || stretch;
      if (grainMode && voice.framesUntilNextGrain == 0) {
        auto* grain = &voice.grains.front();
        for (auto& candidate : voice.grains) {
          if (!candidate.active) {
            grain = &candidate;
            break;
          }
          if (candidate.ageFrames > grain->ageFrames) {
            grain = &candidate;
          }
        }
        *grain = Grain {
            true,
            voice.playheadFrame,
            0,
            grainSamples,
        };
        voice.framesUntilNextGrain = grainInterval;
      }

      if (grainMode) {
        for (int channel = 0; channel < renderedChannels; ++channel) {
          const auto sourceChannel = sourceChannels == 1 ? 0 : std::min(channel, sourceChannels - 1);
          const auto* data = current->media->audioBuffer.getReadPointer(sourceChannel);
          float weightedSample = 0.0f;
          float windowSum = 0.0f;
          for (const auto& grain : voice.grains) {
            if (!grain.active || grain.playheadFrame >= static_cast<double>(voice.sliceEndFrame)) {
              continue;
            }
            const auto frame = std::clamp(
                grain.playheadFrame,
                0.0,
                static_cast<double>(current->media->audioBuffer.getNumSamples() - 1));
            const auto intFrame = static_cast<int>(std::floor(frame));
            const auto nextFrame = juce::jmin(intFrame + 1, current->media->audioBuffer.getNumSamples() - 1);
            const auto frac = static_cast<float>(frame - static_cast<double>(intFrame));
            const auto windowIndex = std::min<std::uint64_t>(
                grainWindow_.size() - 1,
                grain.ageFrames * static_cast<std::uint64_t>(grainWindow_.size() - 1) /
                    std::max<std::uint64_t>(1, grain.durationFrames));
            const auto grainWindow = grainWindow_[static_cast<std::size_t>(windowIndex)];
            weightedSample += juce::jmap(frac, data[intFrame], data[nextFrame]) * grainWindow;
            windowSum += grainWindow;
          }
          mixed[static_cast<std::size_t>(channel)] +=
              weightedSample * envelope / std::max(0.25f, windowSum);
        }
      } else {
        const auto frame = std::clamp(
            voice.playheadFrame,
            0.0,
            static_cast<double>(current->media->audioBuffer.getNumSamples() - 1));
        const auto intFrame = static_cast<int>(std::floor(frame));
        const auto nextFrame = juce::jmin(intFrame + 1, current->media->audioBuffer.getNumSamples() - 1);
        const auto frac = static_cast<float>(frame - static_cast<double>(intFrame));
        for (int channel = 0; channel < renderedChannels; ++channel) {
          const auto sourceChannel = sourceChannels == 1 ? 0 : std::min(channel, sourceChannels - 1);
          const auto* data = current->media->audioBuffer.getReadPointer(sourceChannel);
          mixed[static_cast<std::size_t>(channel)] +=
              juce::jmap(frac, data[intFrame], data[nextFrame]) * envelope;
        }
      }
      voice.playheadFrame += std::max(0.0001, voice.sourceIncrement);
      if (grainMode) {
        if (voice.framesUntilNextGrain > 0) {
          --voice.framesUntilNextGrain;
        }
        for (auto& grain : voice.grains) {
          if (!grain.active) {
            continue;
          }
          grain.playheadFrame += voice.sourceRateRatio * grainReadIncrement;
          ++grain.ageFrames;
          if (grain.ageFrames >= grain.durationFrames ||
              grain.playheadFrame >= static_cast<double>(voice.sliceEndFrame)) {
            grain.active = false;
          }
        }
      }
      if (voice.releasing && voice.fadeRemaining > 0) {
        --voice.fadeRemaining;
      }
      if ((voice.releasing && voice.fadeRemaining == 0) || voice.playheadFrame >= voice.sliceEndFrame) {
        voice.active = false;
      }
    }

    for (int channel = 0; channel < outputChannels; ++channel) {
      if (channel < static_cast<int>(mixed.size())) {
        audioBuffer.addSample(channel, sampleIndex, mixed[static_cast<std::size_t>(channel)]);
      }
    }
  }

  publishVoiceState();
  audioSourceHazard_.store(nullptr, std::memory_order_seq_cst);
}

float RecutRuntime::midiToRatio(float semitones) {
  return std::pow(2.0f, semitones / 12.0f);
}

std::uint64_t RecutRuntime::clampFrame(std::int64_t frame, std::uint64_t maxFrame) {
  if (frame < 0) {
    return 0;
  }
  return static_cast<std::uint64_t>(std::min<std::int64_t>(frame, static_cast<std::int64_t>(maxFrame)));
}

std::uint64_t RecutRuntime::framesFromMilliseconds(double sampleRate, float ms) {
  return static_cast<std::uint64_t>(std::max(1.0, std::round(sampleRate * static_cast<double>(ms) / 1000.0)));
}

void RecutRuntime::publishSnapshot(std::shared_ptr<LoadedSource> source) {
  const std::lock_guard lock(stateMutex_);
  publishSnapshotLocked(std::move(source));
}

bool RecutRuntime::publishSnapshotForLoad(
    std::shared_ptr<LoadedSource> source,
    std::uint64_t generation,
    std::uint64_t mergedRevision) {
  const std::lock_guard lock(stateMutex_);
  if (generation != loadGeneration_.load(std::memory_order_acquire)) {
    return false;
  }
  if (sourceOwner_ && sourceOwner_->state.revision() != mergedRevision) {
    copyMutableLoadState(sourceOwner_->state, &source->state);
  }
  const auto latestRevision = sourceOwner_ ? sourceOwner_->state.revision() : 0;
  const auto baseRevision = std::max(source->state.revision(), latestRevision);
  source->state.set_revision(
      baseRevision == std::numeric_limits<std::uint64_t>::max() ? baseRevision : baseRevision + 1);
  publishSnapshotLocked(std::move(source));
  return true;
}

void RecutRuntime::publishSnapshotLocked(std::shared_ptr<LoadedSource> source) {
  if (source) {
    source->runtimeGeneration =
        sourceOwner_ && source->media == sourceOwner_->media
            ? sourceOwner_->runtimeGeneration
            : ++sourceGenerationCounter_;
  }
  analysisProgress_.store(source ? source->analysisProgress : 0.0f, std::memory_order_release);

  auto previous = std::move(sourceOwner_);
  sourceOwner_ = std::move(source);
  publishedSourceGeneration_.store(
      sourceOwner_ ? sourceOwner_->runtimeGeneration : 0,
      std::memory_order_release);
  publishedSource_.store(sourceOwner_.get(), std::memory_order_seq_cst);
  if (previous) {
    retiredSources_.push_back(std::move(previous));
  }
  reclaimRetiredSourcesLocked();
}

void RecutRuntime::reclaimRetiredSourcesLocked() {
  const auto* hazard = audioSourceHazard_.load(std::memory_order_seq_cst);
  retiredSources_.erase(
      std::remove_if(
          retiredSources_.begin(),
          retiredSources_.end(),
          [hazard](const auto& source) { return source.get() != hazard; }),
      retiredSources_.end());
}

std::shared_ptr<const RecutRuntime::LoadedSource> RecutRuntime::snapshot() const {
  const std::lock_guard lock(stateMutex_);
  return sourceOwner_;
}

void RecutRuntime::updateMutableSnapshot(const std::function<void(LoadedSource&)>& update) {
  const std::lock_guard lock(stateMutex_);
  auto next = sourceOwner_
      ? std::make_shared<LoadedSource>(*sourceOwner_)
      : std::make_shared<LoadedSource>();
  update(*next);
  next->state.set_revision(next->state.revision() + 1);
  publishSnapshotLocked(std::move(next));
}

std::shared_ptr<RecutRuntime::LoadedSource> RecutRuntime::analyzeFile(
    const juce::File& file,
    std::uint64_t generation) {
  appendBackendLog("recut-runtime", "analyzeFile begin path=" + file.getFullPathName().toStdString());
  juce::AudioFormatManager formatManager;
  formatManager.registerBasicFormats();
  auto stream = std::unique_ptr<juce::FileInputStream>(file.createInputStream());
  if (stream == nullptr) {
    appendBackendLog("recut-runtime", "analyzeFile failed to create input stream path=" + file.getFullPathName().toStdString());
    return nullptr;
  }

  auto reader = std::unique_ptr<juce::AudioFormatReader>(formatManager.createReaderFor(std::move(stream)));
  if (reader == nullptr) {
    appendBackendLog("recut-runtime", "analyzeFile failed to create reader path=" + file.getFullPathName().toStdString());
    return nullptr;
  }

  const auto decodedChannels = static_cast<std::uint64_t>(reader->numChannels);
  const auto decodedFrames = reader->lengthInSamples > 0
      ? static_cast<std::uint64_t>(reader->lengthInSamples)
      : 0;
  if (!isValidDecodedAudioMetadata(decodedChannels, decodedFrames, reader->sampleRate)) {
    appendBackendLog(
        "recut-runtime",
        "analyzeFile rejected decoded size path=" + file.getFullPathName().toStdString() +
            " channels=" + std::to_string(decodedChannels) +
            " frames=" + std::to_string(decodedFrames));
    return nullptr;
  }

  auto source = std::make_shared<LoadedSource>();
  auto media = std::make_shared<SourceMedia>();
  source->media = media;
  source->state = padpilot::proto::createDefaultRecutState();
  source->state.set_source_name(file.getFileName().toStdString());
  source->state.set_source_path(storage::toPortableSerializedPath(file.getFullPathName().toStdString()));
  source->state.set_source_sha256(juce::SHA256(file).toHexString().toStdString());
  source->state.set_sample_rate(static_cast<std::uint32_t>(std::lround(reader->sampleRate)));
  source->state.set_channel_count(static_cast<std::uint32_t>(reader->numChannels));
  source->state.set_length_frames(static_cast<std::uint64_t>(reader->lengthInSamples));
  source->state.set_loaded(true);
  source->analysisProgress = 0.4f;
  if (generation == loadGeneration_.load(std::memory_order_acquire)) {
    analysisProgress_.store(0.4f, std::memory_order_release);
  }

  media->audioBuffer.setSize(static_cast<int>(reader->numChannels), static_cast<int>(reader->lengthInSamples));
  if (!reader->read(&media->audioBuffer, 0, static_cast<int>(reader->lengthInSamples), 0, true, true)) {
    appendBackendLog(
        "recut-runtime",
        "analyzeFile failed to decode source path=" + file.getFullPathName().toStdString());
    return nullptr;
  }
  if (generation != loadGeneration_.load(std::memory_order_acquire)) {
    return nullptr;
  }

  media->monoAnalysis.reserve(static_cast<std::size_t>(reader->lengthInSamples));
  for (int sampleIndex = 0; sampleIndex < media->audioBuffer.getNumSamples(); ++sampleIndex) {
    if ((sampleIndex & 4095) == 0 && generation != loadGeneration_.load(std::memory_order_acquire)) {
      return nullptr;
    }
    float mono = 0.0f;
    for (int channel = 0; channel < media->audioBuffer.getNumChannels(); ++channel) {
      mono += media->audioBuffer.getSample(channel, sampleIndex);
    }
    mono /= static_cast<float>(media->audioBuffer.getNumChannels());
    media->monoAnalysis.push_back(mono);
  }

  media->transientCandidates = detectTransientCandidates(media->monoAnalysis, generation);
  if (generation != loadGeneration_.load(std::memory_order_acquire)) {
    return nullptr;
  }
  media->candidateTransientFrames.clear();
  media->candidateTransientFrames.reserve(media->transientCandidates.size());
  for (const auto& candidate : media->transientCandidates) {
    media->candidateTransientFrames.push_back(candidate.frame);
  }
  media->waveformPeaks = buildWaveformPeaks(media->monoAnalysis, kPeakBins);

  if (media->candidateTransientFrames.size() < 4) {
    media->candidateTransientFrames.clear();
    const auto sliceCount = static_cast<std::uint32_t>(
        std::min<std::uint64_t>(kMaxSlices, decodedFrames));
    for (std::uint32_t index = 0; index < sliceCount; ++index) {
      media->candidateTransientFrames.push_back(static_cast<std::uint32_t>(
          (static_cast<std::uint64_t>(index) * decodedFrames) / sliceCount));
    }
  }

  source->state.clear_choke_groups();
  auto* rowA = source->state.add_choke_groups();
  rowA->set_id(0);
  rowA->set_name("Row A");
  rowA->set_accent_hue(190);
  auto* rowB = source->state.add_choke_groups();
  rowB->set_id(1);
  rowB->set_name("Row B");
  rowB->set_accent_hue(280);
  rebuildSlices(*source);
  source->analysisProgress = 1.0f;
  source->state.set_loaded(true);
  source->state.set_revision(source->state.revision() + 1);
  if (generation == loadGeneration_.load(std::memory_order_acquire)) {
    analysisProgress_.store(1.0f, std::memory_order_release);
  }
  appendBackendLog(
      "recut-runtime",
      "analyzeFile success path=" + file.getFullPathName().toStdString() +
          " channels=" + std::to_string(reader->numChannels) +
          " sampleRate=" + std::to_string(static_cast<int>(reader->sampleRate)) +
          " frames=" + std::to_string(static_cast<std::uint64_t>(reader->lengthInSamples)) +
          " slices=" + std::to_string(source->state.slice_markers_size()));
  return source;
}

std::vector<RecutRuntime::TransientCandidate> RecutRuntime::detectTransientCandidates(
    const std::vector<float>& mono,
    std::uint64_t generation) const {
  juce::dsp::FFT fft(static_cast<int>(std::log2(kAnalysisWindowSize)));
  std::vector<float> window(kAnalysisWindowSize);
  for (std::size_t i = 0; i < window.size(); ++i) {
    window[i] = 0.5f - 0.5f * std::cos((static_cast<float>(i) / static_cast<float>(window.size() - 1)) * juce::MathConstants<float>::twoPi);
  }

  std::vector<float> previousMagnitudes(kAnalysisWindowSize / 2, 0.0f);
  std::vector<TransientCandidate> candidates;
  std::vector<float> fluxScores;
  std::vector<float> energyScores;

  std::array<float, kAnalysisWindowSize * 2> fftData {};
  for (std::size_t offset = 0; offset + kAnalysisWindowSize < mono.size(); offset += kAnalysisHopSize) {
    if (generation != loadGeneration_.load(std::memory_order_acquire)) {
      return {};
    }
    for (std::size_t index = 0; index < kAnalysisWindowSize; ++index) {
      fftData[index] = mono[offset + index] * window[index];
      fftData[kAnalysisWindowSize + index] = 0.0f;
    }
    fft.performFrequencyOnlyForwardTransform(fftData.data());

    float flux = 0.0f;
    for (std::size_t bin = 0; bin < previousMagnitudes.size(); ++bin) {
      const auto currentMagnitude = std::abs(fftData[bin]);
      const auto delta = std::max(0.0f, currentMagnitude - previousMagnitudes[bin]);
      flux += delta;
      previousMagnitudes[bin] = currentMagnitude;
    }

    float energy = 0.0f;
    for (std::size_t index = 0; index < kAnalysisWindowSize; ++index) {
      const auto sample = mono[offset + index];
      energy += sample * sample;
    }
    energyScores.push_back(std::sqrt(energy / static_cast<float>(kAnalysisWindowSize)));
    fluxScores.push_back(flux);
  }

  if (fluxScores.size() < 3) {
    return candidates;
  }

  const float fluxMedian = medianOfValues(fluxScores);
  std::vector<float> deviations;
  deviations.reserve(fluxScores.size());
  for (const auto score : fluxScores) {
    deviations.push_back(std::abs(score - fluxMedian));
  }
  const float fluxMad = std::max(1.0e-6f, medianOfValues(deviations));
  const float energyMedian = std::max(1.0e-5f, medianOfValues(energyScores));

  for (std::size_t index = 1; index + 1 < fluxScores.size(); ++index) {
    const auto flux = fluxScores[index];
    if (flux <= fluxScores[index - 1] || flux < fluxScores[index + 1]) {
      continue;
    }
    const auto localEnergyMedian = neighborhoodMedian(energyScores, index, 4);
    const auto energyFloor = std::max({energyMedian * 1.05f, localEnergyMedian * 1.1f, 1.0e-4f});
    if (energyScores[index] < energyFloor) {
      continue;
    }
    const float normalized = (flux - fluxMedian) / fluxMad;
    if (normalized < kMinConfidence) {
      continue;
    }
    const auto frame = static_cast<std::uint32_t>(index * kAnalysisHopSize);
    const auto intensity = juce::jlimit(0.0f, 1.0f, normalized / 8.0f);
    if (!candidates.empty() && frame - candidates.back().frame < kMinimumSliceSpacing) {
      if (intensity > candidates.back().intensity) {
        candidates.back() = {frame, intensity, 0};
      }
      continue;
    }
    candidates.push_back({frame, intensity, 0});
  }

  return candidates;
}

std::pair<float, float> RecutRuntime::inferBpm(const LoadedSource& source) const {
  if (source.media->candidateTransientFrames.size() < 2 || source.state.sample_rate() == 0) {
    return {projectBpm_.load(std::memory_order_acquire), 0.0f};
  }

  std::vector<float> bpms;
  bpms.reserve(source.media->candidateTransientFrames.size() - 1);
  for (std::size_t index = 1; index < source.media->candidateTransientFrames.size(); ++index) {
    const auto intervalFrames =
        source.media->candidateTransientFrames[index] - source.media->candidateTransientFrames[index - 1];
    if (intervalFrames == 0) {
      continue;
    }
    auto bpm = 60.0f * static_cast<float>(source.state.sample_rate()) / static_cast<float>(intervalFrames);
    if (bpm < 60.0f) {
      bpm *= 2.0f;
    } else if (bpm > 180.0f) {
      bpm *= 0.5f;
    }
    if (bpm >= 40.0f && bpm <= 240.0f) {
      bpms.push_back(bpm);
    }
  }

  if (bpms.empty()) {
    return {projectBpm_.load(std::memory_order_acquire), 0.0f};
  }

  const auto bpmMean = std::accumulate(bpms.begin(), bpms.end(), 0.0f) / static_cast<float>(bpms.size());
  float deviation = 0.0f;
  for (const auto bpm : bpms) {
    deviation += std::abs(bpm - bpmMean);
  }
  deviation /= static_cast<float>(bpms.size());
  return {bpmMean, juce::jlimit(0.0f, 1.0f, 1.0f - deviation / 24.0f)};
}

std::vector<RecutRuntime::TransientCandidate> RecutRuntime::selectAutoSliceCandidates(const LoadedSource& source) const {
  const auto safeLength = std::max<std::uint64_t>(1, source.state.length_frames());
  if (source.media->transientCandidates.empty()) {
    return {{0, 0.5f, 0}};
  }

  const auto threshold = autoAdmissionThreshold(source.media->transientCandidates, source.state.density());
  std::vector<TransientCandidate> admitted;
  admitted.reserve(source.media->transientCandidates.size());
  for (const auto& candidate : source.media->transientCandidates) {
    if (candidate.intensity < threshold) {
      continue;
    }
    auto admittedCandidate = candidate;
    admittedCandidate.bucketIndex = std::min<std::uint32_t>(
        static_cast<std::uint32_t>(kBucketCount - 1),
        static_cast<std::uint32_t>((static_cast<double>(candidate.frame) / static_cast<double>(safeLength)) * static_cast<double>(kBucketCount)));
    admitted.push_back(admittedCandidate);
  }
  if (admitted.empty()) {
    auto strongest = *std::max_element(
        source.media->transientCandidates.begin(),
        source.media->transientCandidates.end(),
        [](const auto& left, const auto& right) {
      return left.intensity < right.intensity;
    });
    strongest.bucketIndex = 0;
    admitted.push_back(strongest);
  }

  if (admitted.size() <= kMaxSlices) {
    std::sort(admitted.begin(), admitted.end(), [](const auto& left, const auto& right) {
      return left.frame < right.frame;
    });
    return admitted;
  }

  const auto bucketWidth = std::max<std::uint32_t>(1, static_cast<std::uint32_t>(safeLength / kBucketCount));
  std::vector<float> bucketCenters;
  bucketCenters.reserve(kBucketCount);
  for (std::size_t bucketIndex = 0; bucketIndex < kBucketCount; ++bucketIndex) {
    bucketCenters.push_back(static_cast<float>(bucketIndex * bucketWidth) + static_cast<float>(bucketWidth) * 0.5f);
  }

  std::vector<std::pair<std::size_t, TransientCandidate>> selections;
  std::vector<std::uint32_t> usedFrames;
  selections.reserve(kBucketCount);
  usedFrames.reserve(kBucketCount);
  for (std::size_t bucketIndex = 0; bucketIndex < kBucketCount; ++bucketIndex) {
    if (std::find_if(admitted.begin(), admitted.end(), [&](const auto& candidate) {
          return candidate.bucketIndex == bucketIndex;
        }) == admitted.end()) {
      continue;
    }
    const auto it = std::max_element(admitted.begin(), admitted.end(), [&](const auto& left, const auto& right) {
      const auto leftInBucket = left.bucketIndex == bucketIndex;
      const auto rightInBucket = right.bucketIndex == bucketIndex;
      if (leftInBucket != rightInBucket) {
        return !leftInBucket && rightInBucket;
      }
      if (left.intensity != right.intensity) {
        return left.intensity < right.intensity;
      }
      return left.frame > right.frame;
    });
    selections.push_back({bucketIndex, *it});
    usedFrames.push_back(it->frame);
  }

  for (std::size_t bucketIndex = 0; bucketIndex < kBucketCount; ++bucketIndex) {
    if (std::find_if(selections.begin(), selections.end(), [&](const auto& selection) { return selection.first == bucketIndex; }) != selections.end()) {
      continue;
    }
    const auto borrowed = findBorrowCandidate(bucketIndex, bucketCenters, admitted, usedFrames);
    if (borrowed.intensity <= 0.0f && borrowed.frame == 0) {
      continue;
    }
    selections.push_back({bucketIndex, borrowed});
    usedFrames.push_back(borrowed.frame);
  }

  const auto closeThreshold = std::max<std::uint32_t>(kMinimumSliceSpacing, bucketWidth / 4);
  for (std::size_t pass = 0; pass < 2; ++pass) {
    auto ordered = selections;
    std::sort(ordered.begin(), ordered.end(), [](const auto& left, const auto& right) {
      return left.second.frame < right.second.frame;
    });
    bool changed = false;
    for (std::size_t index = 1; index < ordered.size(); ++index) {
      const auto& previous = ordered[index - 1];
      const auto& current = ordered[index];
      if (current.second.frame - previous.second.frame >= closeThreshold) {
        continue;
      }
      const auto weakerSlot = previous.second.intensity < current.second.intensity ? previous.first : current.first;
      std::vector<std::uint32_t> usedWithoutCurrent;
      for (const auto& selection : selections) {
        if (selection.first != weakerSlot) {
          usedWithoutCurrent.push_back(selection.second.frame);
        }
      }
      for (std::size_t radius = 0; radius < kBucketCount; ++radius) {
        std::vector<TransientCandidate> pool;
        for (const auto& candidate : admitted) {
          if (std::find(usedWithoutCurrent.begin(), usedWithoutCurrent.end(), candidate.frame) != usedWithoutCurrent.end()) {
            continue;
          }
          if (static_cast<std::size_t>(std::abs(static_cast<int>(candidate.bucketIndex) - static_cast<int>(weakerSlot))) == radius) {
            pool.push_back(candidate);
          }
        }
        if (pool.empty()) {
          continue;
        }
        std::sort(pool.begin(), pool.end(), [](const auto& left, const auto& right) {
          if (left.intensity != right.intensity) {
            return left.intensity > right.intensity;
          }
          return left.frame < right.frame;
        });
        bool found = false;
        for (const auto& candidate : pool) {
          if (!isCandidateValidWithNeighbors(selections, weakerSlot, candidate, closeThreshold)) {
            continue;
          }
          for (auto& selection : selections) {
            if (selection.first == weakerSlot) {
              selection.second = candidate;
              found = true;
              changed = true;
              break;
            }
          }
          if (found) {
            break;
          }
        }
        if (found) {
          break;
        }
      }
    }
    if (!changed) {
      break;
    }
  }

  std::sort(selections.begin(), selections.end(), [](const auto& left, const auto& right) {
    return left.second.frame < right.second.frame;
  });
  std::vector<TransientCandidate> selected;
  selected.reserve(std::min<std::size_t>(kMaxSlices, selections.size()));
  for (std::size_t index = 0; index < selections.size() && index < kMaxSlices; ++index) {
    selected.push_back(selections[index].second);
  }
  return selected;
}

std::vector<std::uint32_t> RecutRuntime::selectBpmSliceStarts(const LoadedSource& source, float bpm, std::size_t targetCount) const {
  std::vector<std::uint32_t> starts;
  if (source.state.sample_rate() == 0) {
    starts.push_back(0);
    return starts;
  }

  const auto safeTargetCount = std::max<std::size_t>(1, std::min<std::size_t>(kMaxSlices, targetCount));
  const auto beatFrames = std::max<std::uint32_t>(
      1,
      static_cast<std::uint32_t>(std::lround((60.0 / std::max(20.0f, bpm)) * static_cast<double>(source.state.sample_rate()))));
  for (std::size_t index = 0; index < safeTargetCount; ++index) {
    auto frame = static_cast<std::uint32_t>(std::min<std::uint64_t>(source.state.length_frames() - 1, static_cast<std::uint64_t>(index * beatFrames)));
    const auto candidate = std::find_if(
        source.media->candidateTransientFrames.begin(),
        source.media->candidateTransientFrames.end(),
        [&](const auto transientFrame) {
          return std::abs(static_cast<int>(transientFrame) - static_cast<int>(frame)) <= static_cast<int>(beatFrames / 5);
        });
    if (candidate != source.media->candidateTransientFrames.end()) {
      frame = *candidate;
    }
    starts.push_back(frame);
    if (frame >= source.state.length_frames() - 1) {
      break;
    }
  }

  if (starts.empty()) {
    starts.push_back(0);
  }
  return starts;
}

void RecutRuntime::rebuildSlices(LoadedSource& source) {
  source.state.set_project_bpm_snapshot(projectBpm_.load(std::memory_order_acquire));

  const auto targetCount = targetSliceCountForDensity(source.state.analysis_mode(), source.state.density());
  const auto inferredBpm = inferBpm(source);
  source.state.set_bpm_suggested_value(inferredBpm.first);
  source.state.set_bpm_suggested_confidence(inferredBpm.second);

  if (source.state.analysis_mode() == padpilot::recut::RECUT_ANALYSIS_MODE_BPM) {
    const auto bpm = source.state.bpm_value() > 0.0f ? source.state.bpm_value() : (inferredBpm.second >= 0.5f ? inferredBpm.first : projectBpm_.load(std::memory_order_acquire));
    source.state.set_bpm_value(bpm);
    source.state.set_bpm_confidence(inferredBpm.second);
    source.state.set_bpm_source(
        source.state.bpm_source() == padpilot::recut::RECUT_BPM_SOURCE_USER
            ? padpilot::recut::RECUT_BPM_SOURCE_USER
            : (inferredBpm.second >= 0.5f ? padpilot::recut::RECUT_BPM_SOURCE_ANALYZED : padpilot::recut::RECUT_BPM_SOURCE_PROJECT));
  } else if (source.state.analysis_mode() == padpilot::recut::RECUT_ANALYSIS_MODE_AUTO) {
    source.state.set_bpm_confidence(inferredBpm.second);
    source.state.set_bpm_value(inferredBpm.second >= 0.5f ? inferredBpm.first : projectBpm_.load(std::memory_order_acquire));
    source.state.set_bpm_source(inferredBpm.second >= 0.5f ? padpilot::recut::RECUT_BPM_SOURCE_ANALYZED : padpilot::recut::RECUT_BPM_SOURCE_PROJECT);
  }

  std::vector<std::uint32_t> starts;
  std::vector<float> confidences;
  std::vector<std::uint32_t> padIndices;
  if (source.state.analysis_mode() == padpilot::recut::RECUT_ANALYSIS_MODE_CUSTOM && source.state.slice_markers_size() > 0) {
    starts.reserve(source.state.slice_markers_size());
    for (const auto& slice : source.state.slice_markers()) {
      starts.push_back(slice.start_frame());
      confidences.push_back(slice.confidence());
      padIndices.push_back(slice.pad_index());
    }
  } else if (source.state.analysis_mode() == padpilot::recut::RECUT_ANALYSIS_MODE_BPM) {
    starts = selectBpmSliceStarts(source, source.state.bpm_value(), targetCount);
    confidences.assign(starts.size(), 0.7f);
    padIndices.resize(starts.size());
    std::iota(padIndices.begin(), padIndices.end(), 0U);
  } else {
    const auto selected = selectAutoSliceCandidates(source);
    starts.reserve(selected.size());
    confidences.reserve(selected.size());
    for (const auto& candidate : selected) {
      starts.push_back(candidate.frame);
      confidences.push_back(candidate.intensity);
    }
    if (selected.size() <= kMaxSlices) {
      padIndices = assignSparsePadIndices(selected.size());
    }
    if (selected.size() == kMaxSlices) {
      padIndices.resize(selected.size());
      std::iota(padIndices.begin(), padIndices.end(), 0U);
    }
  }

  if (!starts.empty()) {
    std::vector<std::uint32_t> dedupedStarts;
    std::vector<float> dedupedConfidences;
    std::vector<std::uint32_t> dedupedPadIndices;
    dedupedStarts.reserve(starts.size());
    dedupedConfidences.reserve(confidences.size());
    dedupedPadIndices.reserve(padIndices.size());
    for (std::size_t index = 0; index < starts.size(); ++index) {
      if (!dedupedStarts.empty() && dedupedStarts.back() == starts[index]) {
        continue;
      }
      dedupedStarts.push_back(starts[index]);
      dedupedConfidences.push_back(index < confidences.size() ? confidences[index] : 0.7f);
      dedupedPadIndices.push_back(index < padIndices.size() ? padIndices[index] : static_cast<std::uint32_t>(index));
    }
    starts = std::move(dedupedStarts);
    confidences = std::move(dedupedConfidences);
    padIndices = std::move(dedupedPadIndices);
  }
  source.state.clear_slice_markers();
  const auto safeLength = static_cast<std::uint32_t>(std::max<std::uint64_t>(1, source.state.length_frames()));
  const auto lastFrame = safeLength - 1U;
  for (std::size_t index = 0; index < starts.size() && index < kMaxSlices; ++index) {
    const auto startFrame = std::min(starts[index], lastFrame);
    const auto endFrame = index + 1 < starts.size() && starts[index + 1] > startFrame
                              ? std::min(lastFrame, starts[index + 1] - 1U)
                              : lastFrame;
    auto* slice = source.state.add_slice_markers();
    slice->set_start_frame(startFrame);
    slice->set_end_frame(endFrame);
    slice->set_transient_frame(startFrame);
    slice->set_confidence(index < confidences.size() ? confidences[index] : 0.7f);
    slice->set_pad_index(index < padIndices.size() ? padIndices[index] : static_cast<std::uint32_t>(index));
    slice->set_choke_group_id(0);
    slice->set_fade_ms(kDefaultFadeMs);
    slice->set_snap_exact(true);
  }

  source.state.clear_pad_assignments();
  const auto sliceCount = std::max(1, source.state.slice_markers_size());
  std::vector<std::int32_t> sparseMapping(kMaxVoices, -1);
  if (source.state.analysis_mode() == padpilot::recut::RECUT_ANALYSIS_MODE_AUTO && source.state.slice_markers_size() <= static_cast<int>(kMaxSlices)) {
    for (int sliceIndex = 0; sliceIndex < source.state.slice_markers_size(); ++sliceIndex) {
      const auto padIndex = source.state.slice_markers(sliceIndex).pad_index();
      if (padIndex < sparseMapping.size()) {
        sparseMapping[padIndex] = sliceIndex;
      }
    }
  }
  for (std::size_t index = 0; index < kMaxVoices; ++index) {
    auto* pad = source.state.add_pad_assignments();
    pad->set_pad_index(static_cast<std::uint32_t>(index));
    pad->set_bank(static_cast<std::uint32_t>(index / kFaceButtons.size()));
    pad->set_face_button(kFaceButtons[index % kFaceButtons.size()]);
    if (source.state.analysis_mode() == padpilot::recut::RECUT_ANALYSIS_MODE_AUTO && source.state.slice_markers_size() < static_cast<int>(kMaxSlices)) {
      const auto sliceIndex = sparseMapping[index];
      pad->set_is_empty(sliceIndex < 0);
      pad->set_slice_index(sliceIndex < 0 ? 0U : static_cast<std::uint32_t>(sliceIndex));
    } else {
      pad->set_is_empty(false);
      pad->set_slice_index(static_cast<std::uint32_t>(index % static_cast<std::size_t>(sliceCount)));
    }
    pad->set_choke_group_id(0);
  }
}

std::vector<float> RecutRuntime::buildWaveformPeaks(const std::vector<float>& mono, std::size_t bins) {
  std::vector<float> peaks;
  peaks.reserve(bins);
  if (mono.empty() || bins == 0) {
    return peaks;
  }

  const auto binSize = std::max<std::size_t>(1, mono.size() / bins);
  for (std::size_t index = 0; index < bins; ++index) {
    const auto start = index * binSize;
    const auto end = std::min(mono.size(), start + binSize);
    float peak = 0.0f;
    for (std::size_t sample = start; sample < end; ++sample) {
      peak = std::max(peak, std::abs(mono[sample]));
    }
    peaks.push_back(peak);
  }
  return peaks;
}

std::uint64_t RecutRuntime::findNearestZeroCrossing(const LoadedSource& source, std::uint64_t frame) const {
  if (source.media->monoAnalysis.empty()) {
    return frame;
  }

  const auto start = static_cast<std::int64_t>(frame);
  const auto searchRadius = static_cast<std::int64_t>(framesFromMilliseconds(sampleRate_.load(std::memory_order_relaxed), 5.0f));
  for (std::int64_t distance = 0; distance <= searchRadius; ++distance) {
    for (const auto direction : {-1, 1}) {
      const auto candidate = start + distance * direction;
      if (candidate <= 0 || candidate >= static_cast<std::int64_t>(source.media->monoAnalysis.size())) {
        continue;
      }
      const auto left = source.media->monoAnalysis[static_cast<std::size_t>(candidate - 1)];
      const auto right = source.media->monoAnalysis[static_cast<std::size_t>(candidate)];
      if ((left <= 0.0f && right >= 0.0f) || (left >= 0.0f && right <= 0.0f)) {
        return static_cast<std::uint64_t>(candidate);
      }
    }
  }
  return frame;
}

const padpilot::recut::SliceMarker* RecutRuntime::findSliceForPad(const LoadedSource& source, std::uint32_t padIndex) const {
  if (source.state.slice_markers_size() <= 0) {
    return nullptr;
  }
  for (const auto& assignment : source.state.pad_assignments()) {
    if (assignment.pad_index() == padIndex) {
      if (assignment.is_empty()) {
        return nullptr;
      }
      const auto sliceIndex = juce::jlimit(0, source.state.slice_markers_size() - 1, static_cast<int>(assignment.slice_index()));
      return &source.state.slice_markers(sliceIndex);
    }
  }
  return source.state.slice_markers_size() > 0 ? &source.state.slice_markers(juce::jlimit(0, source.state.slice_markers_size() - 1, static_cast<int>(padIndex))) : nullptr;
}

void RecutRuntime::startVoice(const LoadedSource& source, std::uint32_t padIndex) {
  const auto* slice = findSliceForPad(source, padIndex);
  if (slice == nullptr) {
    return;
  }

  chokeGroup(slice->choke_group_id());

  auto voiceIt = std::find_if(voices_.begin(), voices_.end(), [](const Voice& currentVoice) { return !currentVoice.active; });
  if (voiceIt == voices_.end()) {
    voiceIt = voices_.begin();
  }
  auto& voice = *voiceIt;

  const auto sampleRate = sampleRate_.load(std::memory_order_relaxed);
  const auto sourceRate = source.state.sample_rate() > 0 ? source.state.sample_rate() : static_cast<std::uint32_t>(sampleRate);
  const auto pitchRatio = pitchRatio_.load(std::memory_order_relaxed);
  std::uint32_t sliceIndex = 0;
  for (int index = 0; index < source.state.slice_markers_size(); ++index) {
    if (&source.state.slice_markers(index) == slice) {
      sliceIndex = static_cast<std::uint32_t>(index);
      break;
    }
  }
  voice.active = true;
  voice.held = true;
  voice.releasing = false;
  voice.padIndex = padIndex;
  voice.sliceIndex = sliceIndex;
  voice.chokeGroupId = slice->choke_group_id();
  voice.sliceStartFrame = slice->start_frame();
  voice.sliceEndFrame = std::min<std::uint64_t>(
      std::max<std::uint32_t>(slice->start_frame() + 1, slice->end_frame()),
      static_cast<std::uint64_t>(source.media->audioBuffer.getNumSamples() - 1));
  voice.playheadFrame = static_cast<double>(slice->start_frame());
  voice.sourceRateRatio = static_cast<double>(sourceRate) / sampleRate;
  voice.sourceIncrement = voice.sourceRateRatio * pitchRatio;
  voice.gain = 1.0f;
  voice.fadeRemaining = framesFromMilliseconds(sampleRate, slice->fade_ms() > 0.0f ? slice->fade_ms() : kDefaultFadeMs);
  voice.granular = granularEnabled_.load(std::memory_order_relaxed);
  voice.grains.fill({});
  voice.framesUntilNextGrain = 0;
  displayVoiceSlot_ = static_cast<std::size_t>(std::distance(voices_.begin(), voiceIt));
  activeSliceIndex_.store(sliceIndex, std::memory_order_release);
  queuePrimaryHaptic(1.0f, 0.35f, 18);
}

void RecutRuntime::chokeGroup(std::uint32_t chokeGroupId) {
  if (chokeGroupId == 0) {
    return;
  }
  for (auto& voice : voices_) {
    if (voice.active && voice.chokeGroupId == chokeGroupId) {
      voice.active = false;
    }
  }
}

void RecutRuntime::queuePrimaryHaptic(float lowFrequency,
                                      float highFrequency,
                                      std::uint32_t durationMs) {
  activeQueueWriters_.fetch_add(1, std::memory_order_acq_rel);
  struct QueueWriterGuard {
    std::atomic<std::uint32_t>& writers;
    ~QueueWriterGuard() { writers.fetch_sub(1, std::memory_order_release); }
  } writerGuard {activeQueueWriters_};
  if (!running_.load(std::memory_order_acquire)) {
    return;
  }
  auto* queue = hapticQueue_.load(std::memory_order_acquire);
  if (queue == nullptr) {
    return;
  }

  const HapticCommand command {
      kPrimaryHapticDeviceSlot,
      lowFrequency,
      highFrequency,
      durationMs,
  };
  if (!queue->push(command)) {
    hapticCommandsDropped_.fetch_add(1, std::memory_order_relaxed);
  }
}

void RecutRuntime::resetPlaybackState() {
  voices_.fill({});
  pendingTriggers_.clear();
  playheadFrame_.store(0, std::memory_order_release);
  armedPadIndex_.store(0, std::memory_order_release);
  activeSliceIndex_.store(0, std::memory_order_release);
  publishedVoiceState_.store(0, std::memory_order_release);
  audioSourceGeneration_ = 0;
  displayVoiceSlot_ = 0;
}

void RecutRuntime::publishVoiceState() {
  std::uint32_t publishedState = 0;
  for (const auto& voice : voices_) {
    if (!voice.active || voice.padIndex >= kMaxVoices) {
      continue;
    }
    const auto bitOffset = voice.padIndex * 2U;
    publishedState |= 1U << bitOffset;
    if (voice.held) {
      publishedState |= 2U << bitOffset;
    }
  }
  publishedVoiceState_.store(publishedState, std::memory_order_release);

  if (displayVoiceSlot_ >= voices_.size() || !voices_[displayVoiceSlot_].active) {
    const auto active = std::find_if(voices_.begin(), voices_.end(), [](const Voice& voice) { return voice.active; });
    if (active == voices_.end()) {
      playheadFrame_.store(0, std::memory_order_release);
      return;
    }
    displayVoiceSlot_ = static_cast<std::size_t>(std::distance(voices_.begin(), active));
    activeSliceIndex_.store(active->sliceIndex, std::memory_order_release);
  }

  playheadFrame_.store(
      static_cast<std::uint64_t>(std::max(0.0, std::floor(voices_[displayVoiceSlot_].playheadFrame))),
      std::memory_order_release);
}

}  // namespace padpilot
