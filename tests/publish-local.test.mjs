import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,writeFile,readFile,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fixture} from './helpers.mjs';
import {importSite} from '../scripts/import-site.mjs';

const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_AUTHOR_NAME:'Test',GIT_AUTHOR_EMAIL:'test@example.com',GIT_COMMITTER_NAME:'Test',GIT_COMMITTER_EMAIL:'test@example.com'}}).trim();
async function setup() {
  const f=await fixture();
  for(const dir of ['src','scripts']) await cp(new URL(`../${dir}/`,import.meta.url),join(f.repoDir,dir),{recursive:true});
  await writeFile(join(f.repoDir,'.gitignore'),'dist/\n.export-*/\n.build-*/\n');
  for(const slug of ['razetag','razestore']) await importSite({...f,slug});
  const sourceRemote=join(f.root,'source.git'),publicRemote=join(f.root,'public.git');
  for(const [cwd,remote] of [[f.sourceDir,sourceRemote],[f.repoDir,publicRemote]]) {
    git(cwd,'init','-b','main');git(cwd,'config','user.name','Test');git(cwd,'config','user.email','test@example.com');
    git(cwd,'add','.');git(cwd,'commit','-m','initial');git(f.root,'init','--bare',remote);git(cwd,'remote','add','origin',remote);git(cwd,'push','-u','origin','main');
  }
  return {...f,sourceRemote,publicRemote};
}
async function run(f,options={}) {
  const {publishLocal}=await import('../scripts/publish-local.mjs');
  return publishLocal({...f,slug:'razetag',expectedSourceRemote:f.sourceRemote,expectedPublicRemote:f.publicRemote,message:'Update privacy',log:()=>{},...options});
}
const head=f=>git(f.sourceDir,'rev-parse','HEAD');
const remoteHead=(f,remote)=>git(f.root,'--git-dir',remote,'rev-parse','main');
const change=f=>writeFile(join(f.sourceDir,'privacy.html'),'<h1>Policy</h1><p>Updated locally</p><a href="index.html#features">Home</a>');

