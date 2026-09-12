import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
export async function renderReport(atlas,{sourceBase=''}={}) {
  const [template,css,client]=await Promise.all(['report.html','report.css','report-client.js'].map(file=>fs.readFile(path.join(dir,file),'utf8')));
  const safe=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return template.replace('/* ATLAS_CSS */',()=>css).replace('/* ATLAS_DATA */',()=>`const ATLAS=${safe(atlas)}; const SOURCE_BASE=${safe(sourceBase)};`).replace('/* ATLAS_CLIENT */',()=>client);
}
