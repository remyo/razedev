import {lstat,readdir,readFile,mkdir,rename,rm} from 'node:fs/promises';
import {join,dirname,resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
export async function regularFile(root,relative) {
  let path=resolve(root);
  if((await lstat(path)).isSymbolicLink()) throw new Error('Symlink root rejected');
  for(const part of relative.split('/')) {
    path=join(path,part); let stat;
    try {stat=await lstat(path);} catch(error) {if(error.code==='ENOENT') throw new Error(`Missing file: ${relative}`);throw error;}
    if(stat.isSymbolicLink()) throw new Error(`Symlink rejected: ${relative}`);
  }
  if(!(await lstat(path)).isFile()) throw new Error(`Not a regular file: ${relative}`);
  return path;
}
export async function fileList(root) {
  const files=[];
  async function walk(dir,prefix='') {
    for(const entry of await readdir(dir,{withFileTypes:true})) {
      const name=prefix+entry.name;
      if(entry.isSymbolicLink()) throw new Error(`Symlink rejected: ${name}`);
      if(entry.isDirectory()) await walk(join(dir,entry.name),`${name}/`);
      else if(entry.isFile()) files.push(name); else throw new Error(`Unsupported file: ${name}`);
    }
  }
  await walk(root);return files.sort();
}
export async function treeDigest(root) {
  const hash=createHash('sha256');
  for(const name of await fileList(root)) hash.update(name).update('\0').update(await readFile(join(root,name)));
  return hash.digest('hex');
}
export async function replaceDirectory(stage,destination) {
  await mkdir(dirname(destination),{recursive:true});
  const backup=`${stage}-previous`; let existed=false;
  try {const stat=await lstat(destination);if(stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Unsafe destination');await rename(destination,backup);existed=true;} catch(error) {if(error.code!=='ENOENT') throw error;}
  try {await rename(stage,destination);} catch(error) {if(existed) await rename(backup,destination);throw error;}
  if(existed) await rm(backup,{recursive:true,force:true});
}
export function isWithin(root,path) {return resolve(path)===resolve(root) || resolve(path).startsWith(resolve(root)+sep);}
