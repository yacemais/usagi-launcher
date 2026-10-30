import {useEffect,useState} from 'react';
import type {Snapshot} from '../../shared/types';
import {defaultPresencePreferences,type PresencePreferences} from '../../shared/presence';
import type {Request} from './ui';

export function PresenceSettings({state,request}:{state:Snapshot;request:Request}) {
  const current=state.discordPresence?.preferences ?? defaultPresencePreferences();
  const [values,setValues]=useState(current),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{setValues(current);},[JSON.stringify(current)]);
  const labels:Record<keyof PresencePreferences,string>={enabled:'Show Discord activity on this device',showMinecraftActivity:'Show Minecraft activity',showDimension:'Show my dimension',showPlayerCount:'Show online player count',showPlayerNames:'Show consenting friends’ names',showEvent:'Show the active server event'};
  async function save() {setBusy(true);setMessage('');try {const result=await request({type:'presence.preferences',preferences:values});setMessage(result.ok ? 'Discord activity preferences saved.' : result.error);}finally {setBusy(false);}}
  return <section className="settings-section" aria-label="Discord activity settings"><div className="settings-section-heading"><h2>Discord activity</h2><p>Choose what appears on your Discord profile. Preferences are saved separately for each Minecraft account.</p></div><div className="settings-fields">{(Object.keys(labels) as (keyof PresencePreferences)[]).map(key=><label className="toggle-row" key={key}><span><strong>{labels[key]}</strong></span><input aria-label={labels[key]} type="checkbox" checked={values[key]} disabled={busy || key!=='enabled'&&!values.enabled} onChange={event=>setValues(old=>({...old,[key]:event.target.checked}))}/></label>)}<p className="quiet-note">Discord desktop must be open. Dimensions and player information appear only while Usagi receives verified server updates. Invisible Social status hides Discord activity.</p><p role="status">{state.discordPresence?.status.message}</p>{message&&<p role="status">{message}</p>}<button className="secondary-button" disabled={busy || state.authBusy || state.appUpdate?.phase==='installing'} onClick={()=>void save()}>{busy ? 'Saving…' : 'Save Discord activity'}</button></div></section>;
}
