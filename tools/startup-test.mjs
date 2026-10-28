import { _electron as electron,expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
const packaged=process.env.USAGI_PACKAGED_EXE;
const profile=path.resolve(packaged?'.scratch-runtime/startup-packaged':'.scratch-runtime/startup');
const application=await electron.launch({...(packaged?{executablePath:path.resolve(packaged)}:{args:['.']}),env:{...process.env,USAGI_DATA_DIR:profile,USAGI_TEST_DATA:profile,CELESTIA_GUI_TEST:'1'}});
try{
  const page=await application.firstWindow();
  if(packaged){
    await expect(page.locator('.startup-splash')).toHaveCount(0,{timeout:6000});
    await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].hide());
    await page.reload();
  }
  await expect(page.getByRole('status',{name:'Opening Usagi'})).toBeAttached();
  await expect(page.locator('.app-shell')).toHaveAttribute('inert','');
  expect(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible())).toBe(false);
  await page.waitForTimeout(2800);
  await expect(page.locator('.startup-splash')).toHaveCount(1);
  await expect(page.locator('.startup-splash')).not.toHaveClass(/is-running/);
  expect(await page.evaluate(()=>getComputedStyle(document.querySelector('.startup-splash')).animationName)).toBe('none');
  expect((await page.evaluate(()=>window.celestia.request({type:'startup.visibility',windowId:999}))).ok).toBe(false);
  await page.evaluate(()=>{window.__startupTiming={};const observer=new MutationObserver(()=>{if(!document.querySelector('.startup-splash')){window.__startupTiming.removedAt=Date.now();observer.disconnect();}});observer.observe(document.getElementById('root'),{subtree:true,childList:true});});
  const shownAt=await application.evaluate(({BrowserWindow})=>{const shownAt=Date.now();BrowserWindow.getAllWindows()[0].show();return shownAt;});
  await expect(page.locator('.startup-splash')).toHaveClass(/is-running/);
  await page.waitForTimeout(600);
  await page.screenshot({path:packaged?'docs/screenshots/startup-packaged-0.3.1.png':'docs/screenshots/startup.png'});
  await expect(page.locator('.startup-splash')).toHaveCount(0,{timeout:4000});
  const removedAt=await page.evaluate(()=>window.__startupTiming.removedAt);const duration=removedAt-shownAt;expect(duration).toBeGreaterThanOrEqual(2500);expect(duration).toBeLessThan(3500);
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert','');
  await page.emulateMedia({reducedMotion:'reduce'});await page.reload();
  await expect(page.locator('.startup-splash')).toHaveCount(0,{timeout:1500});
  await expect(page.getByRole('button',{name:'Home',exact:true})).toBeVisible();
  await fs.writeFile(packaged?'docs/startup-packaged-timing-results.json':'docs/startup-timing-results.json',JSON.stringify({packaged:Boolean(packaged),hiddenWaitMs:2800,visibleDurationMs:duration,reducedMotion:'passed',scope:'actual Electron window visibility; not a physical display measurement'},null,2));
  console.log('STARTUP CHECKS PASSED: hidden window preserves splash; visible duration '+duration+'ms; reduced motion skips animation; forged visibility query rejected.');
}finally{await application.close();}
