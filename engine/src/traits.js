import{name,resolveClass,source}from'./ast.js';
// Expand only unambiguous local trait uses. Preserve the trait's lexical imports and source.
export function composeTraits(owner,traits,diagnose,seen=new Set()){
 if(seen.has(owner.fqcn)){diagnose('trait-cycle','Trait composition is cyclic; methods remain unresolved.',source(owner.file,owner.node));return owner.methods;}
 seen=new Set([...seen,owner.fqcn]);const own=new Set(owner.methods.map(m=>name(m.name).toLowerCase())),candidates=new Map(),conflicts=new Set();
 for(const use of (owner.node.body??[]).filter(n=>n.kind==='traituse')){
  if(use.adaptations?.length){owner.traitPartial=true;diagnose('trait-adaptation','Trait aliases and conflict adaptations are not expanded.',source(owner.file,use));continue;}
  for(const ref of use.traits){const target=traits.get(resolveClass(ref,owner.env)?.toLowerCase());
   if(!target||target.duplicate){owner.traitPartial=true;diagnose('trait-composition','Trait is unavailable or ambiguous in local app source; its methods are not expanded.',source(owner.file,use));continue;}
   for(const m of composeTraits(target,traits,diagnose,seen)){
    const key=name(m.name).toLowerCase();if(own.has(key))continue;
    const method={...m,_origin:m._origin??{file:target.file,env:target.env}};
    const old=candidates.get(key);
    if(old&&(old._origin.file!==method._origin.file||old.loc.start.line!==method.loc.start.line||old.loc.start.column!==method.loc.start.column)){conflicts.add(key);owner.traitPartial=true;diagnose('trait-method-conflict','Multiple traits define the same method; no method is chosen.',source(owner.file,use));}
    else candidates.set(key,method);
   }
  }
 }
 return [...owner.methods,...[...candidates].filter(([k])=>!conflicts.has(k)).map(([,m])=>m)];
}
