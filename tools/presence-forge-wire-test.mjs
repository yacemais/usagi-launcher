import {createServer} from 'node:http';
import {WebSocketServer} from 'ws';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const classpath=await readFile('integrations/forge/build/wire-classpath.txt','utf8');
for(const mode of ['legacy','supported','reject-metadata']) {
  const supported=mode!=='legacy';
  const key=randomBytes(32).toString('hex'),server=createServer(),wss=new WebSocketServer({server});let observed=false;let violation;
  wss.on('connection',socket=>{let authenticated=false;socket.on('error',()=>{});socket.on('message',raw=>{try {
    const packet=JSON.parse(raw.toString());if(!authenticated){assert.equal(packet.type,'authenticate');assert.equal(packet.role,'server');assert.equal(packet.token,key);authenticated=true;socket.send(JSON.stringify({event:'ready'}));return;}
    if(packet.action.op==='capabilities'){socket.send(JSON.stringify(supported ? {id:packet.id,ok:true,data:{features:['rich_presence.v1']}} : {id:packet.id,ok:false,error:'Invalid Social request.',code:'input'}));return;}
    assert.equal(packet.action.op,'players');const player=packet.action.players[0];assert.equal(player.uuid,'1'.repeat(32));assert.equal(player.name,'TestAlpha');
    if(mode==='reject-metadata' && player.dimension){socket.send(JSON.stringify({id:packet.id,ok:false,error:'Metadata refused by fixture',code:'input'}));return;}
    if(mode==='supported'){assert.equal(player.dimension,'test:moon_garden');assert.equal(packet.action.event.id,'test-event');}else {assert.deepEqual(Object.keys(player).sort(),['name','uuid']);assert.equal(packet.action.event,undefined);}
    observed=true;socket.send(JSON.stringify({id:packet.id,ok:true,data:{}}));
  }catch {violation='Invalid native presence payload';socket.close(1008);}});});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;
  const environment=Object.fromEntries(['SystemRoot','WINDIR','PATH','Path','TEMP','TMP','ComSpec','PATHEXT'].flatMap(name=>process.env[name]===undefined ? [] : [[name,process.env[name]]]));
  const child=spawn(path.join(process.env.JAVA_HOME,'bin/java.exe'),['-cp',classpath,'smp.usagi.social.PresenceWireProbe'],{env:{...environment,SOCIAL_TEST_ORIGIN:origin,USAGI_BRIDGE_SECRET:key},shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',bytes=>{output+=bytes.toString();});child.stderr.on('data',()=>{});
  const timeout=setTimeout(()=>child.kill(),25000);
  try {
    const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});assert.equal(code,0,'Java presence transport failed');assert.equal(violation,undefined);assert.equal(observed,true);assert.ok(output.includes('JAVA_PRESENCE_COMPATIBILITY_PASSED'));
    console.log(mode==='supported' ? 'JAVA PRESENCE: negotiated dimension/event metadata passed.' : mode==='legacy' ? 'JAVA PRESENCE: legacy owner fallback preserves the original player contract.' : 'JAVA PRESENCE: rejected optional metadata safely falls back without interrupting core Social presence.');
  }finally {clearTimeout(timeout);if(child.exitCode===null)child.kill();for(const socket of wss.clients)socket.terminate();await new Promise(done=>wss.close(done));await new Promise(done=>server.close(done));}
}
