/*!
* @license Apache-2.0
*
* Copyright (c) 2018 The Stdlib Authors.
*/
/*!
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*    http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
// Adapted to TypeScript; provenance and complete licenses: THIRD_PARTY_NOTICES.md.
// NOTES //

const PINF = Infinity;
const NINF = -Infinity;
const BIAS = 1023;
const MAX_EXPONENT = 1023;
const MAX_SUBNORMAL_EXPONENT = -1023;
const MIN_SUBNORMAL_EXPONENT = -1074;
const isnan = Number.isNaN;
const isInfinite = (x: number) => x === Infinity || x === -Infinity;
import { copysign } from './bits.ts';
import { normalize } from './bits.ts';
import { floatExp } from './bits.ts';
import { toWords } from './bits.ts';
import { fromWords } from './bits.ts';

// 1/(1<<52) = 1/(2**52) = 1/4503599627370496
let TWO52_INV = 2.220446049250313e-16;

// Exponent all 0s: 1 00000000000 11111111111111111111 => 2148532223
let CLEAR_EXP_MASK = 2148532223; // asm type annotation

// Normalization workspace:
let FRAC = [ 0.0, 0.0 ];

// High/low words workspace:
let WORDS = [ 0, 0 ];

export function ldexp(frac: number, exp: number): number {
	let high;
	let m;
	if (
		exp === 0 ||
		frac === 0.0 || // handles +-0
		isnan( frac ) ||
		isInfinite( frac )
	) {
		return frac;
	}
	// Normalize the input fraction:
	normalize( frac, FRAC, 1, 0 );
	frac = FRAC[ 0 ];
	exp += FRAC[ 1 ];

	// Extract the exponent from `frac` and add it to `exp`:
	exp += floatExp( frac );

	// Check for underflow/overflow...
	if ( exp < MIN_SUBNORMAL_EXPONENT ) {
		return copysign( 0.0, frac );
	}
	if ( exp > MAX_EXPONENT ) {
		if ( frac < 0.0 ) {
			return NINF;
		}
		return PINF;
	}
	// Check for a subnormal and scale accordingly to retain precision...
	if ( exp <= MAX_SUBNORMAL_EXPONENT ) {
		exp += 52;
		m = TWO52_INV;
	} else {
		m = 1.0;
	}
	// Split the fraction into higher and lower order words:
	toWords( frac, WORDS, 1, 0 );
	high = WORDS[ 0 ];

	// Clear the exponent bits within the higher order word:
	high &= CLEAR_EXP_MASK;

	// Set the exponent bits to the new exponent:
	high |= ((exp+BIAS) << 20);

	// Create a new floating-point number:
	return m * fromWords( high, WORDS[ 1 ] );
}
