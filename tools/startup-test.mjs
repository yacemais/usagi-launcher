import { _electron as electron,expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
const application=await electron.launch({args:['.'],env:{...process.env,USAGI_TEST_DATA:path.resolve('.scratch-runtime/startup'),CELESTIA_GUI_TEST:'1'}});
try{
  const page=await application.firstWindow();
  await expect(page.getByRole('status',{name:'Opening Usagi'})).toBeAttached();
  await expect(page.locator('.app-shell')).toHaveAttribute('inert','');
  await page.waitForTimeout(350);
  await page.screenshot({path:'docs/screenshots/startup.png'});
  await expect(page.locator('.startup-splash')).toHaveCount(0,{timeout:3500});
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert','');
  await page.emulateMedia({reducedMotion:'reduce'});await page.reload();
  await expect(page.locator('.startup-splash')).toHaveCount(0,{timeout:1500});
  await expect(page.getByRole('button',{name:'Home',exact:true})).toBeVisible();
  console.log('STARTUP CHECKS PASSED: real logo, timed transition, inert background, reduced motion.');
}finally{await application.close();}
