import {readFile} from 'node:fs/promises';
import {join, posix} from 'node:path';

export function safePath(value) {
  if (typeof value !== 'string' || !value || /[\\%?#\x00-\x1f]/.test(value) || value.startsWith('/') || posix.normalize(value)!==value || value.split('/').some(p=>!p || p==='..' || p.startsWith('.'))) throw new Error(`Unsafe path: ${value}`);
  if (value.split('/').some(p=>['private','backups','scripts','tests','docs','node_modules'].includes(p))) throw new Error(`Non-public path: ${value}`);
  return value;
}
export async function readRegistry(repoDir) {
  const registry=JSON.parse(await readFile(join(repoDir,'apps.json'),'utf8'));
  const {origin,basePath}=registry.site || {};
  if (new URL(origin).origin!==origin || !origin.startsWith('https://') || !/^\/(?:[a-z0-9-]+\/)+$/.test(basePath)) throw new Error('Invalid site origin/base path');
  if (!Array.isArray(registry.apps) || !registry.apps.length) throw new Error('Missing apps');
  const slugs=new Set();
  for (const app of registry.apps) {
    if (!/^[a-z][a-z0-9-]*$/.test(app.slug) || slugs.has(app.slug)) throw new Error('Invalid or duplicate app slug');
    slugs.add(app.slug);
    if (![app.name,app.description].every(x=>typeof x==='string' && x.trim()) || !/^#[0-9a-f]{6}$/i.test(app.accent)) throw new Error('Invalid card details');
    if (!Array.isArray(app.assets) || new Set(app.assets).size!==app.assets.length) throw new Error('Invalid asset manifest');
    for (const file of app.assets) {safePath(file); if (!/\.(?:css|js|png|webp|jpe?g|svg|gif|ico)$/i.test(file)) throw new Error(`Unsupported asset: ${file}`);}
    if (!app.assets.includes(safePath(app.icon))) throw new Error('Icon absent from manifest');
    if (!app.pages || app.pages['index.html']!=='home' || app.pages['privacy.html']!=='privacy') throw new Error('Home/privacy mappings required');
    const routes=new Set();
    for(const [file,route] of Object.entries(app.pages)) {
      safePath(file);
      if(!/^[a-z0-9-]+\.html$/.test(file) || !/^[a-z][a-z0-9-]*$/.test(route) || routes.has(route)) throw new Error('Invalid page mapping');
      routes.add(route);
    }
    const legacy=new URL(app.legacyBaseUrl);
    if(legacy.protocol!=='https:' || !legacy.pathname.endsWith('/')) throw new Error('Invalid legacy base');
  }
  return registry;
}
