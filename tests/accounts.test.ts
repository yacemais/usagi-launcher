import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const fixture=vi.hoisted(()=>({owned:true,accounts:[{homeAccountId:'fixture-account'}],silent:0,removed:0,deviceGate:undefined as Promise<void>|undefined}));
vi.mock('@azure/msal-node',()=>({PublicClientApplication:class {
  getTokenCache(){return {serialize:()=>JSON.stringify({fixture:'mock-token'}),deserialize:()=>{},getAllAccounts:async()=>fixture.accounts,removeAccount:async()=>{fixture.removed++;fixture.accounts=[];}};}
  async acquireTokenByDeviceCode(){await fixture.deviceGate;return {accessToken:'fixture-microsoft-token',account:{homeAccountId:'fixture-account'}};}
  async acquireTokenSilent(){fixture.silent++;return {accessToken:'fixture-refresh-token',account:{homeAccountId:'fixture-account'}};}
}}));
vi.mock('@xmcl/user',()=>({MicrosoftAuthenticator:class {
  async authenticateXboxLive(){return {Token:'fixture-xbl-token'};}
  async authorizeXboxLive(){return {Token:'fixture-xsts-token',DisplayClaims:{xui:[{uhs:'fixture-hash'}]}};}
  async loginMinecraftWithXBox(){return {access_token:'fixture-minecraft-token'};}
},MojangClient:class {
  async checkGameOwnership(){return {items:fixture.owned?[{name:'game_minecraft'}]:[]};}
  async getProfile(){return {id:'00112233445566778899aabbccddeeff',name:'FixturePlayer'};}
}}));
import { Accounts } from '../src/main/authentication/accounts';
import { Logger } from '../src/main/logging/logger';
let root:string;
// Test-only protection and mocked services; actual Windows safeStorage is checked by Electron GUI tests.
const protection={available:()=>true,encrypt:(s:string)=>Buffer.from(s),decrypt:(b:Buffer)=>b.toString()};
const accounts=()=>new Accounts(root,protection,new Logger(path.join(root,'logs')),()=>{});
beforeEach(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'Celestia account fixture '));fixture.owned=true;fixture.accounts=[{homeAccountId:'fixture-account'}];fixture.silent=0;fixture.removed=0;});
afterEach(async()=>{await fs.rm(root,{recursive:true,force:true});});
describe('account orchestration using explicit service mocks',()=>{
  it('blocks a new sign-in while logout is durably removing the selected account',async()=>{let release:()=>void=()=>{};let gate:Promise<void>|undefined;const p={...protection,encrypt:async(s:string)=>{await gate;return Buffer.from(s);}};const a=new Accounts(root,p,new Logger(root),()=>{});await a.configure('fixture-client-id');await a.login('device');gate=new Promise<void>(resolve=>{release=resolve;});const work=a.logout('fixture-account');await expect(a.login('device')).rejects.toThrow(/progress/);release();await work;expect(a.profiles).toEqual([]);expect(a.busy).toBe(false);});
  it('waits for a cancelled sign-in to settle and rejects its late token',async()=>{const a=accounts();await a.configure('fixture-client-id');let finish:()=>void=()=>{};fixture.deviceGate=new Promise<void>(resolve=>{finish=resolve;});const work=a.login('device');a.cancel();await expect(a.login('device')).rejects.toThrow(/progress/);finish();await work;fixture.deviceGate=undefined;expect(a.busy).toBe(false);expect(a.profiles).toEqual([]);await expect(fs.stat(path.join(root,'accounts.protected'))).rejects.toThrow();});
  it('does not publish an account if protected storage fails',async()=>{const a=new Accounts(root,{...protection,encrypt:()=>{throw new Error('fixture storage failure');}},new Logger(root),()=>{});await a.configure('fixture-client-id');await expect(a.login('device')).rejects.toThrow();expect(a.profiles).toEqual([]);expect(a.selected).toBeUndefined();});
  it('refuses sign-in without a configured application ID',async()=>{await expect(accounts().login('device')).rejects.toThrow(/client ID/);});
  it('rejects missing Java entitlement without persisting an account',async()=>{const a=accounts();await a.configure('fixture-client-id');fixture.owned=false;await expect(a.login('device')).rejects.toThrow(/does not own Minecraft Java/);expect(a.profiles).toEqual([]);await expect(fs.stat(path.join(root,'accounts.protected'))).rejects.toThrow();expect(a.busy).toBe(false);});
  it('refreshes and rechecks ownership before a launch session',async()=>{const a=accounts();await a.configure('fixture-client-id');await a.login('device');expect((await a.session()).profile.name).toBe('FixturePlayer');expect(fixture.silent).toBe(1);fixture.owned=false;await expect(a.session()).rejects.toThrow(/does not own/);});
  it('restores saved profiles and removes the selected account on logout',async()=>{const a=accounts();await a.configure('fixture-client-id');await a.login('device');const b=accounts();await b.configure('fixture-client-id');expect(b.profiles).toHaveLength(1);await b.logout('fixture-account');expect(b.profiles).toEqual([]);expect(b.selected).toBeUndefined();expect(fixture.removed).toBe(1);const restarted=accounts();await restarted.configure('fixture-client-id');expect(restarted.selected).toBeUndefined();expect(restarted.profiles).toEqual([]);});
  it('will not sign in without credential protection',async()=>{const a=new Accounts(root,{...protection,available:()=>false},new Logger(root),()=>{});await a.configure('fixture-client-id');await expect(a.login('device')).rejects.toThrow(/protection/);});
  it('rejects selecting an unknown account and never supplies an offline identity',async()=>{const a=accounts();await a.configure('fixture-client-id');await expect(a.select('forged-account')).rejects.toThrow(/Unknown account/);await expect(a.session()).rejects.toThrow(/Sign in/);});
});
