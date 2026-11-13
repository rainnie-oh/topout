"""sessions.json  ->  tower.json  (what the web app loads)

Drops every hold into a walled container with pymunk, in time order, and
records each hold's fall so the front end can replay it without running a
rigid-body sim. Ported from the prototype's phys2.py + build_proto.py.

Deterministic: same input + same seed + same pymunk version = same output.

    python bake.py sessions.json -o ../web/public/data/tower.json
"""
import argparse, collections, datetime, json, math, os, random, re, sys, time
import numpy as np, cv2, pymunk
from pymunk import autogeometry as ag

HERE = os.path.dirname(os.path.abspath(__file__))
WEIGHTS = [1, 1.6, 2.4, 3.6, 5.2, 7.5, 11]
MPP = 0.16            # metres per point
WC = 296              # container width (px)
LEVEL_C = {'y': 3.2, 'm': 12, 'w': 55}   # area coefficient per zoom level
SEED = 7
# shape families per grade bucket (names in assets/holds_lib.json)
FAMS = {0: ['tealSphereC', 'tealSphereA', 'domeGreenBig', 'tealSphereD'],
        1: ['yellow1', 'yellow2', 'yellow3', 'yellowBean'],
        2: ['yellowMoonC', 'yellowMoonD', 'yellowMoonE'],
        3: ['blueHornL', 'blueHornR', 'blueSlab', 'blueWing', 'greenBean'],
        4: ['blueBlob', 'blueLong', 'greenCup', 'purpleBeanB', 'greenDomeB'],
        5: ['purpleSpire', 'purpleBar', 'purpleBlade', 'purplePillA', 'purplePillC'],
        6: ['blackBean', 'blackBeanS', 'blackJ', 'blackBeanA2', 'blackBeanD2', 'blackBeanE2', 'triBlackA', 'hexBlackA', 'hexBlackA', 'triBlackA']}


def _poly(d):
    nums = list(map(float, re.findall(r'-?\d+\.?\d*', d)))
    pts = [(nums[0], nums[1])]; i = 2
    while i + 5 < len(nums):
        pts.append((nums[i + 4], nums[i + 5])); i += 6
    return np.array(pts)


def week_epoch(sessions):
    d = datetime.date.fromisoformat(sessions[0]['date'])
    return d - datetime.timedelta(days=d.weekday())      # Monday on/before first session


def bucket_key(level, d, epoch):
    if level == 'w':
        return (d - epoch).days // 7
    if level == 'm':
        return d.year * 12 + d.month - 1
    return d.year


def aggregate(sessions, level, epoch):
    A = collections.OrderedDict()
    for s in sessions:
        key = bucket_key(level, datetime.date.fromisoformat(s['date']), epoch)
        for k, c in enumerate(s['counts']):
            if c:
                A.setdefault(key, {}).setdefault(k, 0); A[key][k] += c
    return A


