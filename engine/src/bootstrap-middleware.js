import{walk,chain,resolveClass,literal,name,source,strings}from'./ast.js';
export function scanBootstrapMiddleware(nodes,env,file,result,diagnose){
 walk(nodes,n=>{
  const ch=chain(n),registration=ch?.calls.find(c=>c.method==='withmiddleware');
  if(!registration||resolveClass(ch.root,env)!=='Illuminate\\Foundation\\Application')return;
  const callback=registration.args[0],parameter=callback?.arguments?.[0];
  if(callback?.kind!=='closure'||resolveClass(parameter?.type,env)!=='Illuminate\\Foundation\\Configuration\\Middleware'){diagnose('dynamic-bootstrap-middleware','Middleware configuration callback is not a supported typed closure.',source(file,registration.node));return false;}
  const variable=name(parameter.name);let reassigned=false;
  walk(callback.body,n=>{if(n.kind==='assign'&&n.left?.kind==='variable'&&n.left.name===variable)reassigned=true;});
  if(reassigned){diagnose('dynamic-bootstrap-middleware','Middleware configuration receiver is reassigned; declarations are unresolved.',source(file,registration.node));return false;}
  walk(callback.body,(n,parents)=>{
   if(['closure','arrowfunc','function','class'].includes(n.kind))return false;
   const call=chain(n);if(call?.static||call?.root?.kind!=='variable'||call.root.name!==variable)return;
   if(parents.some(p=>['if','switch','for','foreach','while','try'].includes(p.kind))){diagnose('conditional-bootstrap-middleware','Conditional middleware configuration is not treated as a definite map.',source(file,call.calls[0].node));return false;}
   for(const item of call.calls){
    if(item.method==='alias'){
     const aliases=item.args[0];
     if(aliases?.kind!=='array'){diagnose('dynamic-middleware-map','Bootstrap alias map is dynamic.',source(file,item.node));continue;}
     for(const entry of aliases.items??[]){const alias=literal(entry?.key,env),member=literal(entry?.value,env);if(entry?.unpack||typeof alias!=='string'||typeof member!=='string'){diagnose('dynamic-middleware-map','Bootstrap alias entry is dynamic.',source(file,entry??item.node));continue;}const src=source(file,entry);result.push({id:`middleware:${alias}:${file}:${src.line}:${src.column}`,kind:'alias',name:alias,members:[member],source:src});}
    }else if(item.method==='group'){
     const group=literal(item.args[0],env),members=strings(literal(item.args[1],env)),src=source(file,item.node);
     if(typeof group!=='string'||!members){diagnose('dynamic-middleware-map','Bootstrap middleware group is dynamic.',src);continue;}
     result.push({id:`middleware:${group}:${file}:${src.line}:${src.column}`,kind:'group',name:group,members,source:src});
    }else diagnose('bootstrap-middleware-operation','Global stack changes and middleware configuration helpers are not expanded.',source(file,item.node),'info');
   }
   return false;
  });return false;
 });
}
