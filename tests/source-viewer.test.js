import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const script=await fs.readFile(new URL('../engine/src/source-viewer.js',import.meta.url),'utf8');
const create=vm.runInNewContext(script+'\ncreateIncludedSourceViewer;');
class Node {
  constructor(doc,tag='div'){this.doc=doc;this.tagName=tag.toUpperCase();this.children=[];this.listeners=new Map();this.attributes=new Map();this._text='';this.value='';this.dataset={};this.isConnected=true;this.hidden=false;this.disabled=false;this.open=false;this.classes=new Set();this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x),toggle:(x,on)=>on?this.classes.add(x):this.classes.delete(x)};}
  set innerHTML(value){throw new Error('Source must never be parsed as HTML.');}
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
  append(...children){for(const child of children){if(child.fragment)this.append(...child.children);else {this.children.push(child);child.parentNode=this;}}}
  replaceChildren(...children){this._text='';this.children=[];this.append(...children);}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);this.isConnected=false;}
  click(){if(this.tagName==='A'){this.doc.anchorConnectedAtClick=this.doc.body.children.includes(this);this.doc.downloadName=this.download;}}
  setAttribute(name,value){this.attributes.set(name,String(value));}
  getAttribute(name){return this.attributes.get(name)??null;}
  removeAttribute(name){this.attributes.delete(name);}
  addEventListener(name,callback){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push(callback);}
  async dispatch(name,event={}){for(const callback of this.listeners.get(name)??[])await callback({preventDefault(){},...event});}
  focus(){if(!this.disabled)this.doc.activeElement=this;}
  scrollIntoView(){this.scrolled=true;}
  showModal(){this.open=true;}
  close(){this.open=false;for(const callback of this.listeners.get('close')??[])callback();}
}
function document(){const doc={nodes:new Map(),activeElement:null,defaultView:{navigator:{clipboard:{writeText:async text=>{doc.copied=text;}}}},createElement:tag=>new Node(doc,tag),createDocumentFragment:()=>Object.assign(new Node(doc),{fragment:true}),getElementById:id=>doc.nodes.get(id)};for(const id of ['included-source-dialog','included-source-file','included-source-line','included-source-code','included-source-location','included-source-error','browse-sources','source-bundle-disclosure','included-source-feedback','included-source-go','included-source-copy','included-source-form','close-included-source'])doc.nodes.set(id,new Node(doc));doc.activeElement=new Node(doc,'button');doc.body=new Node(doc,'body');doc.addEventListener=()=>{};doc.querySelector=()=>null;return doc;}
test('no bundle keeps the local-mapping path inactive and unchanged',()=>{const d=document(),v=create(d,null);assert.equal(v.available,false);assert.equal(v.has('app/A.php'),false);assert.equal(v.open(),false);assert.equal(d.getElementById('included-source-dialog').open,false);});
test('declaration links select the exact line as literal text and restore focus on close',async()=>{const d=document(),origin=d.activeElement,text='<?php\n<img src=x onerror=bad()>\n/* ATLAS_CLIENT */';const v=create(d,{'app/A.php':text});assert.equal(v.available,true);v.open('app/A.php',2,3);assert.equal(d.getElementById('included-source-dialog').open,true);assert.equal(d.getElementById('included-source-location').textContent,'app/A.php:2:3');const rows=d.getElementById('included-source-code').children;assert.equal(rows[1].children[1].textContent,'<img src=x onerror=bad()>');assert.equal(rows[1].getAttribute('aria-current'),'location');assert.equal(d.activeElement,rows[1]);assert.equal(rows[1].scrolled,true);await d.getElementById('close-included-source').dispatch('click');assert.equal(d.activeElement,origin);assert.equal(d.getElementById('included-source-dialog').open,false);});
test('file browsing, line navigation and copy use only explicitly supplied text',async()=>{const d=document(),v=create(d,{'app/B.php':'b1\nb2','app/A.php':'a1\na2\na3'});await d.getElementById('browse-sources').dispatch('click');assert.equal(d.activeElement,d.getElementById('included-source-file'));assert.equal(d.getElementById('included-source-file').value,'app/A.php');const select=d.getElementById('included-source-file');select.value='app/B.php';await select.dispatch('change');assert.equal(d.getElementById('included-source-location').textContent,'app/B.php:1:1');d.getElementById('included-source-line').value='2';await d.getElementById('included-source-form').dispatch('submit');assert.equal(d.getElementById('included-source-location').textContent,'app/B.php:2:1');await d.getElementById('included-source-copy').dispatch('click');assert.equal(d.copied,'b1\nb2');assert.equal(d.getElementById('included-source-feedback').textContent,'Included file copied.');assert.equal(v.has('app/Other.php'),false);});
test('missing files/lines and denied clipboard have explicit accessible outcomes',async()=>{const d=document(),v=create(d,{'app/A.php':'one\ntwo'});v.open('app/A.php',99,1);assert.match(d.getElementById('included-source-error').textContent,/Requested line 99/);assert.equal(d.getElementById('included-source-location').textContent,'app/A.php:1:1');v.open('../private.php',1,1);assert.match(d.getElementById('included-source-error').textContent,/was not included/);d.defaultView.navigator.clipboard.writeText=async()=>{throw new Error('Unavailable');};await d.getElementById('included-source-copy').dispatch('click');assert.match(d.getElementById('included-source-feedback').textContent,/Copy is unavailable/);assert.equal(d.activeElement,d.getElementById('included-source-code'));});
test('explicit empty maps and literal prototype-looking keys are safe',()=>{const empty=document();create(empty,{}).open();assert.equal(empty.getElementById('included-source-copy').disabled,true);assert.match(empty.getElementById('included-source-location').textContent,/No source files/);const d=document(),v=create(d,JSON.parse('{"__proto__":"literal"}'));assert.equal(v.has('__proto__'),true);v.open('__proto__',1);assert.equal(d.getElementById('included-source-code').children[0].children[1].textContent,'literal');assert.equal({}.polluted,undefined);});

