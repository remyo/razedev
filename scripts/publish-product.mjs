import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {importSite} from './import-site.mjs';
import {buildSite} from './build.mjs';

export async function publishProduct({repoDir,sourceDir,slug,maxAttempts=3,expectedRemote='https://github.com/remyo/razedev.git'}) {
  if(!Number.isInteger(maxAttempts) || maxAttempts<1 || maxAttempts>3) throw new Error('At most 3 push attempts permitted');
  const token=process.env.RAZEDEV_PUBLISH_TOKEN;delete process.env.RAZEDEV_PUBLISH_TOKEN;
  const authDir=await mkdtemp(join(tmpdir(),'razedev-auth-')),askpass=join(authDir,'askpass');
  await writeFile(askpass,'#!/bin/sh\ncase "$1" in *Username*) printf "%s" x-access-token;; *) printf "%s" "$RAZEDEV_PUBLISH_TOKEN";; esac\n');await chmod(askpass,0o700);
  const redact=text=>token?String(text).replaceAll(token,'[redacted]'):String(text);
  function git(args,{cwd=repoDir,network=false,allowFailure=false}={}) {
    const env={...process.env,GIT_TERMINAL_PROMPT:'0',LC_ALL:'C'};
    if(network) {env.GIT_ASKPASS=askpass;if(token)env.RAZEDEV_PUBLISH_TOKEN=token;}
    const result=spawnSync('git',['-c','credential.helper=',...args],{cwd,env,encoding:'utf8',maxBuffer:5*1024*1024});
    if(result.error) throw new Error(redact(result.error.message));
    if(result.status!==0 && !allowFailure) throw new Error(redact((result.stderr || result.stdout).trim() || 'Git command failed'));
    return {code:result.status,out:result.stdout.trimEnd(),error:result.stderr.trim()};
  }
  const canonical=url=>url.replace(/^git@github.com:/,'https://github.com/').replace(/\.git$/,'');
  try {
    if(canonical(git(['remote','get-url','origin']).out)!==canonical(expectedRemote)) throw new Error('Unexpected destination origin');
    if(expectedRemote.startsWith('https:') && !token) throw new Error('RAZEDEV_PUBLISH_TOKEN is required');
    if(git(['branch','--show-current']).out!=='main' || git(['status','--porcelain']).out) throw new Error('Public checkout must be clean and on main');
    const sourceHead=git(['rev-parse','HEAD'],{cwd:sourceDir}).out,sourceMain=git(['rev-parse','refs/remotes/origin/main'],{cwd:sourceDir}).out;
    if(sourceHead!==sourceMain || git(['status','--porcelain'],{cwd:sourceDir}).out) throw new Error('Source is stale or dirty; dispatch the latest source main');
    let base=git(['rev-parse','HEAD']).out;
    await importSite({repoDir,sourceDir,slug});await buildSite({repoDir});
    const prefix=`public/${slug}/`;
    const changed=git(['status','--porcelain','-z']).out.split('\0').filter(Boolean);
    if(changed.some(line=>!line.slice(3).startsWith(prefix))) throw new Error('Changes outside selected product');
    git(['add','-A','--',prefix]);
    if(!git(['diff','--cached','--name-only']).out) return {status:'unchanged',commit:null,attempts:0};
    const staged=git(['diff','--cached','--name-only','-z']).out.split('\0').filter(Boolean);
    if(staged.some(path=>!path.startsWith(prefix))) throw new Error('Staged changes outside product');
    git(['-c','user.name=github-actions[bot]','-c','user.email=41898282+github-actions[bot]@users.noreply.github.com','commit','-m',`Update ${slug} public website`]);
    let attempts=0;
    while(attempts<maxAttempts) {
      git(['fetch','--no-tags','origin','refs/heads/main:refs/remotes/origin/main'],{network:true});
      const remote=git(['rev-parse','origin/main']).out,candidate=git(['rev-parse','HEAD']).out;
      if(git(['merge-base','--is-ancestor',candidate,remote],{allowFailure:true}).code===0) return attempts?{status:'published',commit:candidate,attempts}:{status:'unchanged',commit:null,attempts:0};
      if(git(['merge-base','--is-ancestor',base,remote],{allowFailure:true}).code!==0) throw new Error('Public main history was rewritten');
      if(remote!==base) {
        const remoteFiles=git(['diff','--name-only',base,remote]).out.split('\n');
        if(remoteFiles.some(path=>path=== 'apps.json' || path.startsWith('scripts/'))) throw new Error('Publishing contract changed; dispatch again');
        if(remoteFiles.some(path=>path.startsWith(prefix))) {
          const wanted=git(['rev-parse',`HEAD:${prefix.slice(0,-1)}`]).out,actual=git(['rev-parse',`origin/main:${prefix.slice(0,-1)}`],{allowFailure:true});
          if(actual.code===0 && actual.out===wanted) return {status:'unchanged',commit:null,attempts};
          throw new Error('This product changed remotely; dispatch again');
        }
        const rebased=git(['-c','user.name=github-actions[bot]','-c','user.email=41898282+github-actions[bot]@users.noreply.github.com','rebase','--no-autostash','origin/main'],{allowFailure:true});
        if(rebased.code!==0) {git(['rebase','--abort'],{allowFailure:true});throw new Error('Public rebase conflicted; dispatch again');}
        base=remote;await buildSite({repoDir});
      }
      attempts++;
      const pushed=git(['push','--porcelain','origin','HEAD:refs/heads/main'],{network:true,allowFailure:true});
      if(pushed.code===0) return {status:'published',commit:git(['rev-parse','HEAD']).out,attempts};
      // A network error can occur after the server accepted the commit.
      git(['fetch','--no-tags','origin','refs/heads/main:refs/remotes/origin/main'],{network:true});
      if(git(['merge-base','--is-ancestor','HEAD','origin/main'],{allowFailure:true}).code===0) return {status:'published',commit:git(['rev-parse','HEAD']).out,attempts};
      const rejected=pushed.out+pushed.error;
      const advanced=git(['rev-parse','origin/main']).out!==base;
      if(!advanced || /authentication|permission|access denied|protected branch|hook declined/i.test(rejected)) throw new Error(`Public push rejected: ${redact(pushed.error || pushed.out)}`);
    }
    throw new Error(`Publication stopped after ${maxAttempts} push attempts; dispatch again`);
  } catch(error) {throw new Error(redact(error.message));}
  finally {await rm(authDir,{recursive:true,force:true});}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
  try {
    if(!['--app','--source','--checkout'].every(flag=>args.includes(flag))) throw new Error('Usage: publish-product.mjs --app <slug> --source <dir> --checkout <dir>');
    console.log(JSON.stringify(await publishProduct({repoDir:resolve(get('--checkout')),sourceDir:resolve(get('--source')),slug:get('--app'),maxAttempts:args.includes('--max-attempts')?Number(get('--max-attempts')):3})));
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
