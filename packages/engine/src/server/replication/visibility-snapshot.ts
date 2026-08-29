export type VisibleEntityBucketResult<TBucket extends string, TOutEntity> = {
  entities: Record<string, TOutEntity>;
  buckets: Partial<Record<TBucket, Record<string, TOutEntity>>>;
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
  result: VisibleEntityBucketResult<TBucket, TEntity | TOutEntity>,
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
  const projected: TEntity | TOutEntity | undefined = options.project ? options.project(entity) : entity;
  if (!projected) return;
  result.entities[id] = projected;
  const bucket = result.buckets[bucketName] ?? {};
  result.buckets[bucketName] = bucket;
  bucket[id] = projected;
  result.count += 1;
}

export function selectVisibleEntityBuckets<TEntity extends { id: string }, TBucket extends string, TOutEntity = TEntity>(
  options: VisibleEntityBucketOptions<TEntity, TBucket, TOutEntity> & { project: (entity: TEntity) => TOutEntity | undefined }
): VisibleEntityBucketResult<TBucket, TOutEntity>;
export function selectVisibleEntityBuckets<TEntity extends { id: string }, TBucket extends string>(
  options: Omit<VisibleEntityBucketOptions<TEntity, TBucket, TEntity>, "project"> & { project?: undefined }
): VisibleEntityBucketResult<TBucket, TEntity>;
export function selectVisibleEntityBuckets<TEntity extends { id: string }, TBucket extends string, TOutEntity>(
  options: VisibleEntityBucketOptions<TEntity, TBucket, TOutEntity>
): VisibleEntityBucketResult<TBucket, TEntity | TOutEntity> {
  const buckets: Partial<Record<TBucket, Record<string, TEntity | TOutEntity>>> = {};
  for (const name of options.bucketNames ?? []) buckets[name] = {};
  const result: VisibleEntityBucketResult<TBucket, TEntity | TOutEntity> = {
    entities: {},
    buckets,
    count: 0
  };
  const visited = new Set<string>();
  for (const id of options.ids) pushVisibleEntity(result, options, visited, id);
  for (const id of options.includeIds ?? []) pushVisibleEntity(result, options, visited, id);
  return result;
}
