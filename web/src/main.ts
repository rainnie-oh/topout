import './style.css';
import { App } from './app';
import type { Tower } from './types';
import { withDisplayMpp } from './metres';

async function load(name: string): Promise<Tower | null> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${name}.json`);
  // the dev server answers missing files with index.html, so check the type too
  if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return null;
  return (await res.json()) as Tower;
}

async function start() {
  try {
    // ?data=name loads public/data/name.json (handy for comparing bakes); only plain names are allowed
    const q = new URLSearchParams(location.search).get('data');
    // default = the mock sample; ?data=mine shows your own bake (mine.json, local only)
    const name = q && /^[\w-]{1,64}$/.test(q) ? q : 'sample';
    const t = await load(name);
    if (!t) throw new Error(`no data/${name}.json`);
    new App(withDisplayMpp(t));
  } catch (e) {
    const d = document.createElement('div');
    d.className = 'fatal';
    d.textContent = `找不到 data/${new URLSearchParams(location.search).get('data') || 'sample'}.json。用 pipeline/build.py 生成。`;
    document.body.appendChild(d);
    console.error(e);
  }
}
start();
