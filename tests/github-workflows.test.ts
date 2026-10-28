import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { loadProduct } from '../src/main/config/product';
const yaml=createRequire(import.meta.url)('js-yaml') as {load(s:string):any};
describe('public GitHub workflow and registration configuration',()=>{
  it('embeds the registered public ID and a verification public key, never a client secret',async()=>{const p=await loadProduct(process.cwd());expect(p.microsoftClientId).toBe('ee966e53-e97c-46eb-b6ea-6de2cca23fd5');expect(p.launcherUpdates.baseUrl).toBe('https://yacemais.github.io/usagi-launcher/launcher/channels/');expect(p.launcherUpdates.publicKey).toContain('BEGIN PUBLIC KEY');expect(JSON.stringify(p)).not.toMatch(/PRIVATE KEY|clientSecret/);});
  it('pins Actions and keeps signing secrets out of push/PR build jobs',()=>{const pkg=JSON.parse(readFileSync('package.json','utf8'));for(const script of ['package:dir','package:win'])expect(pkg.scripts[script]).toMatch(/--publish never$/);for(const name of ['windows-build','draft-release','pages']){const text=readFileSync(`.github/workflows/${name}.yml`,'utf8'),data=yaml.load(text);expect(data.permissions.contents).toBe('read');for(const line of text.split('\n').filter(l=>l.includes('uses:')))expect(line).toMatch(/@[a-f0-9]{40}\b/);if(name==='windows-build')expect(text).not.toContain('USAGI_APP_SIGNING_KEY');if(name==='draft-release'){expect(data.on.workflow_dispatch).toBeDefined();expect(data.on.push).toBeUndefined();expect(data.jobs.release.if).toContain('refs/heads/main');}}});
});
