import {createServer} from 'node:http';
import {readFile,realpath,stat} from 'node:fs/promises';
import {resolve,join,extname,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {isWithin} from './lib/files.mjs';
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'};
export async function startPreview({rootDir,basePath='/razedev/',host='127.0.0.1',port=0}) {
  const root=await realpath(rootDir);
  const server=createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(url.pathname);
      if(!pathname.startsWith(basePath)) throw new Error('Outside base');
      const relative=pathname.slice(basePath.length);
      if(relative.split('/').some(p=>p.startsWith('.') && p)) throw new Error('Hidden or traversal path');
      let file=resolve(root,relative);
      if(!isWithin(root,file)) throw new Error('Outside root');
      if((await stat(file)).isDirectory()) {
        if(!pathname.endsWith('/')) {res.writeHead(301,{Location:`${url.pathname}/${url.search}`});res.end();return;}
        file=join(file,'index.html');
      }
      file=await realpath(file);if(!isWithin(root,file)) throw new Error('Outside root');
      res.writeHead(200,{'Content-Type':mime[extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});res.end(await readFile(file));
    } catch {
      res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});
      try {res.end(await readFile(join(root,'404.html')));} catch {res.end('Page not found. Check the address.');}
    }
  });
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,host,ok);});
  return {url:`http://${host}:${server.address().port}${basePath}`,close:()=>new Promise((ok,fail)=>{server.close(error=>error?fail(error):ok());server.closeAllConnections();})};
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  startPreview({rootDir:join(repo,'dist'),port:Number(process.argv[process.argv.indexOf('--port')+1]) || 8767}).then(server=>{console.log(`Local: ${server.url}`);for(const signal of ['SIGINT','SIGTERM']) process.on(signal,async()=>{await server.close();process.exit(0);});}).catch(error=>{console.error(error.message);process.exitCode=1;});
}
