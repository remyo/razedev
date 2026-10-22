import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {regularFile,assertNoSymlinkPath} from './files.mjs';

// Framework builds run only in the private source checkout. Export still uses
// the same public allowlist and namespace validation as native HTML websites.
export async function prepareSite({siteDir,registry,app}) {
  if(app.build!=='npm') return siteDir;
  await assertNoSymlinkPath(siteDir);
  await regularFile(siteDir,'package.json');await regularFile(siteDir,'package-lock.json');
  for(const args of [['ci','--ignore-scripts','--no-audit','--no-fund'],['run','build']]) {
    const result=spawnSync('npm',args,{cwd:siteDir,encoding:'utf8',timeout:120000,maxBuffer:5*1024*1024,env:{...process.env,BASE_PATH:`${registry.site.basePath}${app.slug}/`}});
    if(result.error || result.status!==0) throw new Error(`Website build failed (${args.join(' ')}): ${result.error?.message || result.stderr || result.stdout}`);
  }
  const output=join(siteDir,'dist/razedev');await assertNoSymlinkPath(output);
  return output;
}
