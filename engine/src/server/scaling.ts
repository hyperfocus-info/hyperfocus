import { createInterestGrid, type InterestGridOptions, type InterestIndex } from "./interest-grid.ts";

export type MmoReplicationOptions = {
  snapshotRate?: number;
  deltaRate?: number;
  maxBytesPerClientPerSecond?: number;
  binary?: boolean;
  maxClientsPerTick?: number;
  spread?: "none" | "round-robin";
  phase?: boolean;
};

export type MmoAdmissionSelection = "least-loaded" | "fill-first";

export type MmoAdmissionOptions = {
  roomType: string;
  roomIdPrefix: string;
  rooms: number;
  playersPerRoom: number;
  softPlayersPerRoom?: number;
  selection?: MmoAdmissionSelection;
};

export type MmoScalePreset = {
  profile: "mmo-1000";
  totalPlayers: number;
  tickRate: number;
  maxPlayersPerRoom: number;
  replication: MmoReplicationOptions;
  admission: MmoAdmissionOptions;
};

export type Mmo1000PresetOptions = {
  publicRoomType: string;
  publicRoomPrefix?: string;
  publicRooms?: number;
  playersPerRoom?: number;
  softPlayersPerRoom?: number;
  admissionSelection?: MmoAdmissionSelection;
  tickRate?: number;
  replication?: MmoReplicationOptions;
};

export type MmoInterestGridOptions = Omit<InterestGridOptions, "cellSize" | "maxEntitiesPerClient" | "hysteresisCells"> & {
  profile?: "mmo-1000";
  cellSize?: number;
  maxEntitiesPerClient?: number;
  hysteresisCells?: number;
};

function assertNonEmptyString(name: string, value: string) {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${name} must be a non-empty string`);
}

function assertPositiveInteger(name: string, value: number) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
}

function assertPositiveNumber(name: string, value: number | undefined) {
  if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw new Error(`${name} must be a positive number`);
}

function assertNonNegativeInteger(name: string, value: number | undefined) {
  if (value !== undefined && (!Number.isInteger(value) || value < 0)) throw new Error(`${name} must be a non-negative integer`);
}

function assertAdmissionSelection(value: MmoAdmissionSelection | undefined) {
  if (value !== undefined && value !== "least-loaded" && value !== "fill-first") {
    throw new Error("admission.selection must be least-loaded or fill-first");
  }
}

export function validateMmoAdmissionOptions(options: MmoAdmissionOptions): MmoAdmissionOptions {
  assertNonEmptyString("admission.roomType", options.roomType);
  assertNonEmptyString("admission.roomIdPrefix", options.roomIdPrefix);
  assertPositiveInteger("admission.rooms", options.rooms);
  assertPositiveInteger("admission.playersPerRoom", options.playersPerRoom);
  assertAdmissionSelection(options.selection);
  if (options.softPlayersPerRoom !== undefined) {
    assertPositiveInteger("admission.softPlayersPerRoom", options.softPlayersPerRoom);
    if (options.softPlayersPerRoom > options.playersPerRoom) throw new Error("admission.softPlayersPerRoom must be <= admission.playersPerRoom");
  }
  return {
    roomType: options.roomType,
    roomIdPrefix: options.roomIdPrefix,
    rooms: options.rooms,
    playersPerRoom: options.playersPerRoom,
    softPlayersPerRoom: options.softPlayersPerRoom ?? options.playersPerRoom,
    selection: options.selection ?? "least-loaded"
  };
}

export function validateMmoScalePreset(scale: MmoScalePreset): MmoScalePreset {
  if (scale.profile !== "mmo-1000") throw new Error("scale.profile must be mmo-1000");
  assertPositiveInteger("scale.totalPlayers", scale.totalPlayers);
  assertPositiveInteger("scale.tickRate", scale.tickRate);
  assertPositiveInteger("scale.maxPlayersPerRoom", scale.maxPlayersPerRoom);
  assertPositiveNumber("scale.replication.snapshotRate", scale.replication.snapshotRate);
  assertPositiveNumber("scale.replication.deltaRate", scale.replication.deltaRate);
  assertPositiveNumber("scale.replication.maxBytesPerClientPerSecond", scale.replication.maxBytesPerClientPerSecond);
  assertNonNegativeInteger("scale.replication.maxClientsPerTick", scale.replication.maxClientsPerTick);
  if (scale.replication.spread !== undefined && scale.replication.spread !== "none" && scale.replication.spread !== "round-robin") {
    throw new Error("scale.replication.spread must be none or round-robin");
  }
  const admission = validateMmoAdmissionOptions(scale.admission);
  return {
    profile: "mmo-1000",
    totalPlayers: scale.totalPlayers,
    tickRate: scale.tickRate,
    maxPlayersPerRoom: scale.maxPlayersPerRoom,
    replication: { ...scale.replication },
    admission
  };
}

export function createMmo1000Preset(options: Mmo1000PresetOptions): MmoScalePreset {
  assertNonEmptyString("publicRoomType", options.publicRoomType);
  const rooms = options.publicRooms ?? 10;
  const playersPerRoom = options.playersPerRoom ?? 100;
  const softPlayersPerRoom = options.softPlayersPerRoom ?? playersPerRoom;
  const tickRate = options.tickRate ?? 20;
  return validateMmoScalePreset({
    profile: "mmo-1000",
    totalPlayers: rooms * playersPerRoom,
    tickRate,
    maxPlayersPerRoom: playersPerRoom,
    replication: {
      snapshotRate: 1,
      deltaRate: 10,
      maxBytesPerClientPerSecond: 24 * 1024,
      binary: true,
      maxClientsPerTick: playersPerRoom,
      spread: "round-robin",
      phase: true,
      ...options.replication
    },
    admission: {
      roomType: options.publicRoomType,
      roomIdPrefix: options.publicRoomPrefix ?? "mmo-public",
      rooms,
      playersPerRoom,
      softPlayersPerRoom,
      selection: options.admissionSelection
    }
  });
}

export function createMmoInterestGrid(options: MmoInterestGridOptions = {}): InterestIndex {
  if (options.profile !== undefined && options.profile !== "mmo-1000") throw new Error("interest profile must be mmo-1000");
  return createInterestGrid({
    ...options,
    cellSize: options.cellSize ?? 64,
    maxEntitiesPerClient: options.maxEntitiesPerClient ?? 512,
    hysteresisCells: options.hysteresisCells ?? 1
  });
}
