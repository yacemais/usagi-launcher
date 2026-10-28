import { _electron as electron,expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
const root=path.resolve('.scratch-runtime/install smoke');await fs.mkdir(root,{recursive:true});await fs.mkdir('docs/screenshots',{recursive:true});
const application=await electron.launch({args:['.'],env:{...process.env,CELESTIA_TEST_DATA:root,CELESTIA_GUI_TEST:'1'},timeout:60000});
try {
  const page=await application.firstWindow();page.setDefaultTimeout(60000);await page.waitForSelector('.hero');
  await page.getByRole('button',{name:'Updates',exact:true}).click();
  await page.getByRole('button',{name:'Install Minecraft & modpack',exact:true}).click();
  let captured=false,last='';const deadline=Date.now()+20*60*1000;
  while(Date.now()<deadline){
    const response=await page.evaluate(()=>window.celestia.request({type:'snapshot'}));if(!response.ok)throw new Error(response.error);const s=response.state;
    const phase=s.progress?.phase || s.phase;if(phase!==last){console.log('INSTALL_PHASE',phase,s.progress?.file || s.message);last=phase;}
    if(!captured && s.progress?.downloaded>100000){await page.screenshot({path:'docs/screenshots/actual-download.png'});captured=true;}
    if(s.phase==='idle'){
      if(s.error)throw new Error(s.error);
      expect(s.java?.major).toBe(17);expect(s.message).toContain('Minecraft, Forge and Java are installed');expect(s.installation).toBe('missing');
      await page.screenshot({path:'docs/screenshots/core-installed.png'});await fs.writeFile('docs/install-results.json',JSON.stringify({root,java:s.java,message:s.message,authenticatedGameLaunch:'NOT TESTED: public client ID and Microsoft account required',modpack:'NOT INSTALLED: signed production manifest not supplied'},null,2));console.log('OFFICIAL CORE INSTALLATION PASSED');break;
    }
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(Date.now()>=deadline)throw new Error('Core installation test timed out.');
}finally{await application.close();}
