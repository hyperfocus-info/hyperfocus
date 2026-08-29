#pragma once

#include <string>

#include "generated/proto/capability.pb.h"

namespace padpilot::proto {

std::string serializeCapabilityFrameEnvelope(const padpilot::capability::CapabilityFrameEnvelope& envelope);
std::string buildCapabilityFrameEnvelopeBase64(const padpilot::capability::CapabilityFrameEnvelope& envelope);

}  // namespace padpilot::proto
