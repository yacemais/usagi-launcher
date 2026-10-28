import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createPublicKey } from 'node:crypto';
import { settingsSchema } from '../../shared/validation';
import type { Settings } from '../../shared/types';
import { atomicWrite, exists, inside, readJson, safePath } from '../security/files';
import { validatePackPath } from '../updater/manifest';
export const totalRamMb=Math.floor(os.totalmem()/1024/1024);
export const maxRamMb=Math.min(32768,Math.max(2048,totalRamMb-2048));
export class SettingsStore {
  value:Settings;
  constructor(public root:string) { this.value={ramMb:Math.min(6144,maxRamMb),width:1280,height:720,fullscreen:false,gameDirectory:path.join(root,'game'),javaPath:'',minimizeOnLaunch:true,launchBehavior:'minimize',concurrency:4,notifications:true,language:'en',manifestUrl:'',manifestPublicKey:'',newsUrl:'',serverHost:'',serverPort:25565,microsoftClientId:'',optionalFiles:[],autoJoin:false,appUpdateChannel:'stable'}; }
  async load() { const file=path.join(this.root,'settings.json'); this.value=settingsSchema.parse(await exists(file)?await readJson(file):this.value); this.validate(this.value); return this.value; }
  validate(value:Settings) {
    settingsSchema.parse(value); if(value.ramMb>maxRamMb) throw new Error(`RAM must not exceed ${maxRamMb} MB on this computer.`);
    if(!path.isAbsolute(value.gameDirectory)) throw new Error('Choose an absolute game directory.');
    const normalized=path.resolve(value.gameDirectory).toLowerCase();
    const protectedRoots=[path.join(os.homedir(),'AppData/Roaming/PrismLauncher'),path.join(os.homedir(),'Documents/RobloxProject')];
    if(protectedRoots.some(p=>inside(p.toLowerCase(),normalized) || inside(normalized,p.toLowerCase()))) throw new Error('Choose a dedicated launcher folder outside Prism and existing SMP development files.');
    if(value.javaPath && (!path.isAbsolute(value.javaPath) || !/^java(?:w)?\.exe$/i.test(path.basename(value.javaPath)))) throw new Error('Select the Java executable.');
    if(value.manifestPublicKey) {if(!value.manifestPublicKey.trim().startsWith('-----BEGIN PUBLIC KEY-----') || createPublicKey(value.manifestPublicKey).asymmetricKeyType!=='ed25519')throw new Error('Paste an Ed25519 public key, never a private key.');}
    for(const file of value.optionalFiles)validatePackPath(file);
  }
  async save(value:Settings) { this.validate(value); await atomicWrite(path.join(this.root,'settings.json'),JSON.stringify(value,null,2)); this.value=value; }
  async prepareGame() {
    const root=this.value.gameDirectory; const marker=await safePath(root,'.celestia-owner.json'); await fs.mkdir(root,{recursive:true});
    if(await exists(marker)) { const data=await readJson(marker) as {owner?:string}; if(data.owner!=='celestia-launcher') throw new Error('Game directory marker is invalid.'); }
    else { if((await fs.readdir(root)).length) throw new Error('This folder already contains files. Choose an empty folder or an existing Usagi installation.'); await atomicWrite(marker,JSON.stringify({owner:'celestia-launcher',schema:1})); }
  }
}
