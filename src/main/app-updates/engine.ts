import { NsisUpdater,type UpdateInfo } from 'electron-updater';
import type { AppAdapter } from 'electron-updater/out/AppAdapter';
import { Provider } from 'electron-updater/out/providers/Provider';
import type { DownloadUpdateOptions } from 'electron-updater/out/AppUpdater';
import type { Progress } from '../../shared/types';
import { promises as fs } from 'node:fs';
import { hashFile } from '../security/files';
import { Downloads } from '../installer/downloads';
import { ReleaseRepository,type AppRelease } from './release';
function info(release:AppRelease):UpdateInfo{return {version:release.version,releaseDate:release.publishedAt,releaseNotes:release.notes,path:new URL(release.installer.url).pathname.split('/').at(-1)!,sha512:release.installer.sha512,files:[{url:release.installer.url,sha512:release.installer.sha512,size:release.installer.size}]};}
class ApprovedProvider extends Provider<UpdateInfo>{
  constructor(private release:AppRelease){super({platform:'win32',isUseMultipleRangeRequest:false,executor:null!});}
  async getLatestVersion(){return info(this.release);}
  resolveFiles(){const value=info(this.release);return [{url:new URL(this.release.installer.url),info:value.files[0]}];}
}
export class UsagiNsisUpdater extends NsisUpdater {
  constructor(private repository:ReleaseRepository,adapter:AppAdapter,private report:(p:Progress)=>void,private publishers:string[]){super(null,adapter);this.autoDownload=false;this.autoInstallOnAppQuit=false;this.disableDifferentialDownload=true;this.disableWebInstaller=true;this.allowDowngrade=false;this.forceDevUpdateConfig=true;}
  protected async getUpdateInfoAndProvider(){const release=await this.repository.check();const provider=new ApprovedProvider(release);return {info:await provider.getLatestVersion(),provider};}
  protected async doDownloadUpdate(options:DownloadUpdateOptions){
    await this.repository.guard(this.app.baseCachePath+'/cache/pending/guard');
    const release=this.repository.approved();if(release.version!==options.updateInfoAndProvider.info.version)throw new Error('Launcher update changed. Check again.');
    const fileInfo=new ApprovedProvider(release).resolveFiles()[0];
    return this.executeDownload({fileExtension:'exe',fileInfo,downloadUpdateOptions:options,task:async destination=>{
      const abort=new AbortController(),cancel=()=>abort.abort(new Error('Launcher download cancelled.'));options.cancellationToken.once('cancel',cancel);if(options.cancellationToken.cancelled)cancel();
      try{await new Downloads(this.report,file=>this.repository.guard(file),this.repository.fetcher).run([{path:destination,urls:[release.installer.url],size:release.installer.size,checksum:{algorithm:'sha512',value:Buffer.from(release.installer.sha512,'base64').toString('hex')}}],abort.signal,1,'Downloading Usagi');
        if(this.publishers.length){const failure=await this.verifyUpdateCodeSignature(this.publishers,destination);if(failure)throw new Error('Windows publisher verification failed.');}
      }finally{options.cancellationToken.off('cancel',cancel);}
    }});
  }
  async verifyReady(){const release=this.repository.approved(),file=this.installerPath;if(!file)throw new Error('Download a launcher update first.');await this.repository.guard(file);if((await fs.stat(file)).size!==release.installer.size||Buffer.from(await hashFile(file,'sha512'),'hex').toString('base64')!==release.installer.sha512)throw new Error('Cached launcher installer is corrupt. Download it again.');if(this.publishers.length){const failure=await this.verifyUpdateCodeSignature(this.publishers,file);if(failure)throw new Error('Windows publisher verification failed.');}return file;}
}
