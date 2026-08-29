import { encodeFxChainStateBase64, type ChainState, type FxChainState, type FxNodeType } from "./fx-chain-state";
import { type ChainPresetSummary } from "./fx-types";

export const isTextTarget = (target: EventTarget | null) =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);

export const sameSnapshot = (left: FxChainState, right: FxChainState) => encodeFxChainStateBase64(left) === encodeFxChainStateBase64(right);

export function findChainById(chains: readonly ChainState[], chainId: number) {
  return chains.find((chain) => chain.id === chainId);
}

export function findNodeById(chain: ChainState | undefined, nodeId: number) {
  return chain?.nodes.find((node) => node.id === nodeId);
}

export function getDraftNodeType(nodeTypeByChain: Record<number, FxNodeType>, chainId: number, fallback: FxNodeType) {
  return nodeTypeByChain[chainId] ?? fallback;
}

export function resolveSelectedChainPreset(
  libraryByChain: Record<number, ChainPresetSummary[]>,
  queryByChain: Record<number, string>,
  chainId: number | null,
) {
  if (chainId === null) {
    return undefined;
  }

  const query = queryByChain[chainId] ?? "";
  return (libraryByChain[chainId] ?? []).find((item) => item.name === query);
}