def simulate(A, C, seed=SEED, R=1.9, minfac=8.7, log=None):
    lib = json.load(open(os.path.join(HERE, 'assets', 'holds_lib.json')))
    POLY = {k: _poly(v['d']) for k, v in lib.items()}
    rnd = random.Random(seed)
    space = pymunk.Space(); space.gravity = (0, -1400); space.damping = 0.55
    sb = space.static_body
    for a, b in (((0, 0), (WC, 0)), ((0, 0), (0, 400000)), ((WC, 0), (WC, 400000))):
        s = pymunk.Segment(sb, a, b, 6); s.friction = 0.9; s.elasticity = 0; space.add(s)
    bodies = []; top = 0
    total = sum(len(v) for v in A.values())
    for key in sorted(A):
        items = list(A[key].items()); rnd.shuffle(items)
        for k, cnt in items:
            pts = cnt * WEIGHTS[k]
            nm = rnd.choice(FAMS[k]); P = POLY[nm].copy()
            area = max(minfac * C, pts * C); P = P * math.sqrt(area / 10000); P[:, 1] *= -1
            P = P - P.mean(0); w = P[:, 0].max() - P[:, 0].min()
            if w > WC - 24:
                P = P * ((WC - 24) / w); w = WC - 24
            approx = cv2.approxPolyDP(P.astype(np.float32).reshape(-1, 1, 2), max(0.8, 0.012 * w), True).reshape(-1, 2)
            parts = ag.convex_decomposition([tuple(map(float, p)) for p in approx] + [tuple(map(float, approx[0]))], max(0.5, 0.008 * w))
            body = pymunk.Body(); shapes = []
            for part in parts:
                if len(part) < 3:
                    continue
                sh = pymunk.Poly(body, [tuple(v) for v in part], radius=R)
                sh.density = 1; sh.friction = 0.9; sh.elasticity = 0.0; shapes.append(sh)
            if not shapes:
                continue
            body.position = (rnd.uniform(w / 2 + 10, WC - w / 2 - 10), top + 160 + w); body.angle = rnd.uniform(0, 2 * math.pi)
            space.add(body, *shapes)
            still = 0; rec = [(body.position.x, body.position.y, body.angle)]
            for i in range(900):
                space.step(1 / 120)
                if i % 4 == 3:
                    rec.append((body.position.x, body.position.y, body.angle))
                sp = body.velocity.length + abs(body.angular_velocity) * 20
                still = still + 1 if sp < 4 else 0
                if still > 25:
                    break
            bodies.append(dict(body=body, P=P, k=k, key=key, pts=pts, cnt=cnt, rec=rec[:max(3, len(rec) - 6)]))
            top = max(top, max(body.local_to_world(tuple(p)).y for p in P[::5]))
            for bd in bodies[-80:]:            # freeze deeply buried bodies
                if bd['body'].body_type == pymunk.Body.DYNAMIC:
                    ymax = max(bd['body'].local_to_world(tuple(p)).y for p in bd['P'][::10])
                    if ymax < top - 420:
                        bd['body'].body_type = pymunk.Body.STATIC; space.reindex_shapes_for_body(bd['body'])
            if log and len(bodies) % 100 == 0:
                log(f'{len(bodies)}/{total}')
    Hmax = max(max(b['body'].local_to_world(tuple(p)).y for p in b['P'][::4]) for b in bodies)
    out = []
    for b in bodies:
        pts = [b['body'].local_to_world(tuple(p)) for p in b['P']]
        com = b['body'].local_to_world((0, 0))
        fx, fy, fa = b['body'].position.x, b['body'].position.y, b['body'].angle
        tr = []
        for (x, y, a) in b['rec']:
            tr += [round(x - fx, 1), round(-(y - fy), 1), round(-math.degrees(a - fa), 1)]
        out.append(dict(tr=tr, poly=[(p.x, Hmax - p.y) for p in pts], k=b['k'], key=int(b['key']), pts=b['pts'], cnt=b['cnt'],
                        cx=round(com.x, 1), cy=round(Hmax - com.y, 1),
                        r=round(max(2.0, min(5.0, math.sqrt(b['pts'] * C) * 0.075)), 1)))
    return out, Hmax


def collision_circles(A, x0, y0, w, h, n=4):
    """Up to n inscribed circles (distance transform) approximating the hold, for the jelly physics."""
    sc = 2.0 if max(w, h) < 120 else 1.0
    W = int(w * sc) + 4; H = int(h * sc) + 4
    m = np.zeros((H, W), np.uint8)
    P = ((A - np.array([x0, y0])) * sc + 2).astype(np.int32)
    cv2.fillPoly(m, [P], 255)
    out = []; first = None
    for _ in range(n):
        dt = cv2.distanceTransform(m, cv2.DIST_L2, 5)
        r = float(dt.max())
        if r <= 0.8:
            break
        if first is None:
            first = r
        elif r < 0.38 * first:
            break
        yy, xx = np.unravel_index(dt.argmax(), dt.shape)
        out.append([round((xx - 2) / sc, 1), round((yy - 2) / sc, 1), round(r * 0.97 / sc, 1)])
        cv2.circle(m, (int(xx), int(yy)), int(r * 0.8) + 1, 0, -1)
    return out


