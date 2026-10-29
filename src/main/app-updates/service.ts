import { CancellationToken } from 'electron-updater';
import type { AppAdapter } from 'electron-updater/out/AppAdapter';
import type { AppUpdateState } from '../../shared/types';
import type { ProductConfig } from '../config/product';
import { ReleaseRepository,UnpublishedChannelError } from './release';
import { UsagiNsisUpdater } from './engine';
import { Logger } from '../logging/logger';
import { atomicWrite } from '../security/files';
import path from 'node:path';
import type { Fetcher } from '../installer/downloads';
import semver from 'semver';
export class AppUpdates {
  state:AppUpdateState;private engine?:UsagiNsisUpdater;private repository?:ReleaseRepository;private operation?:Promise<void>;private abort?:AbortController;private token?:CancellationToken;
  constructor(private root:string,config:ProductConfig['launcherUpdates'],private adapter:AppAdapter,private log:Logger,private changed:()=>void,private mayInstall:()=>boolean,fetcher?:Fetcher){
    this.state={phase:config.baseUrl&&config.publicKey?'idle':'unconfigured',currentVersion:adapter.version,channel:'stable',message:config.baseUrl&&config.publicKey?'Ready to check for Usagi updates.':'The owner has not configured a signed Usagi update source.'};
    if(config.baseUrl&&config.publicKey){this.repository=new ReleaseRepository(root,config.baseUrl,config.publicKey,fetcher);this.engine=new UsagiNsisUpdater(this.repository,adapter,p=>{this.state.progress=p;this.changed();},config.publisherNames);this.engine.logger={info:m=>log.write(String(m),'app-updates.log'),warn:m=>log.write(String(m),'app-updates.log'),error:m=>log.write(String(m),'app-updates.log')};this.engine.on('error',error=>{if(this.state.phase==='installing'){this.state.phase='error';this.state.error=log.clean(error.message);this.state.message=this.state.error;this.changed();}});}
  }
  private async run(task:()=>Promise<void>){if(this.operation)throw new Error('A Usagi update operation is already running.');if(!this.engine||!this.repository)throw new Error(this.state.message);this.state.error=undefined;const work=task().catch(error=>{this.state.phase='error';this.state.error=this.log.clean(error instanceof Error?error.message:'Usagi update failed.');this.state.message=this.state.error;this.log.write(this.state.error,'app-updates.log');}).finally(()=>{this.operation=undefined;this.state.progress=undefined;this.abort=undefined;this.token=undefined;this.changed();});this.operation=work;this.changed();await work;}
  async check(channel:'stable'|'beta'){
    const downloaded=this.state.phase==='downloaded'?this.state.availableVersion:undefined;
    await this.run(async()=>{
      this.state.channel=channel;this.state.phase='checking';this.state.channelStatus=undefined;this.state.message='Checking signed Usagi releases…';
      this.abort=new AbortController();this.repository!.signal=AbortSignal.any([this.abort.signal,AbortSignal.timeout(30000)]);this.repository!.channel=channel;this.engine!.allowPrerelease=channel==='beta';this.engine!.allowDowngrade=false;
      let result:Awaited<ReturnType<UsagiNsisUpdater['checkForUpdates']>>;
      try{result=await this.engine!.checkForUpdates();}
      catch(error){
        if(!(error instanceof UnpublishedChannelError))throw error;
        this.state.checkedAt=new Date().toISOString();this.state.channelStatus='empty';this.state.availableVersion=undefined;this.state.notes=undefined;this.state.phase='idle';this.state.message=error.message;return;
      }
      this.state.checkedAt=new Date().toISOString();this.state.channelStatus='published';this.state.availableVersion=result?.updateInfo.version;this.state.notes=this.repository!.current?.notes;this.state.phase=result?.isUpdateAvailable?'available':'idle';this.state.message=result?.isUpdateAvailable?'Usagi '+result.updateInfo.version+' is available.':'Usagi is up to date.';
      if(downloaded&&downloaded===this.state.availableVersion){await this.engine!.verifyReady();this.state.phase='downloaded';this.state.message='Usagi is ready to update. Restart when Minecraft and downloads are closed.';}
    });
  }
  async download(){await this.run(async()=>{this.repository!.approved();if(!this.state.availableVersion||!semver.gt(this.state.availableVersion,this.adapter.version))throw new Error('Check for a newer Usagi release first.');this.state.phase='downloading';this.state.message='Downloading the signed Usagi installer…';this.token=new CancellationToken();await this.engine!.downloadUpdate(this.token);await this.engine!.verifyReady();this.state.phase='downloaded';this.state.message='Usagi is ready to update. Restart when Minecraft and downloads are closed.';});}
  selectChannel(channel:'stable'|'beta'){if(this.busy)throw new Error('Finish the Usagi update operation first.');this.state.channel=channel;this.state.availableVersion=undefined;this.state.notes=undefined;this.state.error=undefined;this.state.channelStatus=undefined;if(this.repository){this.repository.channel=channel;this.state.phase='idle';this.state.message='Check the '+channel+' channel for a newer Usagi release.';}this.changed();}
  cancel(){this.abort?.abort();this.token?.cancel();}
  get busy(){return !!this.operation;}
  async settled(){await this.operation;}
  async install(){if(this.state.phase!=='downloaded')throw new Error('Finish downloading the Usagi update first.');await this.run(async()=>{if(!this.adapter.isPackaged)throw new Error('Install launcher updates from the packaged Usagi app.');if(!this.mayInstall())throw new Error('Close Minecraft and finish game downloads or sign-in before updating Usagi.');this.state.phase='installing';this.state.message='Verifying the Usagi installer…';this.changed();await this.engine!.verifyReady();if(!this.mayInstall())throw new Error('Another launcher operation started. Try again after it finishes.');await atomicWrite(path.join(this.root,'last-install-attempt.json'),JSON.stringify({from:this.adapter.version,to:this.state.availableVersion,at:new Date().toISOString()}));this.state.message='Opening the Usagi installer…';this.changed();this.engine!.quitAndInstall(false,true);});}
}
