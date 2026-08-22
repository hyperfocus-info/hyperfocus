export type VisibleEntityBucketResult<TBucket extends string, TOutEntity> = {
  entities: Record<string, TOutEntity>;
  buckets: Record<TBucket, Record<string, TOutEntity>>;
  count: number;
};

export type VisibleEntityBucketOptions<TEntity extends { id: string }, TBucket extends string, TOutEntity = TEntity> = {
  source: Record<string, TEntity | undefined>;
  ids: Iterable<string>;
  includeIds?: Iterable<string>;
  bucketFor: (entity: TEntity) => TBucket | undefined;
  bucketNames?: readonly TBucket[];
  project?: (entity: TEntity) => TOutEntity | undefined;
};

function pushVisibleEntity<TEntity extends { id: string }, TBucket extends string, TOutEntity>(
  result: VisibleEntityBucketResult<TBucket, TOutEntity>,
  options: VisibleEntityBucketOptions<TEntity, TBucket, TOutEntity>,
  visited: Set<string>,
  id: string
) {
  if (visited.has(id)) return;
  visited.add(id);
  const entity = options.source[id];
  if (!entity) return;
  const bucketName = options.bucketFor(entity);
  if (!bucketName) return;
  const projected = options.project ? options.project(entity) : (entity as unknown as TOutEntity);
  if (!projected) return;
  result.entities[id] = projected;
  const buckets = result.buckets as Record<string, Record<string, TOutEntity> | undefined>;
  (buckets[bucketName] ??= {})[id] = projected;
  result.count += 1;
}

export function selectVisibleEntityBuckets<TEntity extends { id: string }, TBucket extends string, TOutEntity = TEntity>(
  options: VisibleEntityBucketOptions<TEntity, TBucket, TOutEntity>
): VisibleEntityBucketResult<TBucket, TOutEntity> {
  const buckets = {} as Record<TBucket, Record<string, TOutEntity>>;
  for (const name of options.bucketNames ?? []) buckets[name] = {};
  const result: VisibleEntityBucketResult<TBucket, TOutEntity> = {
    entities: {},
    buckets,
    count: 0
  };
  const visited = new Set<string>();
  for (const id of options.ids) pushVisibleEntity(result, options, visited, id);
  for (const id of options.includeIds ?? []) pushVisibleEntity(result, options, visited, id);
  return result;
}
