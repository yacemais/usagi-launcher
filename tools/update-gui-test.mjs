import { _electron as electron,expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
const root=await fs.mkdtemp(path.resolve('.scratch-runtime/update-ui-'));
const fixture={id:'fixture-modpack-available',subject:'modpack',kind:'available',current:'0.1.0',version:'0.1.1',message:'An official modpack update is available.',at:new Date().toISOString(),dismissed:false};
await fs.writeFile(path.join(root,'update-notices.json'),JSON.stringify([fixture]));
const executablePath=process.env.USAGI_PACKAGED_EXE?path.resolve(process.env.USAGI_PACKAGED_EXE):undefined;
async function open(){const application=await electron.launch({...(executablePath?{executablePath}:{args:['.']}),env:{...process.env,USAGI_DATA_DIR:root,CELESTIA_GUI_TEST:'1'}});const page=await application.firstWindow();await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show());await page.waitForSelector('.hero');await expect(page.locator('.startup-splash')).toHaveCount(0,{timeout:6000});return {application,page};}
let application;
try{
  let opened=await open();application=opened.application;let page=opened.page;const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.getByRole('button',{name:'Updates',exact:true}).click();const notices=page.getByRole('region',{name:'Update notifications'});await expect(notices).toBeVisible();const notice=notices.locator('article').filter({hasText:'Usagi modpack · 0.1.1'});await expect(notice).toBeVisible();await expect(notice).toContainText('Installed: 0.1.0');
  await page.getByRole('tab',{name:'Usagi launcher'}).click();await notice.getByRole('button',{name:'Review',exact:true}).click();await expect(page.getByRole('tab',{name:'Usagi SMP'})).toHaveAttribute('aria-selected','true');
  await notice.getByRole('button',{name:'Dismiss modpack notification'}).click();await expect(notice).toHaveCount(0);await expect.poll(async()=>JSON.parse(await fs.readFile(path.join(root,'update-notices.json'),'utf8')).find(n=>n.id===fixture.id)?.dismissed).toBe(true);
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(960,620));expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:path.join(root,'notifications-960.png')});await application.close();application=undefined;
  opened=await open();application=opened.application;page=opened.page;await page.getByRole('button',{name:'Updates',exact:true}).click();await expect(page.locator('.update-notification').filter({hasText:'Usagi modpack · 0.1.1'})).toHaveCount(0);expect(errors).toEqual([]);
  await fs.writeFile(path.join(root,'results.json'),JSON.stringify({checks:['actual persisted notice UI','current/available versions','Review selects modpack tab','dismiss through real IPC','dismiss persists across process restart','960x620 layout'],packaged:!!executablePath,errors},null,2));console.log('UPDATE NOTIFICATION GUI CHECKS PASSED');
}finally{await application?.close();}
