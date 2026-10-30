import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { randomBytes,randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
await build({entryPoints:['services/social/server.ts','src/main/social/client.ts'],outdir:'.scratch-runtime/wire',outbase:'.',bundle:true,platform:'node',format:'cjs',outExtension:{'.js':'.cjs'},external:['ws']});
const require=createRequire(import.meta.url),{createSocialServer}=require('../.scratch-runtime/wire/services/social/server.cjs'),{SocialClient}=require('../.scratch-runtime/wire/src/main/social/client.cjs');
const folder=await fs.mkdtemp(path.resolve('.scratch-runtime/wire-database-')),secret=randomBytes(32).toString('base64url'),token=randomBytes(32).toString('base64url');
const app=createSocialServer({file:path.join(folder,'social.sqlite'),bridgeSecret:secret,verifyIdentity:async value=>{if(value!==token)throw new Error('Invalid test identity');return {uuid:'1'.repeat(32),name:'TestAlpha'};}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+app.server.address().port;
const client=new SocialClient(origin,async()=>({token}),()=>{},()=>{},true);let child;
try{
  await client.connect();const alpha=app.store.row('SELECT id FROM users WHERE uuid=?','1'.repeat(32)).id;
  const classpath=await fs.readFile('integrations/forge/build/wire-classpath.txt','utf8');
  const environment=Object.fromEntries(['SystemRoot','WINDIR','PATH','Path','TEMP','TMP','ComSpec','PATHEXT'].flatMap(name=>process.env[name]===undefined ? [] : [[name,process.env[name]]]));
  child=spawn(path.join(process.env.JAVA_HOME,'bin/java.exe'),['-cp',classpath,'smp.usagi.social.BridgeWireProbe'],{env:{...environment,SOCIAL_TEST_ORIGIN:origin,USAGI_BRIDGE_SECRET:secret,SOCIAL_TEST_ALPHA_ID:alpha},shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',b=>{output+=b.toString();});let stderr='';child.stderr.on('data',b=>{stderr+=b.toString();});
  const exit=new Promise(resolve=>child.once('exit',resolve));
  const wait=async predicate=>{const deadline=Date.now()+20000;while(Date.now()<deadline){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Wire test timed out.');};
  await wait(()=>output.includes('JAVA_BRIDGE_READY'));
  const beta=app.store.row('SELECT id FROM users WHERE uuid=?','2'.repeat(32)).id;await client.action({op:'accept',target:beta});await client.action({op:'message',target:beta,text:'A private launcher message.',clientId:randomUUID()});
  await wait(()=>client.state.conversations[beta]?.some(m=>m.text==='Reply from the real Java bridge transport.'));
  const code=await exit;if(code!==0||!output.includes('JAVA_BRIDGE_ROUND_TRIP_PASSED'))throw new Error('Java bridge test failed.');
  if(app.store.pending(beta,'minecraft').length)throw new Error('Minecraft acknowledgment was not persisted.');
  console.log('JAVA FORGE BRIDGE TRANSPORT ROUND TRIP PASSED: real SocialClient → HTTP/WebSocket/SQLite → Java BridgeConnection → reply. Test-only identity verifier; in-game player chat not exercised.');
}finally{if(child&&child.exitCode===null)child.kill();await client.disconnect();await app.close();await fs.rm(folder,{recursive:true,force:true});}
