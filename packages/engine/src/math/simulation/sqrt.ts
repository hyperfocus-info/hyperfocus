/*!
 * Port of fdlibm e_sqrt.c, https://netlib.org/fdlibm/e_sqrt.c
 * Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
 * Developed at SunSoft, a Sun Microsystems, Inc. business.
 * Permission to use, copy, modify, and distribute this software is freely
 * granted, provided that this notice is preserved.
 */

const words = new DataView(new ArrayBuffer(8));

/** Correctly rounded binary64 square root using fdlibm's integer bit-by-bit algorithm. */
export function portableSqrt(value: number): number {
  words.setFloat64(0, value, false);
  let high = words.getInt32(0, false), low = words.getUint32(4, false);
  if ((high & 0x7ff00000) === 0x7ff00000) return value * value + value;
  if (high <= 0) {
    if (((high & 0x7fffffff) | low) === 0) return value;
    if (high < 0) return NaN;
  }
  let exponent = high >> 20;
  if (exponent === 0) {
    while (high === 0) { exponent -= 21;high |= low >>> 11;low = (low << 21) >>> 0; }
    let shift = 0;
    while ((high & 0x00100000) === 0) { high <<= 1;shift++; }
    exponent -= shift - 1;
    // JS masks shift counts to five bits, unlike the source's mathematical 32-bit shift.
    if (shift !== 0) high |= low >>> (32 - shift);
    low = (low << shift) >>> 0;
  }
  exponent -= 1023;
  high = (high & 0x000fffff) | 0x00100000;
  if (exponent & 1) { high += high + (low >>> 31);low = (low + low) >>> 0; }
  exponent >>= 1;
  high += high + (low >>> 31);low = (low + low) >>> 0;
  let resultHigh = 0, resultLow = 0, sumHigh = 0, sumLow = 0, bit = 0x00200000;
  while (bit !== 0) {
    const trial = sumHigh + bit;
    if (trial <= high) { sumHigh = trial + bit;high -= trial;resultHigh += bit; }
    high += high + (low >>> 31);low = (low + low) >>> 0;bit >>>= 1;
  }
  bit = 0x80000000;
  while (bit !== 0) {
    const trialLow = (sumLow + bit) >>> 0, trialHigh = sumHigh;
    if (trialHigh < high || (trialHigh === high && trialLow <= low)) {
      sumLow = (trialLow + bit) >>> 0;
      if ((trialLow & 0x80000000) !== 0 && (sumLow & 0x80000000) === 0) sumHigh++;
      high -= trialHigh;
      if (low < trialLow) high--;
      low = (low - trialLow) >>> 0;resultLow = (resultLow + bit) >>> 0;
    }
    high += high + (low >>> 31);low = (low + low) >>> 0;bit >>>= 1;
  }
  // JavaScript binary64 arithmetic always rounds to nearest, ties to even.
  if ((high | low) !== 0) {
    if (resultLow === 0xffffffff) { resultLow = 0;resultHigh++; }
    else resultLow = (resultLow + (resultLow & 1)) >>> 0;
  }
  high = (resultHigh >> 1) + 0x3fe00000 + (exponent << 20);
  low = resultLow >>> 1;
  if (resultHigh & 1) low |= 0x80000000;
  words.setInt32(0, high, false);words.setUint32(4, low, false);
  return words.getFloat64(0, false);
}

/** IEEE f64.sqrt has the same correctly rounded finite results as the portable kernel. */
export const sqrt = acceleratedSquareRoot() ?? portableSqrt;

function acceleratedSquareRoot() {
  try {
    // (module (func (export "sqrt") (param f64) (result f64) local.get 0 f64.sqrt))
    // No imports, memory, fetch, or per-call allocation; one instance per JS realm.
    const instance = new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array([
      0,97,115,109,1,0,0,0,1,6,1,96,1,124,1,124,3,2,1,0,7,8,1,4,115,113,114,116,0,0,10,7,1,5,0,32,0,159,11,
    ])));
    // The fixed module above declares this exact exported numeric signature.
    const squareRoot = instance.exports.sqrt;
    return isSquareRootExport(squareRoot) ? squareRoot : undefined;
  } catch {
    // Restricted CSPs and hosts without WebAssembly retain identical arithmetic.
    return undefined;
  }
}

// The fixed, import-free module above declares this exact numeric signature.
function isSquareRootExport(value: WebAssembly.ExportValue | undefined): value is (value: number) => number {
  return typeof value === "function";
}
