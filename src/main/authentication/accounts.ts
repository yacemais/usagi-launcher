import path from 'node:path';
import { promises as fs } from 'node:fs';
import { PublicClientApplication, type DeviceCodeRequest, type AuthenticationResult } from '@azure/msal-node';
import { MicrosoftAuthenticator, MojangClient } from '@xmcl/user';
import type { Profile, Snapshot } from '../../shared/types';
import { atomicWrite, exists } from '../security/files';
import { Logger } from '../logging/logger';
import { browserLogin,scopes } from './browser';
import { MinecraftAuthError } from './errors';
export interface Protection {available():boolean|Promise<boolean>;encrypt(value:string):Buffer|Promise<Buffer>;decrypt(value:Buffer):string|Promise<string>}
export interface MinecraftSession { profile:Profile; token:string }
export class OwnershipError extends Error {
  constructor() { super('This account does not own Minecraft Java. Sign in with an account that owns the Java Edition.'); }
}
class CredentialProtectionError extends Error{constructor(){super('Windows credential protection is unavailable. Sign-in cannot be saved securely.');}}
export class Accounts {
  profiles:Profile[]=[]; selected?:string; busy=false; stage?:string; deviceCode?:Snapshot['deviceCode'];
  private client?:PublicClientApplication; private controller?:AbortController; private serial=0;
  private clientId='';
  constructor(private root:string,private protection:Protection,private log:Logger,private changed:()=>void,private avatar:(url:string)=>Promise<string|undefined>=async()=>undefined,private openBrowser:(url:string)=>Promise<void>=async()=>{throw new Error('System browser is unavailable.');}) {}
  private get file() { return path.join(this.root,'accounts.protected'); }
  async configure(clientId:string) {
    if(this.busy) throw new Error('Finish or cancel sign-in before changing account configuration.');
    if(this.clientId===clientId && this.client) return; this.clientId=clientId; this.profiles=[]; this.selected=undefined; this.client=undefined;
    if(!clientId) return;
    this.client=this.createClient();
    if(await exists(this.file)) {
      if(!await this.protection.available()) throw new Error('Windows credential protection is unavailable.');
      const saved=JSON.parse(await this.protection.decrypt(await fs.readFile(this.file))) as {clientId:string;cache:string;profiles:Profile[];selected?:string};
      if(saved.clientId===clientId) { this.client.getTokenCache().deserialize(saved.cache); this.profiles=saved.profiles.map(p=>({id:p.id,name:p.name,accountId:p.accountId,avatar:p.avatar})); this.selected=saved.selected; }
    }
  }
  private createClient(signal?:AbortSignal){return new PublicClientApplication({auth:{clientId:this.clientId,authority:'https://login.microsoftonline.com/consumers'},system:{loggerOptions:{piiLoggingEnabled:false,loggerCallback:()=>{}},networkClient:{sendGetRequestAsync:async <T>(url:string,options?:{headers?:Record<string,string>})=>this.microsoftRequest<T>(url,'GET',options,signal),sendPostRequestAsync:async <T>(url:string,options?:{headers?:Record<string,string>;body?:string})=>this.microsoftRequest<T>(url,'POST',options,signal)}}});}
  private async microsoftRequest<T>(url:string,method:string,options?:{headers?:Record<string,string>;body?:string},signal?:AbortSignal) {
    const u=new URL(url); if(u.protocol!=='https:' || !['login.microsoftonline.com','login.live.com'].includes(u.hostname)) throw new Error('Unexpected Microsoft authentication endpoint.');
    const response=await fetch(u,{method,headers:options?.headers,body:options?.body,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000),redirect:'error'});
    return {headers:Object.fromEntries(response.headers),status:response.status,body:await response.json() as T};
  }
  private async save(client=this.client,profiles=this.profiles,selection:{selected?:string}={selected:this.selected}) {
    if(!client || !await this.protection.available()) throw new CredentialProtectionError();
    await atomicWrite(this.file,await this.protection.encrypt(JSON.stringify({clientId:this.clientId,cache:client.getTokenCache().serialize(),profiles,selected:selection.selected})));
  }
  cancel() {this.serial++;this.controller?.abort();this.stage=this.controller?'Cancelling sign-in':undefined;this.deviceCode=undefined;this.changed();}
  async login(method:'browser'|'device'='browser') {
    if(!this.client) throw new Error('Add your Microsoft public application client ID in Settings before signing in.');
    if(this.busy) throw new Error('Sign-in is already in progress.');
    const serial=++this.serial; this.busy=true; const controller=new AbortController();this.controller=controller;this.stage=method==='browser'?'Waiting for your browser':'Requesting a Microsoft device code';this.changed();
    let deviceRequest:DeviceCodeRequest|undefined;const stopDevice=()=>{if(deviceRequest)deviceRequest.cancel=true;};controller.signal.addEventListener('abort',stopDevice,{once:true});
    try {
      if(!await this.protection.available())throw new CredentialProtectionError();controller.signal.throwIfAborted();
      const client=this.createClient(controller.signal);client.getTokenCache().deserialize(this.client.getTokenCache().serialize());
      const request:DeviceCodeRequest={scopes,timeout:900,deviceCodeCallback:code=>{
        if(serial!==this.serial) return; this.deviceCode={code:code.userCode,url:code.verificationUri,expiresAt:Date.now()+code.expiresIn*1000}; this.changed();
      }};
      deviceRequest=request;
      const result=method==='browser'?await browserLogin(client,this.openBrowser,controller.signal):await client.acquireTokenByDeviceCode(request); if(!result || serial!==this.serial) throw new Error('Sign-in cancelled.');
      const session=await this.minecraft(result,controller.signal,serial); if(serial!==this.serial) throw new Error('Sign-in cancelled.');
      const profiles=[...this.profiles.filter(p=>p.accountId!==session.profile.accountId),session.profile];await this.save(client,profiles,{selected:session.profile.accountId});if(serial!==this.serial){await this.save();throw new Error('Sign-in cancelled.');}this.client=client;this.profiles=profiles;this.selected=session.profile.accountId;
    } catch(error) { if(serial===this.serial) { if(error instanceof OwnershipError || error instanceof MinecraftAuthError || error instanceof CredentialProtectionError)throw error;const code=String((error as {errorCode?:string}).errorCode || '');if(/invalid_client|unauthorized_client|invalid_scope/.test(code))throw new Error('Microsoft rejected the Usagi application registration. Check its client ID, personal-account support, public-client permissions, redirect URI and Minecraft API approval.');if(error instanceof Error && /declined|timed out|cancelled/.test(error.message))throw new Error(error.message);throw new Error('Microsoft sign-in could not finish. Check your connection and Usagi’s application registration, then try again.'); } }
    finally {controller.signal.removeEventListener('abort',stopDevice);if(this.controller===controller) { this.busy=false;this.stage=undefined; this.deviceCode=undefined; this.controller=undefined; this.changed(); } }
  }
  async session():Promise<MinecraftSession> {
    if(this.busy)throw new Error('Finish or cancel sign-in before launching.');
    return this.changeAccount('Refreshing your Microsoft session',async()=>{
    if(!this.client || !this.selected) throw new Error('Sign in with a Microsoft account that owns Minecraft Java.');
    const account=(await this.client.getTokenCache().getAllAccounts()).find(a=>a.homeAccountId===this.selected); if(!account) throw new Error('Your account needs to sign in again.');
    let result:AuthenticationResult;
    try { result=await this.client.acquireTokenSilent({account,scopes:['XboxLive.signin','offline_access']}); }
    catch { throw new Error('Your Microsoft session needs to be renewed. Sign in again.'); }
    const session=await this.minecraft(result);const profiles=this.profiles.map(p=>p.accountId===session.profile.accountId?session.profile:p);await this.save(this.client,profiles);this.profiles=profiles;return session;
    });
  }
  private async minecraft(result:AuthenticationResult,signal:AbortSignal=AbortSignal.timeout(45000),serial?:number):Promise<MinecraftSession> {
    const step=async <T>(label:string,work:()=>Promise<T>)=>{if(serial===this.serial){this.stage=label;this.changed();}try{const result=await work();this.log.write(label+': completed.','authentication.log');return result;}catch(error){signal.throwIfAborted();const failure=new MinecraftAuthError(label,error);this.log.write(failure.message,'authentication.log');throw failure;}};
    this.log.secret(result.accessToken);
    const auth=new MicrosoftAuthenticator(); const xbl=await step('Signing in to Xbox Live',()=>auth.authenticateXboxLive(result.accessToken,signal)); this.log.secret(xbl.Token);
    const xsts=await step('Authorizing Minecraft with Xbox',()=>auth.authorizeXboxLive(xbl.Token,'rp://api.minecraftservices.com/',signal)); this.log.secret(xsts.Token);
    const token=await step('Getting a Minecraft session',()=>auth.loginMinecraftWithXBox(xsts.DisplayClaims.xui[0].uhs,xsts.Token,signal)); this.log.secret(token.access_token);
    const client=new MojangClient(); const ownership=await step('Checking Minecraft Java ownership',()=>client.checkGameOwnership(token.access_token,signal));
    if(!ownership.items.some(i=>i.name==='game_minecraft' || i.name==='product_minecraft')) throw new OwnershipError();
    const profile=await step('Loading your Minecraft profile',()=>client.getProfile(token.access_token,signal)); if(!/^[a-f0-9]{32}$/i.test(profile.id) || !/^[A-Za-z0-9_]{1,16}$/.test(profile.name) || !result.account) throw new Error('Minecraft profile is unavailable.');
    const skin=(profile as {skins?:{url:string;state:string}[]}).skins?.find(s=>s.state==='ACTIVE')?.url;
    return {token:token.access_token,profile:{id:profile.id,name:profile.name,accountId:result.account.homeAccountId,avatar:skin?await this.avatar(skin).catch(()=>undefined):undefined}};
  }
  private async changeAccount<T>(stage:string,work:()=>Promise<T>):Promise<T>{if(this.busy)throw new Error('Finish the current account operation first.');this.busy=true;this.stage=stage;this.changed();try{return await work();}finally{this.busy=false;this.stage=undefined;this.changed();}}
  async select(id:string){if(!this.profiles.some(p=>p.accountId===id))throw new Error('Unknown account.');await this.changeAccount('Selecting account',async()=>{await this.save(this.client,this.profiles,{selected:id});this.selected=id;});}
  async logout(id:string){if(!this.client)return;if(!this.profiles.some(p=>p.accountId===id))throw new Error('Unknown account.');await this.changeAccount('Signing out',async()=>{const client=this.createClient();client.getTokenCache().deserialize(this.client!.getTokenCache().serialize());const account=(await client.getTokenCache().getAllAccounts()).find(a=>a.homeAccountId===id);if(account)await client.getTokenCache().removeAccount(account);const profiles=this.profiles.filter(p=>p.accountId!==id),selected=this.selected===id?profiles[0]?.accountId:this.selected;await this.save(client,profiles,{selected});this.client=client;this.profiles=profiles;this.selected=selected;});}
}
