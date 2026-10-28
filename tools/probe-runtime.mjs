import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const [port]=(await readFile('.scratch-runtime/install smoke/DevToolsActivePort','utf8')).trim().split('\n');
const browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
try{for(const context of browser.contexts())for(const page of context.pages()){console.log(page.url());console.log(await page.evaluate(async()=>{const r=await window.celestia?.request({type:'snapshot'});return r?.ok?{phase:r.state.phase,installation:r.state.installation,message:r.state.message,error:r.state.error,progress:r.state.progress}:r;}));if(process.argv.includes('--close'))await page.evaluate(()=>window.celestia.request({type:'window',action:'close'})).catch(()=>{});}}finally{await browser.close();}
