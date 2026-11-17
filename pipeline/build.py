"""One step: logs (CSV/JSON, any number) -> web/public/data/mine.json

    python pipeline/build.py my_log.csv
    python pipeline/build.py data/sample_sessions.json
"""
import argparse, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importer, bake

ap = argparse.ArgumentParser()
ap.add_argument('inputs', nargs='+')
ap.add_argument('-o', '--out', default=os.path.join(bake.HERE, '..', 'web', 'public', 'data', 'mine.json'))
a = ap.parse_args()
sessions, rep = importer.load(a.inputs)
print(rep, file=sys.stderr)
if rep.errors:
    sys.exit('fix the errors above and run again')
print(f'{len(sessions)} sessions, baking...', file=sys.stderr)
t = time.time()
out = bake.bake(sessions)
os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
js = json.dumps(out, separators=(',', ':'), ensure_ascii=False)
open(a.out, 'w').write(js)
print(f'{os.path.relpath(a.out)}  {len(js) // 1024} KB  {time.time() - t:.0f}s', file=sys.stderr)
