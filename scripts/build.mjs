import {readFile,writeFile,mkdir,mkdtemp,rm,cp} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readRegistry} from './lib/registry.mjs';
import {escapeHtml} from './lib/html.mjs';
import {validateProduct,validateSite} from './lib/validate.mjs';
import {replaceDirectory} from './lib/files.mjs';
export async function buildSite({repoDir}) {
  const registry=await readRegistry(repoDir),stage=await mkdtemp(join(repoDir,'.build-'));
  try {
    for(const app of registry.apps) {await validateProduct({rootDir:join(repoDir,'public',app.slug),registry,app});await cp(join(repoDir,'public',app.slug),join(stage,app.slug),{recursive:true});}
    const cards=registry.apps.map((app,index)=>`<a class="app-card ${escapeHtml(app.slug)}" href="./${app.slug}/home/" style="--accent:${app.accent}" aria-label="Explore ${escapeHtml(app.name)}"><div class="card-top"><span class="icon-frame"><img src="./${app.slug}/${escapeHtml(app.icon)}" width="70" height="70" alt=""></span><span class="card-number">${String(index+1).padStart(2,'0')} / RAZE APPS</span></div><div class="card-copy"><h3>${escapeHtml(app.name)}</h3><p>${escapeHtml(app.description)}</p></div><span class="card-action">Explore ${escapeHtml(app.name)} <span class="card-arrow" aria-hidden="true">↗</span></span></a>`).join('\n');
    await mkdir(join(stage,'assets'));
    await writeFile(join(stage,'index.html'),(await readFile(join(repoDir,'src/hub.html'),'utf8')).replace('{{APP_CARDS}}',cards));
    await cp(join(repoDir,'src/hub.css'),join(stage,'assets/hub.css'));
    await cp(join(repoDir,'src/404.html'),join(stage,'404.html'));
    await writeFile(join(stage,'.nojekyll'),'');
    const report=await validateSite({rootDir:stage,registry}),distDir=join(repoDir,'dist');
    await replaceDirectory(stage,distDir);return {distDir,report};
  } finally {await rm(stage,{recursive:true,force:true});}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try{console.log(JSON.stringify(await buildSite({repoDir:resolve(dirname(fileURLToPath(import.meta.url)),'..')})));}catch(error){console.error(error.message);process.exitCode=1;}
}
