// Compare declaration metadata, ignoring source relocation and generated identifiers.
const collections=['routes','controllers','models','relationships','middleware','edges','diagnostics'];
const normalize=value=>{
  if(Array.isArray(value))return value.map(normalize);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['id','source','groups','methodId'].includes(k)).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>[k,normalize(v)]));
  return value;
};
function indexed(snapshot){
  if(snapshot?.schemaVersion!==1||collections.some(k=>!Array.isArray(snapshot[k])))throw new Error('Expected a MrLaravel schemaVersion 1 snapshot.');
  const ids=new Map(), output=new Map(), occurrences=new Map();
  for(const collection of collections.filter(k=>k!=='edges'))for(const record of snapshot[collection]){
    const identity=collection==='routes'?JSON.stringify([record.source.file,record.methods,record.uri,record.name,record.domain]):collection==='relationships'?`${record.model}::${record.name}`:collection==='diagnostics'?`${record.code}:${record.source.file}`:record.name;
    const base=collection+':'+identity;const index=(occurrences.get(base)??0)+1;occurrences.set(base,index);const key=base+'#'+index;
    ids.set(record.id,key);output.set(key,{collection,identity,data:normalize(record),source:record.source});
  }
  for(const record of snapshot.edges){const data=normalize({...record,from:ids.get(record.from)??record.from,to:ids.get(record.to)??record.to});const key='edges:'+JSON.stringify(data);output.set(key,{collection:'edges',identity:`${data.from} → ${data.to}`,data,source:record.source});}
  return output;
}
export function compare(before,after){
  const a=indexed(before),b=indexed(after),added=[],removed=[],changed=[];
  for(const [key,value]of b){if(!a.has(key))added.push(value);else if(JSON.stringify(a.get(key).data)!==JSON.stringify(value.data))changed.push({collection:value.collection,identity:value.identity,before:a.get(key),after:value});}
  for(const [key,value]of a)if(!b.has(key))removed.push(value);
  const sort=(a,b)=>(a.collection+a.identity).localeCompare(b.collection+b.identity,'en');
  return {schemaVersion:1,kind:'snapshot-comparison',semantics:'Declaration metadata; source line movement ignored. Route identity includes methods, URI, name, domain and file. Duplicate identities matched in declaration order.',counts:{added:added.length,removed:removed.length,changed:changed.length},added:added.sort(sort),removed:removed.sort(sort),changed:changed.sort(sort)};
}
