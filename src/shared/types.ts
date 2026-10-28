export type Page = 'home'|'news'|'updates'|'settings'|'account';
export interface Settings {
  ramMb:number; width:number; height:number; fullscreen:boolean; gameDirectory:string; javaPath:string;
  minimizeOnLaunch:boolean; launchBehavior:'stay'|'minimize'; concurrency:number; notifications:boolean; language:'en';
  manifestUrl:string; manifestPublicKey:string; newsUrl:string; serverHost:string; serverPort:number;
  microsoftClientId:string; optionalFiles:string[]; autoJoin:boolean;
  appUpdateChannel:'stable'|'beta';
}
export interface AppUpdateState {
  phase:'unconfigured'|'idle'|'checking'|'available'|'downloading'|'downloaded'|'installing'|'error';
  currentVersion:string; channel:'stable'|'beta'; availableVersion?:string; notes?:string; checkedAt?:string;
  message:string; error?:string; progress?:Progress;
}
export interface Profile { id:string; name:string; accountId:string; avatar?:string }
export interface Progress { phase:string; file:string; downloaded:number; total:number; speed:number; filesDone:number; filesTotal:number }
export interface ServerStatus { state:'unconfigured'|'checking'|'online'|'offline'; online?:number; max?:number; version?:string; checkedAt?:string; lastSuccess?:string; error?:string }
export interface NewsItem { id:string; title:string; date:string; summary:string; content?:string; url?:string; image?:string }
export interface Snapshot {
  settings:Settings; totalRamMb:number; maxRamMb:number; profiles:Profile[]; selectedAccount?:string; authBusy:boolean;
  deviceCode?:{ code:string; url:string; expiresAt:number }; phase:'idle'|'checking'|'installing'|'updating'|'verifying'|'launching'|'playing';
  authStage?:string; appUpdate?:AppUpdateState;
  installation:'missing'|'repair'|'ready'; installedVersion?:string; availableVersion?:string; updateAvailable?:boolean; verifiedAt?:string;
  progress?:Progress; message:string; error?:string; server:ServerStatus; news:NewsItem[]; newsState:'unconfigured'|'loading'|'ready'|'error'; newsError?:string;
  java?:{ path:string; version:string; major:number }; gameExit?:{ code:number|null; crashed:boolean; at:string }; maximized:boolean;
}
export type Command =
  | {type:'snapshot'} | {type:'settings.save'; settings:Settings} | {type:'directory.choose'} | {type:'java.choose'}
  | {type:'install'} | {type:'verify'} | {type:'updates.check'} | {type:'cancel'} | {type:'launch'}
  | {type:'auth.login';method?:'browser'|'device'} | {type:'auth.cancel'} | {type:'auth.logout'; accountId:string} | {type:'auth.select'; accountId:string}
  | {type:'appUpdates.check'} | {type:'appUpdates.download'} | {type:'appUpdates.cancel'} | {type:'appUpdates.install'}
  | {type:'server.refresh'} | {type:'news.refresh'} | {type:'external.open'; url:string}
  | {type:'folder.open'; folder:'logs'|'game'|'crashes'} | {type:'window'; action:'minimize'|'maximize'|'close'};
export type Response = {ok:true; state?:Snapshot; path?:string} | {ok:false; error:string};
export interface LauncherApi { request(command:Command):Promise<Response>; subscribe(listener:(state:Snapshot)=>void):()=>void }
