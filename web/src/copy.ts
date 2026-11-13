import type { Tower } from './types';

/** Globally recognisable heights, metres. */
export const LANDMARKS: [string, number][] = [
  ['自由女神像', 93], ['埃菲尔铁塔', 330], ['帝国大厦', 443], ['台北101', 508], ['哈利法塔', 828], ['酋长岩', 914],
  ['桌山', 1086], ['半圆顶', 2693], ['富士山', 3776], ['京那巴鲁山', 4095], ['马特洪峰', 4478], ['勃朗峰', 4806],
  ['乞力马扎罗', 5895], ['阿空加瓜', 6961], ['珠穆朗玛峰', 8849], ['客机巡航', 10668], ['平流层底', 20000], ['太空边缘', 100000],
];

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** Index of the highest landmark at or below m, or -1. */
export const landmarkBelow = (m: number) => {
  let k = -1;
  LANDMARKS.forEach((l, i) => { if (m >= l[1]) k = i; });
  return k;
};

/**
 * "比去年高 X%，" when the latest year out-climbed the one before it.
 * Replaces the prototype's "比 Alex 爬得还高" placeholder until real friend data exists.
 * Note: the latest year may still be in progress, so this only shows when it already beats last year.
 */
export function versusLastYear(t: Tower): string {
  const ys = Object.keys(t.stats.years).map(Number).sort((a, b) => a - b);
  if (ys.length < 2) return '';
  const cur = t.stats.years[ys[ys.length - 1]], prev = t.stats.years[ys[ys.length - 2]];
  if (!prev || prev.metres <= 0 || cur.metres <= prev.metres) return '';
  return `比去年高 ${Math.round((cur.metres / prev.metres - 1) * 100)}%，`;
}

export function hero(total: number, vs: string): { title: string; sub: string } {
  const k = landmarkBelow(total);
  if (k < 0) return { title: '你的第一步已经迈出', sub: `累计 ${fmt(total)} m，先从${LANDMARKS[0][0]}开始` };
  const l = LANDMARKS[k], nx = LANDMARKS[k + 1];
  if (k === LANDMARKS.length - 1) return { title: '你爬出了大气层', sub: `${vs}累计 ${fmt(total)} m` };
  if (l[0] === '平流层底') return { title: '你爬进了平流层', sub: `${vs}再爬 ${fmt(nx[1] - total)} m 就到太空边缘` };
  if (l[0] === '客机巡航') return { title: '你爬到了客机的高度', sub: `${vs}下一站平流层` };
  const r = total / l[1], n = r >= 10 ? String(Math.round(r)) : r.toFixed(1).replace(/\.0$/, '');
  return {
    title: r < 1.1 ? `你爬过了${l[0]}` : `你爬了 ${n} 座${l[0]}`,
    sub: `${vs}再爬 ${fmt(nx[1] - total)} m 就是${nx[0]}`,
  };
}
