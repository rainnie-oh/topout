/**
 * "Jelly" interaction: every hold springs back to its baked rest pose, and
 * holds push each other via position-based collision between their
 * distance-transform circles. Ported 1:1 from the prototype.
 */
import type { Hold, Level } from './types';

export const PX_R = 36;          // pusher radius
const EXTRA = 16, MAXO = 26, MAXT = 0.32, KS = 55, CS = 7.5, KR = 70, CR = 8;

export const selScale = (h: Hold) => Math.max(1.4, Math.min(2.4, 84 / Math.max(h.w, h.h)));

type Pose = [number, number, number];

export class Jelly {
  /** per hold: ox, oy, theta(rad), vx, vy, vtheta */
  st: Float32Array;
  nb: number[][];
  mass: number[];
  act = new Set<number>();
  ex = 0;        // how far holds may bulge past the walls while pushed
  fi = -1;       // focused (selected) hold
  fs = 1;        // focused hold's current collision scale
  ft = 1;        // ... and its target

  constructor(private L: Level) {
    const H = L.holds, n = H.length, M = 30;
    this.st = new Float32Array(n * 6);
    const order = H.map((_, i) => i).sort((a, b) => H[a].y - H[b].y);
    this.nb = H.map(() => []);
    for (let a = 0; a < n; a++) {
      const A = H[order[a]];
      for (let b = a + 1; b < n; b++) {
        const B = H[order[b]];
        if (B.y > A.y + A.h + M) break;
        if (B.x > A.x + A.w + M || A.x > B.x + B.w + M) continue;
        this.nb[order[a]].push(order[b]); this.nb[order[b]].push(order[a]);
      }
    }
    this.mass = H.map(h => Math.max(60, h.w * h.h));
  }

  offset(i: number): Pose | null {
    const o = i * 6, s = this.st;
    return s[o] || s[o + 1] || s[o + 2] ? [s[o], s[o + 1], s[o + 2]] : null;
  }

  focus(i: number) {
    const H = this.L.holds;
    if (i >= 0 && H[i]) { this.fi = i; this.fs = 1; this.ft = selScale(H[i]); this.act.add(i); }
    else this.ft = 1;
    for (let k = 0; k < H.length; k++) if (this.offset(k)) this.act.add(k);
  }

  /** Scrolling gives the visible holds a little vertical shove. */
  kick(d: number, top: number, bottom: number, yo: number) {
    this.L.holds.forEach((h, i) => {
      const t = h.y + yo; if (t + h.h < top - 60 || t > bottom + 60) return;
      const f = Math.max(0.5, Math.min(1.4, 1.5 - this.mass[i] / 6000));
      let v = this.st[i * 6 + 4] - d * 0.4 * f; v = Math.max(-170, Math.min(170, v));
      this.st[i * 6 + 4] = v; this.act.add(i);
    });
  }

  /** Advance; ptr is the pusher in tower coordinates (or null). Returns whether it still needs frames. */
  step(dt: number, ptr: { x: number; y: number } | null): boolean {
    const lim = Math.max(1, Math.ceil(dt / (1 / 60)));
    for (let s = 0; s < lim; s++) this.sub(dt / lim, ptr);
    const held = this.fi >= 0 && this.ft > 1;
    return this.act.size > 0 || !!ptr || (this.ex > 0.05 && !(held && this.ex > EXTRA - 0.1))
      || (this.fi >= 0 && Math.abs(this.fs - this.ft) > 0.002) || (this.fi >= 0 && this.ft === 1);
  }

