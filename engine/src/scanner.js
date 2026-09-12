import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parser, scopes, walk, name, resolveClass, literal, chain, source, strings, isRouteChain } from './ast.js';
import { scanRoutes } from './routes.js';
import { scanBootstrapMiddleware } from './bootstrap-middleware.js';
import { composeTraits } from './traits.js';
const blocked = /^(?:vendor|node_modules|storage|bootstrap|cache|logs?|public|resources|tests?|database|dist|build|generated|reports?|coverage|credentials?|secrets?|personal|uploads?|backups?)$|^\.|(?:\.blade|\.generated)\.php$/i;
const relationTypes = new Set(['hasone','hasmany','belongsto','belongstomany','hasonethrough','hasmanythrough','morphone','morphmany','morphto','morphtomany','morphedbymany']);
const relationLabels = {hasone:'hasOne',hasmany:'hasMany',belongsto:'belongsTo',belongstomany:'belongsToMany',hasonethrough:'hasOneThrough',hasmanythrough:'hasManyThrough',morphone:'morphOne',morphmany:'morphMany',morphto:'morphTo',morphtomany:'morphToMany',morphedbymany:'morphedByMany'};
const modelBases = ['Illuminate\\Database\\Eloquent\\Model','Illuminate\\Foundation\\Auth\\User','Illuminate\\Database\\Eloquent\\Relations\\Pivot','Illuminate\\Database\\Eloquent\\Relations\\MorphPivot'];
export const boundaries = [
  'This is a declaration atlas, not artisan route:list. Route-file mounting, provider prefixes/namespaces, implicit web/api middleware, global/controller execution order, and package routes are not inferred.',
  'Regular PHP files beneath app/ and routes/, plus bootstrap/app.php, are parsed. Symlinks, hidden files, generated directories, other configuration, environment files, credentials, logs, vendor, database and resources are excluded.',
  'No target PHP, Composer scripts, application bootstrap, migrations, database queries, or network requests are executed.',
  'Source bodies, comments, arbitrary argument values, property values and runtime records are not embedded. Structural identifiers and route metadata remain local. Middleware parameters and sensitive-looking URI segments are redacted.',
  'Custom resource conventions, macros, variable routers, route assignments/mutations, dynamic registration, custom builders, external inheritance and adapted or external traits may be incomplete. Diagnostics identify encountered gaps; absence of a diagnostic is not proof of complete coverage.',
];
export async function sourceFiles(root) {
  const found=[];
  async function visit(dir) {
    let entries;
    try { entries=await fs.readdir(path.join(root,dir),{withFileTypes:true}); } catch(e) { if(e.code==='ENOENT') return; throw e; }
    for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
      if(blocked.test(entry.name)||entry.isSymbolicLink()||/(?:secret|credential|\.log)/i.test(entry.name)) continue;
      const rel=path.posix.join(dir,entry.name);
      if(entry.isDirectory()) await visit(rel);
      else if(entry.isFile()&&entry.name.endsWith('.php')) found.push(rel);
    }
  }
  for(const dir of ['app','routes']) {try {if(!(await fs.lstat(path.join(root,dir))).isSymbolicLink()) await visit(dir);}catch(e){if(e.code!=='ENOENT')throw e;}}
  try{const boot=await fs.lstat(path.join(root,'bootstrap'));const app=await fs.lstat(path.join(root,'bootstrap/app.php'));if(!boot.isSymbolicLink()&&app.isFile()&&!app.isSymbolicLink())found.push('bootstrap/app.php');}catch(e){if(e.code!=='ENOENT')throw e;}
  return found.sort();
}
export async function scan(target,{label='Application',maxFileBytes=2*1024*1024}={}) {
  const root=await fs.realpath(target);
  const stat=await fs.stat(root); if(!stat.isDirectory()) throw new Error('Target must be a directory.');
  const files=await sourceFiles(root);
  if(!files.length) throw new Error('No eligible PHP files found beneath app/ or routes/.');
  const result={schemaVersion:1,tool:{name:'MrLaravel',version:'1.0.0',parser:'php-parser 3.7.0'},application:label,mode:'static-declarations',boundaries,files:[],routes:[],controllers:[],models:[],middleware:[],relationships:[],edges:[],diagnostics:[]};
  const classes=new Map(), traits=new Map(), parsed=[];
  const diagnose=(code,message,src,severity='warning')=>{
    if(!result.diagnostics.some(x=>x.code===code&&x.source.file===src.file&&x.source.line===src.line&&x.source.column===src.column)) result.diagnostics.push({id:`diagnostic:${code}:${src.file}:${src.line}:${src.column}`,code,severity,message,source:src});
  };
  for(const file of files) {
    const src={file,line:1,column:1};
    let code;
    try {
      const stats=await fs.lstat(path.join(root,file));
      if(!stats.isFile()||stats.isSymbolicLink()) {diagnose('file-skipped','Source changed or is not a regular file.',src);continue;}
      if(stats.size>maxFileBytes) {diagnose('file-too-large','File exceeds the scan size limit and was skipped.',src);continue;}
      code=await fs.readFile(path.join(root,file),'utf8');
    }catch{diagnose('file-unreadable','PHP file could not be read.',src);continue;}
    try {
      const ast=parser.parseCode(code,file);
      result.files.push({file,lines:code.split('\n').length,status:'parsed'});
      for(const scope of scopes(ast)) {
        parsed.push({file,...scope});
        walk(scope.nodes,(n,parents)=>{
          if(!['class','trait'].includes(n.kind)||n.isAnonymous) return;
          const registry=n.kind==='trait'?traits:classes;
          const fqcn=[scope.env.namespace,name(n.name)].filter(Boolean).join('\\');
          const parent=resolveClass(n.extends,scope.env);
          const env={...scope.env,className:fqcn,parent};
          if(registry.has(fqcn.toLowerCase())) {diagnose('duplicate-class','Duplicate class declaration; class linkage is ambiguous.',source(file,n)); registry.get(fqcn.toLowerCase()).duplicate=true;return false;}
          registry.set(fqcn.toLowerCase(),{fqcn,parent,env,node:n,file,conditional:parents.some(p=>['if','function','closure'].includes(p.kind)),methods:(n.body??[]).filter(x=>x.kind==='method')});
          return false;
        });
      }
    }catch(e){
      const line=Number(e.lineNumber); result.files.push({file,status:'parse-error'});
      diagnose('parse-error','PHP could not be parsed. No findings were recovered from this file.',{file,line:Number.isInteger(line)&&line>0?line:1,column:1},'error');
    }
  }
  for(const c of classes.values()) c.methods=composeTraits(c,traits,diagnose);
  const lookup=cls=>typeof cls==='string'?classes.get(cls.toLowerCase()):undefined;
  function derives(c,bases,seen=new Set()) {
    if(!c||seen.has(c.fqcn))return false;seen.add(c.fqcn);
    return bases.some(b=>c.parent?.toLowerCase()===b.toLowerCase())||derives(lookup(c.parent),bases,seen);
  }
  function methodFor(c,method,seen=new Set()) {
    if(!c||c.duplicate||seen.has(c.fqcn))return null;seen.add(c.fqcn);
    const m=c.methods.find(m=>name(m.name)?.toLowerCase()===method?.toLowerCase()&&(!m.visibility||m.visibility==='public')&&!m.isStatic&&!m.isAbstract);
    return m?{c,m}:methodFor(lookup(c.parent),method,seen);
  }
  for(const c of classes.values()) {
    c.isModel=derives(c,modelBases); c.isController=c.file.startsWith('app/Http/Controllers/')||derives(c,['Illuminate\\Routing\\Controller']);
    if(c.isModel||c.isController) {
      const record={id:`class:${c.fqcn}`,kind:c.isModel?'model':'controller',name:c.fqcn,parent:c.parent,source:source(c.file,c.node),status:c.duplicate||c.conditional||c.traitPartial?'partial':'static',methods:c.methods.filter(m=>(!m.visibility||m.visibility==='public')&&!m.isStatic).map(m=>({id:`method:${c.fqcn}::${name(m.name)}`,name:name(m.name),source:source(m._origin?.file??c.file,m)}))};
      result[c.isModel?'models':'controllers'].push(record);
    } else if(c.file.startsWith('app/Models/')) diagnose('unresolved-model-ancestry','Class in app/Models is not proven to extend Eloquent; external parents and traits are not loaded.',source(c.file,c.node));
    if(c.file==='app/Http/Kernel.php') {
      for(const prop of c.node.body.filter(n=>n.kind==='propertystatement').flatMap(n=>n.properties??[])) {
        const pn=name(prop.name); if(!['routeMiddleware','middlewareAliases','middlewareGroups'].includes(pn))continue;
        const values=literal(prop.value,c.env);
        if(!values||typeof values!=='object'||Array.isArray(values)) {diagnose('dynamic-middleware-map','Kernel middleware map is unresolved.',source(c.file,prop));continue;}
        for(const [alias,value] of Object.entries(values)) {
          const members=strings(value); const entry=prop.value.items?.find(i=>literal(i.key,c.env)===alias);
          if(!members){diagnose('dynamic-middleware-map','Kernel middleware map entry is unresolved.',source(c.file,entry??prop));continue;}
          result.middleware.push({id:`middleware:${alias}:${c.file}:${source(c.file,entry??prop).line}`,kind:pn==='middlewareGroups'?'group':'alias',name:alias,members,source:source(c.file,entry??prop)});
        }
      }
    }
  }
  let conventionsUnknown=false;
  for(const {nodes} of parsed) walk(nodes,n=>{const ch=chain(n);if(ch?.calls.some(c=>['resourceparameters','resourceverbs','singularresourceparameters','uselanguage'].includes(c.method)))conventionsUnknown=true;});
  for(const {file,nodes,env} of parsed) {
    if(file==='bootstrap/app.php')scanBootstrapMiddleware(nodes,env,file,result.middleware,diagnose);
    if(file.startsWith('routes/')) scanRoutes(nodes,env,file,result.routes,diagnose,{conventionsUnknown});
    else walk(nodes,n=>{if(isRouteChain(chain(n),env)){diagnose('route-outside-route-files','Route facade call outside routes/ is not interpreted. Provider mounting and registration remain unverified.',source(file,n));return false;}});
  }
  const edge=(from,to,type,src,extra={})=>{if(!result.edges.some(e=>e.from===from&&e.to===to&&e.type===type&&e.source.file===src.file&&e.source.line===src.line))result.edges.push({id:`edge:${createHash('sha256').update(JSON.stringify([from,to,type,src])).digest('hex').slice(0,16)}`,from,to,type,source:src,...extra});};
  for(const c of classes.values()) {
    if(!c.isModel&&!c.isController)continue;
    for(const method of c.methods) {
      const methodFile=method._origin?.file??c.file,methodEnv=method._origin?{...method._origin.env,className:c.fqcn,parent:c.parent}:c.env;
      if(c.isController && (!method.visibility||method.visibility==='public') && !method.isStatic) walk(method,n=>{
        let cls=null,kind=null;
        if(n.kind==='staticlookup'&&name(n.offset)!=='class'){cls=resolveClass(n.what,methodEnv);kind='static reference';}
        if(n.kind==='new'){cls=resolveClass(n.what,methodEnv);kind='construction';}
        if(n.kind==='parameter'&&n.type?.kind==='name'){cls=resolveClass(n.type,methodEnv);kind='parameter type';}
        if(lookup(cls)?.isModel&&!lookup(cls).duplicate)edge(`method:${c.fqcn}::${name(method.name)}`,`class:${lookup(cls).fqcn}`,'references-model',source(methodFile,n),{evidence:kind});
        if(['closure','arrowfunc','class','function'].includes(n.kind))return false;
      });
      if(!c.isModel||(method.visibility&&method.visibility!=='public')||method.isStatic)continue;
      let found=false;
      walk(method.body,(n,parents)=>{
        if(['closure','arrowfunc','function','class'].includes(n.kind))return false;
        if(n.kind!=='return')return;
        const ch=chain(n.expr);
        if(ch?.static||ch?.root?.kind!=='variable'||ch.root.name!=='this'||!relationTypes.has(ch.calls[0]?.method))return;
        found=true;
        const call=ch.calls[0], type=call.method, issues=[];
        const conditional=parents.some(p=>['if','switch','for','foreach','while','try'].includes(p.kind));
        const mutations=ch.calls.slice(1).map(x=>x.method);
        if(mutations.some(x=>['get','first','find','count','exists','pluck','value','sum','avg','min','max','create','save','delete','update','paginate'].includes(x))){diagnose('relationship-terminal-call','Relationship builder is consumed by a terminal call; this method is not reported as a relationship.',source(methodFile,call.node));return;}
        if(c.methods.some(m=>name(m.name)?.toLowerCase()===type)){issues.push('custom-relationship-factory');diagnose('custom-relationship-factory','Class overrides this relationship factory; the connection is only a candidate.',source(methodFile,call.node));}
        const preserving=new Set(['where','wherein','wherenull','wherenotnull','orderby','latest','oldest','withpivot','withtimestamps','withdefault','as','using','withtrashed','onlytrashed','withoutglobalScopes'.toLowerCase(),'ofmany','latestofmany','oldestofmany','wherepivot','wherepivotin','wherepivotnull','orderbypivot','select','limit','take']);
        if(mutations.some(x=>!preserving.has(x))){issues.push('relationship-chain-unverified');diagnose('relationship-chain-unverified','Returned chain may transform the relationship; only the base call is recorded.',source(methodFile,call.node));}
        if(conditional){issues.push('conditional-relationship');diagnose('conditional-relationship','Relationship return depends on control flow; this is a possible connection.',source(methodFile,call.node));}
        if(method.arguments.some(a=>!a.value&&!a.variadic)){issues.push('relationship-requires-arguments');diagnose('relationship-requires-arguments','Method requires arguments; it may not be usable as an Eloquent relationship.',source(methodFile,method));}
        let target=type==='morphto'?null:literal(call.args[0],methodEnv);
        if(typeof target!=='string')target=null;else target=target.replace(/^\\/,'');
        const through=['hasonethrough','hasmanythrough'].includes(type)?literal(call.args[1],methodEnv):null;
        if(type==='morphto'){issues.push('polymorphic-target');diagnose('polymorphic-target','morphTo target is selected at runtime; no target model is invented.',source(methodFile,call.node),'info');}
        else if(!target){issues.push('dynamic-relationship-target');diagnose('dynamic-relationship-target','Related class expression cannot be resolved.',source(methodFile,call.node));}
        else if(!lookup(target)?.isModel||lookup(target)?.duplicate){issues.push('relationship-target-unavailable');diagnose('relationship-target-unavailable','Related class is not a unique Eloquent model in the scanned source.',source(methodFile,call.node));}
        if(['hasonethrough','hasmanythrough'].includes(type)&&(!lookup(through)?.isModel||lookup(through)?.duplicate)){issues.push('relationship-through-unavailable');diagnose('relationship-through-unavailable','Through model is unresolved or outside the scan.',source(methodFile,call.node));}
        const src=source(methodFile,call.node), id=`relationship:${c.fqcn}::${name(method.name)}:${src.line}:${src.column}`;
        const rel={id,kind:'relationship',model:c.fqcn,name:name(method.name),type:relationLabels[type],target,through:typeof through==='string'?through:null,source:src,status:issues.length?'partial':'static',issues};
        result.relationships.push(rel);
        edge(`class:${c.fqcn}`,id,'declares-relationship',src);
        if(target&&lookup(target)?.isModel&&!lookup(target).duplicate)edge(id,`class:${lookup(target).fqcn}`,'related-model',src,{certainty:issues.length?'possible':'static'});
        if(typeof through==='string'&&lookup(through)?.isModel&&!lookup(through).duplicate)edge(id,`class:${lookup(through).fqcn}`,'through-model',src,{certainty:issues.length?'possible':'static'});
      });
      if(!found) walk(method.body,n=>{const ch=chain(n);if(ch?.root?.kind==='variable'&&ch.root.name==='this'&&relationTypes.has(ch.calls[0]?.method)){diagnose('indirect-relationship','Relationship call is not directly returned; no relationship inferred.',source(methodFile,n));return false;}});
    }
  }
  for(const route of result.routes) {
    if(route.handler.kind==='controller') {
      const c=lookup(route.handler.class), resolved=methodFor(c,route.handler.method);
      if(resolved&&resolved.c.isController&&!c.conditional) {
        route.handler.source=source(resolved.m._origin?.file??resolved.c.file,resolved.m);
        route.handler.methodId=`method:${resolved.c.fqcn}::${name(resolved.m.name)}`;
        edge(route.id,route.handler.methodId,'handles',route.source);
      }else{route.issues.push('controller-action-unavailable');route.status='partial';diagnose('controller-action-unavailable','Controller action is absent, non-public, ambiguous, external, or depends on a provider namespace/trait.',route.source);}
    }
    for(const entry of route.middleware) {
      const alias=entry.value.split(':')[0], definitions=result.middleware.filter(m=>m.name===alias), def=definitions.length===1?definitions[0]:null, cls=lookup(alias);
      if(definitions.length>1){diagnose('ambiguous-middleware-definition','Multiple middleware definitions use this name; no definition is selected.',entry.source);continue;}
      if(def)edge(route.id,def.id,'declares-middleware',entry.source);
      else if(cls) {
        let m=result.middleware.find(m=>m.id===`class:${cls.fqcn}`);
        if(!m){m={id:`class:${cls.fqcn}`,kind:'class',name:cls.fqcn,members:[],source:source(cls.file,cls.node)};result.middleware.push(m);}
        edge(route.id,m.id,'declares-middleware',entry.source);
      } else diagnose('middleware-definition-unavailable','Assigned middleware alias or class is outside the supported source maps.',entry.source,'info');
    }
  }
  for(const collection of ['routes','controllers','models','middleware','relationships','edges','diagnostics']) result[collection].sort((a,b)=>(a.source?.file??'').localeCompare(b.source?.file??'','en') || (a.source?.line??0)-(b.source?.line??0) || (a.source?.column??0)-(b.source?.column??0) || a.id.localeCompare(b.id,'en'));
  result.counts={files:result.files.length,routes:result.routes.length,controllers:result.controllers.length,models:result.models.length,relationships:result.relationships.length,middleware:result.middleware.length,edges:result.edges.length,diagnostics:result.diagnostics.length};
  return redact(result);
}
function redact(result) {
  // Export an allowlist of metadata only. Never include parsed AST or source text.
  for(const route of result.routes) {
    for(const entry of [...route.middleware,...route.excludedMiddleware]) entry.value=entry.value.replace(/:.+$/,':[parameters omitted]');
  }
  for(const entry of result.middleware)entry.members=entry.members.map(m=>m.replace(/:.+$/,':[parameters omitted]'));
  const sensitive=/(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:password|secret|token|api[_-]?key)[=:][^\s/]+|\b[A-Za-z0-9_-]{40,}\b)/gi;
  function clean(value) {
    if (typeof value === 'string') return value.replace(sensitive,'[redacted]');
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clean(v)]));
    return value;
  }
  return clean(result);
}
