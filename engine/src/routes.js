import { expandResource, resourceMethods } from './resources.js';
import { chain, isRouteChain, literal, source, strings } from './ast.js';
const verbs = new Set(['get','post','put','patch','delete','options','any','match','view','redirect','permanentredirect','fallback']);
const allVerbs = ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'];
const fresh = () => ({ prefix: '', name: '', domain: null, namespace: '', controller: null, middleware: [], excludedMiddleware: [], issues: [], groups: [] });
const join = (a,b) => '/' + [a,b].filter(Boolean).map(x=>x.replace(/^\/+|\/+$/g,'')).filter(Boolean).join('/');
const classString = (v, ctx) => typeof v === 'string' ? v.startsWith('\\') ? v.slice(1) : ctx.namespace && !v.startsWith(ctx.namespace+'\\') ? ctx.namespace+'\\'+v : v : null;
export function scanRoutes(nodes, env, file, output, diagnose, options = {}) {
  const issue = (ctx, code, message, node) => { ctx.issues.push(code); diagnose(code, message, source(file,node)); };
  function attr(ctx, method, val, node, local = false) {
    if (['prefix','name','as','domain','namespace','controller'].includes(method)) {
      const key = method === 'as' ? 'name' : method;
      if (typeof val !== 'string') { ctx[key] = null; issue(ctx,'dynamic-route-attribute',`Dynamic ${key}; affected route values are unresolved.`,node); return; }
      if (key === 'prefix') ctx.prefix = ctx.prefix === null ? null : local ? join(val,ctx.prefix) : join(ctx.prefix,val);
      else if (key === 'name') ctx.name = ctx.name === null ? null : ctx.name + val;
      else if (key === 'namespace') ctx.namespace = val.startsWith('\\') ? val.replace(/^\\|\\$/g,'') : ctx.namespace === null ? null : [ctx.namespace,val.replace(/^\\|\\$/g,'')].filter(Boolean).join('\\');
      else ctx[key] = val;
    } else if (['middleware','withoutmiddleware'].includes(method)) {
      const list = strings(val);
      if (!list) issue(ctx,'dynamic-middleware','Middleware expression could not be resolved.',node);
      else ctx[method === 'middleware' ? 'middleware' : 'excludedMiddleware'].push(...list.map(value=>({ value, source: source(file,node) })));
    } else if (['where','wherenumber','wherealpha','wherealphanumeric','whereuuid','whereulid','wherein','scopebindings','withoutscopedbindings','withtrashed','defaults','missing','can'].includes(method)) {
      // These affect runtime behavior; never claim a complete matcher or middleware stack.
      issue(ctx,'route-option-unmodeled',`Route option ${method} is present but its runtime effects are not modeled.`,node);
    } else issue(ctx,'unsupported-route-call','Unsupported route fluent call; declaration is partial.',node);
  }
  function action(n, ctx) {
    if (n?.kind === 'closure' || n?.kind === 'arrowfunc') return { kind: 'closure', source: source(file,n) };
    const value = literal(n,env);
    if (Array.isArray(value) && value.length === 2 && value.every(v=>typeof v==='string')) return {kind:'controller', class: value[0].replace(/^\\/,''), method:value[1], explicitClass:true};
    if (typeof value === 'string') {
      if (value.includes('@')) { const [cls,method,...rest] = value.split('@'); if (!rest.length && method) return {kind:'controller',class:classString(cls,ctx),method}; }
      if (ctx.controller) return {kind:'controller',class:classString(ctx.controller,ctx),method:value};
      // A bare short legacy name depends on the provider namespace. Do not guess it.
      return {kind:'controller',class:classString(value,ctx),method:'__invoke'};
    }
    return {kind:'unresolved'};
  }
  function builder(calls,ctx) {
    const seen=new Set();
    for(const call of calls) {
      const key=call.method==='as'?'name':call.method;
      if(['prefix','name','domain','namespace','controller'].includes(key) && seen.has(key)) {
        ctx[key]=null;
        issue(ctx,'repeated-builder-attribute','Repeated builder attributes are not modeled; the affected value is unresolved.',call.node);
      } else attr(ctx,call.method,literal(call.args[0],env),call.node);
      seen.add(key);
    }
  }
  function process(c, inherited, conditional) {
    const ctx = structuredClone(inherited);
    if (conditional) issue(ctx,'conditional-route','Declaration is inside control flow or a callable; registration is conditional or deferred.',c.calls[0].node);
    const groupAt = c.calls.findIndex(x=>x.method==='group');
    if (groupAt >= 0) {
      builder(c.calls.slice(0,groupAt),ctx);
      const group = c.calls[groupAt];
      let callback = group.args[0];
      if (group.args.length > 1) {
        const attrs = group.args[0];
        if (attrs?.kind==='array' && attrs.items.every(i=>i && !i.unpack && typeof literal(i.key,env)==='string')) {
          for(const item of attrs.items) attr(ctx,literal(item.key,env).toLowerCase(),literal(item.value,env),item);
        } else { ctx.prefix=null; ctx.name=null; ctx.namespace=null; issue(ctx,'dynamic-route-group','Group attributes are unresolved; inherited values cannot be completed.',group.node); }
        callback = group.args[1];
      }
      ctx.groups.push(source(file,group.node));
      if (c.calls.length > groupAt+1) issue(ctx,'unsupported-route-call','Calls after group() are not modeled.',group.node);
      if (callback?.kind === 'closure') visit(callback.body,ctx,false);
      else issue(ctx,'dynamic-route-group','Group callback or included route file is unresolved; no routes invented.',group.node);
      return;
    }
    const resourceAt=c.calls.findIndex(x=>resourceMethods.has(x.method));
    if(resourceAt>=0){builder(c.calls.slice(0,resourceAt),ctx);output.push(...expandResource(c,resourceAt,ctx,env,file,diagnose,options));return;}
    const at = c.calls.findIndex(x=>verbs.has(x.method));
    if (at < 0) {
      issue(ctx,'unsupported-route-declaration','Route macro, resource, registration helper, or unsupported declaration was not expanded.',c.calls[0].node);
      return;
    }
    builder(c.calls.slice(0,at),ctx);
    const decl = c.calls[at];
    let pathIndex = decl.method === 'match' ? 1 : 0;
    let methods = decl.method === 'match' ? strings(literal(decl.args[0],env))?.map(x=>x.toUpperCase()) : ['get','view','fallback'].includes(decl.method) ? ['GET','HEAD'] : ['any','redirect','permanentredirect'].includes(decl.method) ? [...allVerbs] : [decl.method.toUpperCase()];
    if (!methods?.length || methods.some(m=>!allVerbs.includes(m))) { methods=null; issue(ctx,'dynamic-route-methods','HTTP methods are unresolved or unsupported.',decl.node); }
    if(methods?.includes('GET') && !methods.includes('HEAD')) methods.push('HEAD');
    const uri = decl.method==='fallback' ? null : literal(decl.args[pathIndex],env);
    if (decl.method !== 'fallback' && typeof uri !== 'string') issue(ctx,'dynamic-route-path','Route URI is dynamic and has not been evaluated.',decl.node);
    let handler = ['view','redirect','permanentredirect'].includes(decl.method) ? {kind:decl.method} : action(decl.args[decl.method==='fallback'?0:pathIndex+1],ctx);
    for (const call of c.calls.slice(at+1)) {
      if (call.method === 'uses') handler = action(call.args[0],ctx);
      else if(['controller','namespace','as'].includes(call.method)) issue(ctx,'unsupported-route-call','This option after a route declaration is not modeled.',call.node);
      else attr(ctx,call.method,literal(call.args[0],env),call.node,true);
    }
    if (handler.kind === 'unresolved') issue(ctx,'dynamic-route-handler','Handler cannot be resolved without executing PHP.',decl.node);
    if (ctx.namespace === null && handler.kind === 'controller' && !handler.explicitClass) {handler.class=null; issue(ctx,'dynamic-controller-namespace','Controller namespace is unknown.',decl.node);}
    const src = source(file,decl.node);
    output.push({id:`route:${file}:${src.line}:${src.column}`,kind:'route',methods,fallback:decl.method==='fallback',uri:typeof uri==='string'&&ctx.prefix!==null?join(ctx.prefix,uri):null,name:ctx.name||null,domain:ctx.domain,handler,middleware:ctx.middleware,excludedMiddleware:ctx.excludedMiddleware,groups:ctx.groups,source:src,issues:[...new Set(ctx.issues)],status:ctx.issues.length?'partial':'static',registration:'unverified'});
  }
  function visit(node,ctx,conditional=false) {
    if (!node || typeof node!=='object') return;
    if (Array.isArray(node)) {node.forEach(n=>visit(n,ctx,conditional));return;}
    const c = chain(node);
    if (isRouteChain(c,env)) {process(c,ctx,conditional);return;}
    if (node.kind === 'include') diagnose('route-file-include','Included files are not followed; files under routes/ are scanned independently.',source(file,node));
    if(c && !c.static && c.root?.kind === 'variable' && (verbs.has(c.calls[0]?.method)||c.calls[0]?.method==='group')) {diagnose('ambiguous-route-receiver','Variable receiver may be a router; no route has been inferred.',source(file,c.calls[0].node));return;}
    const uncertain = conditional || ['assign','if','for','foreach','while','do','switch','try','function','method','closure','arrowfunc','class'].includes(node.kind);
    for (const [k,v] of Object.entries(node)) if (!['loc','leadingComments','trailingComments'].includes(k) && v && typeof v==='object') visit(v,ctx,uncertain);
  }
  visit(nodes,fresh());
}