def compact(holds, H):
    out = []
    for h in holds:
        P = np.array(h['poly'], dtype=np.float32)
        A = cv2.approxPolyDP(P.reshape(-1, 1, 2), 0.7, True).reshape(-1, 2)
        x0, y0 = float(A[:, 0].min()), float(A[:, 1].min())
        x1, y1 = float(A[:, 0].max()), float(A[:, 1].max())
        d = 'M' + 'L'.join(f'{a[0] - x0:.1f} {a[1] - y0:.1f}' for a in A) + 'Z'
        out.append({'k': h['k'], 'key': h['key'], 'cnt': h['cnt'],
                    'x': round(x0, 1), 'y': round(y0, 1), 'w': round(x1 - x0, 1), 'h': round(y1 - y0, 1),
                    'cx': round(h['cx'] - x0, 1), 'cy': round(h['cy'] - y0, 1), 'r': h['r'], 'd': d,
                    'tr': [int(round(v)) for v in h['tr']],
                    'c': [v for c in collision_circles(A, x0, y0, x1 - x0, y1 - y0) for v in c]})
    # metres <-> y map: cumulative height after each time bucket vs. the bucket's mean y
    by = collections.defaultdict(list)
    for h in holds:
        by[h['key']].append(h)
    cum = 0; mp = [[0.0, round(H, 1)]]; run = H
    for k in sorted(by):
        cum += sum(h['pts'] for h in by[k]) * MPP
        y = sum(h['cy'] for h in by[k]) / len(by[k]); run = min(run, y); mp.append([round(cum, 1), round(run, 1)])
    mp.append([round(cum + 0.001, 3), 0.0])
    return {'H': round(H, 1), 'W': WC, 'total': round(cum, 1), 'map': mp, 'holds': out}


def bake_level(args):
    sessions, level, C, epoch = args
    t = time.time()
    log = lambda m: print(f'  [{level}] {m}', file=sys.stderr, flush=True)
    holds, H = simulate(aggregate(sessions, level, epoch), C, log=log)
    res = compact(holds, H)
    log(f'{len(holds)} holds, H={round(H)}px, {time.time() - t:.0f}s')
    return level, res


def stats(sessions):
    per = collections.OrderedDict()
    for s in sessions:
        y = int(s['date'][:4]); p = per.setdefault(y, {'sessions': 0, 'sends': 0, 'metres': 0.0})
        p['sessions'] += 1; p['sends'] += sum(s['counts'])
        p['metres'] += sum(c * w for c, w in zip(s['counts'], WEIGHTS)) * MPP
    for p in per.values():
        p['metres'] = round(p['metres'], 1)
    top = max((k for s in sessions for k, c in enumerate(s['counts']) if c), default=0)
    return {'sessions': len(sessions), 'sends': sum(sum(s['counts']) for s in sessions),
            'maxBucket': top, 'first': sessions[0]['date'], 'last': sessions[-1]['date'],
            'years': {str(k): v for k, v in per.items()}}


def bake(sessions, levels='ymw'):
    if not sessions:
        raise SystemExit('no sessions to bake')
    sessions = sorted(sessions, key=lambda s: s['date'])
    epoch = week_epoch(sessions)
    jobs = [(sessions, lv, LEVEL_C[lv], epoch) for lv in levels]
    res = dict(bake_level(j) for j in jobs)   # sequential: a few seconds total, and pymunk/cv2 in a process pool crashed on macOS
    return {'v': 1, 'pymunk': pymunk.version, 'seed': SEED, 'mpp': MPP,
            'weekEpoch': epoch.isoformat(), 'stats': stats(sessions), 'levels': res}


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Bake Topout tower data')
    ap.add_argument('sessions')
    ap.add_argument('-o', '--out', default=os.path.join(HERE, '..', 'web', 'public', 'data', 'tower.json'))
    a = ap.parse_args()
    sessions = json.load(open(a.sessions))
    t = time.time()
    out = bake(sessions)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    js = json.dumps(out, separators=(',', ':'), ensure_ascii=False)
    open(a.out, 'w').write(js)
    print(f'{a.out}  {len(js) // 1024} KB  {time.time() - t:.0f}s', file=sys.stderr)
