import {readFile,writeFile,mkdir,mkdtemp,lstat,rm,realpath} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readRegistry} from './lib/registry.mjs';
import {rewritePage,renderRedirect} from './lib/routes.mjs';
import {regularFile,isWithin,replaceDirectory,treeDigest} from './lib/files.mjs';
import {validateProduct} from './lib/validate.mjs';

export async function importSite({repoDir,sourceDir,slug}) {
  repoDir=resolve(repoDir); sourceDir=resolve(sourceDir);
  const registry=await readRegistry(repoDir),app=registry.apps.find(app=>app.slug===slug);
  if(!app) throw new Error(`Unknown app: ${slug}`);
  if((await lstat(sourceDir)).isSymbolicLink()) throw new Error('Symlink source rejected');
  const sourceReal=await realpath(sourceDir),repoReal=await realpath(repoDir);
  if(isWithin(sourceReal,repoReal) || isWithin(repoReal,sourceReal)) throw new Error('Source and destination overlap');
  const publicRoot=join(repoDir,'public'),destination=join(publicRoot,slug);
  await mkdir(publicRoot,{recursive:true});
  if((await lstat(publicRoot)).isSymbolicLink()) throw new Error('Symlink destination rejected');
  for(const file of [...app.assets,...Object.keys(app.pages)]) await regularFile(sourceDir,file);
  const stage=await mkdtemp(join(repoDir,'.export-'));
  try {
    for(const file of app.assets) {const target=join(stage,file);await mkdir(dirname(target),{recursive:true});await writeFile(target,await readFile(await regularFile(sourceDir,file)));}
    for(const [sourcePage,route] of Object.entries(app.pages)) {
      const html=rewritePage(await readFile(join(sourceDir,sourcePage),'utf8'),{registry,app,sourcePage});
      await mkdir(join(stage,route),{recursive:true});await writeFile(join(stage,route,'index.html'),html);
      await writeFile(join(stage,sourcePage),renderRedirect({relativeTarget:`./${route}/`,label:`${app.name} ${route}`}));
    }
    const report=await validateProduct({rootDir:stage,registry,app});
    let changed=true;
    try {if((await lstat(destination)).isSymbolicLink()) throw new Error('Symlink destination rejected');changed=await treeDigest(stage)!==await treeDigest(destination);} catch(error) {if(error.code!=='ENOENT') throw error;}
    if(changed) await replaceDirectory(stage,destination);
    return {slug,files:report.htmlPages+report.assets,changed};
  } finally {await rm(stage,{recursive:true,force:true});}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];
  try {if(!args.includes('--app') || !args.includes('--source')) throw new Error('Usage: import-site.mjs --app <slug> --source <directory>');console.log(JSON.stringify(await importSite({repoDir:resolve(dirname(fileURLToPath(import.meta.url)),'..'),sourceDir:arg('--source'),slug:arg('--app')})));}
  catch(error) {console.error(error.message);process.exitCode=1;}
}
