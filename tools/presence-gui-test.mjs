import {_electron as electron,expect} from '@playwright/test';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';

await fs.mkdir('.scratch-runtime',{recursive:true});const root=await fs.mkdtemp(path.resolve('.scratch-runtime/presence-gui-'));
const endpoint=process.platform==='win32' ? '\\\\?\\pipe\\usagi-presence-test-'+randomUUID() : path.join(os.tmpdir(),'usagi-presence-test-'+randomUUID());
const packets=[],sockets=new Set();
function frame(value){const body=Buffer.from(JSON.stringify(value)),header=Buffer.alloc(8);header.writeUInt32LE(1,0);header.writeUInt32LE(body.length,4);return Buffer.concat([header,body]);}
const server=createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});let buffer=Buffer.alloc(0);socket.on('data',bytes=>{buffer=Buffer.concat([buffer,bytes]);while(buffer.length>=8){const op=buffer.readUInt32LE(0),length=buffer.readUInt32LE(4);if(length>65536){socket.destroy();return;}if(buffer.length<8+length)return;const value=JSON.parse(buffer.subarray(8,8+length).toString());buffer=buffer.subarray(8+length);packets.push(value);if(op===0)socket.write(frame({cmd:'DISPATCH',evt:'READY',data:{v:1}}));else if(op===1 && socket.writable)socket.write(frame({cmd:value.cmd,nonce:value.nonce,evt:null,data:{}}));}});});
await new Promise(done=>server.listen(endpoint,done));let application;
async function closeApplication() {if(!application)return;const instance=application;const timeout=setTimeout(()=>{void instance.evaluate(({app})=>app.exit(0)).catch(()=>{});},8000);try {await instance.close();}finally {clearTimeout(timeout);application=undefined;}}
try {
  application=await electron.launch({args:['.'],env:{...process.env,USAGI_DATA_DIR:root,CELESTIA_DATA_DIR:root,USAGI_TEST_DATA:root,CELESTIA_GUI_TEST:'1',USAGI_TEST_DISCORD_IPC:endpoint}});
  const page=await application.firstWindow();const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.waitForLoadState('load');await page.emulateMedia({reducedMotion:'reduce'});await page.reload();
  await page.getByRole('button',{name:'Settings',exact:true}).click();const checkbox=page.getByLabel('Show Discord activity on this device',{exact:true});await expect(checkbox).not.toBeChecked();
  expect((await page.evaluate(()=>window.celestia.request({type:'presence.preferences',preferences:{enabled:true,dimension:'forged'}}))).ok).toBe(false);
  await checkbox.check();await page.getByRole('button',{name:'Save Discord activity',exact:true}).click();await expect.poll(()=>packets.filter(packet=>packet.cmd==='SET_ACTIVITY').at(-1)?.args.activity?.details,{timeout:10000}).toBe('In the Launcher');
  expect(packets.find(packet=>packet.v===1)?.client_id).toBe('1565378499731263570');await expect(page.getByText('Discord activity is connected.',{exact:true})).toBeVisible();
  await page.screenshot({path:'.scratch-runtime/presence-gui.png',fullPage:true});
  await checkbox.uncheck();await page.getByRole('button',{name:'Save Discord activity',exact:true}).click();await expect.poll(()=>packets.filter(packet=>packet.cmd==='SET_ACTIVITY').at(-1)?.args.activity).toBeNull();
  const stored=JSON.parse(await fs.readFile(path.join(root,'discord-presence.json'),'utf8'));expect(stored.profiles.launcher.enabled).toBe(false);
  await checkbox.check();await page.getByRole('button',{name:'Save Discord activity',exact:true}).click();await expect.poll(()=>packets.filter(packet=>packet.cmd==='SET_ACTIVITY').at(-1)?.args.activity?.details).toBe('In the Launcher');expect(errors).toEqual([]);
  await closeApplication();await expect.poll(()=>packets.filter(packet=>packet.cmd==='SET_ACTIVITY').at(-1)?.args.activity).toBeNull();
  console.log(JSON.stringify({realElectron:true,defaultOff:true,officialApplicationId:true,forgedIpcDenied:true,preferencesPersist:true,localMockDiscordOnly:true,clearedOnDisable:true,clearedOnExit:true,pageErrors:errors.length}));
} finally {
  await closeApplication();
  for(const socket of sockets)socket.destroy();await new Promise(done=>server.close(done));await fs.rm(root,{recursive:true,force:true});
}
