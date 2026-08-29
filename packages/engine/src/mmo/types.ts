export type MmoEntityData = Record<string, unknown>;

export type MmoVec2 = {
  x: number;
  y: number;
};

export type MmoEntityVisibility = "public" | "owner" | "private";

type MmoEntityRecordBase<
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData,
  TPrivate extends MmoEntityData = MmoEntityData
> = {
  id: string;
  type: string;
  x: number;
  y: number;
  zoneId?: string;
  radius?: number;
  priority?: number;
  global?: boolean;
  tags?: readonly string[];
  revision?: number;
  publicData?: TPublic;
  ownerData?: TOwner;
  privateData?: TPrivate;
};

export type MmoEntityRecord<
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData,
  TPrivate extends MmoEntityData = MmoEntityData
> = MmoEntityRecordBase<TPublic, TOwner, TPrivate> & (
  | { visibility?: "public"; ownerId?: string }
  | { visibility: "owner"; ownerId: string }
  | { visibility: "private"; ownerId?: string }
);

export type MmoEntityPatch<
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData,
  TPrivate extends MmoEntityData = MmoEntityData
> = Partial<Omit<MmoEntityRecordBase<TPublic, TOwner, TPrivate>, "id">> & {
  visibility?: MmoEntityVisibility;
  ownerId?: string;
};

type MmoReplicatedEntityBase<
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData
> = {
  id: string;
  type: string;
  x: number;
  y: number;
  zoneId?: string;
  radius?: number;
  priority?: number;
  global?: boolean;
  tags?: readonly string[];
  revision: number;
  publicData?: TPublic;
  ownerData?: TOwner;
};

export type MmoReplicatedEntity<
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData
> = MmoReplicatedEntityBase<TPublic, TOwner> & (
  | { visibility: "public"; ownerId?: string }
  | { visibility: "owner"; ownerId: string }
);

export type MmoEntitySnapshot<
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData,
  TMeta = unknown
> = {
  revision: number;
  meta?: TMeta;
  visibleIds: string[];
  omittedIds: string[];
  entities: Record<string, MmoReplicatedEntity<TPublic, TOwner>>;
};

export type MmoEncodedEntitySnapshot<
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData,
  TMeta = unknown
> = {
  revision: number;
  meta?: TMeta;
  visibleIds: string[];
  omittedIds: string[];
  entities: Array<MmoReplicatedEntity<TPublic, TOwner>>;
};

export type MmoInterestTarget = MmoVec2 & {
  radius: number;
  zoneId?: string;
};

export type MmoInterestEntity = MmoVec2 & {
  id: string;
  type: string;
  zoneId?: string;
  radius?: number;
  priority?: number;
  global?: boolean;
};
