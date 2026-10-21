import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {startPreview} from './serve.mjs';
import {buildSite} from './build.mjs';
import {readRegistry} from './lib/registry.mjs';
import {scanHtml} from './lib/html.mjs';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),galleryOnly=process.argv.includes('--gallery-only');
const output=join(repo,'.preview/razedev-check');await mkdir(output,{recursive:true});
const report={passed:false,checks:[],screenshots:[]};
const modules=process.env.RAZEDEV_NODE_MODULES || '/Users/rem/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {chromium}=createRequire(import.meta.url)(join(modules,'playwright'));
if(!galleryOnly) await buildSite({repoDir:repo});
const registry=await readRegistry(repo),server=await startPreview({rootDir:join(repo,galleryOnly?'public':'dist')}),origin=new URL(server.url).origin;
const browser=await chromium.launch({headless:true,executablePath:process.env.RAZEDEV_QA_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const deadline=setTimeout(()=>{console.error('Browser checks exceeded 180 seconds');process.exit(1);},180000);deadline.unref();
async function check(name,work) {try{await work();report.checks.push({name,passed:true});console.log(`PASS ${name}`);}catch(error){report.checks.push({name,passed:false,error:error.message});console.error(`FAIL ${name}: ${error.message}`);}}
async function imageCheck(page) {
  const missing=await page.locator('img[src]').evaluateAll(images=>Promise.all(images.map(async img=>{
    img.loading='eager';
    try{await Promise.race([img.decode(),new Promise((_,fail)=>setTimeout(()=>fail(new Error('decode timeout')),6000))]);return img.naturalWidth?null:img.src;}catch{return img.src;}
  })).then(items=>items.filter(Boolean)));
  assert.deepEqual(missing,[],'All images must decode');
}
async function context(profile={width:1440,height:1000}) {
  const ctx=await browser.newContext({viewport:{width:profile.width,height:profile.height},reducedMotion:'reduce',serviceWorkers:'block'});
  await ctx.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  return ctx;
}
async function gallery(page) {
  await page.goto(`${server.url}razestore/home/`);await imageCheck(page);
  for(const key of ['products','checkout','gcash','sales','receipts']) {await page.locator(`#tab-${key}`).click();assert.equal(await page.locator(`#tab-${key}`).getAttribute('aria-selected'),'true');await imageCheck(page);}
  await page.locator('#tab-checkout').focus();await page.keyboard.press('ArrowDown');assert.equal(await page.locator('#tab-gcash').getAttribute('aria-selected'),'true');
  await page.locator('[data-open-screen]').click();assert.equal(await page.locator('#screen-dialog').evaluate(d=>d.open),true);
  assert.match(await page.locator('#dialog-image').evaluate(img=>img.src),/\/razedev\/razestore\/assets\/screenshots\/gcash.png$/);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#screen-dialog').evaluate(d=>d.open),false);assert.equal(await page.locator('[data-open-screen]').evaluate(e=>e===document.activeElement),true);
}
try {
  const ctx=await context(),page=await ctx.newPage();page.setDefaultTimeout(8000);
  await check('relocated-store-gallery-and-keyboard-dialog',()=>gallery(page));
  if(!galleryOnly) {
    await check('aliases-preserve-query-and-fragment',async()=>{
      for(const app of registry.apps) {
        await page.goto(`${server.url}${app.slug}/index.html?from=test#features`);await page.waitForURL(`**/${app.slug}/home/?from=test#features`);
        assert.equal(new URL(page.url()).hash,'#features');
      }
      await page.goto(`${server.url}razetag/guide.html?from=test#shop-team`);await page.waitForURL('**/razetag/guide/?from=test#shop-team');
    });
    await check('tag-faq-guide-chapters-modal-presentation-print',async()=>{
      await page.goto(`${server.url}razetag/home/`);const questions=page.locator('#questions details');assert.equal(await questions.count(),6);
      await questions.first().locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await questions.first().evaluate(d=>d.open),true);
      await page.goto(`${server.url}razetag/guide/`);await imageCheck(page);assert.equal(await page.locator('.chapter').count(),17);
      assert.equal(await page.locator('[data-screen]').count(),30);
      for(const id of ['sync','desktop','shop-team']) {await page.goto(`${server.url}razetag/guide/#${id}`);assert.equal(await page.locator(`#${id}`).isVisible(),true);}
      await page.locator('#desktop [data-screen]').first().click();assert.equal(await page.locator('#screen-dialog').evaluate(d=>d.open),true);await page.keyboard.press('Escape');
      await page.locator('#present-button').click();assert.equal(await page.locator('body').evaluate(b=>b.classList.contains('presenting')),true);
      await page.locator('#next-chapter').click();await page.locator('#exit-presentation').click();
      await page.emulateMedia({media:'print'});assert.equal(await page.locator('.chapter:visible').count(),17);await page.emulateMedia({media:'screen'});
    });
    await ctx.close();
    const profiles=[{name:'desktop',width:1440,height:1000},{name:'tablet',width:768,height:1024},{name:'mobile',width:390,height:844},{name:'small-mobile',width:320,height:740},{name:'text-200',width:390,height:844,scale:2}];
    for(const profile of profiles) {
      const c=await context(profile),p=await c.newPage();p.setDefaultTimeout(8000);const errors=[];
      p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});p.on('requestfailed',r=>errors.push(`Failed ${r.url()}`));
      const routes=['',...registry.apps.flatMap(app=>Object.values(app.pages).map(route=>`${app.slug}/${route}/`))];
      for(const path of routes) await check(`${profile.name}/${path || 'hub'}`,async()=>{
        await p.goto(server.url+path);await p.reload();if(profile.scale)await p.evaluate(scale=>document.documentElement.style.fontSize=`${16*scale}px`,profile.scale);
        await imageCheck(p);
        const size=await p.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert(size.scroll<=size.width+1,`Horizontal overflow: ${JSON.stringify(size)}`);
        const bad=await p.locator('a[href]').evaluateAll((links,args)=>links.map(a=>new URL(a.href)).filter(u=>u.origin===location.origin && (args.slug?!u.pathname.startsWith(`/razedev/${args.slug}/`):false)).map(u=>u.href),{slug:path.split('/')[0]});assert.deepEqual(bad,[],'Product navigation must stay within its app');
        const file=`${profile.name}-${path.replaceAll('/','-') || 'hub'}.png`;await p.screenshot({path:join(output,file),fullPage:path===''});report.screenshots.push(file);
      });
      await check(`${profile.name}/no-browser-errors`,()=>assert.deepEqual(errors,[]));await c.close();
    }
    await check('no-javascript-hub-and-product-navigation',async()=>{
      const c=await browser.newContext({viewport:{width:390,height:844},javaScriptEnabled:false});
      try{const p=await c.newPage();await p.goto(server.url);for(const app of registry.apps){await p.goto(server.url);await p.getByRole('link',{name:`Explore ${app.name}`,exact:true}).click();assert.equal(new URL(p.url()).pathname,`/razedev/${app.slug}/home/`);await imageCheck(p);}
        await p.goto(`${server.url}razestore/home/`);assert.equal(await p.locator('noscript a').count(),4);await p.locator('.nav-links a').filter({hasText:'Privacy'}).click();assert.equal(new URL(p.url()).pathname,'/razedev/razestore/privacy/');
      }finally{await c.close();}
    });
    for(let i=2;i<process.argv.length;i++) if(process.argv[i]==='--source') {
      const entry=process.argv[++i],equals=entry.indexOf('='),slug=entry.slice(0,equals),source=entry.slice(equals+1);
      await check(`${slug}/policy-wording-unchanged`,async()=>{
        function mask(html){for(const a of scanHtml(html).tags.flatMap(t=>t.attributes).filter(a=>['href','src','srcset'].includes(a.name)).sort((a,b)=>b.start-a.start))html=html.slice(0,a.start)+'URL'+html.slice(a.end);return html;}
        assert.equal(mask(await readFile(join(source,'privacy.html'),'utf8')),mask(await readFile(join(repo,'public',slug,'privacy/index.html'),'utf8')));
      });
    }
  } else await ctx.close();
} finally {
  clearTimeout(deadline);await browser.close();await server.close();report.passed=report.checks.every(c=>c.passed);
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(`${report.passed?'PASS':'FAIL'} ${report.checks.filter(c=>c.passed).length}/${report.checks.length} browser checks`);if(!report.passed)process.exitCode=1;
}
