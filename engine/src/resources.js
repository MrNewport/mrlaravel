import{literal,source,strings}from'./ast.js';
import{singular}from'./inflector.js';
export const resourceMethods=new Set(['resource','apiresource']);
export function expandResource(c,at,ctx,env,file,diagnose,{conventionsUnknown=false}={}){
 const call=c.calls[at],src=source(file,call.node);let resource=literal(call.args[0],env),controller=literal(call.args[1],env);
 const issue=(code,message)=>{ctx.issues.push(code);diagnose(code,message,src);};
 if(typeof resource!=='string'||!/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(resource)||typeof controller!=='string') {issue('dynamic-resource','Resource name or controller is unresolved, or the declaration uses unsupported slash syntax. No routes expanded.');return[];}
 let opts={};if(call.args[2]){const v=literal(call.args[2],env);if(v&&typeof v==='object'&&!Array.isArray(v))opts=v;else if(Array.isArray(v)&&!v.length)opts={};else{issue('dynamic-resource-options','Resource options are dynamic; no route set has been invented.');return[];}}
 for(const fluent of c.calls.slice(at+1)){
  const val=literal(fluent.args[0],env);
  if(['only','except','names','parameters','middleware'].includes(fluent.method))opts[fluent.method]=val;
  else if(fluent.method==='withoutmiddleware')opts.excluded_middleware=val;
  else if(fluent.method==='shallow')opts.shallow=val===undefined&&!fluent.args.length?true:val;
  else if(fluent.method==='name') {const method=val,value=literal(fluent.args[1],env);if(typeof method==='string'&&typeof value==='string')opts.names={...(typeof opts.names==='object'?opts.names:{}),[method]:value};else opts.names=undefined;}
  else {issue('unsupported-resource-option','An unsupported resource modifier prevents complete expansion.');return[];}
 }
 if(Object.keys(opts).some(k=>!['only','except','names','parameters','middleware','excluded_middleware','shallow'].includes(k))){issue('unsupported-resource-option','Resource options contain unmodeled behavior; no route set has been invented.');return[];}
 let methods=call.method==='apiresource'&&!('only'in opts)?['index','store','show','update','destroy']:['index','create','store','show','edit','update','destroy'];
 for(const key of ['only','except'])if(key in opts){const set=strings(opts[key]);if(!set||set.some(m=>!['index','create','store','show','edit','update','destroy'].includes(m))){issue('dynamic-resource-options','Resource action filters are unresolved.');return[];}methods=methods.filter(m=>key==='only'?set.includes(m):!set.includes(m));}
 const parameters=opts.parameters??{};
 if('parameters'in opts&&(!parameters||typeof parameters!=='object'||Array.isArray(parameters)||Object.values(parameters).some(v=>typeof v!=='string'||!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(v)))){issue('dynamic-resource-options','Resource parameters are unresolved.');return[];}
 if('names'in opts&&!(typeof opts.names==='string'||opts.names&&typeof opts.names==='object'&&!Array.isArray(opts.names)&&Object.values(opts.names).every(v=>typeof v==='string'))){issue('dynamic-resource-options','Resource route names are unresolved.');return[];}
 if('shallow'in opts&&typeof opts.shallow!=='boolean'){issue('dynamic-resource-options','Resource shallowness is unresolved.');return[];}
 for(const [key,dest]of [['middleware','middleware'],['excluded_middleware','excludedMiddleware']])if(key in opts){const values=strings(opts[key]);if(values)ctx[dest].push(...values.map(value=>({value,source:src})));else issue('dynamic-middleware','Resource middleware is unresolved.');}
 if(conventionsUnknown)issue('resource-conventions-unresolved','Custom resource or inflection conventions were found; generated URI defaults are unresolved.');
 const segments=resource.split('.'),param=s=>(parameters[s]??singular(s)).replace(/-/g,'_');
 const nested=segments.map((s,i)=>s+(i<segments.length-1?'/{'+param(s)+'}':'')).join('/');
 const simple=segments.at(-1),baseParam=param(simple),verbs={index:['GET','HEAD'],create:['GET','HEAD'],store:['POST'],show:['GET','HEAD'],edit:['GET','HEAD'],update:['PUT','PATCH'],destroy:['DELETE']};
 const fullClass=controller.startsWith('\\')?controller.slice(1):ctx.namespace&&!controller.startsWith(ctx.namespace+'\\')?ctx.namespace+'\\'+controller:controller;
 return methods.map(method=>{
  const isMember=['show','edit','update','destroy'].includes(method),shallow=opts.shallow&&isMember;let uri=shallow?simple:nested;
  if(isMember)uri+='/{'+baseParam+'}';if(method==='create'||method==='edit')uri+='/'+method;
  const routeName=typeof opts.names==='object'&&opts.names[method]!==undefined?opts.names[method]:`${typeof opts.names==='string'?opts.names:shallow?simple:resource}.${method}`;
  return {id:`route:${file}:${src.line}:${src.column}:${method}`,kind:'route',methods:verbs[method],fallback:false,uri:ctx.prefix===null||conventionsUnknown?null:'/'+[ctx.prefix,uri].filter(Boolean).map(s=>s.replace(/^\/+|\/+$/g,'')).filter(Boolean).join('/'),name:ctx.name===null?null:ctx.name+routeName,domain:ctx.domain,handler:{kind:'controller',class:ctx.namespace===null?null:fullClass,method},middleware:structuredClone(ctx.middleware),excludedMiddleware:structuredClone(ctx.excludedMiddleware),groups:ctx.groups,source:src,issues:[...new Set(ctx.issues)],status:ctx.issues.length?'partial':'static',registration:'unverified',resource:{name:resource,action:method}};
 });
}
