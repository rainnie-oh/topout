export type LevelKey = 'y' | 'm' | 'w';

/** One hold = one grade inside one time bucket. All coordinates in tower px, y grows downward from the top of the tower. */
export interface Hold {
  k: number;      // grade bucket 0..6
  key: number;    // time bucket key (y: year, m: year*12+month-1, w: weeks since weekEpoch)
  cnt: number;    // sends in this bucket at this grade
  x: number; y: number; w: number; h: number;  // bounding box
  cx: number; cy: number;                      // centre of mass, relative to the box
  r: number;      // bolt hole / eye radius
  d: string;      // SVG path, relative to the box
  tr: number[];   // baked fall trajectory: [dx, dy, deg] per frame (30fps), relative to rest pose
  c: number[];    // collision circles: [x, y, r] relative to the box, flattened
}

export interface Level {
  H: number;                    // tower height (px)
  W: number;                    // container width (px)
  total: number;                // virtual metres
  map: [number, number][];      // [metres, y] monotone map
  holds: Hold[];
}

export interface YearStats { sessions: number; sends: number; metres: number }

export interface Tower {
  v: 1;
  weekEpoch: string;
  mpp: number;
  stats: {
    sessions: number; sends: number; maxBucket: number; first: string; last: string;
    years: Record<string, YearStats>;
  };
  levels: Record<LevelKey, Level>;
}
