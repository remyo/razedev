import {posix} from 'node:path';
import {scanHtml, escapeHtml} from './html.mjs';

export function rewritePage(html,{registry,app,sourcePage}) {
  const pageRoute=app.pages[sourcePage]; if(!pageRoute) throw new Error('Unknown source page');
  const publicBase=`${registry.site.origin}${registry.site.basePath}${app.slug}/`;
  function relocate(input,absolute=false) {
    if(!input || input.startsWith('#') || /^(?:mailto:|tel:|data:)/i.test(input)) return input;
    let value=input,wasLegacy=false;
    if(value.startsWith(app.legacyBaseUrl)) {value=value.slice(app.legacyBaseUrl.length) || 'index.html';wasLegacy=true;}
    else if(/^(?:[a-z][\w+.-]*:|\/\/)/i.test(value)) return value;
    const suffix=value.match(/[?#].*$/)?.[0] || '';
    let pathname=decodeURIComponent(value.slice(0,value.length-suffix.length));
    if(pathname==='') pathname=sourcePage;
    if(pathname.startsWith('/') || pathname.split('/').includes('..') || pathname.includes('\\')) throw new Error(`Unsafe reference: ${input}`);
    pathname=posix.normalize(pathname); if(pathname==='.') pathname='index.html';
    let target;
    if(app.pages[pathname]) target=`${app.pages[pathname]}/`;
    else if(app.assets.includes(pathname)) target=pathname;
    else throw new Error(`Unlisted reference: ${input}`);
    return `${absolute || wasLegacy ? publicBase : '../'}${target}${suffix}`;
  }
  const edits=[];
  for(const tag of scanHtml(html).tags) for(const attr of tag.attributes) {
    const meta=tag.name==='meta' && tag.attributes.some(a=>['property','name'].includes(a.name) && /^(?:og:(?:url|image)|twitter:image)$/.test(a.value));
    let value;
    if(['href','src','xlink:href'].includes(attr.name) || (meta && attr.name==='content')) value=relocate(attr.value,meta);
    else if(attr.name==='srcset') value=attr.value.split(',').map(x=>{const [url,...rest]=x.trim().split(/\s+/);return [relocate(url),...rest].join(' ');}).join(', ');
    if(value!==undefined && value!==attr.value) edits.push({...attr,value:escapeHtml(value)});
  }
  for(const edit of edits.sort((a,b)=>b.start-a.start)) html=html.slice(0,edit.start)+edit.value+html.slice(edit.end);
  return html;
}
export function renderRedirect({relativeTarget,label}) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(label)}</title><p><a href="${escapeHtml(relativeTarget)}">Continue to ${escapeHtml(label)}</a></p><script>const target=new URL(${JSON.stringify(relativeTarget)},location.href);target.search=location.search;target.hash=location.hash;location.replace(target.href);</script></html>\n`;
}
