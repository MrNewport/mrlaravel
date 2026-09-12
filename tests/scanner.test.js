import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import { execFileSync } from 'node:child_process';
import { scan,sourceFiles } from '../engine/src/scanner.js';
import { compare } from '../engine/src/diff.js';
import { renderReport } from '../engine/src/report.js';
const fixture=fileURLToPath(new URL('./fixtures/atlas/',import.meta.url));
const cli=fileURLToPath(new URL('../engine/bin/mrlaravel.js',import.meta.url));
const atlas=await scan(fixture);
const route=uri=>atlas.routes.find(r=>r.uri===uri);
async function temporary(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'mrlaravel-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.cp(fixture,root,{recursive:true});return root;}
test('resolves nested groups, imports, GET/HEAD, names, exclusions and source columns',()=>{
  const r=route('/workspace/journals/{journal}');assert.deepEqual(r.methods,['GET','HEAD']);assert.equal(r.name,'workspace.journals.show');
  assert.equal(r.handler.class,'App\\Http\\Controllers\\JournalController');assert.equal(r.handler.method,'show');assert.equal(r.handler.source.line,7);
  assert.deepEqual(r.middleware.map(m=>m.value),['auth','throttle:[parameters omitted]','verified']);assert.equal(r.groups.length,2);
  assert.equal(r.source.line,9);assert.equal(r.source.column,16);
  const post=atlas.routes.find(r=>r.methods?.[0]==='POST');assert.deepEqual(post.excludedMiddleware.map(m=>m.value),['verified']);
});
test('controller groups, invokable handlers, closures and non-controller helpers',()=>{
  assert.deepEqual(route('/api/search').methods,['GET','POST','HEAD']);assert.equal(route('/api/search').handler.method,'search');
  assert.equal(route('/health').handler.method,'__invoke');assert.equal(route('/health').handler.source.line,3);
  assert.equal(route('/about').handler.kind,'closure');assert.equal(route('/help').handler.kind,'view');assert.equal(route('/old').handler.kind,'redirect');assert.equal(route('/team').domain,'{team}.example.test');
});
test('dynamic declarations and missing actions remain explicitly unresolved',()=>{
  assert.equal(atlas.routes.filter(r=>r.uri===null).length,3);
  assert.equal(route('/dynamic').handler.kind,'unresolved');assert.equal(route('/guarded').status,'partial');assert.equal(route('/preview').status,'partial');
  assert.equal(route('/missing').handler.methodId,undefined);
  for(const code of ['dynamic-route-path','dynamic-route-handler','dynamic-route-attribute','dynamic-route-group','conditional-route','controller-action-unavailable'])assert.ok(atlas.diagnostics.some(d=>d.code===code),code);
  assert.ok(atlas.routes.some(r=>r.uri==='/journals/{journal}/edit'&&r.resource.action==='edit'));
});
test('model ancestry, direct relationship targets, polymorphism, and terminal calls',()=>{
  assert.equal(atlas.models.length,5);assert.ok(atlas.models.some(m=>m.name==='App\\Models\\Entry'));
  const owner=atlas.relationships.find(r=>r.name==='owner');assert.equal(owner.type,'belongsTo');assert.equal(owner.target,'App\\Models\\User');assert.equal(owner.source.line,8);
  const subject=atlas.relationships.find(r=>r.name==='subject');assert.equal(subject.target,null);assert.ok(!atlas.edges.some(e=>e.from===subject.id));
  const author=atlas.relationships.find(r=>r.name==='author');assert.equal(author.through,'App\\Models\\Journal');
  assert.equal(atlas.relationships.find(r=>r.name==='mystery').target,null);assert.equal(atlas.relationships.find(r=>r.name==='maybe').status,'partial');
  assert.ok(!atlas.relationships.some(r=>['indirect','entryCount'].includes(r.name)));assert.ok(atlas.diagnostics.some(d=>d.code==='relationship-terminal-call'));
});
test('controller-model edges require actual references; source positions identify tokens',async()=>{
  const edges=atlas.edges.filter(e=>e.type==='references-model');assert.ok(edges.some(e=>e.evidence==='parameter type'));assert.ok(edges.some(e=>e.evidence==='construction'));
  assert.ok(!edges.some(e=>e.from==='method:App\\Http\\Controllers\\JournalController::index'&&e.to==='class:App\\Models\\Entry'));
  for(const r of atlas.routes){const line=(await fs.readFile(path.join(fixture,r.source.file),'utf8')).split('\n')[r.source.line-1];assert.match(line.slice(r.source.column-1),/^(get|post|match|view|redirect|resource)\(/);}
  for(const r of atlas.relationships){const line=(await fs.readFile(path.join(fixture,r.source.file),'utf8')).split('\n')[r.source.line-1];assert.ok(line.slice(r.source.column-1).startsWith(r.type+'('));}
});
test('all edges point at known nodes and all finding source links exist',async()=>{
  const nodes=new Set([...atlas.routes,...atlas.controllers,...atlas.models,...atlas.middleware,...atlas.relationships,...atlas.controllers.flatMap(c=>c.methods)].map(x=>x.id));
  for(const e of atlas.edges){assert.ok(nodes.has(e.from),e.from);assert.ok(nodes.has(e.to),e.to);}
  for(const r of [...atlas.routes,...atlas.controllers,...atlas.models,...atlas.middleware,...atlas.relationships,...atlas.diagnostics,...atlas.edges]){const code=await fs.readFile(path.join(fixture,r.source.file),'utf8');assert.ok(r.source.line>0&&r.source.line<=code.split('\n').length);}
});
test('privacy: source bodies, properties, middleware parameters and personal literals omitted',()=>{
  const json=JSON.stringify(atlas);for(const secret of ['DO_NOT_EXPORT_LITERAL','DO_NOT_EXPORT_PROPERTY','SUPER_PRIVATE_VALUE','person@example.test','60,1','Never export response bodies'])assert.ok(!json.includes(secret),secret);
  assert.ok(route('/secret/[redacted]'));assert.ok(!json.includes(fixture));
});
test('filesystem scope excludes secrets, environment, generated output and symlinks',async t=>{
  const root=await temporary(t);for(const dir of ['vendor','storage/logs','app/generated','app/credentials','routes/.private']){await fs.mkdir(path.join(root,dir),{recursive:true});await fs.writeFile(path.join(root,dir,'Injected.php'),"<?php Route::get('/DO_NOT_SCAN', fn()=>1);");}
  await fs.writeFile(path.join(root,'.env'), 'SECRET=NEVER_READ');await fs.symlink(path.join(root,'routes/web.php'),path.join(root,'routes/link.php'));
  const files=await sourceFiles(root);assert.ok(!files.some(f=>f.includes('Injected')||f.includes('link.php')));assert.deepEqual((await scan(root)).counts,atlas.counts);
});
test('PHP is parsed without execution; parse failures do not leak parser snippets',async t=>{
  const root=await temporary(t),sentinel=path.join(root,'executed');await fs.writeFile(path.join(root,'routes/no-execute.php'),`<?php file_put_contents('${sentinel}', 'executed'); Route::get('/safe', fn()=>1);`);
  await fs.writeFile(path.join(root,'app/Broken.php'),"<?php class Broken { private $secret = 'NEVER_ECHO_PARSE_CONTENT' !!! }");
  const result=await scan(root);await assert.rejects(fs.access(sentinel));assert.ok(result.routes.some(r=>r.uri==='/safe'));assert.ok(result.diagnostics.some(d=>d.code==='parse-error'));assert.ok(!JSON.stringify(result).includes('NEVER_ECHO_PARSE_CONTENT'));
});
test('multiline fluent calls and aliases link to exact methods; unrelated Route class ignored',async t=>{
  const root=await temporary(t);await fs.writeFile(path.join(root,'routes/extra.php'),`<?php\nuse Illuminate\\Support\\Facades\\Route as R;\nR::prefix('a')\n ->middleware('auth')\n ->get('b', fn()=>1);\n$router->get('/variable', fn()=>1);\nnamespace Other;\nuse Other\\Route;\nRoute::get('/not-a-laravel-route', fn()=>1);`);
  const result=await scan(root);assert.equal(result.routes.find(r=>r.uri==='/a/b').source.line,5);assert.equal(result.routes.find(r=>r.uri==='/a/b').middleware[0].source.line,4);assert.ok(!result.routes.some(r=>r.uri==='/not-a-laravel-route'));assert.ok(result.diagnostics.some(d=>d.code==='ambiguous-route-receiver'));
});
test('snapshots are deterministic, and comparison ignores line movement but detects behavior changes',async t=>{
  assert.deepEqual(atlas,await scan(fixture));const root=await temporary(t),file=path.join(root,'routes/web.php');let code=await fs.readFile(file,'utf8');await fs.writeFile(file,code.replace('<?php','<?php\n\n'));const shifted=await scan(root);assert.deepEqual(compare(atlas,shifted).counts,{added:0,removed:0,changed:0});
  await fs.writeFile(file,code.replace("->name('home')","->middleware('verified')->name('home')"));const changed=compare(atlas,await scan(root));assert.ok(changed.changed.some(c=>c.collection==='routes'));assert.ok(changed.added.some(c=>c.collection==='edges'));
});
test('CLI prevents writes into target including output symlink, and emits useful exit codes',async t=>{
  const root=await temporary(t);assert.throws(()=>execFileSync(process.execPath,[cli,'scan',root,'--out',path.join(root,'report')],{stdio:'pipe'}),e=>e.status===1);
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'mrlaravel-out-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));await fs.symlink(root,path.join(temp,'link'));assert.throws(()=>execFileSync(process.execPath,[cli,'scan',root,'--out',path.join(temp,'link','report')],{stdio:'pipe'}));
  await fs.writeFile(path.join(root,'app/Bad.php'),'<?php class { broken');assert.throws(()=>execFileSync(process.execPath,[cli,'scan',root,'--out',path.join(temp,'scan')],{stdio:'pipe'}),e=>e.status===2);assert.ok((await fs.stat(path.join(temp,'scan/report.html'))).isFile());
});
test('self-contained HTML safely embeds hostile structural text without executable markup',async()=>{
  const r=structuredClone(atlas);r.application='</script><script>globalThis.pwned=true</script>';
  const html=await renderReport(r);assert.ok(!html.includes(r.application));assert.ok(html.includes('\\u003c/script\\u003e'));assert.ok(html.includes("connect-src 'none'"));assert.ok(!html.includes('<script src='));
});
test('Laravel HTTP semantics: match GET adds HEAD; fallback is GET/HEAD; all verbs are explicit',async t=>{
  const root=await temporary(t);await fs.writeFile(path.join(root,'routes/methods.php'),`<?php\nRoute::match(['get','post'], '/match', fn()=>1);\nRoute::fallback(fn()=>1);\nRoute::any('/any', fn()=>1);\nRoute::match(['HEAD'], '/head', fn()=>1);\nRoute::put('/put', fn()=>1);\nRoute::patch('/patch', fn()=>1);\nRoute::delete('/delete', fn()=>1);\nRoute::options('/options', fn()=>1);\nRoute::permanentRedirect('/redirect', '/destination');`);
  const r=await scan(root);assert.deepEqual(r.routes.find(r=>r.uri==='/match').methods,['GET','POST','HEAD']);assert.deepEqual(r.routes.find(r=>r.fallback).methods,['GET','HEAD']);assert.equal(r.routes.find(r=>r.fallback).uri,null);assert.deepEqual(r.routes.find(r=>r.uri==='/head').methods,['HEAD']);assert.equal(r.routes.find(r=>r.uri==='/any').methods.length,7);
  for(const method of ['PUT','PATCH','DELETE','OPTIONS'])assert.deepEqual(r.routes.find(r=>r.uri==='/'+method.toLowerCase()).methods,[method]);
});
test('empty/partially dynamic groups retain known values; namespaces and post-declaration prefixes are accurate',async t=>{
  const root=await temporary(t);await fs.writeFile(path.join(root,'routes/groups.php'),`<?php
use App\\Http\\Controllers\\JournalController;
Route::group([], function(){ Route::get('/empty', [JournalController::class,'index']); });
Route::group(['prefix'=>config('prefix'), 'middleware'=>['auth']], function(){ Route::get('/unknown', [JournalController::class,'index']); });
Route::namespace('App\\Http\\Controllers')->group(function(){
 Route::get('/legacy','JournalController@index');
 Route::get('/array',[JournalController::class,'index']);
});
Route::prefix('admin')->group(function(){ Route::get('/page',fn()=>1)->prefix('v2'); });
Route::prefix('a')->prefix('b')->get('/repeat',fn()=>1);
Route::get('/two//slashes',fn()=>1);
`);
  const result=await scan(root);assert.equal(result.routes.find(r=>r.uri==='/empty').status,'static');
  const unknown=result.routes.find(r=>r.uri===null&&r.middleware.length);assert.equal(unknown.middleware[0].value,'auth');assert.ok(unknown.handler.methodId);
  assert.equal(result.routes.find(r=>r.uri==='/legacy').handler.methodId,'method:App\\Http\\Controllers\\JournalController::index');assert.ok(result.routes.find(r=>r.uri==='/array').handler.methodId);
  assert.ok(result.routes.find(r=>r.uri==='/v2/admin/page'));assert.ok(result.routes.find(r=>r.uri==='/two//slashes'));assert.ok(result.diagnostics.find(d=>d.code==='repeated-builder-attribute'));
});
test('implicit public visibility and self references work; late-static targets stay unknown',async t=>{
  const root=await temporary(t);await fs.writeFile(path.join(root,'app/Models/Recursive.php'),`<?php namespace App\\Models; class Recursive extends BaseModel { function children(){return $this->hasMany(self::class);} function dynamic(){return $this->hasMany(static::class);} }`);
  await fs.writeFile(path.join(root,'app/Http/Controllers/ImplicitController.php'),`<?php namespace App\\Http\\Controllers; class ImplicitController { function index(){return new \\App\\Models\\Recursive();} }`);
  const result=await scan(root);assert.equal(result.relationships.find(r=>r.name==='children').target,'App\\Models\\Recursive');assert.equal(result.relationships.find(r=>r.name==='dynamic').target,null);assert.ok(result.controllers.find(c=>c.name.endsWith('ImplicitController')).methods.some(m=>m.name==='index'));
});
test('resources expand nested names, parameters, shallow routes, filters and API actions',async t=>{
 const root=await temporary(t);await fs.writeFile(path.join(root,'routes/resources.php'),`<?php
use App\\Http\\Controllers\\JournalController as J;
Route::prefix('admin')->name('admin.')->group(function(){
 Route::resource('people.journals',J::class)->parameters(['people'=>'owner'])->shallow()->only(['index','show','update'])->names(['show'=>'journal.detail']);
});
Route::apiResource('entries',J::class)->except(['destroy']);
Route::resource($dynamic,J::class);
Route::resource('hidden',J::class)->only(config('methods'));
Route::crud('backpack',J::class);
`);
 const a=await scan(root),r=a.routes.filter(r=>r.source.file==='routes/resources.php');
 assert.equal(r.length,7);assert.ok(r.some(r=>r.uri==='/admin/people/{owner}/journals'&&r.name==='admin.people.journals.index'));
 assert.ok(r.some(r=>r.uri==='/admin/journals/{journal}'&&r.name==='admin.journal.detail'));assert.deepEqual(r.find(r=>r.resource.name==='people.journals'&&r.resource.action==='update').methods,['PUT','PATCH']);
 assert.ok(!r.some(r=>r.resource.name==='entries'&&['create','edit','destroy'].includes(r.resource.action)));
 for(const code of ['dynamic-resource','dynamic-resource-options','unsupported-route-declaration'])assert.ok(a.diagnostics.some(d=>d.code===code));
});
test('custom resource conventions suppress default URI inference',async t=>{
 const root=await temporary(t);await fs.writeFile(path.join(root,'routes/conventions.php'),`<?php Route::resourceParameters(['journals'=>'book']);`);
 const a=await scan(root);for(const r of a.routes.filter(r=>r.resource)){assert.equal(r.uri,null);assert.ok(r.issues.includes('resource-conventions-unresolved'));}
});
test('local traits preserve lexical imports, consuming self, method precedence and source evidence',async t=>{
 const root=await temporary(t);await fs.mkdir(path.join(root,'app/Concerns'),{recursive:true});await fs.writeFile(path.join(root,'app/Concerns/HasEntries.php'),`<?php
namespace App\\Concerns;
use App\\Models\\Entry as Related;
trait HasEntries {
 public function entries(){return $this->hasMany(Related::class);}
 public function children(){return $this->hasMany(self::class);}
}
`);
 await fs.writeFile(path.join(root,'app/Models/Notebook.php'),`<?php namespace App\\Models; class Notebook extends BaseModel { use \\App\\Concerns\\HasEntries; public function entries(){return $this->belongsTo(User::class);} }`);
 await fs.writeFile(path.join(root,'app/Models/Folio.php'),`<?php namespace App\\Models; class Folio extends BaseModel { use \\App\\Concerns\\HasEntries; }`);
 const a=await scan(root),folio=a.relationships.filter(r=>r.model==='App\\Models\\Folio');assert.equal(folio.find(r=>r.name==='entries').target,'App\\Models\\Entry');assert.equal(folio.find(r=>r.name==='entries').source.file,'app/Concerns/HasEntries.php');assert.equal(folio.find(r=>r.name==='children').target,'App\\Models\\Folio');
 const own=a.relationships.find(r=>r.model==='App\\Models\\Notebook'&&r.name==='entries');assert.equal(own.type,'belongsTo');assert.equal(own.source.file,'app/Models/Notebook.php');
});
test('trait conflicts and adaptations do not invent method resolution',async t=>{
 const root=await temporary(t);await fs.mkdir(path.join(root,'app/Concerns'),{recursive:true});await fs.writeFile(path.join(root,'app/Concerns/Conflict.php'),`<?php namespace App\\Concerns; trait One { public function same(){return $this->hasMany(\\App\\Models\\Entry::class);} } trait Two { public function same(){return $this->hasMany(\\App\\Models\\User::class);} }`);
 await fs.writeFile(path.join(root,'app/Models/Conflict.php'),`<?php namespace App\\Models; class Conflict extends BaseModel { use \\App\\Concerns\\One, \\App\\Concerns\\Two; } class Adapted extends BaseModel { use \\App\\Concerns\\One { same as another; } }`);
 const a=await scan(root);assert.ok(!a.relationships.some(r=>r.model==='App\\Models\\Conflict'||r.model==='App\\Models\\Adapted'));for(const code of ['trait-method-conflict','trait-adaptation'])assert.ok(a.diagnostics.some(d=>d.code===code));
});
test('resource expansion agrees with this tool’s installed Laravel registrar',async t=>{
 const root=await temporary(t);await fs.writeFile(path.join(root,'routes/reference.php'),`<?php
use App\\Http\\Controllers\\JournalController as J;
Route::prefix('admin')->name('admin.')->group(function(){Route::resource('people.journals',J::class)->parameters(['people'=>'owner'])->shallow()->only(['index','show','update'])->names(['show'=>'journal.detail']);});
Route::apiResource('entries',J::class)->except(['destroy']);
`);
 const expected=JSON.parse(execFileSync('php',[fileURLToPath(new URL('./reference-resources.php',import.meta.url))],{encoding:'utf8',env:{...process.env,MRLARAVEL_TEST_AUTOLOAD:process.env.MRLARAVEL_TEST_AUTOLOAD??path.resolve('vendor/autoload.php')}}));const a=await scan(root);
 const actual=a.routes.filter(r=>r.source.file==='routes/reference.php').map(({uri,name,methods})=>({uri,name,methods})).sort((a,b)=>a.name<b.name?-1:1);assert.deepEqual(actual,expected);
});
test('modern typed bootstrap middleware maps preserve source and flag conditional declarations',async t=>{
 const root=await temporary(t);await fs.mkdir(path.join(root,'bootstrap'),{recursive:true});await fs.writeFile(path.join(root,'bootstrap/app.php'),`<?php
use Illuminate\\Foundation\\Application;
use Illuminate\\Foundation\\Configuration\\Middleware;
return Application::configure(basePath: dirname(__DIR__))
 ->withMiddleware(function(Middleware $middleware){
  $middleware->alias(['staff'=>\\App\\Http\\Middleware\\Authenticate::class]);
  $middleware->group('custom',['staff','throttle:5']);
  if(config('enable')){$middleware->alias(['maybe'=>'Dynamic']);}
  $middleware->append(\\App\\Http\\Middleware\\Authenticate::class);
 });`);
 await fs.writeFile(path.join(root,'routes/modern.php'),`<?php Route::middleware('staff')->get('/staff',fn()=>1);`);
 const a=await scan(root);const alias=a.middleware.find(m=>m.name==='staff');assert.equal(alias.source.file,'bootstrap/app.php');assert.equal(alias.source.line,6);assert.ok(a.edges.some(e=>e.to===alias.id));assert.ok(!a.middleware.some(m=>m.name==='maybe'));assert.ok(a.diagnostics.some(d=>d.code==='conditional-bootstrap-middleware'));assert.ok(a.diagnostics.some(d=>d.code==='bootstrap-middleware-operation'));
});

test('diff refuses canonical path aliases and hard links to its input snapshots',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mrlaravel-diff-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const before=path.join(root,'before.json'),after=path.join(root,'after.json');
  const bytes=JSON.stringify(atlas);await fs.writeFile(before,bytes);await fs.writeFile(after,bytes);
  const alias=path.join(root,'alias');await fs.symlink(root,alias,'dir');
  const hard=path.join(root,'hard.json');await fs.link(before,hard);
  for(const out of [before,path.join(alias,'before.json'),hard]){
    assert.throws(()=>execFileSync(process.execPath,[cli,'diff',before,after,'--out',out],{stdio:'pipe'}),e=>e.status===1);
    assert.equal(await fs.readFile(before,'utf8'),bytes);
  }
});
