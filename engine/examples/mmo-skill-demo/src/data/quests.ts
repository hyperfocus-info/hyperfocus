export type ClientContractInfo = {
  id: string;
  name: string;
  targetKills: number;
  area: string;
};

export const clientContracts: ClientContractInfo[] = [
  { id: "ashwood-hunt", name: "Ashwood Hunt", targetKills: 12, area: "Ashwood" },
  { id: "crag-patrol", name: "Crag Patrol", targetKills: 10, area: "Iron Crags" },
  { id: "bazaar-sweep", name: "Bazaar Sweep", targetKills: 9, area: "Sunken Bazaar" },
  { id: "dungeon-writ", name: "Dungeon Writ", targetKills: 1, area: "Dungeon" }
];
