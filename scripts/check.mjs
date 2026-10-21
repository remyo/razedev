import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startPreview} from './serve.mjs';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const modules=process.env.RAZEDEV_NODE_MODULES || '/Users/rem/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {chromium}=createRequire(import.meta.url)(join(modules,'playwright'));
const browser=await chromium.launch({headless:true,executablePath:process.env.RAZEDEV_QA_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const server=await startPreview({rootDir:join(repo,'public')});
try {
  const page=await browser.newPage();await page.goto(`${server.url}razestore/home/`);
  await page.locator('#tab-checkout').click();
  assert.match(await page.locator('#app-screen').getAttribute('src'),/assets\/screenshots\/checkout.png$/);
  assert.equal(await page.locator('#app-screen').evaluate(async img=>{try{await img.decode();return img.naturalWidth>0;}catch{return false;}}),true,'Relocated gallery image must decode');
  await page.locator('[data-open-screen]').click();
  assert.match(await page.locator('#dialog-image').evaluate(img=>img.src),/\/razedev\/razestore\/assets\/screenshots\/checkout.png$/);
  await page.locator('#dialog-image').evaluate(img=>img.decode());
  console.log('PASS relocated gallery image and dialog');
} finally {await browser.close();await server.close();}
