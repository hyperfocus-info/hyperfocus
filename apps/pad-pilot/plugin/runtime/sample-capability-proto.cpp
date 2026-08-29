#include "runtime/sample-capability-proto.h"

#include "runtime/base64.h"

namespace padpilot::proto {

std::string serializeCapabilityFrameEnvelope(const padpilot::capability::CapabilityFrameEnvelope& envelope) {
  std::string bytes;
  envelope.SerializeToString(&bytes);
  return bytes;
}

std::string buildCapabilityFrameEnvelopeBase64(const padpilot::capability::CapabilityFrameEnvelope& envelope) {
  return bytesToBase64(serializeCapabilityFrameEnvelope(envelope));
}

}  // namespace padpilot::proto
