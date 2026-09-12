'use strict';
const $=id=>document.getElementById(id);
const labels={routes:'Routes',controllers:'Controllers',models:'Models',relationships:'Relationships',middleware:'Middleware',diagnostics:'Needs review'};
const all=new Map();
for(const key of Object.keys(labels)) for(const record of ATLAS[key]) all.set(record.id,{...record,collection:key});
for(const c of [...ATLAS.controllers,...ATLAS.models]) for(const m of c.methods) all.set(m.id,{...m,kind:'method',class:c.name,collection:c.kind==='model'?'models':'controllers'});
let section='routes',selected=ATLAS.routes[0]?.id??ATLAS.models[0]?.id,query='',filter='all',method='all';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const short=s=>s?.split('\\').at(-1)??'Unresolved';
const title=r=>r.kind==='route'?r.fallback?'Fallback route':r.uri??'Unresolved URI':r.kind==='relationship'?`${short(r.model)}.${r.name}()` :r.kind==='method'?`${short(r.class)}::${r.name}()` :r.collection==='diagnostics'?r.code:short(r.name);
const partial=r=>r.status==='partial'||r.collection==='diagnostics';
const storageKey='mrlaravel-source:'+(typeof MAPPING_KEY==='string'?MAPPING_KEY:'offline');
let mappedFolder='';
try{mappedFolder=sessionStorage.getItem(storageKey)??'';}catch{}
function validFolder(value){return value.length<=1000 && (/^\//.test(value)||/^[A-Za-z]:\//.test(value)) && !/[\u0000-\u001f<>?#]/.test(value) && !value.split('/').some(s=>s==='.'||s==='..') && !value.startsWith('//');}
if(!validFolder(mappedFolder))mappedFolder='';
function sourceLink(src){
  const div=el('div','source-link');if(!src)return div;
  const a=el('a','',`${src.file}:${src.line}`);
  let url=null;
  if(mappedFolder){url=new URL('file:///'+[mappedFolder.replace(/^\//,''),src.file].join('/').split('/').map(encodeURIComponent).join('/'));}
  else if(typeof SOURCE_BASE==='string')url=new URL(SOURCE_BASE+src.file.split('/').map(encodeURIComponent).join('/'),document.baseURI);
  if(url?.protocol==='file:'){
    a.href=`vscode://file/${url.pathname.replace(/^\//,'')}:${src.line}:${src.column??1}`;a.title='Open exact source line in VS Code';
    const fallback=el('a','file-link','file ↗');fallback.href=url.href;fallback.target='_blank';fallback.rel='noopener noreferrer';div.append(a,fallback);
  }else{
    a.href='#';a.title='Choose your local source folder to open this line';a.onclick=e=>{e.preventDefault();$('source-folder-dialog').showModal();};div.append(a,el('span','file-link','local source'));
  }
  return div;
}
function navigate(id){const r=all.get(id);if(!r)return;selected=id;section=r.collection;query='';filter='all';method='all';$('search').value='';$('status-filter').value='all';$('method-filter').value='all';render();}
function connection(id,caption){const r=all.get(id);if(!r)return null;const b=el('button','connection');const arrow=el('i','arrow','↗');const label=el('span','',caption);b.append(arrow,label,el('b','',title(r)));b.onclick=()=>navigate(id);return b;}
function heading(label){return el('h4','',label);}
function addConnection(parent,id,label){const c=connection(id,label);if(c)parent.append(c);}
function detail(){
  const pane=$('detail');pane.replaceChildren();const r=all.get(selected);
  if(!r){pane.append(el('div','empty','Select a finding to trace its connections and inspect the source.'));return;}
  pane.append(el('span','eyebrow',r.kind==='method'?'CONTROLLER ACTION':labels[r.collection].toUpperCase()),el('h3','',title(r)));
  const subtitle=r.kind==='route'?`${r.methods?.join(' · ')??'HTTP methods unresolved'}${r.name?'  /  '+r.name:''}`:r.kind==='relationship'?`${r.type} → ${r.target??'runtime target'}`:r.name;
  if(subtitle)pane.append(el('div','subtitle',subtitle));
  pane.append(el('span','status'+(partial(r)?' partial':''),partial(r)?'Needs review':'Statically declared'),sourceLink(r.source));
  if(r.kind==='route'){
    if(r.domain)pane.append(el('p','subtitle','Declared domain: '+r.domain));
    pane.append(heading('01 / Handler'));
    if(r.handler.methodId)addConnection(pane,r.handler.methodId,'Controller action');
    else pane.append(el('div','note info',r.handler.kind==='controller'?`${r.handler.class??'Unknown class'}::${r.handler.method} · source unresolved`:r.handler.kind+' handler'));
    if(r.handler.methodId){const refs=ATLAS.edges.filter(e=>e.from===r.handler.methodId&&e.type==='references-model');if(refs.length){pane.append(heading('02 / Models referenced by this action'));const shown=new Set();for(const e of refs)if(!shown.has(e.to)){shown.add(e.to);addConnection(pane,e.to,'Source reference · '+e.evidence);}}}
    pane.append(heading('Declared middleware'));
    const chips=el('div','chips');for(const m of r.middleware)chips.append(el('span','chip',m.value));pane.append(chips);
    if(!r.middleware.length)pane.append(el('div','subtitle','None explicitly declared here. Global and implicit middleware are unverified.'));
    for(const m of r.middleware)pane.append(sourceLink(m.source));
    if(r.excludedMiddleware.length)pane.append(el('div','note info','Explicit exclusions: '+r.excludedMiddleware.map(m=>m.value).join(', ')));
    for(const e of ATLAS.edges.filter(e=>e.from===r.id&&e.type==='declares-middleware'))addConnection(pane,e.to,'Middleware definition');
    if(r.groups.length){pane.append(heading('Inherited route groups'));for(const s of r.groups)pane.append(sourceLink(s));}
  }
  if(r.kind==='controller'||r.kind==='model'){
    if(r.parent)pane.append(el('div','subtitle','Extends '+r.parent));
    if(r.kind==='controller'){
      pane.append(heading('Public actions'));
      for(const m of r.methods)addConnection(pane,m.id,'Action declaration');
    }else{
      pane.append(heading('Relationships declared here'));
      for(const rel of ATLAS.relationships.filter(x=>x.model===r.name))addConnection(pane,rel.id,rel.type+' · '+(rel.target?short(rel.target):'unresolved target'));
      if(!ATLAS.relationships.some(x=>x.model===r.name))pane.append(el('div','subtitle','No supported relationship declarations in this class.'));
    }
  }
  if(r.kind==='method'){
    addConnection(pane,`class:${r.class}`,'Declared on controller');
    pane.append(heading('Model references'));
    for(const e of ATLAS.edges.filter(e=>e.from===r.id)){addConnection(pane,e.to,e.evidence??e.type);pane.append(sourceLink(e.source));}
  }
  if(r.kind==='relationship'){
    addConnection(pane,`class:${r.model}`,'Declaring model');
    for(const e of ATLAS.edges.filter(e=>e.from===r.id))addConnection(pane,e.to,(e.certainty==='possible'?'Possible · ':'')+e.type);
  }
  if(r.collection==='middleware'){
    pane.append(heading(r.kind==='group'?'Declared group members':'Declared implementation'));
    for(const member of r.members)pane.append(el('div','inventory-row',member));
    pane.append(el('div','note info','Aliases and groups are declared configuration. Expansion, execution order and runtime overrides are not inferred.'));
  }
  if(r.collection==='diagnostics')pane.append(el('p','note',r.message));
  const incoming=ATLAS.edges.filter(e=>e.to===r.id);
  if(incoming.length){pane.append(heading('Referenced from'));const seen=new Set();for(const e of incoming)if(!seen.has(e.from)){seen.add(e.from);addConnection(pane,e.from,e.type);}}
  if(r.issues?.length){pane.append(heading('Analysis notes'));for(const issue of r.issues){const d=ATLAS.diagnostics.find(d=>d.code===issue&&d.source.file===r.source.file);pane.append(el('div','note',d?.message??issue));}}
}
function render(){
  $('crumb').textContent=labels[section];$('section-heading').textContent=labels[section];
  for(const b of $('navigation').children)b.classList.toggle('selected',b.dataset.section===section);
  $('method-filter').hidden=section!=='routes';
  const list=ATLAS[section].filter(r=>(filter==='all'||(partial({...r,collection:section})?'partial':'static')===filter)&&(section!=='routes'||method==='all'||r.methods?.includes(method))&&JSON.stringify(r).toLowerCase().includes(query.toLowerCase()));
  $('result-count').textContent=`${list.length} of ${ATLAS[section].length} findings`;
  const results=$('results');results.replaceChildren();
  if(!list.length)results.append(el('div','empty','No findings match these filters. Try another search or choose “All findings”.'));
  if(!all.get(selected)||all.get(selected).collection!==section)selected=list[0]?.id;
  if(all.get(selected)?.kind!=='method'&&!list.some(r=>r.id===selected))selected=list[0]?.id;
  for(const entry of list){const r=all.get(entry.id);const b=el('button','result'+(r.id===selected?' active':''));b.setAttribute('aria-pressed',String(r.id===selected));
    const row=el('div','result-main');if(r.kind==='route')row.append(el('span','pill '+(r.methods?.includes('POST')?'post':''),r.methods?.[0]??'?'));
    row.append(el('span','result-title',title(r)),el('span','dot'+(partial(r)?' partial':'')));b.append(row);
    b.append(el('small','',r.kind==='route'?r.handler.kind==='controller'?`${short(r.handler.class)}::${r.handler.method}`:r.handler.kind:r.kind==='relationship'?`${r.type} → ${short(r.target)}`:`${r.source.file}:${r.source.line}`));
    b.onclick=()=>{selected=r.id;render();};results.append(b);
  }
  detail();
}
$('app-name').textContent=ATLAS.application;document.title=ATLAS.application+' · MrLaravel';
for(const [key,label]of Object.entries(labels)){const b=el('button');b.dataset.section=key;b.append(el('span','',label),el('span','count',ATLAS[key].length));b.onclick=()=>{section=key;selected=ATLAS[key][0]?.id;query='';$('search').value='';filter='all';$('status-filter').value='all';render();};$('navigation').append(b);}
for(const key of ['routes','controllers','models','relationships','diagnostics']){const b=el('button','metric');b.append(el('b','',ATLAS[key].length),el('span','',labels[key]),el('small','',key==='diagnostics'?'VISIBLE UNCERTAINTY':'SOURCE LINKED'));b.onclick=()=>{section=key;selected=ATLAS[key][0]?.id;filter='all';query='';$('search').value='';$('status-filter').value='all';render();};$('metrics').append(b);}
$('search').oninput=e=>{query=e.target.value;render();};$('status-filter').onchange=e=>{filter=e.target.value;render();};$('method-filter').onchange=e=>{method=e.target.value;render();};
const openBoundaries=()=>{$('boundaries').showModal();};$('boundaries-button').onclick=openBoundaries;$('close-boundaries').onclick=()=>$('boundaries').close();
for(const boundary of ATLAS.boundaries)$('boundary-content').append(el('p','',boundary));
$('notice-review').onclick=()=>{section='diagnostics';selected=ATLAS.diagnostics[0]?.id;query='';filter='all';$('search').value='';$('status-filter').value='all';render();};
$('file-count').textContent=ATLAS.files.length+' PHP files inspected';
$('download').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(ATLAS,null,2)+'\n'],{type:'application/json'}));const a=el('a');a.href=url;a.download='atlas.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();$('search').focus();}});
render();

$('source-folder-button').onclick=()=>{$('source-folder-input').value=mappedFolder;$('source-folder-error').textContent='';$('source-folder-dialog').showModal();};
$('close-source-folder').onclick=()=>$('source-folder-dialog').close();
$('save-source-folder').onclick=()=>{const value=$('source-folder-input').value.trim().replace(/\\/g,'/').replace(/\/+$/,'');if(!validFolder(value)){$('source-folder-error').textContent='Enter an absolute folder path without URLs, traversal, or query characters.';return;}mappedFolder=value;try{sessionStorage.setItem(storageKey,value);}catch{}$('source-folder-dialog').close();detail();};
$('clear-source-folder').onclick=()=>{mappedFolder='';try{sessionStorage.removeItem(storageKey);}catch{}$('source-folder-dialog').close();detail();};
