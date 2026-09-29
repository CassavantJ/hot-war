/**
 * Maths that gives bit-for-bit the same answer in every browser. JavaScript only promises
 * that for + − × ÷, square roots and rounding; Math.sin, Math.atan2, Math.hypot and `**`
 * may differ in the last bit between engines, and in a multiplayer game every player's
 * simulation has to agree exactly. So the simulation uses these instead: polynomials
 * built from the operations that are exact.
 */

const HALF_PI = Math.PI / 2;
// π/2 split in two, so reducing a big angle loses no precision (Cody–Waite).
const HALF_PI_HI = 1.5707963267341256;
const HALF_PI_LO = 6.077100506506192e-11;

/** sin on [−π/4, π/4]. */
function sinKernel(x: number): number {
  const x2 = x * x;
  return (
    x +
    x *
      x2 *
      (-1 / 6 +
        x2 *
          (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800 + x2 / 6227020800)))))
  );
}

/** cos on [−π/4, π/4]. */
function cosKernel(x: number): number {
  const x2 = x * x;
  return (
    1 +
    x2 *
      (-1 / 2 +
        x2 *
          (1 / 24 +
            x2 * (-1 / 720 + x2 * (1 / 40320 + x2 * (-1 / 3628800 + x2 * (1 / 479001600))))))
  );
}

/** Which quarter turn `x` is in, and how far into it. */
function reduce(x: number): [number, number] {
  const quarter = Math.round(x / HALF_PI);
  const rest = x - quarter * HALF_PI_HI - quarter * HALF_PI_LO;
  return [((quarter % 4) + 4) % 4, rest];
}

export function dsin(x: number): number {
  const [quarter, r] = reduce(x);
  switch (quarter) {
    case 0:
      return sinKernel(r);
    case 1:
      return cosKernel(r);
    case 2:
      return -sinKernel(r);
    default:
      return -cosKernel(r);
  }
}

export function dcos(x: number): number {
  const [quarter, r] = reduce(x);
  switch (quarter) {
    case 0:
      return cosKernel(r);
    case 1:
      return -sinKernel(r);
    case 2:
      return -cosKernel(r);
    default:
      return sinKernel(r);
  }
}

/** atan on [0, 1]: halve the angle twice, then a short series. */
function atanUnit(t: number): number {
  const once = t / (1 + Math.sqrt(1 + t * t));
  const twice = once / (1 + Math.sqrt(1 + once * once));
  const x2 = twice * twice;
  let term = twice;
  let sum = twice;
  for (let n = 3; n <= 17; n += 2) {
    term *= -x2;
    sum += term / n;
  }
  return sum * 4;
}

export function datan2(y: number, x: number): number {
  if (x === 0 && y === 0) return 0;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  let angle = ay <= ax ? atanUnit(ay / ax) : HALF_PI - atanUnit(ax / ay);
  if (x < 0) angle = Math.PI - angle;
  return y < 0 ? -angle : angle;
}

export function dhypot(x: number, y: number, z = 0): number {
  return Math.sqrt(x * x + y * y + z * z);
}

/** `base` to a whole-number power, by repeated multiplication. */
export function dpowInt(base: number, exponent: number): number {
  let result = 1;
  for (let i = 0; i < exponent; i++) result *= base;
  return result;
}
