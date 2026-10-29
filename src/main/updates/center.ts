import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Snapshot,UpdateNotice } from '../../shared/types';
import { atomicWrite,exists } from '../security/files';

export const UPDATE_INTERVAL=15*60*1000;
const noticeSchema=z.object({id:z.string(),subject:z.enum(['launcher','modpack']),kind:z.enum(['available','compatibility','complete','failure']),current:z.string().optional(),version:z.string().optional(),message:z.string(),at:z.string(),dismissed:z.boolean()}).strict();
export class UpdateCenter {
  notices:UpdateNotice[]=[];
  private timer?:ReturnType<typeof setInterval>;private operation?:Promise<void>;private writes=Promise.resolve();private previous?:Snapshot;
  constructor(private file:string,private snapshot:()=>Snapshot,private checkPack:()=>Promise<void>,private checkApp:()=>Promise<void>,private changed:()=>void,private desktop:(notice:UpdateNotice)=>void=()=>{}){}
  async load(){if(await exists(this.file))this.notices=z.array(noticeSchema).max(2000).parse(JSON.parse(await fs.readFile(this.file,'utf8')));}
  start(){if(this.timer)return;this.timer=setInterval(()=>void this.check().catch(()=>{}),UPDATE_INTERVAL);this.timer.unref();}
  stop(){if(this.timer)clearInterval(this.timer);this.timer=undefined;}
  async check(){if(this.operation)return this.operation;this.operation=this.checkInternal().finally(()=>{this.operation=undefined;});return this.operation;}
  private async checkInternal(){await Promise.allSettled([this.checkPack(),this.checkApp()]);this.observe(this.snapshot());await this.writes;}
  private persist(){const data=JSON.stringify(this.notices);this.writes=this.writes.catch(()=>{}).then(()=>atomicWrite(this.file,data));void this.writes.catch(()=>{});}
  async settled(){await this.operation;await this.writes;}
  observe(state:Snapshot){
    const before=this.previous;this.previous=structuredClone({...state,updateNotices:undefined});
    const add=(subject:UpdateNotice['subject'],kind:UpdateNotice['kind'],version:string|undefined,current:string|undefined,message:string)=>{
      const id=createHash('sha256').update(JSON.stringify([subject,kind,version,kind==='failure'?message:undefined])).digest('hex');
      if(this.notices.some(n=>n.id===id))return;
      const notice:UpdateNotice={id,subject,kind,version,current,message,at:new Date().toISOString(),dismissed:false};
      this.notices.push(notice);this.notices=this.notices.slice(-2000);this.persist();this.changed();
      if(state.phase!=='playing' && state.settings.notifications)this.desktop(notice);
    };
    if(state.updateAvailable)add('modpack','available',state.availableVersion,state.installedVersion,'An official modpack update is available.');
    if(state.requiredLauncherVersion)add('modpack','compatibility',state.availableVersion,state.installedVersion,'This modpack requires Usagi '+state.requiredLauncherVersion+' or newer. Update the launcher first.');
    if(state.packSyncedAt && state.packSyncedAt!==before?.packSyncedAt && !state.error && state.installedVersion)add('modpack','complete',state.installedVersion,before?.installedVersion,'The modpack is synchronized and verified.');
    if(state.error && before?.error!==state.error && before && ['updating','installing','checking'].includes(before.phase))add('modpack','failure',state.availableVersion,state.installedVersion,state.error);
    const app=state.appUpdate,old=before?.appUpdate;
    if(app?.phase==='available')add('launcher','available',app.availableVersion,app.currentVersion,'An official Usagi launcher update is available.');
    if(app?.phase==='downloaded')add('launcher','complete',app.availableVersion,app.currentVersion,'The launcher update is downloaded. Restart and install when ready.');
    if(app?.phase==='error'&&app.error&&old?.error!==app.error)add('launcher','failure',app.availableVersion,app.currentVersion,app.error);
  }
  dismiss(id:string){const notice=this.notices.find(n=>n.id===id);if(notice){notice.dismissed=true;this.persist();this.changed();}}
}
