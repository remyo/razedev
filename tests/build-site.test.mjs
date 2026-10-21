import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fixture,snapshotTree} from './helpers.mjs';
import {importSite} from '../scripts/import-site.mjs';
import {buildSite} from '../scripts/build.mjs';
import {startPreview} from '../scripts/serve.mjs';

async function assembled() {
  const f=await fixture();await cp(new URL('../src/',import.meta.url),join(f.repoDir,'src'),{recursive:true});
  for(const app of f.registry.apps) await importSite({...f,slug:app.slug});
  return f;
}
test('build renders two escaped app links and deterministic public files',async()=>{
  const f=await assembled();f.registry.apps[0].description='<script>unsafe</script>';
  await writeFile(join(f.repoDir,'apps.json'),JSON.stringify(f.registry));
  const result=await buildSite(f),html=await readFile(join(result.distDir,'index.html'),'utf8');
  assert.equal((html.match(/class="app-card /g)||[]).length,2);
  assert.match(html,/href="\.\/razetag\/home\/"/);assert.match(html,/&lt;script&gt;unsafe&lt;\/script&gt;/);
  const before=await snapshotTree(result.distDir);await buildSite(f);assert.deepEqual(await snapshotTree(result.distDir),before);
  assert('.nojekyll' in before);assert(!Object.keys(before).some(x=>x.startsWith('scripts/') || x.startsWith('docs/')));
});
test('extensionless routes normalize and all canonical routes refresh',async()=>{
  const f=await assembled(),{distDir}=await buildSite(f),s=await startPreview({rootDir:distDir});
  try {
    const response=await fetch(`${s.url}razestore/home`,{redirect:'manual'});
    assert.equal(response.status,301);assert.equal(new URL(response.headers.get('location'),response.url).pathname,'/razedev/razestore/home/');
    for(const app of f.registry.apps) for(const route of Object.values(app.pages)) for(let i=0;i<2;i++) assert.equal((await fetch(`${s.url}${app.slug}/${route}/`)).status,200);
    for(const path of ['scripts/build.mjs','.git/config','../apps.json','razetag/private/data.json']) assert.equal((await fetch(`${s.url}${path}`)).status,404);
    assert.doesNotMatch(await (await fetch(`${s.url}missing`)).text(),/<a\s/i);
  } finally {await s.close();}
});
test('failed build keeps previous complete output',async()=>{
  const f=await assembled(),{distDir}=await buildSite(f),before=await snapshotTree(distDir);
  await rm(join(f.repoDir,'public/razetag/assets/icon.png'));
  await assert.rejects(buildSite(f));assert.deepEqual(await snapshotTree(distDir),before);
});
