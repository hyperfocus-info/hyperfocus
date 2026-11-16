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
/*!
* ## Notice
*
* The following copyright and license were part of the original implementation available as part of [FreeBSD]{@link https://svnweb.freebsd.org/base/release/9.3.0/lib/msun/src/e_rem_pio2.c}. The implementation follows the original, but has been modified for JavaScript.
*/
/*!
* ```text
* Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
*
* Developed at SunPro, a Sun Microsystems, Inc. business.
* Permission to use, copy, modify, and distribute this
* software is freely granted, provided that this notice
* is preserved.
*
* Optimized by Bruce D. Evans.
* ```
*/
// Adapted to TypeScript; provenance and complete licenses: THIRD_PARTY_NOTICES.md.
const ABS_MASK = 0x7fffffff;
const EXPONENT_MASK = 0x7ff00000;
const SIGNIFICAND_MASK = 0xfffff;
import { getHighWord } from './bits.ts';
import { getLowWord } from './bits.ts';
import { fromWords } from './bits.ts';
import { kernelRempio2 as rempio2Kernel } from './reduction-kernel.ts';
import { rempio2Medium } from './reduction-medium.ts';

let ZERO = 0.00000000000000000000e+00;    // 0x00000000, 0x00000000
let TWO24 = 1.67772160000000000000e+07;   // 0x41700000, 0x00000000

// 33 bits of π/2:
let PIO2_1 = 1.57079632673412561417e+00;  // 0x3FF921FB, 0x54400000

// PIO2_1T = π/2 - PIO2_1:
let PIO2_1T = 6.07710050650619224932e-11; // 0x3DD0B461, 0x1A626331
let TWO_PIO2_1T = 2.0 * PIO2_1T;
let THREE_PIO2_1T = 3.0 * PIO2_1T;
let FOUR_PIO2_1T = 4.0 * PIO2_1T;

// High word significand for π and π/2: 0x921fb = 598523 => 00000000000010010010000111111011
let PI_HIGH_WORD_SIGNIFICAND = 598523; // asm type annotation

// High word for π/4: 0x3fe921fb = 1072243195 => 00111111111010010010000111111011
let PIO4_HIGH_WORD = 1072243195; // asm type annotation

// High word for 3π/4: 0x4002d97c = 1073928572 => 01000000000000101101100101111100
let THREE_PIO4_HIGH_WORD = 1073928572; // asm type annotation

// High word for 5π/4: 0x400f6a7a = 1074752122 => 01000000000011110110101001111010
let FIVE_PIO4_HIGH_WORD = 1074752122; // asm type annotation

// High word for 6π/4: 0x4012d97c = 1074977148 => 01000000000100101101100101111100
let THREE_PIO2_HIGH_WORD = 1074977148; // asm type annotation

// High word for 7π/4: 0x4015fdbc = 1075183036 => 01000000000101011111110110111100
let SEVEN_PIO4_HIGH_WORD = 1075183036; // asm type annotation

// High word for 8π/4: 0x401921fb = 1075388923 => 01000000000110010010000111111011
let TWO_PI_HIGH_WORD = 1075388923; // asm type annotation

// High word for 9π/4: 0x401c463b = 1075594811 => 01000000000111000100011000111011
let NINE_PIO4_HIGH_WORD = 1075594811; // asm type annotation

// 2^20*π/2 = 1647099.3291652855 => 0100000100111001001000011111101101010100010001000010110100011000 => high word => 0x413921fb = 1094263291 => 01000001001110010010000111111011
let MEDIUM = 1094263291; // asm type annotation

// Arrays for storing temporary values:
let TX = [ 0.0, 0.0, 0.0 ];
let TY = [ 0.0, 0.0 ];

