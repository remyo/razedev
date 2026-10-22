import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture,snapshotTree} from './helpers.mjs';
import {readRegistry} from '../scripts/lib/registry.mjs';
import {importSite} from '../scripts/import-site.mjs';

async function compiledFixture() {
  const f=await fixture(),app=f.registry.apps[0];app.build='npm';
  app.assets.push('fonts/Manrope.ttf','fonts/OFL.txt');
  await writeFile(join(f.repoDir,'apps.json'),JSON.stringify(f.registry));
  await mkdir(join(f.sourceDir,'fonts'));
  await writeFile(join(f.sourceDir,'fonts/Manrope.ttf'),'font');
  await writeFile(join(f.sourceDir,'fonts/OFL.txt'),'license');
  const prefix='/razedev/razetag/';
  await writeFile(join(f.sourceDir,'index.html'),`<h1>Prerendered home</h1><img src="${prefix}assets/icon.png"><a href="${prefix}privacy/">Privacy</a><link rel="stylesheet" href="${prefix}assets/site.css">`);
  await writeFile(join(f.sourceDir,'privacy.html'),`<h1>Pre-release policy</h1><a href="${prefix}home/">Home</a>`);
  await writeFile(join(f.sourceDir,'assets/site.css'),`@font-face{font-family:Manrope;src:url(${prefix}fonts/Manrope.ttf)}`);
  return {...f,app};
}
test('prerendered pages keep hydration attributes and font licenses without importing source',async()=>{
  const f=await compiledFixture();await writeFile(join(f.sourceDir,'secret.env'),'private');
  await readRegistry(f.repoDir);await importSite({...f,slug:'razetag'});
  assert.equal(await readFile(join(f.repoDir,'public/razetag/home/index.html'),'utf8'),await readFile(join(f.sourceDir,'index.html'),'utf8'));
  assert.equal((await snapshotTree(join(f.repoDir,'public/razetag')))['secret.env'],undefined);
});
test('prerendered pages still reject links to another app or the hub atomically',async()=>{
  const f=await compiledFixture();await importSite({...f,slug:'razetag'});const before=await snapshotTree(join(f.repoDir,'public'));
  await writeFile(join(f.sourceDir,'privacy.html'),'<a href="/razedev/">Hub</a>');
  await assert.rejects(importSite({...f,slug:'razetag'}),/namespace/);assert.deepEqual(await snapshotTree(join(f.repoDir,'public')),before);
});
test('unsupported build commands cannot be introduced through the registry',async()=>{
  const f=await fixture();f.registry.apps[0].build='arbitrary command';await writeFile(join(f.repoDir,'apps.json'),JSON.stringify(f.registry));
  await assert.rejects(readRegistry(f.repoDir),/build/i);
});
