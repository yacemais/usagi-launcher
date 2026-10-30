import type {Snapshot} from '../../shared/types';
import {defaultPresencePreferences,presencePreferencesSchema,type PresencePreferences,type PresenceState} from '../../shared/presence';
import type {SocialClient} from '../social/client';
import {PresenceSettings} from './settings';
import {DiscordPresence} from './rpc';
import {buildActivity} from './model';

export interface LauncherPresenceState {preferences:PresencePreferences;status:PresenceState}
export class LauncherPresence {
  state:LauncherPresenceState={preferences:defaultPresencePreferences(),status:{status:'disabled',message:'Discord activity is disabled.'}};
  private readonly store:PresenceSettings;private readonly rpc:DiscordPresence;private scope='launcher';private latest?:Snapshot;private launcherStartedAt=Date.now();private gameStartedAt?:number;private gameRunning=false;private loaded=false;private saving=false;private observing=false;private closed=false;private policy='';private timer:ReturnType<typeof setInterval>;
  constructor(root:string,private readonly changed:()=>void,private readonly social:()=>SocialClient|undefined,private readonly assets:{largeImage?:string;eventKeys?:string[]}={},rpcOptions?:ConstructorParameters<typeof DiscordPresence>[1]) {
    this.store=new PresenceSettings(root);this.rpc=new DiscordPresence(status=>{this.state.status=status;this.changed();},rpcOptions);
    this.timer=setInterval(()=>{if(this.latest)this.observe(this.latest);},1000);this.timer.unref();
  }
  async initialise():Promise<void> {try {await this.store.load();} catch {this.state.status={status:'disabled',message:'Discord privacy settings could not be loaded. Save them again before enabling activity.'};}this.loaded=true;if(this.latest)this.observe(this.latest);}
  private accountScope(snapshot:Snapshot):string {const uuid=snapshot.profiles.find(profile=>profile.accountId===snapshot.selectedAccount)?.id.replaceAll('-','').toLowerCase();return uuid && /^[a-f0-9]{32}$/.test(uuid) ? uuid : 'launcher';}
  observe(snapshot:Snapshot):void {
    this.latest=snapshot;if(!this.loaded || this.closed || this.saving || this.observing)return;this.observing=true;try {
    const uuid=snapshot.profiles.find(profile=>profile.accountId===snapshot.selectedAccount)?.id.replaceAll('-','').toLowerCase();
    const next=this.accountScope(snapshot);
    if (next!==this.scope) {this.scope=next;this.rpc.update(null);this.launcherStartedAt=Date.now();this.gameStartedAt=undefined;this.gameRunning=false;}
    if(snapshot.phase==='playing' && !this.gameRunning)this.gameStartedAt=Date.now();this.gameRunning=snapshot.phase==='playing';
    const local=this.store.get(this.scope);const changed=JSON.stringify(local)!==JSON.stringify(this.state.preferences);this.state.preferences=local;
    const source=snapshot.social;const connected=source?.status==='connected';const remote=connected ? source.data?.preferences.presence ?? defaultPresencePreferences() : undefined;
    const effective=remote ? Object.fromEntries(Object.entries(local).map(([key,value])=>[key,value && remote[key as keyof PresencePreferences]])) as PresencePreferences : local;
    const event=source?.activity?.event;const policy=JSON.stringify({effective,visible:source?.data?.preferences.visibility,permitted:source?.presencePermitted,fresh:connected && Boolean(source.activity && source.activity.expiresAt>Date.now()),names:source?.activity?.playerNames,event:event && event.startsAt<=Date.now() && Date.now()<event.endsAt ? event.id : null});if(this.policy && this.policy!==policy)this.rpc.update(null);this.policy=policy;
    const activity=buildActivity({preferences:effective,accountUuid:uuid,gameRunning:this.gameRunning,gameStartedAt:this.gameStartedAt,launcherStartedAt:this.launcherStartedAt,observation:connected ? source.activity : null,now:Date.now(),visible:source?.data?.preferences.visibility!=='invisible',permitted:source?.status==='unconfigured' || !source ? true : connected && source.presencePermitted===true && (!source.presencePolicyExpiresAt || source.presencePolicyExpiresAt>Date.now()),largeImage:this.assets.largeImage || undefined,eventAssets:this.assets.eventKeys});
    this.rpc.update(activity);if(changed)this.changed();
    } finally {this.observing=false;}
  }
  async configure(input:PresencePreferences):Promise<void> {
    const preferences=presencePreferencesSchema.parse(input);if(this.closed)throw new Error('The Launcher is closing.');
    if(this.saving)throw new Error('Discord privacy settings are already being saved.');this.saving=true;
    const scope=this.scope;
    try {
      this.rpc.update(null);
      await this.store.save(scope,preferences);
      if(scope!==(this.latest ? this.accountScope(this.latest) : this.scope))throw new Error('The account changed. Save Discord privacy settings again for this account.');
      const social=this.social();if(social?.state.status==='connected' && social.state.data) {try {await social.action({op:'preferences',...social.state.data.preferences,presence:preferences});}catch {throw new Error('Saved on this device. Your Usagi profile could not be updated; reconnect to Social and save again.');}}
    } finally {this.saving=false;if(this.latest)this.observe(this.latest);this.changed();}
  }
  close():void {this.closed=true;clearInterval(this.timer);this.rpc.close();}
}
