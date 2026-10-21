import {readdir,readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
export async function snapshotTree(dir) {
  const result={};
  async function walk(path,prefix='') {
    for(const entry of (await readdir(path,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      const relative=prefix+entry.name;
      if(entry.isDirectory()) await walk(join(path,entry.name),`${relative}/`);
      else result[relative]=createHash('sha256').update(await readFile(join(path,entry.name))).digest('hex');
    }
  }
  await walk(dir); return result;
}
export async function fixture() {
  const root=await mkdtemp(join(tmpdir(),'razedev-test-')),repoDir=join(root,'repo'),sourceDir=join(root,'source');
  await mkdir(repoDir); await mkdir(join(sourceDir,'assets'),{recursive:true});
  const makeApp=slug=>({slug,name:slug,description:'A useful app',accent:'#123456',icon:'assets/icon.png',legacyBaseUrl:`https://remyo.github.io/${slug}_old/`,pages:{'index.html':'home','privacy.html':'privacy'},assets:['assets/icon.png','assets/site.css']});
  const registry={site:{origin:'https://remyo.github.io',basePath:'/razedev/'},apps:[makeApp('razetag'),makeApp('razestore')]};
  await writeFile(join(repoDir,'apps.json'),JSON.stringify(registry));
  await writeFile(join(sourceDir,'index.html'),'<html><head><link rel="stylesheet" href="assets/site.css"></head><body><h1 id="features">App</h1><img src="assets/icon.png"><a href="privacy.html">Privacy</a></body></html>');
  await writeFile(join(sourceDir,'privacy.html'),'<h1>Policy</h1><p>Private records. Revised 2026.</p><a href="index.html#features">Home</a>');
  await writeFile(join(sourceDir,'assets/site.css'),'body{color:#123456}');
  await writeFile(join(sourceDir,'assets/icon.png'),'demo-image');
  return {root,repoDir,sourceDir,registry};
}
