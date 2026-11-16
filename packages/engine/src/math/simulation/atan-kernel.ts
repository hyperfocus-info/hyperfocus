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
* The original C code, long comment, copyright, license, and constants are from [Cephes]{@link http://www.netlib.org/cephes}. The implementation follows the original, but has been modified for JavaScript.
*/
/*!
* ```text
* Copyright 1984, 1995, 2000 by Stephen L. Moshier
*
* Some software in this archive may be from the book _Methods and Programs for Mathematical Functions_ (Prentice-Hall or Simon & Schuster International, 1989) or from the Cephes Mathematical Library, a commercial product. In either event, it is copyrighted by the author. What you see here may be used freely but it comes with no support or guarantee.
*
* Stephen L. Moshier
* moshier@na-net.ornl.gov
* ```
*/
// Adapted to TypeScript; provenance and complete licenses: THIRD_PARTY_NOTICES.md.
const isnan = Number.isNaN;
const PINF = Infinity;
const PIO2 = 1.5707963267948966;
const PIO4 = 0.7853981633974483;
const NINF = -Infinity;
import { evalpoly as polyvalP } from './atan-poly-p.ts';
import { evalpoly as polyvalQ } from './atan-poly-q.ts';

let MOREBITS = 6.123233995736765886130e-17; // pi/2 = PIO2 + MOREBITS.
let T3P8 = 2.41421356237309504880; // tan( 3*pi/8 )

export function atan(x: number): number {
	let flg;
	let sgn;
	let y;
	let z;
	if ( isnan( x ) || x === 0.0 ) {
		return x;
	}
	if ( x === PINF ) {
		return PIO2;
	}
	if ( x === NINF ) {
		return -PIO2;
	}
	if ( x < 0.0 ) {
		sgn = true;
		x = -x;
	}
	// Range reduction:
	flg = 0;
	if ( x > T3P8 ) {
		y = PIO2;
		flg = 1;
		x = -( 1.0/x );
	} else if ( x <= 0.66 ) {
		y = 0.0;
	} else {
		y = PIO4;
		flg = 2;
		x = (x-1.0) / (x+1.0);
	}
	z = x * x;
	z = z*polyvalP( z ) / polyvalQ( z );
	z = ( x*z ) + x;
	if ( flg === 2 ) {
		z += 0.5 * MOREBITS;
	} else if ( flg === 1 ) {
		z += MOREBITS;
	}
	y += z;
	return ( sgn ) ? -y : y;
}