  private sub(dt: number, ptr: { x: number; y: number } | null) {
    const L = this.L, H = L.holds, st = this.st;
    const hold = !!ptr || (this.fi >= 0 && this.ft > 1);
    const tgt = hold ? EXTRA : 0;
    this.ex += (tgt - this.ex) * Math.min(1, dt * (hold ? 14 : 5)); if (!hold && this.ex < 0.05) this.ex = 0;
    if (this.fi >= 0) {
      this.fs += (this.ft - this.fs) * Math.min(1, dt * 11);
      if (Math.abs(this.fs - this.ft) < 0.002) this.fs = this.ft;
      if (this.ft === 1 && this.fs === 1) this.fi = -1;
    }
    const fi = this.fi, fs = this.fs, mo = fi >= 0 ? 46 : MAXO, ex = this.ex, W = L.W;
    const pOn = !!ptr, px = ptr ? ptr.x : 0, py = ptr ? ptr.y : 0;
    if (pOn) {
      H.forEach((h, i) => {
        if (px < h.x - PX_R - MAXO || px > h.x + h.w + PX_R + MAXO || py < h.y - PX_R - MAXO || py > h.y + h.h + PX_R + MAXO) return;
        this.act.add(i);
      });
    }
    // participants = active + neighbours
    const part = new Set<number>();
    this.act.forEach(i => { part.add(i); this.nb[i].forEach(j => part.add(j)); });
    const ids = Array.from(part);
    const pos = new Map<number, Pose>();
    ids.forEach(i => {
      const o = i * 6, act = this.act.has(i);
      let ox = st[o], oy = st[o + 1], th = st[o + 2], vx = st[o + 3], vy = st[o + 4], vt = st[o + 5];
      if (act && i !== fi) {
        vx += (-KS * ox - CS * vx) * dt; vy += (-KS * oy - CS * vy) * dt; vt += (-KR * th - CR * vt) * dt;
        pos.set(i, [ox + vx * dt, oy + vy * dt, th + vt * dt]);
      } else pos.set(i, [ox, oy, th]);
    });
    const circ = (i: number, c: number, p: Pose) => {
      const h = H[i], k = i === fi ? fs : 1, ax = (h.c[c] - h.cx) * k, ay = (h.c[c + 1] - h.cy) * k;
      const co = Math.cos(p[2]), si = Math.sin(p[2]);
      const rx = ax * co - ay * si, ry = ax * si + ay * co;
      return [h.x + h.cx + p[0] + rx, h.y + h.cy + p[1] + ry, h.c[c + 2] * k, rx, ry];
    };
    const apply = (i: number, p: Pose, cx: number, cy: number, rx: number, ry: number) => {
      if (i === fi) return;
      const rg2 = Math.max(100, this.mass[i] * 0.25);
      p[0] += cx; p[1] += cy; p[2] += 0.5 * (rx * cy - ry * cx) / rg2;
    };
    for (let it = 0; it < 3; it++) {
      ids.forEach(i => {
        const h = H[i], p = pos.get(i)!;
        for (let c = 0; c < h.c.length; c += 3) {
          let q = circ(i, c, p);
          if (pOn) {
            const dx = q[0] - px, dy = q[1] - py, d = Math.hypot(dx, dy), need = q[2] + PX_R;
            if (d < need && d > 0.001) { const k = (need - d) / d; apply(i, p, dx * k, dy * k, q[3], q[4]); q = circ(i, c, p); }
          }
          if (q[0] - q[2] < -ex) apply(i, p, -ex - (q[0] - q[2]), 0, q[3], q[4]);
          else if (q[0] + q[2] > W + ex) apply(i, p, W + ex - (q[0] + q[2]), 0, q[3], q[4]);
          q = circ(i, c, p);
          if (q[1] + q[2] > L.H) apply(i, p, 0, L.H - (q[1] + q[2]), q[3], q[4]);
        }
        const l = Math.hypot(p[0], p[1]); if (l > mo) { p[0] *= mo / l; p[1] *= mo / l; }
        p[2] = Math.max(-MAXT, Math.min(MAXT, p[2]));
      });
      ids.forEach(i => {
        this.nb[i].forEach(j => {
          if (j < i || !part.has(j)) return;
          const A = H[i], B = H[j], pa = pos.get(i)!, pb = pos.get(j)!;
          const wa = i === fi ? 0 : j === fi ? 1 : this.mass[j] / (this.mass[i] + this.mass[j]);
          for (let a = 0; a < A.c.length; a += 3) for (let b = 0; b < B.c.length; b += 3) {
            const qa = circ(i, a, pa), qb = circ(j, b, pb);
            const dx = qb[0] - qa[0], dy = qb[1] - qa[1], d = Math.hypot(dx, dy), need = qa[2] + qb[2] + 0.5;
            if (d < need && d > 0.001) {
              const k = (need - d) / d;
              apply(i, pa, -dx * k * wa, -dy * k * wa, qa[3], qa[4]);
              apply(j, pb, dx * k * (1 - wa), dy * k * (1 - wa), qb[3], qb[4]);
            }
          }
        });
      });
    }
    ids.forEach(i => {
      const o = i * 6, p = pos.get(i)!, act = this.act.has(i);
      if (act) { st[o + 3] = (p[0] - st[o]) / dt; st[o + 4] = (p[1] - st[o + 1]) / dt; st[o + 5] = (p[2] - st[o + 2]) / dt; }
      else if (Math.abs(p[0] - st[o]) + Math.abs(p[1] - st[o + 1]) + Math.abs(p[2] - st[o + 2]) * 10 > 0.02) {
        st[o + 3] = 0; st[o + 4] = 0; st[o + 5] = 0; this.act.add(i);
      }
      st[o] = p[0]; st[o + 1] = p[1]; st[o + 2] = p[2];
    });
    // sleep
    Array.from(this.act).forEach(i => {
      const o = i * 6;
      const calm = Math.abs(st[o + 3]) < 1.5 && Math.abs(st[o + 4]) < 1.5 && Math.abs(st[o + 5]) < 0.05 && !ptr;
      if (i === fi) { if (Math.abs(fs - this.ft) < 0.01) this.act.delete(i); return; }
      if (fi >= 0 && this.ft > 1) { if (calm && Math.abs(fs - this.ft) < 0.01) this.act.delete(i); return; }
      if (Math.abs(st[o]) < 0.12 && Math.abs(st[o + 1]) < 0.12 && Math.abs(st[o + 2]) < 0.004 && calm) {
        for (let k = 0; k < 6; k++) st[o + k] = 0;
        this.act.delete(i);
      }
    });
  }
}
