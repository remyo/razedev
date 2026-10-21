import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
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
