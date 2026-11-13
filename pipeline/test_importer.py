import os, sys, tempfile, unittest
sys.path.insert(0, os.path.dirname(__file__))
from grades import grade_to_bucket
import importer

class Grades(unittest.TestCase):
    def test_v(self):
        for g, b in [('VB',0),('V0',0),('v1',0),('V0-1',0),('V2',1),('V3',2),('V4-5',3),('V4+',3),('V6',5),('V7',6),('V10',6),('V7+',6)]:
            self.assertEqual(grade_to_bucket(g), b, g)
    def test_font(self):
        for g, b in [('5',0),('5+',1),('6A',2),('6a+',2),('6B',3),('6C+',4),('7A',5),('7A+',6),('f7b',6),('Font 6B+',3)]:
            self.assertEqual(grade_to_bucket(g), b, g)
    def test_unknown(self):
        for g in ['5.10a','','?','project']:
            self.assertIsNone(grade_to_bucket(g), g)

def run(text, suffix='.csv'):
    with tempfile.NamedTemporaryFile('w', suffix=suffix, delete=False) as f:
        f.write(text)
    try:
        return importer.load([f.name])
    finally:
        os.unlink(f.name)

class Import(unittest.TestCase):
    def test_session_template(self):
        s, r = run('date,gym,V0-1,V2,V3,V4,V5,V6,V7+\n2026-01-06,A,12,8,5,2,0,0,0\n2026/1/9,A,1,,,,,,\n')
        self.assertEqual(r.errors, [])
        self.assertEqual(s, [{'date':'2026-01-06','gym':'A','counts':[12,8,5,2,0,0,0]},{'date':'2026-01-09','gym':'A','counts':[1,0,0,0,0,0,0]}])
    def test_sends_aggregate(self):
        s, r = run('Date,Rating,Route Type,Location\n2026-01-06,V3,Boulder,X\n2026-01-06,V3,Boulder,X\n2026-01-06,5.10a,Sport,X\n2026-01-06 18:00,6B,Boulder,X\n')
        self.assertEqual(s, [{'date':'2026-01-06','gym':'X','counts':[0,0,2,1,0,0,0]}])
        self.assertEqual(sum(r.skipped.values()), 1)
    def test_count_column(self):
        s, _ = run('date,grade,count\n2026-02-01,V2,3\n2026-02-01,V0,4\n')
        self.assertEqual(s[0]['counts'], [4,3,0,0,0,0,0])
    def test_bad_date(self):
        _, r = run('date,grade\n06/01/2026,V2\n')
        self.assertEqual(len(r.errors), 1)
    def test_json_roundtrip(self):
        s, r = run('[{"date":"2024-01-02","gym":0,"counts":[1,2,0,0,0,0,0]}]', '.json')
        self.assertEqual(s, [{'date':'2024-01-02','gym':'0','counts':[1,2,0,0,0,0,0]}])

if __name__ == '__main__':
    unittest.main()
