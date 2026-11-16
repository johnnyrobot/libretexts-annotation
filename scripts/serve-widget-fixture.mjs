// Local synthetic browser-test fixture; no API proxy, credentials or live writes.
import {createServer} from 'node:http';
import {readFile,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join,sep} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const assets=await realpath(join(root,'reader'));
const server=createServer(async(req,res)=>{
 try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let file;
  if(path==='/'||path==='/annotation-focus-fixture.html')file=join(root,'test/fixtures/annotation-focus.html');
  else if(path==='/annotation-focus-fixture.mjs')file=join(root,'test/fixtures/annotation-focus.mjs');
  else if(path.startsWith('/_assets/reader/')){
   file=await realpath(join(assets,path.slice('/_assets/reader/'.length)));
   if(!file.startsWith(assets+sep))throw Error('Path outside assets');
  }else{res.writeHead(404);res.end();return;}
  const body=await readFile(file);
  res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');
  res.setHeader('Cache-Control','no-store');res.end(req.method==='HEAD'?undefined:body);
 }catch{res.writeHead(404);res.end();}
});
server.listen(8789,'127.0.0.1');
for(const s of ['SIGINT','SIGTERM'])process.on(s,()=>server.close());
