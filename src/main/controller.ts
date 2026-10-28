import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { ChildProcess } from 'node:child_process';
import type { Snapshot, Settings, Progress } from '../shared/types';
import { SettingsStore, maxRamMb, totalRamMb } from './settings/store';
import { Accounts, type Protection } from './authentication/accounts';
import { Logger } from './logging/logger';
import { MinecraftRuntime } from './minecraft/runtime';
import { PackUpdater } from './updater/updater';
import { queryServer } from './server/status';
import { fetchNews } from './server/news';
import { inspectJava } from './minecraft/java';
import { exists } from './security/files';
import { emptyProduct,type ProductConfig } from './config/product';
export class Controller {
  readonly settings:SettingsStore; readonly log:Logger; readonly accounts:Accounts; readonly runtime:MinecraftRuntime;
  state:Snapshot; private abort?:AbortController; private child?:ChildProcess; private lastBroadcast=0; private pendingBroadcast?:ReturnType<typeof setTimeout>; private operation?:Promise<void>;
  constructor(public root:string,protection:Protection,private broadcast:(state:Snapshot)=>void,avatar:(url:string)=>Promise<string|undefined>,openBrowser?:(url:string)=>Promise<void>,private product:ProductConfig=emptyProduct) {
    this.settings=new SettingsStore(root);this.log=new Logger(path.join(root,'logs'));
    this.state={settings:this.settings.value,totalRamMb,maxRamMb,profiles:[],authBusy:false,phase:'checking',installation:'missing',message:'Checking your launcher…',server:{state:'unconfigured'},news:[],newsState:'unconfigured',maximized:false};
    this.accounts=new Accounts(root,protection,this.log,()=>this.emit(),avatar,openBrowser);
    this.runtime=new MinecraftRuntime(path.join(root,'runtime'),this.log,p=>this.progress(p));
  }
  snapshot() { return structuredClone({...this.state,settings:this.settings.value,profiles:this.accounts.profiles,selectedAccount:this.accounts.selected,authBusy:this.accounts.busy,authStage:this.accounts.stage,deviceCode:this.accounts.deviceCode}); }
  emit(force=false) { if(force || Date.now()-this.lastBroadcast>100) { this.lastBroadcast=Date.now();this.broadcast(this.snapshot()); } else if(!this.pendingBroadcast) this.pendingBroadcast=setTimeout(()=>{this.pendingBroadcast=undefined;this.emit(true);},100); }
  private progress(progress:Progress) {this.state.progress=progress;this.state.message=progress.phase;this.emit();}
  private updater() { return new PackUpdater(this.settings.value.gameDirectory,p=>this.progress(p)); }
  async initialise() {
    try {await this.settings.load();const s=this.settings.value,p=this.product;if(p.microsoftClientId)s.microsoftClientId=p.microsoftClientId;s.manifestUrl ||=p.modpack.manifestUrl;s.manifestPublicKey ||=p.modpack.publicKey;s.newsUrl ||=p.newsUrl;if(!s.serverHost&&p.server.host){s.serverHost=p.server.host;s.serverPort=p.server.port;}this.settings.validate(s);await this.accounts.configure(s.microsoftClientId);await this.verifyInternal();if(this.state.installation==='ready')this.state.message='Celestia SMP is ready.';}
    catch(error) {this.failure(error);}
    finally {this.state.phase='idle';this.emit(true);void this.refreshServer();void this.refreshNews();if(this.state.installation==='ready' && this.settings.value.manifestUrl)void this.checkUpdates().catch(error=>this.log.write('Automatic update check could not start: '+this.log.clean(String(error))));}
  }
  private failure(error:unknown) { const message=this.log.clean(error instanceof Error?error.message:'The operation could not finish.');this.state.error=message;this.state.message=message;this.log.write('Operation failed: '+message); }
  async save(settings:Settings) {
    if(this.state.phase!=='idle' || this.accounts.busy) throw new Error('Finish the current operation before changing settings.');
    if(this.product.microsoftClientId&&settings.microsoftClientId!==this.product.microsoftClientId)throw new Error('This Usagi build uses its bundled Microsoft application registration.');
    await this.settings.save(settings);await this.accounts.configure(settings.microsoftClientId);this.state.error=undefined;this.state.installation='missing';this.state.availableVersion=undefined;this.state.updateAvailable=undefined;await this.verify();void this.refreshServer();void this.refreshNews();
  }
  private async verifyInternal(signal?:AbortSignal) {
    this.state.installation='repair'; const core=await this.runtime.verify(signal); const s=this.settings.value;
    if(!core) {const installed=await exists(path.join(this.root,'runtime/runtime-receipt.json'));this.state.installation=installed?'repair':'missing';this.state.message=installed?'Required runtime files are missing or changed. Repair before playing.':'Install the required game files to get started.';return;}
    if(!s.manifestPublicKey) {this.state.installation='missing';this.state.message='Minecraft is installed. Configure a signed modpack source to continue.';return;}
    const pack=await this.updater().verify(s.manifestPublicKey,s.optionalFiles);this.state.installedVersion=pack.version;this.state.installation=pack.ready?'ready':'repair';
    if(pack.reason)this.state.message=pack.reason;this.state.verifiedAt=new Date().toISOString();
    try {this.state.java=await inspectJava(s.javaPath || path.join(this.runtime.javaRoot,'bin/java.exe'));}catch{this.state.installation='repair';}
  }
  private async run(phase:Snapshot['phase'],task:(signal:AbortSignal)=>Promise<void>) {
    if(this.state.phase!=='idle' || this.operation || this.child || this.accounts.busy || this.state.appUpdate?.phase==='installing') throw new Error('Another launcher operation is in progress.');
    this.abort=new AbortController();this.state.phase=phase;this.state.error=undefined;this.state.progress=undefined;this.emit(true);
    const work=(async()=>{try{await task(this.abort!.signal);}catch(error){if(this.abort?.signal.aborted){this.state.message='Operation cancelled safely.';this.log.write('Operation cancelled.');}else this.failure(error);}finally{if(this.state.phase!=='playing')this.state.phase='idle';this.state.progress=undefined;this.abort=undefined;this.emit(true);}})();
    this.operation=work;try{await work;}finally{this.operation=undefined;}
  }
  async verify() {await this.run('verifying',async signal=>{this.state.message='Verifying required game and modpack files…';await this.verifyInternal(signal);if(this.state.installation==='ready')this.state.message='All required files verified.';});}
  async checkUpdates() {await this.run('checking',async signal=>{const s=this.settings.value;if(!s.manifestUrl || !s.manifestPublicKey)throw new Error('Add your signed manifest URL and Ed25519 public key in Settings.');const result=await this.updater().check(s.manifestUrl,s.manifestPublicKey,signal);this.state.availableVersion=result.manifest.version;this.state.updateAvailable=result.updateAvailable;this.state.message=result.updateAvailable?'Modpack '+result.manifest.version+' is available.':'You have the current modpack version.';});}
  async install() {await this.run('installing',async signal=>{
    await this.settings.prepareGame();const s=this.settings.value;await this.updater().recover();
    this.state.installation='repair';this.state.java=await this.runtime.install(s,signal);
    if(!s.manifestUrl || !s.manifestPublicKey) {this.state.installation='missing';this.state.message='Minecraft, Forge and Java are installed. Add a signed modpack source in Settings.';return;}
    this.state.phase='updating';const result=await this.updater().check(s.manifestUrl,s.manifestPublicKey,signal);this.state.availableVersion=result.manifest.version;
    await this.updater().update(result.manifest,result.envelope,s.optionalFiles,signal,s.concurrency);await this.verifyInternal(signal);
    if(this.snapshot().installation!=='ready')throw new Error('Installation verification did not pass. Use Repair before playing.');this.state.updateAvailable=false;this.state.message='Celestia SMP is installed and verified.';
  });}
  cancel() {this.abort?.abort(new Error('Cancelled by user.'));}
  async settled() {await this.operation;}
  async launch(onStarted:()=>void) {
    await this.run('launching',async signal=>{
      this.state.message='Verifying your installation before launch…';await this.verifyInternal(signal);if(this.state.installation!=='ready')throw new Error('Required files are missing or changed. Install or repair before playing.');
      if(this.state.updateAvailable || this.state.availableVersion && this.state.availableVersion!==this.state.installedVersion)throw new Error('A signed modpack update is available. Install the update before playing.');
      this.state.message='Refreshing your Microsoft session and Java entitlement…';this.emit(true);const session=await this.accounts.session();signal.throwIfAborted();
      const child=await this.runtime.launch(this.settings.value,session);this.child=child;
      child.stdout?.on('data',b=>this.log.write(String(b),'game.log'));child.stderr?.on('data',b=>this.log.write(String(b),'game.log'));
      this.state.phase='playing';this.state.message='Minecraft is running.';onStarted();this.emit(true);
      let ended=false;const finish=(code:number|null)=>{if(ended)return;ended=true;this.child=undefined;this.state.phase='idle';this.state.gameExit={code,crashed:code!==0,at:new Date().toISOString()};this.state.message=code===0?'Minecraft closed. Welcome back.':'Minecraft stopped unexpectedly. Open the game log for details.';this.log.write('Minecraft exited with code '+code);this.emit(true);};
      child.once('exit',finish);child.once('error',()=>finish(null));
      if(child.exitCode!==null || child.signalCode!==null)finish(child.exitCode);
    });
  }
  async refreshServer() { const {serverHost,serverPort}=this.settings.value;const last=this.state.server.lastSuccess;this.state.server={...this.state.server,state:serverHost?'checking':'unconfigured'};this.emit();try{const result=await queryServer(serverHost,serverPort);if(serverHost!==this.settings.value.serverHost || serverPort!==this.settings.value.serverPort)return;this.state.server={...result,lastSuccess:result.lastSuccess ?? last};}catch{this.state.server={state:'offline',error:'Status lookup failed.',lastSuccess:last};}this.emit(true); }
  async refreshNews() {const url=this.settings.value.newsUrl;if(!url){this.state.news=[];this.state.newsState='unconfigured';this.emit();return;}this.state.newsState='loading';this.emit();try{const news=await fetchNews(url);if(url!==this.settings.value.newsUrl)return;this.state.news=news;this.state.newsState='ready';this.state.newsError=undefined;}catch(error){this.state.newsState='error';this.state.newsError=error instanceof Error?error.message:'Announcements could not load.';}this.emit(true);}
  async folder(folder:'game'|'logs'|'crashes') {const target=folder==='logs'?this.log.directory:folder==='game'?this.settings.value.gameDirectory:path.join(this.settings.value.gameDirectory,'crash-reports');await fs.mkdir(target,{recursive:true});return target;}
}
