#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { scan } from '../src/scanner.js';
import { renderReport } from '../src/report.js';
import { compare } from '../src/diff.js';
const help=`MrLaravel 1.0 — a local Laravel declaration atlas

Usage:
  node bin/mrlaravel.js scan <laravel-directory> --out <report-directory> [--name <label>]
  node bin/mrlaravel.js diff <before/atlas.json> <after/atlas.json> [--out <comparison.json>]

Scanning reads regular PHP files under app/ and routes/, plus bootstrap/app.php.
It never boots the application. Outputs must be outside the target project. Reports contain
structural metadata and source links, not source bodies or runtime data.

Exit codes: 0 success (diagnostics may exist), 1 invalid input or I/O failure,
2 scan completed with PHP parse errors. Review diagnostics in every report.
`;
function options(argv,allowed){const positional=[],opts={};for(let i=0;i<argv.length;i++){if(argv[i].startsWith('--')){if(!allowed.includes(argv[i])||!argv[i+1]||argv[i+1].startsWith('--'))throw new Error('Unknown option or missing option value. Use --help.');opts[argv[i].slice(2)]=argv[++i];}else positional.push(argv[i]);}return {positional,opts};}
async function canonicalDestination(dest){const abs=path.resolve(dest);let existing=abs;const rest=[];while(true){try{const real=await fs.realpath(existing);return path.join(real,...rest.reverse());}catch(e){if(e.code!=='ENOENT')throw e;rest.push(path.basename(existing));const parent=path.dirname(existing);if(parent===existing)throw e;existing=parent;}}}
const within=(root,dest)=>dest===root||dest.startsWith(root+path.sep);
async function safeWrite(file,content){
  try{const s=await fs.lstat(file);if(!s.isFile()||s.isSymbolicLink())throw new Error('Output must be a regular file, not a link.');}catch(e){if(e.code!=='ENOENT')throw e;}
  await fs.writeFile(file,content,{mode:0o600,flag:'w'});await fs.chmod(file,0o600);
}
try{
  const [command,...args]=process.argv.slice(2);
  if(!command||['--help','-h','help'].includes(command)){console.log(help);}
  else if(command==='scan'){
    const {positional,opts}=options(args,['--out','--name']);
    if(positional.length!==1||!opts.out)throw new Error('scan requires one target and --out. Use --help.');
    const root=await fs.realpath(positional[0]),out=await canonicalDestination(opts.out);
    if(within(root,out))throw new Error('Output must be outside the target project; the scanner never writes into its target.');
    const atlas=await scan(root,{label:opts.name??'Application'});
    await fs.mkdir(out,{recursive:true,mode:0o700});
    const relative=path.relative(out,root).split(path.sep).map(encodeURIComponent).join('/')+'/';
    const html=await renderReport(atlas,{sourceBase:relative});
    await safeWrite(path.join(out,'atlas.json'),JSON.stringify(atlas,null,2)+'\n');
    await safeWrite(path.join(out,'report.html'),html);
    console.log(`${atlas.counts.routes} routes · ${atlas.counts.controllers} controllers · ${atlas.counts.models} models · ${atlas.counts.relationships} relationships`);
    console.log(`${atlas.counts.diagnostics} diagnostics · ${atlas.counts.files} PHP files inspected`);
    console.log(`JSON: ${path.join(out,'atlas.json')}\nReport: ${path.join(out,'report.html')}`);
    if(atlas.diagnostics.some(d=>d.code==='parse-error'))process.exitCode=2;
  }else if(command==='diff'){
    const {positional,opts}=options(args,['--out']);if(positional.length!==2)throw new Error('diff requires two snapshot paths.');
    const snapshots=await Promise.all(positional.map(async p=>JSON.parse(await fs.readFile(p,'utf8'))));
    const result=compare(...snapshots),json=JSON.stringify(result,null,2)+'\n';
    if(opts.out){
      const out=await canonicalDestination(opts.out);
      const inputs=await Promise.all(positional.map(p=>fs.realpath(p)));
      let sameFile=inputs.includes(out);
      try{const destination=await fs.stat(out);for(const input of inputs){const existing=await fs.stat(input);if(existing.dev===destination.dev&&existing.ino===destination.ino)sameFile=true;}}catch(e){if(e.code!=='ENOENT')throw e;}
      if(sameFile)throw new Error('Comparison output cannot overwrite an input snapshot.');
      await fs.mkdir(path.dirname(out),{recursive:true,mode:0o700});await safeWrite(out,json);
      console.log(`${result.counts.added} added · ${result.counts.removed} removed · ${result.counts.changed} changed\n${out}`);
    }else process.stdout.write(json);
  }else throw new Error('Unknown command. Use --help.');
}catch(e){console.error('MrLaravel: '+e.message);process.exitCode=1;}
