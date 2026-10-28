import { _electron as electron,expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
const checks=[];
for(const scale of [1.25,1.5]){
  const root=path.resolve('.scratch-runtime/scale-'+scale);await fs.mkdir(root,{recursive:true});
  const app=await electron.launch({args:['.','--force-device-scale-factor='+scale],env:{...process.env,CELESTIA_TEST_DATA:root,CELESTIA_GUI_TEST:'1'},timeout:60000});
  try{const page=await app.firstWindow();await page.waitForSelector('.hero');await expect(page.getByRole('button',{name:'INSTALL',exact:true})).toBeEnabled();expect(await page.evaluate(()=>devicePixelRatio)).toBeCloseTo(scale,1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(page.getByRole('button',{name:'Save changes'})).toBeVisible();await page.getByRole('button',{name:'Home',exact:true}).click();await page.screenshot({path:`docs/screenshots/home-scale-${scale}.png`});checks.push({scale,home:true,settings:true,horizontalOverflow:false});}
  finally{await app.close();}
}
await fs.writeFile('docs/scale-results.json',JSON.stringify({method:'Chromium forced device scale factor, not a physical multi-monitor Windows test',checks},null,2));console.log('SCALED GUI CHECKS PASSED');
