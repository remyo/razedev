import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readRegistry} from '../scripts/lib/registry.mjs';
import {rewritePage, renderRedirect} from '../scripts/lib/routes.mjs';
import {scanHtml} from '../scripts/lib/html.mjs';

const registry = {site:{origin:'https://remyo.github.io',basePath:'/razedev/'},apps:[]};
const app = {slug:'razestore',pages:{'index.html':'home','privacy.html':'privacy'},assets:['assets/site.css','assets/brand/app-icon.png'],legacyBaseUrl:'https://remyo.github.io/razestore_privacy/'};
test('privacy home link retains its section', () => {
  assert.equal(rewritePage('<a href="./index.html#features">Features</a>',{registry,app,sourcePage:'privacy.html'}),'<a href="../home/#features">Features</a>');
});
test('assets, query strings, HTML entities, and srcsets relocate',()=> {
  const html = '<img src="assets/brand/app-icon.png?v=1&amp;size=2" srcset="assets/brand/app-icon.png 1x, assets/brand/app-icon.png?v=2 2x">';
  assert.equal(rewritePage(html,{registry,app,sourcePage:'index.html'}),html.replaceAll('assets/brand/','../assets/brand/'));
});
test('local fragments, external links, comments, and script/style text are preserved',()=>{
  const html = '<!-- <a href="index.html"> --><script>const s = `<a href="index.html">`;</script><style>a{content:"<a href=\"index.html\">"}</style><a href="#features">go</a><use href="#i-arrow"/><a href="mailto:hello@example.com">mail</a><a href="https://example.com/policy">policy</a>';
  assert.equal(rewritePage(html,{registry,app,sourcePage:'index.html'}),html);
  assert.equal(scanHtml(html).tags.filter(x=>x.name==='a').length,3);
});
test('sharing metadata moves from old absolute URLs',()=>{
  const html='<meta property="og:url" content="https://remyo.github.io/razestore_privacy/"><meta property="og:image" content="https://remyo.github.io/razestore_privacy/assets/brand/app-icon.png">';
  const result=rewritePage(html,{registry,app,sourcePage:'index.html'});
  assert.match(result,/content="https:\/\/remyo.github.io\/razedev\/razestore\/home\/"/);
  assert.match(result,/content="https:\/\/remyo.github.io\/razedev\/razestore\/assets\/brand\/app-icon.png"/);
});
test('unlisted references and traversal are rejected',()=>{
  for(const href of ['missing.html','../private.html','%2e%2e/private.html']) assert.throws(()=>rewritePage(`<a href="${href}">x</a>`,{registry,app,sourcePage:'index.html'}));
});
test('redirect has same-product fallback and preserves query and hash',()=>{
  const html=renderRedirect({relativeTarget:'./home/',label:'RazeStore home'});
  assert.match(html,/href="\.\/home\/"/); assert.match(html,/location.search/); assert.match(html,/location.hash/);
});
test('registry rejects duplicates and unsafe manifest paths',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'raze-registry-'));
  const valid={...app,name:'RazeStore',description:'Store app',accent:'#123e34',icon:'assets/brand/app-icon.png'};
  for(const apps of [[valid,valid],[{...valid,slug:'../bad'}],[{...valid,assets:['../secret']}],[{...valid,pages:{'index.html':'../bad'}}]]) {
    await writeFile(join(dir,'apps.json'),JSON.stringify({...registry,apps}));
    await assert.rejects(readRegistry(dir));
  }
});
