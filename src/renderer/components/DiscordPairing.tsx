import {useEffect,useRef,useState} from 'react';
import type {Snapshot} from '../../shared/types';
import type {PairingAction,PairingResult} from '../../shared/pairing';
import type {Request} from './ui';

export function DiscordPairing({state,request}:{state:Snapshot;request:Request}) {
  const [pair,setPair]=useState<PairingResult>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[now,setNow]=useState(Date.now());
  const scope=state.selectedAccount,scopeRef=useRef(scope),flight=useRef(false);
  scopeRef.current=scope;
  useEffect(()=>{setPair(undefined);setError('');},[scope]);
  const connected=state.social?.status==='connected';
  const selected=state.profiles.find(profile=>profile.accountId===scope);
  async function perform(action:PairingAction) {
    if(flight.current)return;flight.current=true;setBusy(true);setError('');const account=scope;
    try {
      const result=await request({type:'discord.pairing',action});
      if(scopeRef.current!==account)return;
      if(!result.ok){setError(result.error);return;}
      if(result.pairing)setPair(previous=>({...result.pairing!,...(action.op!=='begin'&&previous?.code ? {code:previous.code} : {})}));
    } catch {if(scopeRef.current===account)setError('Account linking is unavailable. Refresh its status before retrying.');}
    finally {flight.current=false;setBusy(false);}
  }
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const active=pair && ['pending','claimed'].includes(pair.state);
  const expired=Boolean(active && now>=pair!.expiresAt),pending=active && !expired ? pair : undefined;
  useEffect(()=>{
    if(!connected || !pending || error)return;
    const timer=setInterval(()=>{void perform({op:'status',id:pending.id});},3000);
    return()=>clearInterval(timer);
  },[connected,pending?.id,pending?.state,error,scope]);
  const locked=!connected || busy || state.authBusy || !selected;
  return <section className="settings-section" aria-label="Discord account linking"><div className="settings-section-heading"><h2>Link Discord</h2><p>Connect Discord to your verified Minecraft account. Confirm the Discord account here before the link is saved.</p></div><div className="settings-fields">
    <p>Selected Minecraft account: <strong>{selected?.name ?? 'Sign in first'}</strong></p>
    {!connected && <p>Connect to Usagi Social with your Minecraft account to generate a code.</p>}
    {!connected && <button className="secondary-button" disabled={busy || state.authBusy || !selected} onClick={()=>void request({type:'social.connect'})}>Connect to Usagi Social</button>}
    {pending && <><p>In the Usagi Discord server, enter <code>/link claim code:{pending.code}</code>. Keep this code private.</p><p>Expires at {new Date(pending.expiresAt).toLocaleTimeString()}.</p>
      {pending.state==='claimed' && pending.discordId && <><p>Discord account ID: <strong>{pending.discordId}</strong>. Confirm only if this is your Discord account and you entered the code yourself.</p><button className="primary-button" disabled={locked} onClick={()=>void perform({op:'approve',id:pending.id,discordId:pending.discordId!})}>Confirm Discord account {pending.discordId}</button></>}
      <div className="button-row"><button className="secondary-button" disabled={locked} onClick={()=>void perform({op:'status',id:pending.id})}>Refresh link status</button><button className="secondary-button" disabled={locked} onClick={()=>void perform({op:'cancel',id:pending.id})}>Cancel linking</button></div></>}
    {pair?.state==='linked' && <p role="status">Discord account {pair.discordId} is linked. Use /link status or /link unlink in Discord to manage this link.</p>}
    {expired && <p role="status">This code expired. Generate a new one.</p>}
    {pair?.state==='cancelled' && <p role="status">Linking cancelled. No replacement link was created.</p>}
    {!pending && pair?.state!=='linked' && <button className="secondary-button" disabled={locked} onClick={()=>void perform({op:'begin'})}>Generate Discord linking code</button>}
    {error && <p role="alert">{error}</p>}
  </div></section>;
}
