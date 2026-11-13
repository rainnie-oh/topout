import type { Hold, Level, LevelKey, Tower } from './types';
import { THEMES, GRADE, FONT, type Theme } from './theme';
import { LANDMARKS, fmt, hero, landmarkBelow, versusLastYear } from './copy';
import { Jelly, selScale } from './physics';
import { eyeOf, lerpMap, paintHold, type Eye } from './holds';
import { posterBlob, posterName } from './poster';

// ---- layout (logical px on a 390-wide stage) ----
const PW = 390, LG = 18, YO = 24;
const LEVELS: LevelKey[] = ['y', 'm', 'w'];
// ---- drop animation ----
const FPS = 30, SPEED = 2.4, START = 0.4;
// ---- gestures ----
const TAP_SLOP = 8, DIR_RATIO = 1.2, HOLD_MS = 220;
const DAY = 86400000;

type Mat = DOMMatrix;
interface Anim { level: LevelKey; d: Map<number, number>; t0: number; end: number }
interface Drag { mode: 'wait' | 'scroll' | 'push'; x: number; y: number; y0: number; timer: number }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const yToM = (map: [number, number][], y: number) => {
  for (let i = 0; i < map.length - 1; i++) {
    const a = map[i], b = map[i + 1], lo = Math.min(a[1], b[1]), hi = Math.max(a[1], b[1]);
    if (b[1] !== a[1] && y >= lo && y <= hi) return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
  }
  return y > map[0][1] ? 0 : map[map.length - 1][0];
};
const easeOutBack = (t: number) => { const c1 = 1.70158 * 1.2, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

const store = {
  get(k: string) { try { return localStorage.getItem('topout.' + k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem('topout.' + k, v); } catch { /* private mode */ } },
};
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class App {
  private frame = $('frame');
  private world = $('world');
  private canvas = $<HTMLCanvasElement>('tower');
  private ctx = this.canvas.getContext('2d')!;
  private hit = document.createElement('canvas').getContext('2d')!;
  private el = {
    hero: $('hero'), name: $<HTMLInputElement>('name'), title: $('hero-title'), sub: $('hero-sub'),
    sessions: $('stat-sessions'), sends: $('stat-sends'), max: $('stat-max'),
    years: $('years'), reading: $('reading'), rName: $('reading-name'), rM: $('reading-m'), rDate: $('reading-date'),
    tag: $('tag'), tagText: $('tag-text'), share: $('share'), mode: $('mode'), toTop: $('to-top'),
    tip: $('tip'), tipDot: $('tip-dot'), tipG: $('tip-g'), tipN: $('tip-n'), tipRange: $('tip-range'),
    seg: $('seg'), toast: $('toast'),
  };

  // view state
  private level: LevelKey = 'w';
  private y0 = 0;
  private sel = -1;
  private light = store.get('theme') === 'light';
  // stage metrics
  private scale = 1; private dpr = 1; private VH = 844;
  private topCtl = 58; private botCtl = 34; private TOP_MIN = -290;
  // runtime
  private jelly: Partial<Record<LevelKey, Jelly>> = {};
  private paths: Partial<Record<LevelKey, Path2D[]>> = {};
  private eyes: Partial<Record<LevelKey, Eye[]>> = {};
  private anim: Anim | null = null;
  private ptr: { x: number; y: number } | null = null;
  private selT0 = 0; private dimT = 0; private dimFor = -1;
  private raf = 0; private last = 0;
  private scrollTween = 0;
  private wheelLock = 0;
  private drawn: { i: number; m: Mat }[] = [];
  private yearList: number[];

  constructor(private T: Tower) {
    this.yearList = Object.keys(T.stats.years).map(Number).sort((a, b) => a - b);
    const nm = store.get('name'); if (nm) this.el.name.value = nm;
    this.applyTheme();
    this.fillHero();
    this.measure();
    this.y0 = this.TOP_MIN;
    this.bind();
    this.syncName();
    this.render();
    setTimeout(() => this.drop(), 60);
    document.fonts?.ready.then(() => { this.syncName(); this.invalidate(); });
    if (import.meta.env.DEV) (window as unknown as { topout: unknown }).topout = { poster: (lv?: LevelKey) => this.posterFor(lv).then(b => URL.createObjectURL(b)), open: () => this.share() };
  }

  // ---------- data helpers ----------
  private get L(): Level { return this.T.levels[this.level]; }
  private get th(): Theme { return this.light ? THEMES.light : THEMES.dark; }
  private jl(lv = this.level) { return (this.jelly[lv] ||= new Jelly(this.T.levels[lv])); }
  private pathOf(i: number) {
    const P = (this.paths[this.level] ||= []);
    return (P[i] ||= new Path2D(this.L.holds[i].d));
  }
  private eyeAt(i: number) {
    const E = (this.eyes[this.level] ||= []);
    return (E[i] ||= eyeOf(this.L.holds[i], i));
  }
  private keyYM(lv: LevelKey, key: number): [number, number, Date | null] {
    if (lv === 'w') { const d = new Date(Date.parse(this.T.weekEpoch + 'T00:00:00Z') + key * 7 * DAY); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d]; }
    if (lv === 'm') return [Math.floor(key / 12), key % 12 + 1, null];
    return [key, 1, null];
  }
  private labelRange(lv: LevelKey, key: number) {
    const [y, m, d] = this.keyYM(lv, key);
    if (lv === 'w' && d) {
      const e = new Date(d.getTime() + 6 * DAY), em = e.getUTCMonth() + 1;
      return `${y} 年 ${m} 月 ${d.getUTCDate()} 日 到 ${em === m ? '' : em + ' 月 '}${e.getUTCDate()} 日`;
    }
    return lv === 'm' ? `${y} 年 ${m} 月` : `${y} 年`;
  }
  private bounds(lv = this.level): [number, number] {
    return [this.TOP_MIN, Math.max(this.TOP_MIN, this.T.levels[lv].H + YO + 48 - this.VH)];
  }

  // ---------- setup ----------
  private fillHero() {
    const s = this.T.stats, h = hero(this.T.levels.w.total, versusLastYear(this.T));
    this.el.title.textContent = h.title;
    this.el.sub.textContent = h.sub;
    this.el.sessions.textContent = fmt(s.sessions);
    this.el.sends.textContent = fmt(s.sends);
    this.el.max.textContent = GRADE[s.maxBucket];
  }

  private applyTheme() {
    document.documentElement.dataset.theme = this.light ? 'light' : 'dark';
    this.el.mode.setAttribute('aria-label', this.light ? '切换到深色' : '切换到浅色');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', this.th.bg);
  }

  /** Scale the 390px stage to the device, and read real safe-area insets. */
  private measure() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const cssW = Math.min(vw, 440);
    this.scale = cssW / PW;
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.VH = vh / this.scale;
    const cs = getComputedStyle($('safe-probe'));
    const st = parseFloat(cs.paddingTop) || 0, sb = parseFloat(cs.paddingBottom) || 0;
    this.topCtl = Math.max(16, st / this.scale + 4);
    this.botCtl = Math.max(20, sb / this.scale);
    this.TOP_MIN = -(this.topCtl + 232);
    this.frame.style.width = cssW + 'px';
    this.world.style.height = this.VH + 'px';
    this.world.style.transform = `scale(${this.scale})`;
    this.canvas.style.width = PW + 'px';
    this.canvas.style.height = this.VH + 'px';
    this.canvas.width = Math.round(PW * this.scale * this.dpr);
    this.canvas.height = Math.round(this.VH * this.scale * this.dpr);
    this.el.hero.style.paddingTop = this.topCtl + 46 + 'px';
    for (const b of [this.el.share, this.el.mode]) b.style.top = this.topCtl + 'px';
    this.el.tag.style.top = this.topCtl + 'px';
    this.el.toTop.style.bottom = this.botCtl + 'px';
    this.el.seg.style.bottom = this.botCtl + 'px';
    this.el.toast.style.bottom = this.botCtl + 56 + 'px';
    this.el.reading.style.top = this.VH / 2 - 40 + 'px';
    const [a, b] = this.bounds(); this.y0 = clamp(this.y0, a, b);
  }

  private bind() {
    const w = this.world;
    window.addEventListener('resize', () => { this.measure(); this.invalidate(); });
    w.addEventListener('wheel', (e) => {
      e.preventDefault(); this.scrollTween = 0;
      if (e.ctrlKey) {               // trackpad pinch / ctrl+wheel = change zoom level
        const now = Date.now(); if (now - this.wheelLock < 420 || Math.abs(e.deltaY) < 1) return;
        this.wheelLock = now; this.step(e.deltaY > 0 ? -1 : 1);
      } else this.scrollTo(this.y0 + e.deltaY / this.scale * (e.deltaMode === 1 ? 16 : 1));
    }, { passive: false });
    w.addEventListener('pointerdown', (e) => this.onDown(e));
    this.el.name.addEventListener('input', () => { this.syncName(); store.set('name', this.el.name.value); });
    this.el.name.addEventListener('blur', () => { if (!this.el.name.value.trim()) { this.el.name.value = '岩友'; this.syncName(); store.set('name', '岩友'); } });
    this.el.name.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.el.name.blur(); });
    this.el.mode.addEventListener('click', () => { this.light = !this.light; store.set('theme', this.light ? 'light' : 'dark'); this.applyTheme(); this.invalidate(); });
    this.el.toTop.addEventListener('click', () => this.toTop());
    this.el.share.addEventListener('click', () => this.share());
    this.el.seg.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.addEventListener('click', () => this.setLevel(b.dataset.level as LevelKey)));
  }

  private syncName() {
    const s = this.el.name.value || '';
    const w = [...s].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 15.5 : 8.8), 0);
    this.el.name.style.width = Math.max(24, Math.ceil(w) + 4) + 'px';
  }

  // ---------- gestures ----------
  private toLocal(e: PointerEvent) {
    const r = this.world.getBoundingClientRect();
    return { x: (e.clientX - r.left) / this.scale, y: (e.clientY - r.top) / this.scale };
  }

  private onDown(e: PointerEvent) {
    if ((e.target as Element).closest?.('[data-ui]')) return;
    if (e.button !== 0) return;
    this.scrollTween = 0;
    const g: Drag = { mode: 'wait', x: e.clientX, y: e.clientY, y0: this.y0, timer: 0 };
    let last = e;
    const startPush = (ev: PointerEvent) => { g.mode = 'push'; this.ptr = this.toLocal(ev); this.invalidate(); };
    g.timer = window.setTimeout(() => { if (g.mode === 'wait') startPush(last); }, HOLD_MS);
    const mv = (ev: PointerEvent) => {
      last = ev;
      if (g.mode === 'wait') {
        const dx = ev.clientX - g.x, dy = ev.clientY - g.y;
        if (Math.hypot(dx, dy) < TAP_SLOP * this.scale) return;
        clearTimeout(g.timer);
        if (Math.abs(dy) > Math.abs(dx) * DIR_RATIO) { g.mode = 'scroll'; g.y = ev.clientY; g.y0 = this.y0; }
        else startPush(ev);
        return;
      }
      if (g.mode === 'scroll') this.scrollTo(g.y0 + (g.y - ev.clientY) / this.scale);
      else { this.ptr = this.toLocal(ev); this.invalidate(); }
    };
    const up = (ev: PointerEvent) => {
      clearTimeout(g.timer);
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (g.mode === 'wait' && ev.type === 'pointerup') {      // a tap: select whatever is under the finger (or clear)
        const p = this.toLocal(ev); this.select(this.pick(p.x, p.y));
      }
      this.ptr = null; this.invalidate();
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }

  private pick(x: number, y: number) {
    for (let k = this.drawn.length - 1; k >= 0; k--) {
      const { i, m } = this.drawn[k];
      const p = m.inverse().transformPoint(new DOMPoint(x, y));
      if (this.hit.isPointInPath(this.pathOf(i), p.x, p.y)) return i;
    }
    return -1;
  }

  private select(i: number) {
    if (i === this.sel && i >= 0) i = -1;    // tapping the selected hold again clears it
    if (i >= 0) { this.selT0 = performance.now(); this.dimFor = i; }
    this.sel = i;
    this.jl().focus(i);
    this.invalidate();
  }

  // ---------- navigation ----------
  private scrollTo(y: number) {
    const [a, b] = this.bounds(), ny = clamp(y, a, b), d = ny - this.y0;
    this.y0 = ny;
    if (d !== 0 && !this.anim) this.jl().kick(d, this.y0, this.y0 + this.VH, YO);
    this.invalidate();
  }

  private toTop() {
    const from = this.y0, to = this.TOP_MIN, dur = Math.min(900, 350 + Math.abs(from - to) * 0.1), t0 = performance.now();
    this.scrollTween = t0;
    if (this.sel >= 0) this.select(-1);
    const stepF = (now: number) => {
      if (this.scrollTween !== t0) return;
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      this.scrollTo(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(stepF);
    };
    requestAnimationFrame(stepF);
  }

  private step(dir: number) { const i = LEVELS.indexOf(this.level) + dir; if (i >= 0 && i <= 2) this.setLevel(LEVELS[i]); }

  private setLevel(nl: LevelKey) {
    if (nl === this.level) { this.select(-1); setTimeout(() => this.drop(), 30); return; }
    const m = yToM(this.L.map, this.y0 + this.VH / 2 - YO);       // keep the same metre under the centre line
    const ny = lerpMap(this.T.levels[nl].map, m);
    const [a, b] = this.bounds(nl);
    this.anim = null; this.sel = -1; this.dimFor = -1; this.dimT = 0;
    this.jelly[this.level] = undefined;
    this.level = nl;
    this.y0 = clamp((ny ?? 0) + YO - this.VH / 2, a, b);
    this.invalidate();
    setTimeout(() => this.drop(), 30);
  }

  // ---------- share: 9:16 poster ----------
  private poster: { key: string; blob: Promise<Blob> } | null = null;
  /** The poster follows the view the person is in: 年 / 月 / 周 (月 and 周 come out as long images). */
  private posterFor(level = this.level) {
    const name = this.el.name.value.trim() || '岩友', key = `${this.light}|${name}|${level}`;
    if (this.poster?.key !== key) this.poster = { key, blob: posterBlob({ T: this.T, theme: this.th, name, level }) };
    return this.poster.blob;
  }
  private posterFile(b: Blob) { return new File([b], posterName(this.T), { type: 'image/png' }); }
  private async share() {
    let blob: Blob;
    try { blob = await this.posterFor(); } catch { this.copyLink(); return; }
    const file = this.posterFile(blob);
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Topout 攀岩年度报告' }); return; }
      catch (e) { if ((e as DOMException).name === 'AbortError') return; }   // e.g. lost user activation: fall through to the preview
    }
    this.openPoster(blob);
  }
  private posterUrl = '';
  private openPoster(blob: Blob) {
    const ov = $('poster'), img = $<HTMLImageElement>('poster-img'), dl = $<HTMLAnchorElement>('poster-dl');
    if (this.posterUrl) URL.revokeObjectURL(this.posterUrl);
    this.posterUrl = URL.createObjectURL(blob);
    img.src = this.posterUrl; dl.href = this.posterUrl; dl.download = posterName(this.T);
    this.holdButtonShape();
    const sh = $('poster-share');
    sh.hidden = !navigator.canShare?.({ files: [this.posterFile(blob)] });
    sh.onclick = () => { navigator.share({ files: [this.posterFile(blob)], title: 'Topout 攀岩年度报告' }).catch(() => {}); };
    const link = $('poster-link');
    link.onclick = () => this.copyLink(link);
    const close = () => { ov.hidden = true; document.removeEventListener('keydown', esc); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    ov.onclick = (e) => { if (e.target === ov) close(); };
    $('poster-close').onclick = close;
    document.addEventListener('keydown', esc);
    ov.hidden = false;
    $('poster-close').focus();
  }
  /** The save button is a real hold from the tower: the largest one whose shape is closest to the button's 200×64. */
  private holdButtonShape() {
    const path = document.getElementById('poster-dl-shape'), svg = path?.parentElement;
    const hs = this.T.levels.y.holds.length ? this.T.levels.y.holds : this.T.levels.m.holds;
    if (!path || !svg || !hs.length) return;
    // prefer full, rounded blobs (polygon area close to the box's ellipse) that need little stretching
    const fill = (h: Hold) => {
      const p = h.d.replace(/[MZ]/g, '').split('L').map(t => t.trim().split(/\s+/).map(Number));
      let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; }
      return Math.abs(a) / 2 / (Math.PI / 4 * h.w * h.h);
    };
    const score = (h: Hold) => Math.abs(Math.log(h.w / h.h / 1.8)) * 0.6 + Math.abs(1 - fill(h)) * 3 - Math.log(h.w * h.h) * 0.05;
    const h = hs.reduce((a, b) => (score(b) < score(a) ? b : a));
    svg.setAttribute('viewBox', `0 0 ${h.w} ${h.h}`);
    path.setAttribute('d', h.d);
  }
  /** In the poster sheet the toast would sit underneath, so the button itself confirms. */
  private copyLink(btn?: HTMLElement) {
    const say = (m: string) => {
      if (!btn) { this.toast(m); return; }
      btn.textContent = m; setTimeout(() => { btn.textContent = '复制链接'; }, 1600);
    };
    if (!navigator.clipboard) { say('复制失败'); return; }
    navigator.clipboard.writeText(location.href).then(() => say('链接已复制'), () => say('复制失败'));
  }
  private toastT = 0;
  private toast(msg: string) {
    this.el.toast.textContent = msg; this.el.toast.hidden = false;
    clearTimeout(this.toastT); this.toastT = window.setTimeout(() => { this.el.toast.hidden = true; }, 1600);
  }

  // ---------- drop-in animation (replays the baked fall) ----------
  private drop() {
    const L = this.L, y0 = this.y0, ids: number[] = [];
    L.holds.forEach((h, i) => { const t = h.y + YO; if (t + h.h >= y0 - 20 && t <= y0 + this.VH + 20 && h.tr.length > 5) ids.push(i); });
    ids.sort((a, b) => (L.holds[b].y + L.holds[b].h) - (L.holds[a].y + L.holds[a].h));
    const gap = Math.min(0.04, 0.9 / Math.max(1, ids.length)), d = new Map<number, number>();
    let end = 0;
    ids.forEach((i, j) => { const n = L.holds[i].tr.length / 3, delay = j * gap; d.set(i, delay); end = Math.max(end, delay + ((n - 1) * (1 - START)) / FPS / SPEED); });
    this.anim = { level: this.level, d, t0: performance.now(), end };
    this.invalidate();
  }

  /** null = not dropped yet, 0 = landed, else [dx, dy, deg] */
  private pose(an: Anim, i: number, tr: number[], now: number): [number, number, number] | 0 | null {
    const t = (now - an.t0) / 1000 - an.d.get(i)!, n = tr.length / 3;
    if (t < 0) return null;
    const u = t * FPS * SPEED + (n - 1) * START;
    if (u >= n - 1) return 0;
    const j = Math.floor(u), f = u - j, a = j * 3, b = a + 3, s = u / (n - 1), w = s * s * (3 - 2 * s), m = (n - 1) * 3;
    // blend out the residual to the final frame with smoothstep so nothing "sticks then snaps"
    return [tr[a] + (tr[b] - tr[a]) * f - tr[m] * w, tr[a + 1] + (tr[b + 1] - tr[a + 1]) * f - tr[m + 1] * w, tr[a + 2] + (tr[b + 2] - tr[a + 2]) * f - tr[m + 2] * w];
  }

  // ---------- frame loop ----------
  private invalidate() { if (!this.raf) this.raf = requestAnimationFrame((t) => this.frameStep(t)); }

  private frameStep(now: number) {
    this.raf = 0;
    let dt = Math.min(0.033, (now - (this.last || now)) / 1000); this.last = now;
    if (dt <= 0) dt = 1 / 60;
    let busy = false;
    const J = this.jelly[this.level];
    if (J && !this.anim) {
      const p = this.ptr ? { x: this.ptr.x - LG, y: this.ptr.y + this.y0 - YO } : null;
      busy = J.step(dt, p) || busy;
    }
    if (this.anim && (now - this.anim.t0) / 1000 >= this.anim.end) this.anim = null;
    if (this.anim) busy = true;
    const dimTarget = this.sel >= 0 ? 1 : 0;
    if (this.dimT !== dimTarget) { this.dimT = clamp(this.dimT + Math.sign(dimTarget - this.dimT) * dt / 0.18, 0, 1); busy = true; }
    if (this.sel >= 0 && now - this.selT0 < 420) busy = true;
    this.render(now);
    if (busy) this.invalidate(); else this.last = 0;
  }

  // ---------- drawing ----------
  private render(now = performance.now()) {
    const ctx = this.ctx, k = this.scale * this.dpr, T = this.th, L = this.L, y0 = this.y0, VH = this.VH;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);

    // ----- axis: metre ticks (short horizontal lines only) + landmarks -----
    const lmY = LANDMARKS.map(l => { const y = lerpMap(L.map, l[1]); return y === null ? null : y + YO; });
    let lastY = 1e9;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    LANDMARKS.forEach((l, i) => {
      const ly = lmY[i]; if (ly === null) return;
      if (lastY - ly < 36) { lmY[i] = null; return; }
      lastY = ly; const yy = ly - y0; if (yy < -40 || yy > VH + 10) return;
      const nearF = yy - VH / 2 > -44 && yy - VH / 2 < 55;
      ctx.strokeStyle = T.dash; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(LG, Math.round(yy) + 0.5); ctx.lineTo(PW - 30, Math.round(yy) + 0.5); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = T.ink; ctx.fillRect(PW - 24, yy - 0.75, 24, 1.5);
      if (!nearF) {
        ctx.font = `600 11px ${FONT}`; ctx.fillStyle = T.ink; ctx.fillText(l[0], PW - 30, yy - 33 + 7);
        ctx.font = `400 11px ${FONT}`; ctx.fillStyle = T.mute; ctx.fillText(l[1].toLocaleString('en-US') + ' m', PW - 30, yy - 33 + 21);
      }
    });
    const nearLm = (yc: number, a: number, b: number) => lmY.some(ly => ly !== null && yc >= ly - a && yc <= ly + b);
    const pxm = L.H / L.total, STEPS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000];
    const labelStep = STEPS.find(s => s * pxm >= 56) || 50000, minor = labelStep / 5, step = minor * pxm >= 7 ? minor : labelStep;
    const mHi = yToM(L.map, y0 - YO - 24), mLo = yToM(L.map, y0 - YO + VH + 24);
    ctx.font = `400 10px ${FONT}`;
    for (let m = Math.max(0, Math.floor(mLo / step) * step); m <= Math.min(L.total, mHi + step); m += step) {
      const y = lerpMap(L.map, m); if (y === null) continue;
      const yc = y + YO, yy = yc - y0; if (yy < -10 || yy > VH + 10) continue;
      const lab = Math.round(m / minor) % 5 === 0 && Math.abs(m / labelStep - Math.round(m / labelStep)) < 1e-6, len = lab ? 16 : 8;
      ctx.fillStyle = lab ? T.mute : T.tmin; ctx.fillRect(PW - len, yy - 0.5, len, 1);
      if (lab && (yy - VH / 2 > 26 || yy - VH / 2 < -48) && !nearLm(yc, 36, 6)) { ctx.fillStyle = T.mute; ctx.fillText(fmt(m), PW - len - 6, yy); }
    }

    // ----- holds -----
    const an = this.anim && this.anim.level === this.level ? this.anim : null;
    const J = this.jelly[this.level], sel = this.sel;
    const base: { i: number; m: Mat }[] = [], falling: { i: number; m: Mat }[] = [];
    let selM: Mat | null = null;
    L.holds.forEach((h, i) => {
      const top = h.y + YO;
      if (top + h.h < y0 - 40 || top > y0 + VH + 40) return;
      let m = new DOMMatrix().translate(LG + h.x + h.cx, top - y0 + h.cy);
      let isFalling = false;
      if (an && an.d.has(i)) {
        const p = this.pose(an, i, h.tr, now);
        if (p === null) return;                                 // not dropped yet
        if (p !== 0) { m = m.translate(p[0], p[1]).rotate(p[2]); isFalling = true; }
      } else if (J && !an) {
        const o = J.offset(i);
        if (o) m = m.translate(o[0], o[1]).rotate(o[2] * 57.29578);
      }
      if (i === sel) {
        const t = clamp((now - this.selT0) / 400, 0, 1);
        m = m.scale(1 + (selScale(h) - 1) * easeOutBack(t));
      } else if (J && i === J.fi) m = m.scale(J.fs);
      m = m.translate(-h.cx, -h.cy);
      if (i === sel) selM = m; else (isFalling ? falling : base).push({ i, m });
    });
    const order = [...base, ...falling];
    if (selM) order.push({ i: sel, m: selM });
    for (const { i, m } of order) this.drawHold(i, m, k, T, i === sel, this.dimFor >= 0 && i !== this.dimFor ? 1 - 0.7 * this.dimT : 1);
    this.drawn = order;

    this.renderDom(now);
  }

  private drawHold(i: number, m: Mat, k: number, T: Theme, lifted: boolean, alpha: number) {
    const ctx = this.ctx;
    ctx.setTransform(k, 0, 0, k, 0, 0); ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
    paintHold(ctx, this.L.holds[i], i, this.pathOf(i), T, () => this.eyeAt(i), lifted ? k : 0, alpha);
  }

  // ---------- DOM overlays ----------
  private setText(el: HTMLElement, s: string) { if (el.textContent !== s) el.textContent = s; }

  private renderDom(_now: number) {
    const L = this.L, y0 = this.y0, VH = this.VH, lv = this.level;
    this.el.hero.style.transform = `translateY(${-(y0 - this.TOP_MIN)}px)`;

    // centre-line reading: landmark / metres / date
    const cc = y0 + VH / 2 - YO, mc = clamp(yToM(L.map, cc), 0, L.total);
    const k = landmarkBelow(mc);
    this.setText(this.el.rName, k >= 0 ? '> ' + LANDMARKS[k][0] : '< ' + LANDMARKS[0][0]);
    this.setText(this.el.rM, fmt(mc) + ' m');
    let best: Hold | null = null, bd = 1e9;
    for (const h of L.holds) { const d = Math.abs(h.y + h.cy - cc); if (d < bd) { bd = d; best = h; } }
    let dateLong = '';
    if (best) {
      const [yy, mm] = this.keyYM(lv, best.key);
      dateLong = lv === 'y' ? `${yy} 年` : `${yy} 年 ${mm} 月`;
      this.setText(this.el.tagText, lv === 'w' ? `${yy} 年 ${mm} 月` : `${yy} 年`);
    }
    this.setText(this.el.rDate, dateLong);
    this.el.tag.hidden = lv === 'y' || !best;

    // year chips in the year view
    const yc = this.el.years;
    if (lv === 'y') {
      while (yc.children.length < this.yearList.length) { const d = document.createElement('div'); d.className = 'glass'; yc.appendChild(d); }
      this.yearList.forEach((yr, j) => {
        const c = yc.children[j] as HTMLElement;
        const hs = L.holds.filter(h => h.key === yr).map(h => h.y + h.h).sort((a, b) => a - b);
        if (!hs.length) { c.hidden = true; return; }
        c.hidden = false; this.setText(c, String(yr));
        c.style.top = hs[Math.max(0, Math.floor(hs.length * 0.85) - 1)] + YO - y0 - 34 + 'px';
      });
      yc.hidden = false;
    } else yc.hidden = true;

    // selected-hold tooltip
    const sel = this.sel, h = sel >= 0 ? L.holds[sel] : null;
    if (h) {
      const W = 204, topv = h.y + YO - y0, cxv = LG + h.x + h.cx, ss = selScale(h);
      const stop = topv + h.cy * (1 - ss), sbot = topv + h.cy + (h.h - h.cy) * ss;
      this.el.tip.style.left = clamp(cxv - W / 2, 12, PW - W - 12) + 'px';
      this.el.tip.style.top = (stop - 14 - 62 >= this.topCtl + 2 ? stop - 14 - 62 : sbot + 14) + 'px';
      this.el.tipDot.style.background = this.th.cols[h.k];
      this.setText(this.el.tipG, GRADE[h.k]);
      this.setText(this.el.tipN, h.cnt + ' 条');
      this.setText(this.el.tipRange, this.labelRange(lv, h.key));
      this.el.tip.hidden = false;
    } else this.el.tip.hidden = true;

    this.el.toTop.hidden = !(y0 > this.TOP_MIN + 500);
    this.el.seg.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.level === lv)));
  }
}
