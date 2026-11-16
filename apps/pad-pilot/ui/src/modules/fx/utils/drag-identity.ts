export function parseChainDragId(id: string | null | undefined) {
  if (!id?.startsWith("chain:")) {
    return null;
  }

  const [, chainId] = id.split(":");
  return chainId ? Number(chainId) : null;
}
export function parseNodeDragId(id: string | null | undefined, chainId: number) {
  if (!id?.startsWith("node:")) {
    return null;
  }

  const [, dragChainId, nodeId] = id.split(":");
  if (Number(dragChainId) !== chainId) {
    return null;
  }

  return nodeId ? Number(nodeId) : null;
}
export function getNodeIdFromRenderKey(value: string) {
  return Number.parseInt(value.split(":")[1] ?? "-1", 10);
}
