import type { LevelKey, Tower } from './types';

/**
 * Metres per grade point shown to people. The bake uses 0.16, which makes a single year feel small
 * (2026 ≈ 2,200 m, "2 座桌山"); 0.3 puts a strong year around a 4,000 m peak. Only labels and the
 * headline change, the holds stay the same. Once pipeline/bake.py ships MPP = 0.3 this becomes a no-op.
 */
export const DISPLAY_MPP = 0.3;

export function withDisplayMpp(t: Tower, mpp = DISPLAY_MPP): Tower {
  const f = mpp / (t.mpp || mpp);
  if (Math.abs(f - 1) < 1e-9) return t;
  for (const k of Object.keys(t.levels) as LevelKey[]) {
    const L = t.levels[k];
    L.total *= f;
    for (const p of L.map) p[0] *= f;
  }
  for (const y of Object.values(t.stats.years)) y.metres *= f;
  t.mpp = mpp;
  return t;
}
