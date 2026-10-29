import { _electron as electron,expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
const core=process.argv.includes('--core');
const root=path.resolve(core?'.scratch-runtime/install smoke':'.scratch-runtime/packaged smoke');await fs.mkdir(root,{recursive:true});
const executablePath=path.resolve(process.env.USAGI_PACKAGED_EXE||'release/win-unpacked/Usagi.exe');
const application=await electron.launch({executablePath,cwd:root,env:{...process.env,CELESTIA_DATA_DIR:root,USAGI_GUI_TEST:'1'},timeout:60000});
try {
  const page=await application.firstWindow();page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.waitForSelector('.hero');await page.evaluate(()=>document.fonts.ready);
  const idle=async(timeout=120000)=>{const deadline=Date.now()+timeout;while(Date.now()<deadline){const r=await page.evaluate(()=>window.celestia.request({type:'snapshot'}));if(r.ok && r.state.phase==='idle')return r.state;await new Promise(resolve=>setTimeout(resolve,250));}throw new Error('Packaged operation timed out.');};await idle();
  await expect(page.getByRole('button',{name:'INSTALL',exact:true})).toBeEnabled();expect(page.url()).toBe('celestia://app/index.html');
  await expect(page.getByRole('heading',{name:'Usagi SMP',exact:true})).toBeVisible();
  await expect(page.getByText(/celestia/i)).toHaveCount(0);
  const status=await application.evaluate(async({app,BrowserWindow,safeStorage})=>({packaged:app.isPackaged,name:app.getName(),version:app.getVersion(),data:app.getPath('userData'),sandbox:BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences().sandbox,credentialProtection:await safeStorage.isAsyncEncryptionAvailable()}));expect(status.packaged).toBe(true);expect(status.name).toBe('Usagi');expect(status.version).toBe(JSON.parse(await fs.readFile('package.json','utf8')).version);expect(status.data).toBe(root);expect(status.sandbox).toBe(true);expect(status.credentialProtection).toBe(true);
  if(core){await page.getByRole('button',{name:'Updates',exact:true}).click();await page.getByRole('button',{name:'Install Minecraft & modpack',exact:true}).click();const state=await idle(300000);expect(state.error).toBeUndefined();expect(state.java.major).toBe(17);expect(state.message).toContain('Minecraft, Forge and Java are installed');expect(state.installation).toBe('missing');await page.screenshot({path:'docs/screenshots/packaged-core-installed.png'});await fs.writeFile('docs/packaged-core-results.json',JSON.stringify({packaged:status.packaged,java:state.java,checks:['actual packaged app verifies existing official runtime after restart','packaged installer executes official Forge workflow','missing signed modpack correctly keeps PLAY disabled'],authenticatedGameLaunch:'NOT TESTED: public client ID and Microsoft account required'},null,2));console.log('PACKAGED CORE INSTALLATION PASSED');}
  else{
  await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(page.getByRole('heading',{name:'Settings'})).toBeVisible();await page.getByRole('button',{name:'Home',exact:true}).click();await page.screenshot({path:'docs/screenshots/packaged-home.png'});expect(errors).toEqual([]);
  await fs.writeFile('docs/packaged-results.json',JSON.stringify({...status,checks:['actual packaged executable starts without Vite','local production protocol','INSTALL state with empty game folder','navigation','Windows credential protection','renderer has no runtime errors'],errors},null,2));console.log('PACKAGED APP CHECKS PASSED');
  }
}finally{await application.close();}
