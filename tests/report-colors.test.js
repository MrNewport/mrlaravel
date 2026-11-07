import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const css=await fs.readFile(new URL('../engine/src/report.css',import.meta.url),'utf8');
const rules=new Map();
for(const [,selectors,body]of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
  const declarations=Object.fromEntries(body.split(';').filter(p=>p.includes(':')).map(p=>{const i=p.indexOf(':');return[p.slice(0,i).trim(),p.slice(i+1).trim()];}));
  for(const selector of selectors.replace(/\/\*[\s\S]*?\*\//g,'').split(',').map(s=>s.trim()))rules.set(selector,{...rules.get(selector),...declarations});
}
function value(selector,property){const raw=rules.get(selector)?.[property];assert.ok(raw,selector+' '+property+' must be declared');return raw.replace(/var\((--[a-z-]+)\)/g,(_,name)=>rules.get(':root')[name]);}
function rgb(color){const hex=color==='white'?'#fff':color;assert.match(hex,/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i);const s=hex.length===4?hex.slice(1).split('').map(c=>c+c).join(''):hex.slice(1);return[0,2,4].map(i=>parseInt(s.slice(i,i+2),16)/255);}
function luminance(color){const channels=rgb(color).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);return channels.reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);}
function contrast(a,b){const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);return(values[0]+0.05)/(values[1]+0.05);}
const light=['#f7f6f2','#fdfdfa','#fcfcf9','#edf0e7','#f1f2ec','#f9faf5'];
test('shipped small text colors meet 4.5:1 on their actual report surfaces',()=>{
  const pairs=[
    ...['dialog p','footer','.atlas-symbol span','.metric small','.search kbd','.result small','.detail h4','.source-link a','.source-link .file-link','.connection span','.connection .arrow','.empty'].flatMap(selector=>light.map(bg=>[selector,bg])),
    ['.notice button','#f7f6f2'],['.notice>span','#f7f6f2'],['.rail-label','#212623'],['.rail-bottom p','#212623'],['.rail-bottom button','#212623'],['.brand small','#212623'],['nav button','#212623'],['nav button.selected','#354035'],['nav button:hover','#354035'],['.rail-bottom button:hover','#212623'],
    ['#included-source-form label','#f7f6f2'],['#included-source-location','#f7f6f2'],['#included-source-feedback','#f7f6f2'],['#included-source-error','#f7f6f2'],['#source-folder-error','#f7f6f2'],['.included-source-number','#e5ebdc'],['.included-source-number','#fdfdfa'],['.source-link .source-button','#fdfdfa'],
    ...light.map(bg=>['button:hover',bg]),
  ];
  for(const selector of ['.pill','.pill.post','.status','.status.partial','.note','.note.info','.source-disclosure'])pairs.push([selector,value(selector,'background')]);
  for(const [selector,bg]of pairs){const fg=value(selector,'color');assert.ok(contrast(fg,bg)>=4.5,`${selector}: ${fg}/${bg} = ${contrast(fg,bg).toFixed(2)}`);}
  assert.equal(value('nav .count','opacity'),'1','Navigation counts must not reduce their text contrast through opacity.');
  assert.ok(contrast(value(':root','--muted'),'#f7f6f2')>=4.5);
});
test('focus and editable control boundaries have at least 3:1 contrast',()=>{
  const focus=value('button:focus-visible','outline').match(/#[0-9a-f]+/i)[0];
  for(const bg of light)assert.ok(contrast(focus,bg)>=3);
  assert.ok(contrast(value('.rail :focus-visible','outline-color'),'#354035')>=3);
  for(const selector of ['.search','.toolbar select','#source-folder-dialog input','#source-folder-dialog>button']){
    const color=value(selector,'border-color');assert.ok(contrast(color,'#fff')>=3);assert.ok(contrast(color,'#f7f6f2')>=3);
  }
  const border=value('#included-source-form button','border').match(/#[0-9a-f]+/i)[0];assert.ok(contrast(border,value('#included-source-form button','background'))>=3);
});

test('mobile text controls declare 16px sizing to avoid focus zoom',()=>{
  assert.match(css,/@media\(max-width:760px\)\{input,select,textarea\{font-size:16px\}/);
  for(const selector of ['.search input','.toolbar select','#source-folder-dialog input','#included-source-form input','#included-source-form select'])assert.equal(value(selector,'font-size'),'16px');
});
