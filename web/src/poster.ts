import type { Hold, Level, LevelKey, Tower, YearStats } from './types';
import { FONT, GRADE, type Theme } from './theme';
import { LANDMARKS, fmt, hero, versusLastYear } from './copy';
import { eyeOf, lerpMap, paintHold } from './holds';

/**
 * Share poster, 1080 wide. At least 9:16 (1080×1920); when the current view's tower is taller it becomes a long image.
 * Laid out on the same 390-wide logical stage as the app, then scaled.
 */
export const POSTER_W = 1080, POSTER_MIN_H = 1920, POSTER_MAX_H = 16000;   // iOS caps canvas area at ~16.7 MP
const PW = 390, S = POSTER_W / PW, PH_MIN = POSTER_MIN_H / S;   // ≈ 693 logical px
const X = 24, XR = PW - 24;
// vertical rhythm (logical px)
const ZONE_TOP = 184, BELOW = 102, TOWER_MAX_W = 240, TOWER_MAX_SCALE = 1.2;   // BELOW: ground line to bottom edge (stats row + ~40px)
const LABEL_GAP = 34;   // min spacing between landmark labels

export interface PosterOpts { T: Tower; theme: Theme; name: string; year?: number; level?: LevelKey }

/** The poster is the latest year only. */
export const posterYear = (T: Tower) => {
  const ks = T.levels.y.holds.map(h => h.key);
  return ks.length ? Math.max(...ks) : Math.max(0, ...Object.keys(T.stats.years).map(Number));
};

const yearOfKey = (T: Tower, lv: LevelKey, key: number) =>
  lv === 'm' ? Math.floor(key / 12)
    : lv === 'w' ? new Date(Date.parse(T.weekEpoch + 'T00:00:00Z') + key * 7 * 86400000).getUTCFullYear()
      : key;

/** Collision circles in tower space. */
const circlesOf = (h: Hold) => {
  const out: [number, number, number][] = [];
  for (let j = 0; j + 2 < h.c.length; j += 3) out.push([h.x + h.c[j], h.y + h.c[j + 1], h.c[j + 2]]);
  return out;
};

/**
 * The cut-out year was baked resting on the years below it, so drop every hold straight down
 * (lowest first) until one of its collision circles lands on a hold already placed, or on the ground.
 */
function settle(hs: Hold[]): Hold[] {
  const out = hs.map(h => ({ ...h }));
  const ground = Math.max(...out.map(h => h.y + h.h));
  const order = out.map((_, i) => i).sort((a, b) => (out[b].y + out[b].h) - (out[a].y + out[a].h));
  const placed: [number, number, number][] = [];
  for (const i of order) {
    const h = out[i];
    let drop = ground - (h.y + h.h);
    for (const [ax, ay, ar] of circlesOf(h)) for (const [bx, by, br] of placed) {
      const R = ar + br, dx = bx - ax;
      if (Math.abs(dx) >= R || by < ay) continue;
      drop = Math.min(drop, by - ay - Math.sqrt(R * R - dx * dx));
    }
    h.y += Math.max(0, drop);
    placed.push(...circlesOf(h));
  }
  return out;
}

/**
 * One year cut out of the current view's level and re-stacked from the ground.
 * Metres per time bucket come from the level's map.
 */
function yearSlice(T: Tower, year: number, lv: LevelKey): { L: Level; st: YearStats; maxK: number } {
  const V = T.levels[lv], st = T.stats.years[year] ?? { sessions: 0, sends: 0, metres: 0 };
  const raw = V.holds.filter(h => yearOfKey(T, lv, h.key) === year);
  if (!raw.length) return { L: { H: 0, W: V.W, total: st.metres, map: [[0, 0]], holds: [] }, st, maxK: -1 };
  const set = settle(raw);
  const top = Math.min(...set.map(h => h.y)), H = Math.max(...set.map(h => h.y + h.h)) - top;
  const hs = set.map(h => ({ ...h, y: h.y - top }));
  // per-bucket metres from the level's cumulative map (entry i+1 belongs to the i-th sorted key)
  const keys = [...new Set(V.holds.map(h => h.key))].sort((a, b) => a - b);
  const mine = [...new Set(hs.map(h => h.key))].sort((a, b) => a - b);
  const map: [number, number][] = [[0, H]];
  let cum = 0, run = H;
  for (const k of mine) {
    const i = keys.indexOf(k) + 1, prev = V.map[i - 1]?.[0] ?? 0, cur = V.map[i]?.[0] ?? prev;
    cum += Math.max(0, cur - prev);
    const g = hs.filter(h => h.key === k);
    run = Math.min(run, g.reduce((a, h) => a + h.y + h.cy, 0) / g.length);
    map.push([cum, run]);
  }
  // stats.years is the source of truth for the headline number; rescale the map to it
  const total = st.metres || cum, f = cum > 0 ? total / cum : 1;
  for (const p of map) p[0] *= f;
  map.push([total + 0.001, 0]);
  return { L: { H, W: V.W, total, map, holds: hs }, st, maxK: Math.max(...hs.map(h => h.k)) };
}
export const posterName = (T: Tower) => `topout-${posterYear(T)}.png`;

