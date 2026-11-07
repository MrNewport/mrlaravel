'use strict';

// Text was supplied explicitly by the report author. Never fetch or evaluate source.
function createIncludedSourceViewer(doc, bundle) {
  if (bundle === null || typeof bundle !== 'object' || Array.isArray(bundle)) {
    return {available:false,has:()=>false,open:()=>false};
  }
  const $=id=>doc.getElementById(id);
  const make=(tag,text)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const has=file=>typeof file==='string'&&Object.hasOwn(bundle,file)&&typeof bundle[file]==='string';
  const files=Object.keys(bundle).filter(has).sort();
  const dialog=$('included-source-dialog'),select=$('included-source-file'),lineInput=$('included-source-line');
  const code=$('included-source-code'),location=$('included-source-location'),error=$('included-source-error');
  let loadedFile=null,lines=[],rows=[],current=null,returnFocus=null;
  for(const file of files){const option=make('option',file);option.value=file;select.append(option);}
  const browse=$('browse-sources');browse.hidden=false;browse.textContent=`Browse included source (${files.length})`;
  const disclosure=$('source-bundle-disclosure');disclosure.hidden=false;
  disclosure.textContent=`This report embeds ${files.length} explicitly supplied source ${files.length===1?'file':'files'}. Anyone receiving this HTML can read them. Opening included files makes no extra requests.`;
  function load(file){
    if(!has(file))return false;
    if(loadedFile===file)return true;
    loadedFile=file;select.value=file;lines=bundle[file].split('\n');rows=[];current=null;
    const fragment=doc.createDocumentFragment();
    for(const [index,text]of lines.entries()){
      const row=make('span');row.className='included-source-row';row.tabIndex=-1;
      row.setAttribute('role','group');row.setAttribute('aria-label',`Line ${index+1}`);
      row.setAttribute('aria-describedby','included-source-location');
      const number=make('span',String(index+1));number.className='included-source-number';number.setAttribute('aria-hidden','true');
      const literal=make('code',text);literal.className='included-source-text';
      row.append(number,literal);rows.push(row);fragment.append(row);
    }
    code.replaceChildren(fragment);lineInput.max=String(lines.length);
    return true;
  }
  function go(line,column=1,focus=true){
    if(!Number.isSafeInteger(line)||line<1||line>lines.length){
      error.textContent=`Line ${line} is not present in the included file. Choose a line from 1 to ${lines.length}.`;
      return false;
    }
    if(current){current.classList.remove('selected-source-line');current.removeAttribute('aria-current');}
    current=rows[line-1];current.classList.add('selected-source-line');current.setAttribute('aria-current','location');
    lineInput.value=String(line);error.textContent='';
    location.textContent=`${loadedFile}:${line}:${Number.isSafeInteger(column)&&column>0?column:1}`;
    if(focus){current.focus({preventScroll:true});current.scrollIntoView({block:'center',inline:'nearest'});}
    return true;
  }
  function open(file,line=1,column=1){
    const exact=has(file),chosen=exact?file:files[0];
    if(!dialog.open){returnFocus=doc.activeElement;dialog.showModal();}
    $('included-source-feedback').textContent='';
    if(!chosen){
      code.replaceChildren();location.textContent='No source files were included.';
      select.disabled=true;lineInput.disabled=true;$('included-source-go').disabled=true;$('included-source-copy').disabled=true;
      select.focus();return true;
    }
    load(chosen);
    if(exact){
      if(!go(line,column)){go(1,1,false);error.textContent=`Requested line ${line} is not present in ${chosen}. The included file has ${lines.length} lines.`;lineInput.focus();}
    }else{
      go(1,1,false);
      if(file!==undefined)error.textContent=`${String(file)} was not included. Choose one of the supplied files; no other file was read.`;
      select.focus();
    }
    return true;
  }
  browse.addEventListener('click',()=>open());
  select.addEventListener('change',()=>{if(load(select.value)){go(1,1,false);$('included-source-feedback').textContent='';}});
  $('included-source-form').addEventListener('submit',event=>{event.preventDefault();if(loadedFile!==null&&!go(Number(lineInput.value)))lineInput.focus();});
  $('close-included-source').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{if(returnFocus?.isConnected)returnFocus.focus();});
  $('included-source-copy').addEventListener('click',async()=>{
    if(loadedFile===null)return;
    try{await doc.defaultView.navigator.clipboard.writeText(bundle[loadedFile]);$('included-source-feedback').textContent='Included file copied.';}
    catch{$('included-source-feedback').textContent='Copy is unavailable here. Select the source text to copy it.';code.focus();}
  });
  return {available:true,has,open};
}
