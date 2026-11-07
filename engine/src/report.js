import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
export async function renderReport(atlas,{sourceBase=''}={}) {
  const [template,css,viewer,client]=await Promise.all(['report.html','report.css','source-viewer.js','report-client.js'].map(file=>fs.readFile(path.join(dir,file),'utf8')));
  const safe=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const replacements={
    '/* ATLAS_CSS */':css,
    '/* ATLAS_DATA */':`const ATLAS=${safe(atlas)}; const SOURCE_BASE=${safe(sourceBase)}; const SOURCE_BUNDLE=null;`,
    '/* ATLAS_CLIENT */':viewer+'\n'+client,
    '/* ATLAS_SOURCE_PRIVACY */':'Source links open the exact line in VS Code when its URL handler is installed. File links are a fallback; browsers may block local file links on an HTTP preview. The report contains metadata, not your source code.',
  };
  return template.replace(/\/\* ATLAS_(?:CSS|DATA|CLIENT|SOURCE_PRIVACY) \*\//g,match=>replacements[match]);
}
