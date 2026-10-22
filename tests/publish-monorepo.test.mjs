import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdir,writeFile,readFile,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fixture} from './helpers.mjs';
import {importSite} from '../scripts/import-site.mjs';
import {publishLocal} from '../scripts/publish-local.mjs';
import {publishProduct} from '../scripts/publish-product.mjs';

const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_AUTHOR_NAME:'Test',GIT_AUTHOR_EMAIL:'test@example.com',GIT_COMMITTER_NAME:'Test',GIT_COMMITTER_EMAIL:'test@example.com'}}).trim();
async function setup() {
  const f=await fixture(),sourceDir=join(f.root,'web');await mkdir(sourceDir);
  for(const slug of ['razetag','razestore']) {
    await cp(f.sourceDir,join(sourceDir,slug),{recursive:true});
    await writeFile(join(sourceDir,slug,'README.md'),'Website development notes');
    await importSite({...f,sourceDir:join(sourceDir,slug),slug});
  }
  for(const dir of ['src','scripts']) await cp(new URL(`../${dir}/`,import.meta.url),join(f.repoDir,dir),{recursive:true});
  await writeFile(join(f.repoDir,'.gitignore'),'dist/\n.export-*/\n.build-*/\n');
  const sourceRemote=join(f.root,'source.git'),publicRemote=join(f.root,'public.git');
  for(const [cwd,remote] of [[sourceDir,sourceRemote],[f.repoDir,publicRemote]]) {
    git(cwd,'init','-b','main');git(cwd,'config','user.name','Test');git(cwd,'config','user.email','test@example.com');
    git(cwd,'add','.');git(cwd,'commit','-m','initial');git(f.root,'init','--bare',remote);git(cwd,'remote','add','origin',remote);git(cwd,'push','-u','origin','main');
  }
  return {...f,sourceDir,sourceRemote,publicRemote};
}
const run=(f,slug='razetag',extra={})=>publishLocal({...f,slug,sitePath:slug,expectedSourceRemote:f.sourceRemote,expectedPublicRemote:f.publicRemote,message:'Update selected app',log:()=>{},...extra});
const remoteHead=(f,remote)=>git(f.root,'--git-dir',remote,'rev-parse','main');
const change=(f,slug='razetag',text='Selected update')=>writeFile(join(f.sourceDir,slug,'privacy.html'),`<h1>Policy</h1><p>${text}</p><a href="index.html#features">Home</a>`);

