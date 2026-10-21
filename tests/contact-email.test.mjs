import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {fileList} from '../scripts/lib/files.mjs';
test('all published contact links and displayed Gmail addresses use the new email',async()=>{
  const root=fileURLToPath(new URL('../public/',import.meta.url));let contacts=0;
  for(const file of await fileList(root)) if(file.endsWith('.html')) {
    const html=await readFile(`${root}/${file}`,'utf8');
    for(const match of html.matchAll(/mailto:([^"'<>\s?]+)/g)){assert.equal(match[1],'razeappdev@gmail.com',file);contacts++;}
    for(const match of html.matchAll(/[\w.+-]+@gmail\.com/g)) assert.equal(match[0],'razeappdev@gmail.com',file);
  }
  assert(contacts>=8,'Both products must retain their contact links');
});
