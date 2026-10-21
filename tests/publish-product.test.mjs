import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdir,writeFile,readFile,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fixture} from './helpers.mjs';
import {importSite} from '../scripts/import-site.mjs';
import {publishProduct} from '../scripts/publish-product.mjs';
const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_AUTHOR_NAME:'Test',GIT_AUTHOR_EMAIL:'test@example.com',GIT_COMMITTER_NAME:'Test',GIT_COMMITTER_EMAIL:'test@example.com'}}).trim();
async function setup() {
  const f=await fixture();
  for(const path of ['src','scripts']) await cp(new URL(`../${path}/`,import.meta.url),join(f.repoDir,path),{recursive:true});
  await writeFile(join(f.repoDir,'.gitignore'),'dist/\n.export-*/\n.build-*/\n');
  for(const slug of ['razetag','razestore']) await importSite({...f,slug});
  git(f.sourceDir,'init','-b','main');git(f.sourceDir,'add','.');git(f.sourceDir,'commit','-m','source');git(f.sourceDir,'update-ref','refs/remotes/origin/main','HEAD');
  git(f.repoDir,'init','-b','main');git(f.repoDir,'add','.');git(f.repoDir,'commit','-m','initial');
  const remote=join(f.root,'remote.git');git(f.root,'init','--bare',remote);git(f.repoDir,'remote','add','origin',remote);git(f.repoDir,'push','-u','origin','main');
  const peer=join(f.root,'peer');git(f.root,'clone','--branch','main',remote,peer);
  return {...f,remote,peer};
}
async function changeSource(f,text='Updated policy') {
  await writeFile(join(f.sourceDir,'privacy.html'),`<h1>Policy</h1><p>${text}</p><a href="index.html#features">Home</a>`);
  git(f.sourceDir,'add','.');git(f.sourceDir,'commit','-m','update');git(f.sourceDir,'update-ref','refs/remotes/origin/main','HEAD');
}
const publish=(f,slug='razetag')=>publishProduct({...f,slug,expectedRemote:f.remote});
test('identical export creates no public commit',async()=>{
  const f=await setup(),before=git(f.repoDir,'rev-parse','HEAD'),result=await publish(f);
  assert.equal(result.status,'unchanged');assert.equal(result.commit,null);assert.equal(result.attempts,0);assert.equal(git(f.root,'--git-dir',f.remote,'rev-parse','main'),before);
});
test('only selected product snapshot is pushed and secrets are not persisted',async()=>{
  const f=await setup(),before=git(f.repoDir,'rev-parse','HEAD');await changeSource(f);
  process.env.RAZEDEV_PUBLISH_TOKEN='not-a-real-token-sentinel';const result=await publish(f);
  assert.equal(result.status,'published');assert.equal(result.attempts,1);
  const changed=git(f.root,'--git-dir',f.remote,'diff','--name-only',before,'main').split('\n');assert(changed.every(x=>x.startsWith('public/razetag/')));
  assert.doesNotMatch(await readFile(join(f.repoDir,'.git/config'),'utf8'),/not-a-real-token-sentinel/);
  assert.doesNotMatch(git(f.root,'--git-dir',f.remote,'show','main:public/razetag/privacy/index.html'),/not-a-real-token-sentinel/);
});
test('different app publishes from same base preserve both products',async()=>{
  const f=await setup();await changeSource(f);await publish(f,'razetag');
  await publishProduct({repoDir:f.peer,sourceDir:f.sourceDir,slug:'razestore',expectedRemote:f.remote});
  for(const app of ['razetag','razestore']) assert.match(git(f.root,'--git-dir',f.remote,'show',`main:public/${app}/privacy/index.html`),/Updated policy/);
});
test('rebasing publication does not require a configured machine identity',async()=>{
  const f=await setup();await changeSource(f);await publish(f,'razetag');
  for(const [key,value] of [['user.useConfigOnly','true'],['user.name',''],['user.email','']]) git(f.peer,'config',key,value);
  const result=await publishProduct({repoDir:f.peer,sourceDir:f.sourceDir,slug:'razestore',expectedRemote:f.remote});
  assert.equal(result.status,'published');
  assert.equal(git(f.root,'--git-dir',f.remote,'show','-s','--format=%cn <%ce>','main'),'github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>');
});
test('same-app concurrent updates accept identical and reject different output',async()=>{
  const f=await setup();await changeSource(f);await publish(f);
  assert.equal((await publishProduct({repoDir:f.peer,sourceDir:f.sourceDir,slug:'razetag',expectedRemote:f.remote})).status,'unchanged');
  const g=await setup();await changeSource(g,'first update');await publish(g);await changeSource(g,'second update');
  await assert.rejects(publishProduct({repoDir:g.peer,sourceDir:g.sourceDir,slug:'razetag',expectedRemote:g.remote}),/changed remotely/i);
});
test('dirty checkout, unexpected origin, stale source, and invalid export never push',async()=>{
  const f=await setup(),before=git(f.root,'--git-dir',f.remote,'rev-parse','main');
  await writeFile(join(f.repoDir,'unrelated.txt'),'keep');await assert.rejects(publish(f),/clean/i);
  await assert.rejects(publishProduct({...f,slug:'razetag',expectedRemote:'wrong'}),/origin/i);
  const g=await setup();git(g.sourceDir,'update-ref','refs/remotes/origin/main','HEAD');await writeFile(join(g.sourceDir,'privacy.html'),'stale');git(g.sourceDir,'add','.');git(g.sourceDir,'commit','-m','not-main-yet');await assert.rejects(publish(g),/source/i);
  const h=await setup();await changeSource(h,'<a href="https://remyo.github.io/razedev/">hub</a>');await assert.rejects(publish(h),/namespace/);
  assert.equal(git(f.root,'--git-dir',f.remote,'rev-parse','main'),before);
});
async function raceHook(f,times,{badApp=false,badBuild=false}={}) {
  const counter=join(f.root,'counter'),hook=join(f.repoDir,'.git/hooks/pre-push');
  const script=`#!/usr/bin/env node
const fs=require('node:fs'),cp=require('node:child_process');const counter=${JSON.stringify(counter)};let n=fs.existsSync(counter)?Number(fs.readFileSync(counter,'utf8')):0;if(n>=${times})process.exit(0);fs.writeFileSync(counter,String(n+1));
const cwd=${JSON.stringify(f.peer)};function git(...args){return cp.execFileSync('git',args,{cwd,stdio:'pipe',env:{...process.env,GIT_AUTHOR_NAME:'Test',GIT_AUTHOR_EMAIL:'test@example.com',GIT_COMMITTER_NAME:'Test',GIT_COMMITTER_EMAIL:'test@example.com'}})}
git('pull','--ff-only','origin','main');fs.writeFileSync(cwd+${JSON.stringify(badApp?'/public/razetag/privacy/index.html':badBuild?'/src/hub.html':'/race.txt')},${JSON.stringify(badApp?'<p>Different policy</p>':badBuild?'<a href="./missing/">broken</a>':'race-')}+n);git('add','.');git('commit','-m','concurrent update');git('push','origin','main');
`;
  await writeFile(hook,script);await chmod(hook,0o755);return counter;
}
test('one and two rejected push races recover; three total attempts stop',async()=>{
  for(const times of [1,2,3]) {const f=await setup();await changeSource(f);const counter=await raceHook(f,times);
    if(times<3) assert.equal((await publish(f)).attempts,times+1);else await assert.rejects(publish(f),/3 push attempts/i);
    assert.equal(Number(await readFile(counter,'utf8')),times);
  }
});
test('remote conflicting app or invalid rebased build stops publication',async()=>{
  for(const options of [{badApp:true},{badBuild:true}]) {const f=await setup();await changeSource(f);await raceHook(f,1,options);await assert.rejects(publish(f),options.badApp?/changed remotely/:/Missing hub reference/);}
});
test('remote authentication/branch rejection is not retried uncontrollably',async()=>{
  const f=await setup();await changeSource(f);await writeFile(join(f.remote,'hooks/pre-receive'),'#!/bin/sh\nprintf "branch rejected\\n" >&2\nexit 1\n');await chmod(join(f.remote,'hooks/pre-receive'),0o755);
  await assert.rejects(publish(f),/push rejected/i);
});
test('already accepted push is recognized even when the client reports failure',async()=>{
  const f=await setup();await changeSource(f);
  const hook=join(f.repoDir,'.git/hooks/pre-push');
  await writeFile(hook,'#!/bin/sh\ngit -c core.hooksPath=/dev/null push origin HEAD:refs/heads/main >/dev/null 2>&1\nexit 1\n');await chmod(hook,0o755);
  const result=await publish(f);assert.equal(result.status,'published');assert.equal(result.attempts,1);assert.equal(result.commit,git(f.root,'--git-dir',f.remote,'rev-parse','main'));
});
test('rewritten public history and changed publication contract stop safely',async()=>{
  const f=await setup();await changeSource(f);git(f.peer,'checkout','--orphan','replacement');git(f.peer,'add','.');git(f.peer,'commit','-m','replacement root');git(f.peer,'push','--force','origin','HEAD:main');
  await assert.rejects(publish(f),/non-fast-forward|rewritten|rejected/i);
  const g=await setup();await changeSource(g);await writeFile(join(g.peer,'scripts/import-site.mjs'),'changed contract');git(g.peer,'add','.');git(g.peer,'commit','-m','contract change');git(g.peer,'push','origin','main');
  await assert.rejects(publish(g),/contract changed/i);
});
test('public commit hooks cannot add files outside the selected app',async()=>{
  const f=await setup(),before=git(f.root,'--git-dir',f.remote,'rev-parse','main');await changeSource(f);
  const hook=join(f.repoDir,'.git/hooks/pre-commit');
  await writeFile(hook,'#!/bin/sh\nprintf "\\n<!-- hook change -->\\n" >> src/hub.html\ngit add src/hub.html\n');await chmod(hook,0o755);
  await assert.rejects(publish(f),/outside.*product/i);
  assert.equal(git(f.root,'--git-dir',f.remote,'rev-parse','main'),before);
});
test('public commit hook output is validated before pushing',async()=>{
  const f=await setup(),before=git(f.root,'--git-dir',f.remote,'rev-parse','main');await changeSource(f);
  const hook=join(f.repoDir,'.git/hooks/pre-commit');
  await writeFile(hook,'#!/bin/sh\nprintf \'<a href="./missing/">Broken</a>\' > public/razetag/privacy/index.html\ngit add public/razetag/privacy/index.html\n');await chmod(hook,0o755);
  await assert.rejects(publish(f),/Missing/);
  assert.equal(git(f.root,'--git-dir',f.remote,'rev-parse','main'),before);
});
