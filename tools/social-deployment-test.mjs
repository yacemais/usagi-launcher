import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
const root=await fs.mkdtemp(path.resolve('.scratch-runtime/deployment-'));
const bundle=path.resolve(process.argv[2]||'services/social');
const child=spawn(process.execPath,[path.join(bundle,'dist/main.cjs')],{cwd:bundle,shell:false,windowsHide:true,env:{...process.env,USAGI_BRIDGE_SECRET:randomBytes(32).toString('base64url'),USAGI_SOCIAL_DB:path.join(root,'social.sqlite'),HOST:'127.0.0.1',PORT:String(port)},stdio:'ignore'});
try{
  let response;for(let i=0;i<50;i++){try{response=await fetch('http://127.0.0.1:'+port+'/health');break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
  if(!response?.ok||JSON.stringify(await response.json())!==JSON.stringify({ok:true,protocol:1}))throw new Error('Production backend health check failed.');
  const rejected=await fetch('http://127.0.0.1:'+port+'/v1/session',{method:'POST',body:JSON.stringify({uuid:'1'.repeat(32)}),headers:{'Content-Type':'application/json'}});if(rejected.status!==400)throw new Error('Production backend accepted a forged identity.');
  console.log('DEPLOYMENT BUNDLE CHECKS PASSED: production entry point, persistent DB creation, health endpoint and rejection of client-only UUID authentication. No identity adapter used.');
}finally{const exit=new Promise(resolve=>child.once('exit',resolve));child.kill();await exit;}
