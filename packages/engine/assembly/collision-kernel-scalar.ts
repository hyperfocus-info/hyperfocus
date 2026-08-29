function clampF64(value: f64, min: f64, max: f64): f64 {
  return Math.min(Math.max(value, min), max);
}

export function circle_rect_overlap(cx: f64, cy: f64, r: f64, rx: f64, ry: f64, rw: f64, rh: f64): i32 {
  const closestX = clampF64(cx, rx, rx + rw);
  const closestY = clampF64(cy, ry, ry + rh);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy <= r * r ? 1 : 0;
}

export function integrate_movement_f32(xPtr: usize, yPtr: usize, vxPtr: usize, vyPtr: usize, dt: f32, count: i32): void {
  for (let i = 0; i < count; i += 1) {
    const offset = <usize>i << 2;
    store<f32>(xPtr + offset, load<f32>(xPtr + offset) + load<f32>(vxPtr + offset) * dt);
    store<f32>(yPtr + offset, load<f32>(yPtr + offset) + load<f32>(vyPtr + offset) * dt);
  }
}

function rotate_xy_f32(xPtr: usize, yPtr: usize, outXPtr: usize, outYPtr: usize, sin: f32, cos: f32, count: i32): void {
  for (let i = 0; i < count; i += 1) {
    const offset = <usize>i << 2;
    const x = load<f32>(xPtr + offset);
    const y = load<f32>(yPtr + offset);
    store<f32>(outXPtr + offset, x * cos - y * sin);
    store<f32>(outYPtr + offset, x * sin + y * cos);
  }
}

export function rotate_points_f32(xPtr: usize, yPtr: usize, outXPtr: usize, outYPtr: usize, sin: f32, cos: f32, count: i32): void {
  rotate_xy_f32(xPtr, yPtr, outXPtr, outYPtr, sin, cos, count);
}

export function rotate_vectors_f32(xPtr: usize, yPtr: usize, outXPtr: usize, outYPtr: usize, sin: f32, cos: f32, count: i32): void {
  rotate_xy_f32(xPtr, yPtr, outXPtr, outYPtr, sin, cos, count);
}

export function range_filter_f32(valuesPtr: usize, min: f32, max: f32, outPtr: usize, count: i32): i32 {
  let hits = 0;
  for (let i = 0; i < count; i += 1) {
    const value = load<f32>(valuesPtr + (<usize>i << 2));
    const hit = value >= min && value <= max ? 1 : 0;
    store<u8>(outPtr + <usize>i, hit);
    hits += hit;
  }
  return hits;
}

export function predicate_filter_mask_f32(valuesPtr: usize, min: f32, max: f32, outPtr: usize, count: i32): i32 {
  return range_filter_f32(valuesPtr, min, max, outPtr, count);
}

export function rect_rect_overlap_batch_f32(
  axPtr: usize,
  ayPtr: usize,
  awPtr: usize,
  ahPtr: usize,
  bxPtr: usize,
  byPtr: usize,
  bwPtr: usize,
  bhPtr: usize,
  outPtr: usize,
  count: i32
): i32 {
  let hits = 0;
  for (let i = 0; i < count; i += 1) {
    const offset = <usize>i << 2;
    const hit =
      load<f32>(axPtr + offset) < load<f32>(bxPtr + offset) + load<f32>(bwPtr + offset) &&
      load<f32>(axPtr + offset) + load<f32>(awPtr + offset) > load<f32>(bxPtr + offset) &&
      load<f32>(ayPtr + offset) < load<f32>(byPtr + offset) + load<f32>(bhPtr + offset) &&
      load<f32>(ayPtr + offset) + load<f32>(ahPtr + offset) > load<f32>(byPtr + offset)
        ? 1
        : 0;
    store<u8>(outPtr + <usize>i, hit);
    hits += hit;
  }
  return hits;
}

export function circle_rect_overlap_batch_scalar_f32(
  cxPtr: usize,
  cyPtr: usize,
  rPtr: usize,
  rxPtr: usize,
  ryPtr: usize,
  rwPtr: usize,
  rhPtr: usize,
  outPtr: usize,
  count: i32
): i32 {
  let hits = 0;
  for (let i = 0; i < count; i += 1) {
    const offset = <usize>i << 2;
    const cx = load<f32>(cxPtr + offset);
    const cy = load<f32>(cyPtr + offset);
    const r = load<f32>(rPtr + offset);
    const rx = load<f32>(rxPtr + offset);
    const ry = load<f32>(ryPtr + offset);
    const rw = load<f32>(rwPtr + offset);
    const rh = load<f32>(rhPtr + offset);
    const closestX = Mathf.min(Mathf.max(cx, rx), rx + rw);
    const closestY = Mathf.min(Mathf.max(cy, ry), ry + rh);
    const dx = cx - closestX;
    const dy = cy - closestY;
    const hit = dx * dx + dy * dy <= r * r ? 1 : 0;
    store<u8>(outPtr + <usize>i, hit);
    hits += hit;
  }
  return hits;
}

export function circle_rect_overlap_batch_f32(
  cxPtr: usize,
  cyPtr: usize,
  rPtr: usize,
  rxPtr: usize,
  ryPtr: usize,
  rwPtr: usize,
  rhPtr: usize,
  outPtr: usize,
  count: i32
): i32 {
  return circle_rect_overlap_batch_scalar_f32(cxPtr, cyPtr, rPtr, rxPtr, ryPtr, rwPtr, rhPtr, outPtr, count);
}
