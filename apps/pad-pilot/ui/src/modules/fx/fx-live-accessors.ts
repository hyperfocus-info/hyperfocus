import type { Accessor } from "solid-js";
import type { ChainState } from "./fx-chain-state";

function resolveAccessorValue(value: Accessor<number> | number) {
  return typeof value === "function" ? value() : value;
}

export function createChainAccessor(chains: Accessor<readonly ChainState[]>, chainId: Accessor<number> | number) {
  return () => chains().find((chain) => chain.id === resolveAccessorValue(chainId));
}

export function createNodeAccessor(chain: Accessor<ChainState | undefined>, nodeId: Accessor<number> | number) {
  return () => chain()?.nodes.find((node) => node.id === resolveAccessorValue(nodeId));
}
