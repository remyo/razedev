import {spawnSync} from 'node:child_process';
import {access} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readRegistry} from './lib/registry.mjs';
import {importSite} from './import-site.mjs';
import {buildSite} from './build.mjs';
import {publishProduct} from './publish-product.mjs';

const sourceRemotes={
  razetag:'git@github.com:remyo/razetag_h5.git',
  razestore:'git@github.com:remyo/razestore_privacy.git',
};
const publicRemote='git@github.com:remyo/razedev.git';
const canonical=url=>url.replace(/^git@github.com:/,'https://github.com/').replace(/\.git$/,'');

// repoDir is a clean, disposable clone created by the source repository's wrapper.
export async function publishLocal({repoDir,sourceDir,slug,message,
  expectedSourceRemote=sourceRemotes[slug],expectedPublicRemote=publicRemote,log=console.log}) {
  if(Number(process.versions.node.split('.')[0])<24) throw new Error('Node.js 24 or newer is required');
  if(!expectedSourceRemote) throw new Error(`Unknown app: ${slug}`);
  repoDir=resolve(repoDir);sourceDir=resolve(sourceDir);
  // Local publishing uses SSH; do not pass an unrelated Actions token to hooks.
  delete process.env.RAZEDEV_PUBLISH_TOKEN;
  function git(cwd,args,{allowFailure=false}={}) {
    const result=spawnSync('git',['-c','credential.helper=',...args],{cwd,encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0',LC_ALL:'C'},maxBuffer:5*1024*1024});
    if(result.error) throw result.error;
    if(result.status!==0 && !allowFailure) throw new Error((result.stderr || result.stdout).trim() || 'Git command failed');
    return {code:result.status,out:result.stdout.trimEnd()};
  }
  const source=(args,options)=>git(sourceDir,args,options);
  const destination=(args,options)=>git(repoDir,args,options);
  if(source(['branch','--show-current']).out!=='main') throw new Error('Run publishing from the source main branch');
  if(resolve(source(['rev-parse','--show-toplevel']).out)!==sourceDir) throw new Error('Source must be the repository root');
  for(const state of ['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply']) {
    const path=resolve(sourceDir,source(['rev-parse','--git-path',state]).out);
    const exists=await access(path).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
    if(exists) throw new Error('An unfinished Git operation is in progress. Finish or abort it before publishing.');
  }
  for(const [args,label] of [[['remote','get-url','origin'],'source origin'],[['remote','get-url','--push','origin'],'source push destination']]) {
    if(canonical(source(args).out)!==canonical(expectedSourceRemote)) throw new Error(`Unexpected ${label}`);
  }
  if(destination(['branch','--show-current']).out!=='main' || destination(['status','--porcelain']).out) throw new Error('Destination must be a clean disposable main checkout');
  if(canonical(destination(['remote','get-url','origin']).out)!==canonical(expectedPublicRemote) || canonical(destination(['remote','get-url','--push','origin']).out)!==canonical(expectedPublicRemote)) throw new Error('Unexpected public destination');
  if(source(['diff','--name-only','--diff-filter=U']).out) throw new Error('Resolve source merge conflicts before publishing');

  const registry=await readRegistry(repoDir),app=registry.apps.find(app=>app.slug===slug);
  if(!app) throw new Error(`Unknown app: ${slug}`);
  const commitMessage=message===undefined?`Update ${app.name} website`:message;
  if(typeof commitMessage!=='string' || !commitMessage.trim()) throw new Error('Commit message must not be empty');
  const manifest=[...Object.keys(app.pages),...app.assets],allowed=new Set(manifest);
  const tracked=new Set(source(['ls-tree','-r','--name-only','-z','HEAD']).out.split('\0').filter(Boolean));
  const added=[...source(['ls-files','--others','--exclude-standard','-z']).out.split('\0'),...source(['ls-files','--cached','-z']).out.split('\0').filter(path=>!tracked.has(path))].filter(Boolean);
  const unexpected=added.filter(path=>!allowed.has(path));
  if(unexpected.length) throw new Error(`New files outside the public manifest: ${[...new Set(unexpected)].join(', ')}. Commit intentional development files separately, or move/ignore them before publishing.`);

  log(`Checking ${app.name} source main...`);
  source(['fetch','--no-tags',expectedSourceRemote,'refs/heads/main:refs/remotes/origin/main']);
  if(source(['merge-base','--is-ancestor','origin/main','HEAD'],{allowFailure:true}).code!==0) throw new Error('Source main is behind or diverged from GitHub. Pull/reconcile it before publishing; local edits are preserved.');

  log(`Validating ${app.name} and the combined RazeDev site...`);
  await importSite({repoDir,sourceDir,slug});await buildSite({repoDir});
  source(['add','-u']);source(['add','-A','--',...manifest]);
  if(source(['diff','--cached','--name-only']).out) source(['commit','-m',commitMessage]);
  if(source(['status','--porcelain']).out) throw new Error('Source changed during the commit. Review the remaining changes and rerun; nothing was pushed.');
  // Hooks may change the committed website, so validate the resulting files too.
  await importSite({repoDir,sourceDir,slug});await buildSite({repoDir});
  if(source(['status','--porcelain']).out) throw new Error('Source changed during validation. Review and rerun; nothing was pushed.');

  log(`Pushing ${app.name} source main...`);
  source(['push',expectedSourceRemote,'HEAD:refs/heads/main']);
  source(['fetch','--no-tags',expectedSourceRemote,'refs/heads/main:refs/remotes/origin/main']);
  const sourceCommit=source(['rev-parse','HEAD']).out;
  if(sourceCommit!==source(['rev-parse','origin/main']).out) throw new Error('Source main advanced during publication. Reconcile it and rerun; no public export was pushed.');

  // Discard only validation output in the disposable clone, never source edits.
  const prefix=`public/${slug}/`;
  destination(['restore','--source=HEAD','--staged','--worktree','--',prefix]);
  destination(['clean','-fd','--',prefix]);
  log(`Publishing only ${app.name} to RazeDev...`);
  const publication=await publishProduct({repoDir,sourceDir,slug,expectedRemote:expectedPublicRemote});
  log(publication.status==='unchanged'?'The public website is already up to date.':'Public export pushed. GitHub Pages will deploy it automatically.');
  log(`${registry.site.origin}${registry.site.basePath}${slug}/home/`);
  return {sourceCommit,publication};
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const args=process.argv.slice(2);
  try {
    if(![4,6].includes(args.length) || args[0]!=='--app' || args[2]!=='--source' || (args.length===6 && args[4]!=='--message')) throw new Error('Usage: publish-local.mjs --app <slug> --source <directory> [--message <message>]');
    await publishLocal({repoDir:resolve(dirname(fileURLToPath(import.meta.url)),'..'),sourceDir:args[3],slug:args[1],message:args[5]});
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
