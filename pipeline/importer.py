"""CSV / JSON  ->  sessions[]

Two input shapes are accepted, detected from the header row:

1. Session template (one row per gym visit):
       date,gym,V0-1,V2,V3,V4,V5,V6,V7+
2. Per-send log (one row per send, e.g. an app export):
       date,grade[,gym][,count]
   Column names are matched loosely (see ALIASES) so exports from logging
   apps usually work without editing. Rows with route grades (5.10a) or
   unknown grades are skipped and reported.

Also accepts the JSON format produced by this script (and data3.json).

Output: [{"date":"YYYY-MM-DD","gym":"...","counts":[7 ints]}] sorted by date,
one entry per (date, gym).
"""
import csv, datetime, io, json, re, sys
from collections import OrderedDict
from grades import BUCKETS, grade_to_bucket

ALIASES = {
    'date': ['date', 'tick date', 'ascent date', 'climbed', 'climb date', 'day', 'session date', 'logged', 'when'],
    'grade': ['grade', 'rating', 'difficulty', 'boulder grade', 'your grade', 'grade (v)', 'level'],
    'gym': ['gym', 'location', 'area', 'crag', 'venue', 'place', 'wall'],
    'count': ['count', 'quantity', 'qty', 'sends', 'number', 'n'],
    'type': ['route type', 'type', 'discipline', 'style type'],
}


def _norm(h):
    return re.sub(r'\s+', ' ', (h or '').strip().lower().lstrip('﻿'))


def parse_date(s):
    s = (s or '').strip()
    if not s:
        raise ValueError('empty date')
    m = re.match(r'^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})', s)
    if m:
        return datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()
    raise ValueError(f'unrecognised date "{s}" (use YYYY-MM-DD)')


def _find(headers, key):
    for i, h in enumerate(headers):
        if h in ALIASES[key]:
            return i
    return None


class Report:
    def __init__(self):
        self.rows = 0
        self.skipped = OrderedDict()  # reason -> count
        self.errors = []

    def skip(self, why):
        self.skipped[why] = self.skipped.get(why, 0) + 1

    def __str__(self):
        out = [f'{self.rows} rows read']
        for k, v in self.skipped.items():
            out.append(f'  skipped {v}: {k}')
        for e in self.errors[:10]:
            out.append(f'  error: {e}')
        if len(self.errors) > 10:
            out.append(f'  ...and {len(self.errors) - 10} more errors')
        return '\n'.join(out)


def _add(acc, date, gym, bucket, n):
    key = (date, gym)
    if key not in acc:
        acc[key] = [0] * 7
    acc[key][bucket] += n


def read_csv_text(text, acc, rep):
    rows = list(csv.reader(io.StringIO(text)))
    rows = [r for r in rows if any(c.strip() for c in r)]
    if not rows:
        return
    headers = [_norm(h) for h in rows[0]]
    body = rows[1:]
    bucket_cols = [headers.index(b.lower()) if b.lower() in headers else None for b in BUCKETS]
    di = _find(headers, 'date')
    gi = _find(headers, 'gym')
    if di is None:
        raise ValueError(f'no date column found in header: {rows[0]}')

    if all(c is not None for c in bucket_cols):          # session template
        for ln, r in enumerate(body, start=2):
            rep.rows += 1
            try:
                date = parse_date(r[di])
                gym = r[gi].strip() if gi is not None and gi < len(r) else ''
                for b, ci in enumerate(bucket_cols):
                    v = r[ci].strip() if ci < len(r) else ''
                    n = int(float(v)) if v else 0
                    if n < 0:
                        raise ValueError('negative count')
                    if n:
                        _add(acc, date, gym, b, n)
            except (ValueError, IndexError) as e:
                rep.errors.append(f'line {ln}: {e}')
        return

    ri = _find(headers, 'grade')                           # per-send log
    if ri is None:
        raise ValueError(f'need either the 7 bucket columns {BUCKETS} or a grade column; header was {rows[0]}')
    ci = _find(headers, 'count')
    ti = _find(headers, 'type')
    for ln, r in enumerate(body, start=2):
        rep.rows += 1
        try:
            if ti is not None and ti < len(r) and r[ti].strip() and 'boulder' not in r[ti].lower():
                rep.skip('not a boulder (route type column)')
                continue
            b = grade_to_bucket(r[ri] if ri < len(r) else '')
            if b is None:
                rep.skip(f'unknown or non-boulder grade')
                continue
            date = parse_date(r[di])
            gym = r[gi].strip() if gi is not None and gi < len(r) else ''
            n = 1
            if ci is not None and ci < len(r) and r[ci].strip():
                n = int(float(r[ci]))
            if n > 0:
                _add(acc, date, gym, b, n)
        except (ValueError, IndexError) as e:
            rep.errors.append(f'line {ln}: {e}')


def read_json_text(text, acc, rep):
    data = json.loads(text)
    if isinstance(data, dict) and 'sessions' in data:
        data = data['sessions']
    for i, s in enumerate(data):
        rep.rows += 1
        try:
            c = s['counts']
            if len(c) != 7:
                raise ValueError('counts must have 7 numbers')
            date = parse_date(s['date'])
            gym = str(s.get('gym', ''))
            for b, n in enumerate(c):
                if n:
                    _add(acc, date, gym, b, int(n))
        except (KeyError, ValueError, TypeError) as e:
            rep.errors.append(f'item {i}: {e}')


def load(paths):
    acc, rep = OrderedDict(), Report()
    for p in paths:
        text = open(p, encoding='utf-8-sig').read()
        if p.lower().endswith('.json'):
            read_json_text(text, acc, rep)
        else:
            read_csv_text(text, acc, rep)
    sessions = [{'date': d, 'gym': g, 'counts': c} for (d, g), c in acc.items() if sum(c)]
    sessions.sort(key=lambda s: (s['date'], s['gym']))
    return sessions, rep


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser(description='Import climbing logs into Topout sessions.json')
    ap.add_argument('inputs', nargs='+')
    ap.add_argument('-o', '--out', default='sessions.json')
    a = ap.parse_args()
    sessions, rep = load(a.inputs)
    print(rep, file=sys.stderr)
    if rep.errors:
        sys.exit('fix the errors above and run again')
    json.dump(sessions, open(a.out, 'w'), separators=(',', ':'), ensure_ascii=False)
    print(f'{len(sessions)} sessions -> {a.out}', file=sys.stderr)
