import { mkdirSync, writeFileSync } from 'node:fs';
const dir = 'artifacts/abi/probe';
mkdirSync(dir, { recursive: true });
for (const [name, url] of [
  ['legacy-list', 'https://historico.abi.bo/index.php?option=com_content&view=category&id=36&layout=default&limit=1000&Itemid=0'],
  ['legacy-list-tmpl', 'https://historico.abi.bo/index.php?option=com_content&view=category&id=36&layout=default&limit=1000&tmpl=component'],
  ['legacy-list-layout', 'https://historico.abi.bo/index.php?option=com_content&view=category&id=36&layout=default&limit=1000&format=html&Itemid=99999'],
]) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const body = await r.text();
    writeFileSync(`${dir}/${name}.html`, body);
    console.log(JSON.stringify({ name, status: r.status, url: r.url, size: body.length,
      links: [...new Set([...body.matchAll(/href="([^"]+)"/g)].map(m => m[1]).filter(s => /^\/index.php.*\/\d{4,}-/.test(s)))].length }));
  } catch (e) { console.log(name, e.message); }
}
