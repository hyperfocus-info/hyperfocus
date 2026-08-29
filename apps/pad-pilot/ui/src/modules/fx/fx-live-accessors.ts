import type { Accessor } from "solid-js";
import type { ChainState } from "./fx-chain-state";

function resolveAccessorValue<T>(value: Accessor<T> | T) {
  return typeof value === "function" ? (value as Accessor<T>)() : value;
}

export function createChainAccessor(chains: Accessor<readonly ChainState[]>, chainId: Accessor<number> | number) {
  return () => chains().find((chain) => chain.id === resolveAccessorValue(chainId));
}

export function createNodeAccessor(chain: Accessor<ChainState | undefined>, nodeId: Accessor<number> | number) {
  return () => chain()?.nodes.find((node) => node.id === resolveAccessorValue(nodeId));
}
