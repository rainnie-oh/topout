import './style.css';
import { App } from './app';
import type { Tower } from './types';
import { withDisplayMpp } from './metres';

async function start() {
  try {
    // ?data=name loads public/data/name.json (handy for comparing bakes); only plain names are allowed
    const q = new URLSearchParams(location.search).get('data');
    const name = q && /^[\w-]{1,64}$/.test(q) ? q : 'tower';
    const res = await fetch(`${import.meta.env.BASE_URL}data/${name}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const t = (await res.json()) as Tower;
    new App(withDisplayMpp(t));
  } catch (e) {
    const d = document.createElement('div');
    d.className = 'fatal';
    d.textContent = '还没有塔的数据。先运行 pipeline/build.py 生成 public/data/tower.json。';
    document.body.appendChild(d);
    console.error(e);
  }
}
start();