/** Shrink the font until the text fits maxW. */
function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, min: number, maxW: number) {
  for (let s = size; s >= min; s -= 1) {
    ctx.font = `${weight} ${s}px ${FONT}`;
    if (ctx.measureText(text).width <= maxW) return s;
  }
  return min;
}

export function drawPoster({ T, theme: th, name, year = posterYear(T), level = 'm' }: PosterOpts): HTMLCanvasElement {
  const { L, st, maxK } = yearSlice(T, year, level), total = L.total;

  // ----- size: the tower keeps a fixed width; the poster grows to fit it (long image), never below 9:16 -----
  const H = Math.max(1, L.H), W = Math.max(1, L.W);
  let ts = Math.min(TOWER_MAX_W / W, TOWER_MAX_SCALE);
  const maxTower = POSTER_MAX_H / S - ZONE_TOP - BELOW - 46;
  if (H * ts > maxTower) ts = maxTower / H;
  const PH = Math.max(PH_MIN, ZONE_TOP + 46 + H * ts + BELOW);
  const GROUND = PH - BELOW, STAT_N = PH - 58, STAT_L = PH - 40;

  const cv = document.createElement('canvas');
  cv.width = POSTER_W; cv.height = Math.round(PH * S);
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = th.bg; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.textBaseline = 'alphabetic';
  const h = hero(total, versusLastYear(T));
  const nm = (name || '').trim() || '岩友';

  // ----- header -----
  ctx.textAlign = 'left';
  ctx.font = `600 13px ${FONT}`; ctx.fillStyle = th.mute;
  ctx.fillText(`${year} Topout 年度报告`, X, 52);
  ctx.font = `600 15px ${FONT}`;
  ctx.fillText(`${nm}，`, X, 90);
  ctx.fillStyle = th.ink;
  fitFont(ctx, h.title, 700, 32, 22, XR - X);
  ctx.fillText(h.title, X, 128);
  ctx.fillStyle = th.mute;
  fitFont(ctx, h.sub, 400, 13, 10, XR - X);
  ctx.fillText(h.sub, X, 152);

  // ----- tower sits on the ground line -----
  const oy = GROUND - H * ts;
  const toY = (ty: number) => oy + ty * ts;

  // ground
  ctx.fillStyle = th.dash; ctx.fillRect(X, GROUND + 0.5, XR - X, 1);

  // ----- peak: total metres -----
  const peakT = lerpMap(L.map, total);
  const peakY = Math.max(ZONE_TOP + 46, peakT === null ? oy : toY(peakT));
  ctx.textAlign = 'right';
  ctx.fillStyle = th.ink; ctx.fillRect(XR - 28, peakY - 0.75, 28, 1.5);
  ctx.font = `700 28px ${FONT}`; ctx.fillText(`${fmt(total)} m`, XR, peakY - 10);
  ctx.font = `600 11px ${FONT}`; ctx.fillStyle = th.mute; ctx.fillText(`${year} 年爬升`, XR, peakY - 42);

  // ----- landmarks below the peak, bottom-up, skipping crowded ones -----
  let lastY = GROUND + LABEL_GAP;
  for (const [lname, lm] of LANDMARKS) {
    if (lm > total) break;
    const ty = lerpMap(L.map, lm); if (ty === null) continue;
    const y = toY(ty);
    if (lastY - y < LABEL_GAP || y - peakY < 56) continue;
    lastY = y;
    const yy = Math.round(y * S) / S + 0.5 / S;
    ctx.strokeStyle = th.dash; ctx.lineWidth = 1 / S * 2; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(X, yy); ctx.lineTo(XR, yy); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = `600 11px ${FONT}`; ctx.fillStyle = th.ink; ctx.fillText(lname, XR, y - 18);
    ctx.font = `400 11px ${FONT}`; ctx.fillStyle = th.mute; ctx.fillText(`${lm.toLocaleString('en-US')} m`, XR, y - 5);
  }

  // ----- holds (drawn over the dashes, like the app) -----
  L.holds.forEach((hd, i) => {
    ctx.setTransform(S * ts, 0, 0, S * ts, S * (X + hd.x * ts), S * toY(hd.y));
    paintHold(ctx, hd, i, new Path2D(hd.d), th, () => eyeOf(hd, i));
  });
  ctx.setTransform(S, 0, 0, S, 0, 0);

  // ----- stats row -----
  ctx.textAlign = 'left';
  const stats: [string, string][] = [[fmt(st.sessions), '次攀岩'], [fmt(st.sends), '条线'], [GRADE[maxK] ?? '-', '最高等级']];
  let sx = X;
  for (const [n, lab] of stats) {
    ctx.font = `700 28px ${FONT}`; ctx.fillStyle = th.ink; ctx.fillText(n, sx, STAT_N);
    const w = ctx.measureText(n).width;
    ctx.font = `400 12px ${FONT}`; ctx.fillStyle = th.mute; ctx.fillText(lab, sx, STAT_L);
    sx += Math.max(w, ctx.measureText(lab).width) + 32;
  }

  return cv;
}

export async function posterBlob(o: PosterOpts): Promise<Blob> {
  try { await Promise.all(['400', '600', '700'].map(w => document.fonts.load(`${w} 16px Inter`))); } catch { /* fall back to system fonts */ }
  const cv = drawPoster(o);
  return new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
}
