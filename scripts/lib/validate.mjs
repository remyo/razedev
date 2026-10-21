import {readFile} from 'node:fs/promises';
import {join,posix} from 'node:path';
import {fileList,regularFile} from './files.mjs';
import {references,scanHtml} from './html.mjs';

export async function validateProduct({rootDir,registry,app}) {
  const files=await fileList(rootDir),known=new Set(files),htmlCache=new Map();
  const expected=[...app.assets,...Object.values(app.pages).map(route=>`${route}/index.html`),...Object.keys(app.pages)].sort();
  if(JSON.stringify(files)!==JSON.stringify(expected)) throw new Error(`Unexpected/missing files in ${app.slug} export`);
  const prefix=`${registry.site.basePath}${app.slug}/`; let links=0;
  async function markup(file) {if(!htmlCache.has(file)) htmlCache.set(file,scanHtml(await readFile(join(rootDir,file),'utf8')));return htmlCache.get(file);}
  async function check(value,from) {
    if(!value || /^(?:mailto:|tel:|data:)/i.test(value)) return;
    const url=new URL(value,`${registry.site.origin}${prefix}${from}`);
    if(url.origin!==registry.site.origin) {if(url.protocol!=='https:') throw new Error(`Unsupported URL: ${value}`);return;}
    if(!url.pathname.startsWith(prefix)) throw new Error(`Link leaves product namespace: ${value}`);
    let relative=decodeURIComponent(url.pathname.slice(prefix.length));
    if(relative.includes('\\') || posix.normalize(relative).startsWith('../')) throw new Error('Unsafe URL path');
    if(!relative || relative.endsWith('/')) relative+='index.html';
    if(!known.has(relative)) throw new Error(`Missing reference: ${value} in ${from}`);
    await regularFile(rootDir,relative);links++;
    if(url.hash && relative.endsWith('.html') && !(await markup(relative)).ids.includes(decodeURIComponent(url.hash.slice(1)))) throw new Error(`Missing fragment ${url.hash} in ${relative}`);
  }
  for(const file of files) {
    if(file.endsWith('.html')) {
      const html=await readFile(join(rootDir,file),'utf8');
      for(const ref of references(html)) await check(ref.value,file);
      const ids=(await markup(file)).ids;
      if(new Set(ids).size!==ids.length) throw new Error(`Duplicate IDs in ${file}`);
    } else if(file.endsWith('.css')) {
      const css=(await readFile(join(rootDir,file),'utf8')).replace(/\/\*[\s\S]*?\*\//g,'');
      for(const ref of css.matchAll(/url\(\s*["']?([^\s)"']+)["']?\s*\)|@import\s+["']([^"']+)["']/g)) await check(ref[1] || ref[2],file);
    }
  }
  return {htmlPages:files.filter(x=>x.endsWith('.html')).length,assets:app.assets.length,links};
}