for(const selected of ['razetag','razestore']) test(`${selected} publication preserves the other app's staged, unstaged, and new files`,async()=>{
  const f=await setup(),other=selected==='razetag'?'razestore':'razetag',before=remoteHead(f,f.sourceRemote),publicBefore=remoteHead(f,f.publicRemote);
  await change(f,other,'Unfinished other policy');git(f.sourceDir,'add',`${other}/privacy.html`);
  await writeFile(join(f.sourceDir,other,'README.md'),'Other notes in progress');
  await writeFile(join(f.sourceDir,other,'private.txt'),'unfinished private work');
  await writeFile(join(f.sourceDir,'private-notes.txt'),'root notes');
  const staged=git(f.sourceDir,'diff','--cached'),otherStatus=git(f.sourceDir,'status','--porcelain','--',other);
  await change(f,selected);const result=await run(f,selected);
  assert.equal(result.publication.status,'published');assert.equal(git(f.sourceDir,'diff','--cached'),staged);assert.equal(git(f.sourceDir,'status','--porcelain','--',other),otherStatus);
  assert.equal(await readFile(join(f.sourceDir,other,'private.txt'),'utf8'),'unfinished private work');
  assert(git(f.root,'--git-dir',f.sourceRemote,'diff','--name-only',before,'main').split('\n').every(path=>path.startsWith(`${selected}/`)));
  assert(git(f.root,'--git-dir',f.publicRemote,'diff','--name-only',publicBefore,'main').split('\n').every(path=>path.startsWith(`public/${selected}/`)));
  assert.doesNotMatch(git(f.root,'--git-dir',f.sourceRemote,'show',`main:${other}/privacy.html`),/Unfinished/);
});
test('an unrelated intent-to-add file remains untouched by the selected commit',async()=>{
  const f=await setup();await writeFile(join(f.sourceDir,'razestore/.env'),'example=private');git(f.sourceDir,'add','-N','razestore/.env');
  const otherStatus=git(f.sourceDir,'status','--porcelain','--','razestore');await change(f);await run(f);
  assert.equal(git(f.sourceDir,'status','--porcelain','--','razestore'),otherStatus);
  assert.throws(()=>git(f.root,'--git-dir',f.sourceRemote,'show','main:razestore/.env'));
});
test('selected app intent-to-add outside the manifest is rejected before committing',async()=>{
  const f=await setup(),before=remoteHead(f,f.sourceRemote);await writeFile(join(f.sourceDir,'razetag/.env'),'example=private');git(f.sourceDir,'add','-N','razetag/.env');await change(f);
  await assert.rejects(run(f),/outside.*manifest/i);assert.equal(git(f.sourceDir,'rev-parse','HEAD'),before);assert.equal(remoteHead(f,f.sourceRemote),before);
});
test('unrelated unpublished commits are not pushed by a selected-app command',async()=>{
  const f=await setup(),before=remoteHead(f,f.sourceRemote);await change(f,'razestore','Committed unfinished policy');git(f.sourceDir,'add','.');git(f.sourceDir,'commit','-m','other app draft');const head=git(f.sourceDir,'rev-parse','HEAD');await change(f);
  await assert.rejects(run(f),/unpushed.*outside|unpublished.*outside/i);assert.equal(git(f.sourceDir,'rev-parse','HEAD'),head);assert.equal(remoteHead(f,f.sourceRemote),before);
});
test('reverted unrelated unpublished commits cannot leak through selected-app publication',async()=>{
  const f=await setup(),before=remoteHead(f,f.sourceRemote);
  await writeFile(join(f.sourceDir,'razestore/README.md'),'Unfinished other-app private draft');
  git(f.sourceDir,'add','razestore/README.md');git(f.sourceDir,'commit','-m','other-app draft');
  git(f.sourceDir,'revert','--no-edit','HEAD');const head=git(f.sourceDir,'rev-parse','HEAD');await change(f);
  await assert.rejects(run(f),/unpushed.*outside|unpublished.*outside/i);
  assert.equal(git(f.sourceDir,'rev-parse','HEAD'),head);assert.equal(remoteHead(f,f.sourceRemote),before);
});
test('selected validation failures preserve all staging and never push',async()=>{
  const f=await setup(),before=remoteHead(f,f.sourceRemote);await change(f,'razestore','Other staged policy');git(f.sourceDir,'add','razestore/privacy.html');
  await change(f,'razetag','<a href="https://remyo.github.io/razedev/">Hub</a>');const staged=git(f.sourceDir,'diff','--cached');
  await assert.rejects(run(f),/namespace/i);assert.equal(git(f.sourceDir,'rev-parse','HEAD'),before);assert.equal(git(f.sourceDir,'diff','--cached'),staged);assert.equal(remoteHead(f,f.sourceRemote),before);
});
test('source hooks cannot commit a different app through the selected command',async()=>{
  const f=await setup(),before=remoteHead(f,f.sourceRemote);await change(f);
  const hook=join(f.sourceDir,'.git/hooks/pre-commit');await writeFile(hook,'#!/bin/sh\nprintf "other hook edit" >> razestore/README.md\ngit add razestore/README.md\n');await chmod(hook,0o755);
  await assert.rejects(run(f),/commit.*outside|outside.*selected/i);assert.equal(remoteHead(f,f.sourceRemote),before);
});
test('unsafe or mismatched source subfolders cannot be exported',async()=>{
  for(const sitePath of ['../razetag','razestore','/tmp/private','.git']) {
    const f=await setup(),before=remoteHead(f,f.sourceRemote);await assert.rejects(run(f,'razetag',{sitePath}),/source.*path|source.*folder|site.*path|site.*folder/i);assert.equal(remoteHead(f,f.sourceRemote),before);
  }
});
test('product publishing reads a nested committed app while another app is dirty',async()=>{
  const f=await setup();await change(f);git(f.sourceDir,'add','razetag');git(f.sourceDir,'commit','-m','selected');git(f.sourceDir,'push','origin','main');await change(f,'razestore','Unfinished other policy');
  const result=await publishProduct({...f,slug:'razetag',sitePath:'razetag',expectedRemote:f.publicRemote});
  assert.equal(result.status,'published');assert.match(git(f.root,'--git-dir',f.publicRemote,'show','main:public/razetag/privacy/index.html'),/Selected update/);
});
async function compiledSource() {
  const f=await setup();f.registry.apps[0].build='npm';
  await writeFile(join(f.repoDir,'apps.json'),JSON.stringify(f.registry));git(f.repoDir,'add','apps.json');git(f.repoDir,'commit','-m','configure compiled app');git(f.repoDir,'push','origin','main');
  const appDir=join(f.sourceDir,'razetag');
  git(f.sourceDir,'rm','razetag/index.html','razetag/privacy.html');
  const pkg={name:'compiled-app-fixture',version:'1.0.0',scripts:{build:'node build.mjs'}};
  await writeFile(join(appDir,'package.json'),JSON.stringify(pkg));
  await writeFile(join(appDir,'package-lock.json'),JSON.stringify({name:pkg.name,version:pkg.version,lockfileVersion:3,packages:{'':{name:pkg.name,version:pkg.version}}}));
  await writeFile(join(appDir,'.gitignore'),'dist/\nnode_modules/\n');
  await writeFile(join(appDir,'policy.txt'),'Original');
  await writeFile(join(appDir,'build.mjs'),`import {mkdir,cp,writeFile,readFile} from 'node:fs/promises';await mkdir('dist/razedev',{recursive:true});await cp('assets','dist/razedev/assets',{recursive:true});const base=process.env.BASE_PATH;await writeFile('dist/razedev/index.html','<h1>Home</h1><a href="'+base+'privacy/">Privacy</a>');await writeFile('dist/razedev/privacy.html','<h1>'+await readFile('policy.txt','utf8')+'</h1><a href="'+base+'home/">Home</a>');`);
  git(f.sourceDir,'add','razetag');git(f.sourceDir,'commit','-m','compiled source');git(f.sourceDir,'push','origin','main');
  return {...f,appDir};
}
test('compiled app publishes freshly built HTML and preserves another app staging',async()=>{
  const f=await compiledSource(),appDir=f.appDir;
  await writeFile(join(appDir,'policy.txt'),'Fresh compiled policy');await change(f,'razestore','Other staged work');git(f.sourceDir,'add','razestore/privacy.html');const staging=git(f.sourceDir,'diff','--cached');
  const result=await run(f);assert.equal(result.publication.status,'published');assert.equal(git(f.sourceDir,'diff','--cached'),staging);
  assert.match(git(f.root,'--git-dir',f.publicRemote,'show','main:public/razetag/privacy/index.html'),/Fresh compiled policy/);
  assert.doesNotMatch(git(f.root,'--git-dir',f.sourceRemote,'ls-tree','-r','--name-only','main'),/dist\//);
});

for(const when of [1,2]) test(`compiled source build ${when} cannot push commits from another app`,async()=>{
  const f=await compiledSource(),before=remoteHead(f,f.sourceRemote),publicBefore=remoteHead(f,f.publicRemote);
  await writeFile(join(f.appDir,'.gitignore'),'dist/\nnode_modules/\n.build-number\n');
  const build=await readFile(join(f.appDir,'build.mjs'),'utf8');
  await writeFile(join(f.appDir,'build.mjs'),build+`import {execFileSync as buildGit} from 'node:child_process';const count=Number(await readFile('.build-number','utf8').catch(()=>0))+1;await writeFile('.build-number',String(count));if(count===${when}){await writeFile('../razestore/README.md','Other app private draft committed by build');buildGit('git',['add','razestore/README.md'],{cwd:'..'});buildGit('git',['commit','--only','-m','build changed other app','--','razestore/README.md'],{cwd:'..'});}`);
  await writeFile(join(f.appDir,'policy.txt'),'New compiled policy');
  await assert.rejects(run(f),/source.*(?:changed|outside)|outside.*selected/i);
  assert.equal(remoteHead(f,f.sourceRemote),before);assert.equal(remoteHead(f,f.publicRemote),publicBefore);
});