export function rempio2(x: number, y: number[]): number {
	let low;
	let e0;
	let hx;
	let ix;
	let nx;
	let i;
	let n;
	let z;

	hx = getHighWord( x )|0; // asm type annotation
	ix = (hx & ABS_MASK)|0; // asm type annotation

	// Case: |x| ~<= π/4 (no need for reduction)
	if ( ix <= PIO4_HIGH_WORD ) {
		y[ 0 ] = x;
		y[ 1 ] = 0.0;
		return 0;
	}
	// Case: |x| ~<= 5π/4
	if ( ix <= FIVE_PIO4_HIGH_WORD ) {
		// Case: |x| ~= π/2 or π
		if ( (ix & SIGNIFICAND_MASK) === PI_HIGH_WORD_SIGNIFICAND ) {
			// Cancellation => use medium case
			return rempio2Medium( x, ix, y );
		}
		// Case: |x| ~<= 3π/4
		if ( ix <= THREE_PIO4_HIGH_WORD ) {
			if ( hx > 0 ) {
				z = x - PIO2_1;
				y[ 0 ] = z - PIO2_1T;
				y[ 1 ] = (z - y[0]) - PIO2_1T;
				return 1;
			}
			z = x + PIO2_1;
			y[ 0 ] = z + PIO2_1T;
			y[ 1 ] = (z - y[0]) + PIO2_1T;
			return -1;
		}
		if ( hx > 0 ) {
			z = x - ( 2.0*PIO2_1 );
			y[ 0 ] = z - TWO_PIO2_1T;
			y[ 1 ] = (z - y[0]) - TWO_PIO2_1T;
			return 2;
		}
		z = x + ( 2.0*PIO2_1 );
		y[ 0 ] = z + TWO_PIO2_1T;
		y[ 1 ] = (z - y[0]) + TWO_PIO2_1T;
		return -2;
	}
	// Case: |x| ~<= 9π/4
	if ( ix <= NINE_PIO4_HIGH_WORD ) {
		// Case: |x| ~<= 7π/4
		if ( ix <= SEVEN_PIO4_HIGH_WORD ) {
			// Case: |x| ~= 3π/2
			if ( ix === THREE_PIO2_HIGH_WORD ) {
				return rempio2Medium( x, ix, y );
			}
			if ( hx > 0 ) {
				z = x - ( 3.0*PIO2_1 );
				y[ 0 ] = z - THREE_PIO2_1T;
				y[ 1 ] = (z - y[0]) - THREE_PIO2_1T;
				return 3;
			}
			z = x + ( 3.0*PIO2_1 );
			y[ 0 ] = z + THREE_PIO2_1T;
			y[ 1 ] = (z - y[0]) + THREE_PIO2_1T;
			return -3;
		}
		// Case: |x| ~= 4π/2
		if ( ix === TWO_PI_HIGH_WORD ) {
			return rempio2Medium( x, ix, y );
		}
		if ( hx > 0 ) {
			z = x - ( 4.0*PIO2_1 );
			y[ 0 ] = z - FOUR_PIO2_1T;
			y[ 1 ] = (z - y[0]) - FOUR_PIO2_1T;
			return 4;
		}
		z = x + ( 4.0*PIO2_1 );
		y[ 0 ] = z + FOUR_PIO2_1T;
		y[ 1 ] = (z - y[0]) + FOUR_PIO2_1T;
		return -4;
	}
	// Case: |x| ~< 2^20*π/2 (medium size)
	if ( ix < MEDIUM ) {
		return rempio2Medium( x, ix, y );
	}
	// Case: x is NaN or infinity
	if ( ix >= EXPONENT_MASK ) {
		y[ 0 ] = NaN;
		y[ 1 ] = NaN;
		return 0.0;
	}
	// Set z = scalbn(|x|, ilogb(x)-23)...
	low = getLowWord( x );
	e0 = (ix >> 20) - 1046; // `e0 = ilogb(z) - 23` => unbiased exponent minus 23
	z = fromWords( ix - ((e0 << 20)|0), low );
	for ( i = 0; i < 2; i++ ) {
		TX[ i ] = z|0;
		z = (z - TX[i]) * TWO24;
	}
	TX[ 2 ] = z;
	nx = 3;
	while ( TX[ nx-1 ] === ZERO ) {
		// Skip zero term...
		nx -= 1;
	}
	n = rempio2Kernel( TX, TY, e0, nx ); // Upstream's unused fifth precision argument is omitted.
	if ( hx < 0 ) {
		y[ 0 ] = -TY[ 0 ];
		y[ 1 ] = -TY[ 1 ];
		return -n;
	}
	y[ 0 ] = TY[ 0 ];
	y[ 1 ] = TY[ 1 ];
	return n;
}
