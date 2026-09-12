import Engine from '../third-party/php-parser/src/index.js';
export const parser = new Engine({ parser: { version: '8.4', suppressErrors: false }, ast: { withPositions: true, withSource: false } });
export const name = n => typeof n === 'string' ? n : n?.name ?? null;
export const source = (file, n) => ({ file, line: n?.loc?.start.line ?? 1, column: (n?.loc?.start.column ?? 0) + 1 });
export function walk(n, visit, parents = []) {
  if (!n || typeof n !== 'object') return;
  if (n.kind && visit(n, parents) === false) return;
  for (const [key, val] of Object.entries(n)) {
    if (['loc', 'leadingComments', 'trailingComments'].includes(key)) continue;
    if (Array.isArray(val)) val.forEach(x => walk(x, visit, [...parents, n]));
    else if (val && typeof val === 'object') walk(val, visit, [...parents, n]);
  }
}
export function scopes(ast) {
  const result = [];
  function add(nodes, namespace = '') {
    const env = { namespace, imports: Object.create(null) };
    for (const node of nodes) if (node.kind === 'usegroup' && !node.type) {
      for (const item of node.items) if (!item.type) {
        const full = [node.name, item.name].filter(Boolean).join('\\');
        env.imports[(name(item.alias) || full.split('\\').at(-1)).toLowerCase()] = full;
      }
    }
    result.push({ nodes: nodes.filter(n => n.kind !== 'namespace'), env });
    nodes.filter(n => n.kind === 'namespace').forEach(n => add(n.children, n.name));
  }
  add(ast.children); return result;
}
export function resolveClass(node, env) {
  if (node?.kind === 'selfreference') return env.className ?? null;
  if (node?.kind === 'parentreference') return env.parent ?? null;
  if (node?.kind === 'staticreference') return null; // Late binding depends on the runtime subclass.
  const value = name(node);
  if (typeof value !== 'string') return null;
  if (node?.kind === 'selfreference' || value.toLowerCase() === 'self' || value.toLowerCase() === 'static') return env.className ?? null;
  if (value.toLowerCase() === 'parent') return env.parent ?? null;
  if (value.startsWith('\\')) return value.slice(1);
  if (node?.resolution === 'rn' || value.startsWith('namespace\\')) return [env.namespace, value.replace(/^namespace\\/, '')].filter(Boolean).join('\\');
  const [first, ...rest] = value.split('\\');
  return env.imports[first.toLowerCase()] ? [env.imports[first.toLowerCase()], ...rest].join('\\') : [env.namespace, value].filter(Boolean).join('\\');
}
export function literal(n, env) {
  if (!n) return undefined;
  if (n.kind === 'string') return n.value;
  if (n.kind === 'number') return Number(n.value);
  if (n.kind === 'boolean') return n.value;
  if (n.kind === 'nullkeyword') return null;
  if (n.kind === 'staticlookup' && name(n.offset)?.toLowerCase() === 'class') return resolveClass(n.what, env) ?? undefined;
  if (n.kind === 'bin' && n.type === '.') {
    const l = literal(n.left, env), r = literal(n.right, env);
    return typeof l === 'string' && typeof r === 'string' ? l + r : undefined;
  }
  if (n.kind === 'array') {
    if (n.items.some(i => !i || i.unpack || i.byRef)) return undefined;
    const entries = n.items.map(i => [i.key ? literal(i.key, env) : null, literal(i.value, env)]);
    if (entries.some(([k,v]) => k === undefined || v === undefined)) return undefined;
    if (entries.every(([k]) => k === null)) return entries.map(([,v]) => v);
    if (entries.some(([k]) => k === null || !['string','number'].includes(typeof k))) return undefined;
    return Object.fromEntries(entries);
  }
  return undefined;
}
export function chain(n) {
  if (n?.kind !== 'call' || !['staticlookup', 'propertylookup'].includes(n.what?.kind)) return null;
  const prev = chain(n.what.what);
  return { root: prev?.root ?? n.what.what, static: prev?.static ?? n.what.kind === 'staticlookup', calls: [...(prev?.calls ?? []), { method: name(n.what.offset)?.toLowerCase() ?? null, args: n.arguments, node: n.what.offset }] };
}
export function isRouteChain(c, env) {
  if (!c?.static) return false;
  const cls = resolveClass(c.root, env);
  return cls?.toLowerCase() === 'illuminate\\support\\facades\\route' || (cls?.toLowerCase() === 'route' && !env.imports.route);
}
export function strings(v) { return typeof v === 'string' ? [v] : Array.isArray(v) && v.every(s => typeof s === 'string') ? v : null; }
