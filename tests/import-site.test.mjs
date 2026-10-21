import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture,snapshotTree} from './helpers.mjs';
import {importSite} from '../scripts/import-site.mjs';

test('import is explicit, isolated, repeatable, and removes obsolete output',async()=>{
  const f=await fixture();
  await mkdir(join(f.sourceDir,'.git')); await writeFile(join(f.sourceDir,'.git/config'),'private');
  await mkdir(join(f.sourceDir,'private')); await writeFile(join(f.sourceDir,'private/secret.txt'),'secret');
  await importSite({...f,slug:'razetag'}); const tag=await snapshotTree(join(f.repoDir,'public/razetag'));
  const first=await importSite({...f,slug:'razestore'}); assert.equal(first.changed,true);
  assert.equal((await importSite({...f,slug:'razestore'})).changed,false);
  assert.deepEqual(await snapshotTree(join(f.repoDir,'public/razetag')),tag);
  const files=Object.keys(await snapshotTree(join(f.repoDir,'public/razestore')));
  assert.deepEqual(files.sort(),['assets/icon.png','assets/site.css','home/index.html','index.html','privacy.html','privacy/index.html'].sort());
  await writeFile(join(f.repoDir,'public/razestore/obsolete.txt'),'old');
  await importSite({...f,slug:'razestore'});
  assert.equal('obsolete.txt' in await snapshotTree(join(f.repoDir,'public/razestore')),false);
});
test('missing input preserves both exported apps',async()=>{
  const f=await fixture(); await importSite({...f,slug:'razetag'}); await importSite({...f,slug:'razestore'});
  const before=await snapshotTree(join(f.repoDir,'public')); await rm(join(f.sourceDir,'assets/icon.png'));
  await assert.rejects(importSite({...f,slug:'razestore'}),/missing/i);
  assert.deepEqual(await snapshotTree(join(f.repoDir,'public')),before);
});
test('symlinks in file and parent paths are rejected',async()=>{
  for(const parent of [false,true]) {
    const f=await fixture();
    if(parent) {await rm(join(f.sourceDir,'assets'),{recursive:true}); await symlink(f.repoDir,join(f.sourceDir,'assets'));}
    else {await rm(join(f.sourceDir,'assets/icon.png'));await symlink(join(f.sourceDir,'privacy.html'),join(f.sourceDir,'assets/icon.png'));}
    await assert.rejects(importSite({...f,slug:'razestore'}),/symlink/i);
  }
});
test('cross-app and hub links fail without replacing previous output',async()=>{
  const f=await fixture(); await importSite({...f,slug:'razestore'}); const before=await snapshotTree(join(f.repoDir,'public'));
  for(const target of ['https://remyo.github.io/razedev/','https://remyo.github.io/razedev/razetag/home/']) {
    await writeFile(join(f.sourceDir,'privacy.html'),`<a href="${target}">Wrong place</a>`);
    await assert.rejects(importSite({...f,slug:'razestore'}),/namespace/i);
    assert.deepEqual(await snapshotTree(join(f.repoDir,'public')),before);
  }
  await assert.rejects(importSite({...f,slug:'unknown'}),/Unknown app/);
});
test('missing CSS dependencies and fragments fail',async()=>{
  const f=await fixture();
  await writeFile(join(f.sourceDir,'assets/site.css'),'body{background:url(missing.png)}');
  await assert.rejects(importSite({...f,slug:'razestore'}),/Missing/);
  await writeFile(join(f.sourceDir,'assets/site.css'),'');
  await writeFile(join(f.sourceDir,'privacy.html'),'<a href="index.html#missing">Home</a>');
  await assert.rejects(importSite({...f,slug:'razestore'}),/fragment/i);
});
