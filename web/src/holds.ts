import type { Hold } from './types';
import type { Theme } from './theme';

/** Deterministic per-hold decoration, same hashes as the prototype. Shared by the live tower and the poster. */
export const holeOn = (i: number) => ((Math.imul(i + 7, 2246822519) ^ 0x9e3779b9) >>> 0) / 4294967296 < 0.5;

export function eyeOf(h: Hold, i: number) {
  let a = (i * 2654435761 + 12345) >>> 0;
  const R = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const u = (lo: number, hi: number) => lo + (hi - lo) * R();
  const sm = Math.min(h.w, h.h), r = h.r;
  const fx = h.cx + u(-0.2, 0.2) * sm, fy = h.cy + u(-0.2, 0.08) * sm, ang = u(-25, 25);
  const er = Math.max(1.8, r * u(0.5, 0.62)), gap = r * u(0.9, 1.5);
  const tilt = [-22, -12, 12, 22][Math.floor(R() * 4)], mir = R() < 0.6, t2 = mir ? -tilt : tilt, dy2 = u(-0.4, 0.4) * er;
  const on = R() < 0.4;
  return { on, fx, fy, ang, rx: er * 0.72, ry: er * 1.1, gap, t1: tilt, t2, dy2 };
}
export type Eye = ReturnType<typeof eyeOf>;

/**
 * Paint one hold in box space. The caller sets ctx's transform so (0,0) is the hold's box corner.
 * lift > 0 draws the selected-hold drop shadow, scaled by that device factor.
 */
export function paintHold(ctx: CanvasRenderingContext2D, h: Hold, i: number, path: Path2D, T: Theme,
  eye: () => Eye, lift = 0, alpha = 1) {
  const col = T.cols[h.k];
  ctx.globalAlpha = alpha;
  if (lift) { ctx.shadowColor = T.lift.color; ctx.shadowBlur = T.lift.blur * lift; ctx.shadowOffsetY = T.lift.y * lift; }
  ctx.fillStyle = col; ctx.fill(path);
  ctx.strokeStyle = col; ctx.lineWidth = 0.6; ctx.lineJoin = 'round'; ctx.stroke(path);
  if (lift) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
  ctx.fillStyle = T.eye;
  if (T.bolts && holeOn(i)) { ctx.beginPath(); ctx.arc(h.cx, h.cy, h.r, 0, Math.PI * 2); ctx.fill(); }
  if (T.eyes) {
    const e = eye();
    if (e.on) {
      const R = Math.PI / 180;
      ctx.save(); ctx.translate(e.fx, e.fy); ctx.rotate(e.ang * R);
      for (const [dx, dy, tilt] of [[-e.gap, 0, e.t1], [e.gap, e.dy2, e.t2]]) {
        ctx.save(); ctx.translate(dx, dy); ctx.rotate(tilt * R);
        ctx.beginPath(); ctx.ellipse(0, 0, e.rx, e.ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

/** Metres → tower y via the level's monotone map; null outside it. */
export const lerpMap = (map: [number, number][], m: number) => {
  for (let i = 0; i < map.length - 1; i++) {
    const a = map[i], b = map[i + 1];
    if (m >= a[0] && m <= b[0] && b[0] > a[0]) return a[1] + (b[1] - a[1]) * (m - a[0]) / (b[0] - a[0]);
  }
  return null;
};
