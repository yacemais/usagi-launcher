import { build } from 'esbuild';
import { _electron as electron,expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { randomBytes,randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { xmclAliases } from './xmcl-aliases.mjs';
await build({entryPoints:['services/social/server.ts'],outfile:'.scratch-runtime/social-server.cjs',bundle:true,platform:'node',format:'cjs',external:['ws']});
await build({entryPoints:['tools/social-gui-main.ts'],outfile:'.scratch-runtime/social-gui-main.cjs',bundle:true,platform:'node',format:'cjs',external:['electron'],alias:xmclAliases});
const {createSocialServer}=createRequire(import.meta.url)('../.scratch-runtime/social-server.cjs');
const folder=await fs.mkdtemp(path.resolve('.scratch-runtime/gui-database-'));const token=randomBytes(32).toString('base64url');
const service=createSocialServer({file:path.join(folder,'social.sqlite'),bridgeSecret:randomBytes(32).toString('base64url'),verifyIdentity:async input=>{if(input!==token)throw new Error('Invalid fixture');return {uuid:'1'.repeat(32),name:'TestAlpha'};}});
await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));
const alpha=service.store.identity('1'.repeat(32),'TestAlpha'),beta=service.store.identity('2'.repeat(32),'TestBeta');
service.store.action(alpha,{op:'request',target:beta});service.store.action(beta,{op:'accept',target:alpha});service.store.lease('fixture-game',beta,'playing');service.store.action(beta,{op:'message',target:alpha,text:'Test delivery from the server protocol.',clientId:randomUUID()});
const application=await electron.launch({args:[path.resolve('.scratch-runtime/social-gui-main.cjs')],env:{...process.env,SOCIAL_TEST_ORIGIN:'http://127.0.0.1:'+service.server.address().port,SOCIAL_TEST_TOKEN:token}});
try{
  const page=await application.firstWindow();await page.getByRole('button',{name:'Social',exact:true}).click();
  await page.getByRole('button').filter({hasText:'TestBeta'}).click();
  await expect(page.getByText('Test delivery from the server protocol.',{exact:true})).toBeVisible();
  await page.getByLabel('Private message',{exact:true}).fill('A test reply from the launcher UI.');await page.getByRole('button',{name:'Send private message'}).click();await expect(page.getByText('A test reply from the launcher UI.',{exact:true})).toBeVisible();
  expect(service.store.rows('SELECT text FROM messages WHERE sender=?',alpha)[0].text).toBe('A test reply from the launcher UI.');
  await page.screenshot({path:'docs/screenshots/social-conversation-test.png'});
  await page.getByRole('button',{name:'Privacy',exact:true}).click();await page.getByLabel('Appear offline').check();await expect(page.getByLabel('Appear offline')).toBeChecked();
  await page.screenshot({path:'docs/screenshots/social-privacy-test.png'});
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(960,620));expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  console.log('SOCIAL GUI CHECKS PASSED against real local HTTP/WebSocket/SQLite with an explicit test-only identity verifier. Official Minecraft login and an in-game client were not tested.');
}finally{await application.close();await service.close();}
