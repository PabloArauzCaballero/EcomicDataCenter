import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const STATE = process.env.FB_STATE_DIR || path.join(HERE, '..', '.work', 'state');
fs.mkdirSync(STATE, { recursive: true });
export const file = (name) => path.join(STATE, name);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const pause = (min, max) => sleep((min + Math.random() * (max - min)) * 1000);

/**
 * La máquina es una laptop compartida con otras sesiones: antes de cada lote se mira la
 * memoria física libre (la misma cifra que `Win32_OperatingSystem.FreePhysicalMemory`)
 * y, si baja de 800 MB, se espera de a 60 s.
 */
export async function waitForRam(minKb = 800000) {
  const { execFileSync } = await import('node:child_process');
  for (let i = 0; ; i += 1) {
    let kb = Infinity;
    try {
      kb = Number(execFileSync('powershell.exe', ['-NoProfile', '-Command', '(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory'], { encoding: 'utf8', timeout: 30000 }).trim());
    } catch { /* si la consulta falla no se bloquea el lote */ }
    if (!(kb < minKb)) return kb;
    if (i % 5 === 0) log(`RAM libre ${Math.round(kb / 1024)} MB < ${Math.round(minKb / 1024)} MB: espero 60 s`);
    await sleep(60000);
  }
}

export function appendLine(name, obj) {
  fs.appendFileSync(file(name), `${JSON.stringify(obj)}\n`);
}

export function readLines(name) {
  if (!fs.existsSync(file(name))) return [];
  return fs.readFileSync(file(name), 'utf8').split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

export function log(...args) {
  const line = `${new Date().toISOString()} ${args.join(' ')}`;
  console.log(line);
  fs.appendFileSync(file('log.txt'), `${line}\n`);
}

const SKIP_FIRST = new Set([
  'groups', 'events', 'marketplace', 'watch', 'reel', 'reels', 'hashtag', 'share', 'sharer', 'sharer.php', 'login', 'login.php',
  'help', 'policies', 'policy.php', 'gaming', 'public', 'search', 'stories', 'l.php', 'media', 'notes', 'business', 'ads',
  'privacy', 'legal', 'dialog', 'plugins', 'tr', 'home.php', 'friends', 'messages', 'bookmarks', 'fundraisers', 'live',
  'places', 'directory', 'recover', 'r.php', 'reg', 'about', 'careers', 'settings', 'video.php', 'video', 'pages_reaction_units',
  'commerce', 'shops', 'job_opening', 'jobs', 'campaign', 'donate', 'lite', 'mobile', 'facebook', 'fb', 'safetycheck',
]);

/** La dirección canónica de una página a partir de cualquier enlace a ella (post, foto, reseña…). */
export function normalizeFb(raw) {
  let url;
  try { url = new URL(raw.startsWith('http') ? raw : `https://${raw}`); } catch { return null; }
  if (!/(^|\.)facebook\.com$/i.test(url.hostname) && !/(^|\.)fb\.com$/i.test(url.hostname)) return null;
  let parts;
  try { parts = url.pathname.split('/').filter(Boolean).map((p) => decodeURIComponent(p)); } catch { return null; }
  if (!parts.length) return null;
  const first = parts[0].toLowerCase();
  if (['profile.php', 'permalink.php', 'story.php', 'photo.php', 'photo'].includes(first)) {
    const id = url.searchParams.get('id');
    if (id && /^\d{5,}$/.test(id)) return { key: id, url: `https://www.facebook.com/profile.php?id=${id}` };
    return null;
  }
  if (first === 'p' && parts[1]) {
    const m = /-(\d{6,})$/.exec(parts[1]);
    return { key: m ? m[1] : parts[1].toLowerCase(), url: `https://www.facebook.com/p/${encodeURIComponent(parts[1])}/` };
  }
  if (first === 'pages' || first === 'people') {
    const id = [...parts].reverse().find((p) => /^\d{6,}$/.test(p));
    if (id) return { key: id, url: `https://www.facebook.com/profile.php?id=${id}` };
    return null;
  }
  if (first === 'pg' && parts[1]) parts.shift();
  if (SKIP_FIRST.has(parts[0].toLowerCase())) return null;
  const handle = parts[0];
  if (!/^[A-Za-z0-9.\-_]{2,}$/.test(handle)) return null;
  if (/\.php$/i.test(handle)) return null;
  if (/^\d{6,}$/.test(handle)) return { key: handle, url: `https://www.facebook.com/profile.php?id=${handle}` };
  // «Nombre-123456789» al final: el número es el id de la página.
  const m = /-(\d{9,})$/.exec(handle);
  if (m) return { key: m[1], url: `https://www.facebook.com/profile.php?id=${m[1]}` };
  return { key: handle.toLowerCase(), url: `https://www.facebook.com/${handle}/` };
}
