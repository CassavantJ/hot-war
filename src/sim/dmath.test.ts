import { describe, expect, it } from 'vitest';

import { datan2, dcos, dhypot, dpowInt, dsin } from './dmath';

describe('deterministic maths', () => {
  it('matches the built-in functions closely', () => {
    let worst = 0;
    for (let i = -2000; i <= 2000; i++) {
      const x = i * 0.0137 + (i % 7) * 1.3;
      worst = Math.max(worst, Math.abs(dsin(x) - Math.sin(x)), Math.abs(dcos(x) - Math.cos(x)));
      const y = Math.sin(i * 0.37) * 50;
      const z = Math.cos(i * 0.91) * 30;
      worst = Math.max(worst, Math.abs(datan2(y, z) - Math.atan2(y, z)));
      expect(dhypot(y, z)).toBeCloseTo(Math.hypot(y, z), 10);
    }
    expect(worst).toBeLessThan(1e-12);
    expect(datan2(0, -1)).toBeCloseTo(Math.PI, 12);
    expect(datan2(-1, 0)).toBeCloseTo(-Math.PI / 2, 12);
    expect(datan2(0, 0)).toBe(0);
    expect(dpowInt(0.8, 3)).toBeCloseTo(0.512, 12);
  });
});
