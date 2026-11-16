/** Maps dense fixed-width tuples without a widening cast or additional arrays.
 * Callbacks read each current element in ascending order and receive the source. */
export function map3<const Values extends readonly [unknown, unknown, unknown], Result>(
  values: Values, project: (value: Values[number], index: 0 | 1 | 2, values: Values) => Result,
): [Result, Result, Result] {
  return [project(values[0], 0, values), project(values[1], 1, values), project(values[2], 2, values)];
}

export function map4<const Values extends readonly [unknown, unknown, unknown, unknown], Result>(
  values: Values, project: (value: Values[number], index: 0 | 1 | 2 | 3, values: Values) => Result,
): [Result, Result, Result, Result] {
  return [project(values[0], 0, values), project(values[1], 1, values), project(values[2], 2, values), project(values[3], 3, values)];
}
