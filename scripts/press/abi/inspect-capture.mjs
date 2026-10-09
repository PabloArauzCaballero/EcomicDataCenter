import fs from 'node:fs';
import zlib from 'node:zlib';
const root='src/database/seeds/boot/abi-news/';
const state=JSON.parse(fs.readFileSync(root+'legacy-inventory.json','utf8'));
const html=zlib.gunzipSync(fs.readFileSync(root+state.categories[0].captures[0].storage)).toString();
console.log('length',html.length,'pagination',html.indexOf('pagination-wrapper'));
const all=[...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
console.log('anchors',all.length); console.log(all.filter(x=>/\/\d{3,}-/.test(x[1])).slice(20,28).map(x=>x[0].slice(0,1600)).join('\n'));