for(const slug of ['razetag','razestore']) test(`local command commits source and publishes only ${slug}`,async()=>{
  const f=await setup(),publicBefore=remoteHead(f,f.publicRemote);await change(f);
  const result=await run(f,{slug,message:'Privacy "$HOME"; literal message'});
  assert.equal(result.publication.status,'published');assert.equal(remoteHead(f,f.sourceRemote),head(f));
  assert.equal(git(f.sourceDir,'log','-1','--format=%s'),'Privacy "$HOME"; literal message');
  assert.match(git(f.root,'--git-dir',f.publicRemote,'show',`main:public/${slug}/privacy/index.html`),/Updated locally/);
  assert(git(f.root,'--git-dir',f.publicRemote,'diff','--name-only',publicBefore,'main').split('\n').every(path=>path.startsWith(`public/${slug}/`)));
  assert.equal(git(f.sourceDir,'status','--porcelain'),'');
});
test('unchanged local publication creates no source or public commit',async()=>{
  const f=await setup(),sourceBefore=head(f),publicBefore=remoteHead(f,f.publicRemote);
  assert.equal((await run(f)).publication.status,'unchanged');assert.equal(head(f),sourceBefore);assert.equal(remoteHead(f,f.publicRemote),publicBefore);
});
test('validation failure leaves source HEAD and staging unchanged and never pushes',async()=>{
  const f=await setup(),sourceBefore=head(f),publicBefore=remoteHead(f,f.publicRemote);
  await writeFile(join(f.sourceDir,'privacy.html'),'<a href="https://remyo.github.io/razedev/">hub</a>');
  git(f.sourceDir,'add','privacy.html');const staged=git(f.sourceDir,'diff','--cached');
  await assert.rejects(run(f),/namespace/);assert.equal(head(f),sourceBefore);assert.equal(git(f.sourceDir,'diff','--cached'),staged);
  assert.equal(remoteHead(f,f.sourceRemote),sourceBefore);assert.equal(remoteHead(f,f.publicRemote),publicBefore);
});
test('unexpected new files are rejected even when staged',async()=>{
  for(const staged of [false,true]) {
    const f=await setup(),sourceBefore=head(f);await change(f);await writeFile(join(f.sourceDir,'.env'),'demo=private');
    if(staged)git(f.sourceDir,'add','.env');
    await assert.rejects(run(f),/new files outside.*manifest/i);assert.equal(head(f),sourceBefore);assert.equal(remoteHead(f,f.sourceRemote),sourceBefore);
    assert.equal(await readFile(join(f.sourceDir,'.env'),'utf8'),'demo=private');
  }
});
test('wrong source branch, wrong source origin, and stale source stop before committing',async()=>{
  for(const mode of ['branch','origin','stale']) {
    const f=await setup(),before=head(f);await change(f);
    if(mode==='branch')git(f.sourceDir,'switch','-c','draft');
    if(mode==='origin')git(f.sourceDir,'remote','set-url','origin',f.publicRemote);
    if(mode==='stale') {
      const peer=join(f.root,'peer');git(f.root,'clone','-b','main',f.sourceRemote,peer);await writeFile(join(peer,'remote.txt'),'remote');git(peer,'add','.');git(peer,'commit','-m','remote');git(peer,'push','origin','main');
    }
    await assert.rejects(run(f),mode==='branch'?/main/:mode==='origin'?/source origin/:/behind|diverged/i);assert.equal(head(f),before);
  }
});
test('a different push URL cannot redirect source publication',async()=>{
  const f=await setup(),publicBefore=remoteHead(f,f.publicRemote);await change(f);git(f.sourceDir,'remote','set-url','--push','origin',f.publicRemote);
  await assert.rejects(run(f),/push.*origin|push.*destination/i);assert.equal(remoteHead(f,f.publicRemote),publicBefore);
});
test('source push rejection preserves local commit and does not publish the hub',async()=>{
  const f=await setup(),sourceBefore=head(f),publicBefore=remoteHead(f,f.publicRemote);await change(f);
  const hook=join(f.sourceRemote,'hooks/pre-receive');await writeFile(hook,'#!/bin/sh\nexit 1\n');await chmod(hook,0o755);
  await assert.rejects(run(f),/push|rejected/i);assert.notEqual(head(f),sourceBefore);assert.equal(remoteHead(f,f.sourceRemote),sourceBefore);assert.equal(remoteHead(f,f.publicRemote),publicBefore);
  assert.match(await readFile(join(f.sourceDir,'privacy.html'),'utf8'),/Updated locally/);
});
test('source commit hook failure preserves edits and leaves both remotes unchanged',async()=>{
  const f=await setup(),sourceBefore=head(f),publicBefore=remoteHead(f,f.publicRemote);await change(f);
  const hook=join(f.sourceDir,'.git/hooks/pre-commit');await writeFile(hook,'#!/bin/sh\nprintf "Review required\\n" >&2\nexit 1\n');await chmod(hook,0o755);
  await assert.rejects(run(f),/Review required/);assert.equal(head(f),sourceBefore);assert.equal(remoteHead(f,f.sourceRemote),sourceBefore);assert.equal(remoteHead(f,f.publicRemote),publicBefore);
  assert.match(await readFile(join(f.sourceDir,'privacy.html'),'utf8'),/Updated locally/);
});
test('an unfinished merge is not committed or pushed by publishing',async()=>{
  const f=await setup(),publicBefore=remoteHead(f,f.publicRemote),sourceRemoteBefore=remoteHead(f,f.sourceRemote);
  git(f.sourceDir,'switch','-c','side');await change(f);git(f.sourceDir,'add','.');git(f.sourceDir,'commit','-m','side');
  git(f.sourceDir,'switch','main');await writeFile(join(f.sourceDir,'index.html'),(await readFile(join(f.sourceDir,'index.html'),'utf8'))+'\n<!-- main change -->');git(f.sourceDir,'add','.');git(f.sourceDir,'commit','-m','main');
  git(f.sourceDir,'merge','--no-commit','--no-ff','side');const before=head(f),staged=git(f.sourceDir,'diff','--cached');
  await assert.rejects(run(f),/unfinished|in progress/i);
  assert.equal(head(f),before);assert.equal(git(f.sourceDir,'diff','--cached'),staged);assert.equal(remoteHead(f,f.sourceRemote),sourceRemoteBefore);assert.equal(remoteHead(f,f.publicRemote),publicBefore);
});