test('JSON export activates a connected anchor and exports metadata without bundled source',async()=>{
  const d=document();
  for(const id of ['app-name','navigation','metrics','search','status-filter','method-filter','crumb','section-heading','result-count','results','detail','boundaries-button','close-boundaries','boundaries','boundary-content','notice-review','file-count','download','source-folder-button','source-folder-input','source-folder-error','source-folder-dialog','close-source-folder','save-source-folder','clear-source-folder'])d.nodes.set(id,new Node(d));
  const atlas={application:'Download fixture',files:[{file:'app/A.php',lines:1,status:'parsed'}],routes:[],controllers:[],models:[],relationships:[],middleware:[],diagnostics:[],edges:[],boundaries:[]};
  let blob;const callbacks=[],revoked=[];
  const context={document:d,ATLAS:atlas,SOURCE_BASE:null,SOURCE_BUNDLE:{'app/A.php':'PRIVATE_SOURCE_BODY'},Blob,URL:{createObjectURL:value=>{blob=value;return'blob:fixture';},revokeObjectURL:value=>revoked.push(value)},setTimeout:callback=>callbacks.push(callback)};
  const client=await fs.readFile(new URL('../engine/src/report-client.js',import.meta.url),'utf8');
  vm.runInNewContext(script+'\n'+client,context);d.getElementById('download').onclick();
  assert.equal(d.anchorConnectedAtClick,true);assert.equal(d.downloadName,'atlas.json');assert.equal(d.body.children.length,0);
  const text=await blob.text();assert.deepEqual(JSON.parse(text),atlas);assert.ok(!text.includes('PRIVATE_SOURCE_BODY'));assert.equal(blob.type,'application/json');
  assert.equal(revoked.length,0);callbacks.forEach(callback=>callback());assert.deepEqual(revoked,['blob:fixture']);
});
