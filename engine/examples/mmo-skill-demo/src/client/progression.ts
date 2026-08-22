import { clientContracts, type ClientContractInfo } from "../data/quests.ts";

export function contractInfo(id: string | undefined) {
  return clientContracts.find((contract) => contract.id === id) ?? clientContracts[0];
}

export type { ClientContractInfo };
