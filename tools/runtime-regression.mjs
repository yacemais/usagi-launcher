import { _electron as electron,expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
const root=path.resolve('.scratch-runtime/install smoke');
const receipt=JSON.parse(await fs.readFile(path.join(root,'runtime/runtime-receipt.json'),'utf8'));
const relative=Object.keys(receipt.files).find(f=>f.startsWith('assets/objects/'));
if(!relative)throw new Error('Run the real official installation test first.');
const target=path.join(root,'runtime/minecraft',relative),original=await fs.readFile(target);
const results=[];
let application;
async function idle(page,timeout=60000){const deadline=Date.now()+timeout;while(Date.now()<deadline){const r=await page.evaluate(()=>window.celestia.request({type:'snapshot'}));if(r.ok && r.state.phase==='idle')return r;await new Promise(resolve=>setTimeout(resolve,250));}throw new Error('Waiting for launcher idle timed out.');}
async function start(){application=await electron.launch({args:['.'],env:{...process.env,CELESTIA_TEST_DATA:root,CELESTIA_GUI_TEST:'1'},timeout:60000});const page=await application.firstWindow();await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show());page.setDefaultTimeout(60000);await page.waitForSelector('.hero');await idle(page);console.log('STARTUP VERIFIED');return page;}
try {
  let page=await start();let r=await page.evaluate(()=>window.celestia.request({type:'snapshot'}));expect(r.ok).toBe(true);expect(r.state.message).toContain('Minecraft is installed');expect(r.state.installation).toBe('missing');results.push('restart verifies persisted official runtime; missing signed pack keeps PLAY disabled');
  console.log('CLOSING FIRST WINDOW');await application.close();application=undefined;console.log('CLOSED FIRST WINDOW');
  await fs.writeFile(target,'intentional corrupt test fixture');
  page=await start();await expect(page.getByRole('button',{name:'REPAIR',exact:true})).toBeVisible();results.push('corrupt runtime asset detected after restart; REPAIR shown');
  await page.getByRole('button',{name:'Updates',exact:true}).click();await page.getByRole('button',{name:'Repair installation',exact:true}).click();
  await idle(page,300000);
  r=await page.evaluate(()=>window.celestia.request({type:'snapshot'}));expect(r.state.error).toBeUndefined();expect(await fs.readFile(target)).toEqual(original);results.push('repair redownloads corrupt asset and successfully reruns official Forge workflow');
  await fs.writeFile('docs/runtime-regression-results.json',JSON.stringify({checks:results,authenticatedGameLaunch:'NOT TESTED: owner public client ID and Microsoft account required'},null,2));console.log('RUNTIME RESTART AND REPAIR PASSED');
}finally{await application?.close();await fs.writeFile(target,original);}
