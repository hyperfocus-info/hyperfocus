import type { SwarmReviewController } from "@hyperfocus/ai-core/swarm";
import { createContext, useContext } from "solid-js";

// The launcher owns this controller across dialog mounts. A standalone page
// creates its own controller instead; borrowing never transfers disposal.
const SwarmReviewContext = createContext<SwarmReviewController>();
export const SwarmReviewProvider = SwarmReviewContext.Provider;
export const useSwarmReviewController = () => useContext(SwarmReviewContext);
