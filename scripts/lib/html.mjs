export const decodeHtml = value => value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi,entity=>{
  const named={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'};
  if(entity[1]!=='#') return named[entity.toLowerCase()];
  return String.fromCodePoint(entity[2].toLowerCase()==='x'?parseInt(entity.slice(3,-1),16):Number(entity.slice(2,-1)));
});
export const escapeHtml = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Preserve original bytes: consumers replace attribute value spans, never serialize HTML.
export function scanHtml(html) {
  const tags=[],ids=[]; let cursor=0;
  while(cursor<html.length) {
    const start=html.indexOf('<',cursor); if(start<0) break;
    if(html.startsWith('<!--',start)) {const end=html.indexOf('-->',start+4); cursor=end<0?html.length:end+3;continue;}
    const match=/^<([a-z][\w:-]*)(?=[\s/>])/i.exec(html.slice(start));
    if(!match) {cursor=start+1;continue;}
    const name=match[1].toLowerCase(),attributes=[]; let i=start+match[0].length;
    while(i<html.length) {
      while(/\s/.test(html[i] || '') && i<html.length) i++;
      if(html[i]==='>' || html.slice(i,i+2)==='/>') break;
      const key=/^[^\s=/>]+/.exec(html.slice(i)); if(!key) {i++;continue;}
      const attrName=key[0].toLowerCase(); i+=key[0].length;
      while(i<html.length && /\s/.test(html[i])) i++;
      if(html[i]!=='=') continue;
      i++; while(i<html.length && /\s/.test(html[i])) i++;
      const quote=html[i]==='"' || html[i]==="'" ? html[i++] : null;
      const valueStart=i;
      if(quote) {while(i<html.length && html[i]!==quote) i++;}
      else {while(i<html.length && !/[\s>]/.test(html[i])) i++;}
      const value=decodeHtml(html.slice(valueStart,i));
      attributes.push({name:attrName,value,start:valueStart,end:i});
      if(attrName==='id') ids.push(value);
      if(quote) i++;
    }
    tags.push({name,attributes}); cursor=i+1;
    if(name==='script' || name==='style') {
      const closing=new RegExp(`</${name}\\s*>`,'ig'); closing.lastIndex=cursor;
      const end=closing.exec(html); cursor=end?closing.lastIndex:html.length;
    }
  }
  return {tags,ids};
}
export function references(html) {
  return scanHtml(html).tags.flatMap(tag=>tag.attributes.flatMap(attr=>{
    const meta=tag.name==='meta' && tag.attributes.some(a=>['property','name'].includes(a.name) && /^(?:og:(?:url|image)|twitter:image)$/.test(a.value));
    if(['href','src','xlink:href'].includes(attr.name) || (meta && attr.name==='content')) return [{...attr,tag:tag.name}];
    if(attr.name==='srcset') return attr.value.split(',').map(x=>({...attr,tag:tag.name,value:x.trim().split(/\s+/)[0]}));
    return [];
  }));
}
