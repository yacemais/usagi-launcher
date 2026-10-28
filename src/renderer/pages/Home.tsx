import { ArrowRight,Download,FolderOpen,Play,RefreshCw,Wrench } from 'lucide-react';
import type { Page,Snapshot } from '../../shared/types';
import { ServerLine,type Request } from '../components/ui';
import mark from '../assets/usagi-mark.png';
export function playLabel(state:Snapshot){
  if(state.phase==='playing')return 'PLAYING';if(state.phase==='launching')return 'LAUNCHING';
  if(state.phase!=='idle')return state.phase==='installing'?'INSTALLING':state.phase==='updating'?'UPDATING':'CHECKING';
  if(state.installation==='missing')return 'INSTALL';if(state.installation==='repair')return 'REPAIR';if(state.updateAvailable||state.availableVersion&&state.availableVersion!==state.installedVersion)return 'UPDATE';return 'PLAY NOW';
}
export function Home({state,request,navigate}:{state:Snapshot;request:Request;navigate:(page:Page)=>void}){
  const label=playLabel(state),profile=state.profiles.find(p=>p.accountId===state.selectedAccount),busy=state.phase!=='idle'||state.authBusy;
  const action=()=>{if(label==='PLAY NOW'){if(!profile){navigate('account');return;}void request({type:'launch'});}else{navigate('updates');void request({type:'install'});}};
  return <div className="home-page">
    <section className="hero" aria-labelledby="hero-heading"><div className="hero-copy"><span className="eyebrow">YOUR MODPACK</span><h1 id="hero-heading">Usagi SMP</h1><p className="hero-subtitle">Minecraft, with a little more to discover.</p>
      <button className="play-button" onClick={action} disabled={busy}><span>{label==='INSTALL'?<Download size={18}/>:label==='REPAIR'?<Wrench size={18}/>:<Play size={18}/>} {label}</span><ArrowRight size={19}/></button>
      <p className="hero-meta"><i className={state.installation==='ready'?'positive-dot':'muted-dot'}/>{state.installation==='ready'?'Installation verified':state.installation==='repair'?'Files need repair':'Installation required'}{state.installedVersion&&<span> · {state.installedVersion}</span>}</p>
    </div><div className="hero-art"><img src={mark} alt="Owner-provided Usagi rabbit emblem"/></div></section>
    <section className="runtime-strip" aria-label="Game information"><div><span>Minecraft</span><strong>1.20.1</strong></div><div><span>Forge</span><strong>47.4.28</strong></div><div><span>Java</span><strong>{state.java?state.java.version:'17 required'}</strong></div><button className="text-button" onClick={()=>void request({type:'folder.open',folder:'game'})}><FolderOpen size={15}/> Game folder</button></section>
    <div className="home-lower"><section className="announcement"><div className="section-title"><h2>Latest news</h2><button className="text-button" onClick={()=>navigate('news')}>View all <ArrowRight size={14}/></button></div>{state.news[0]?<><time>{new Date(state.news[0].date).toLocaleDateString()}</time><h3>{state.news[0].title}</h3><p>{state.news[0].summary}</p></>:<><h3>{state.newsState==='error'?'News is unavailable':'No announcements yet'}</h3><p>{state.newsState==='error'?'Open News to retry the feed.':'The owner has not connected a news feed.'}</p></>}</section>
    <section className="server-panel"><h2>Server</h2><ServerLine state={state} request={request}/><p>{!state.settings.serverHost?'The server address has not been configured.':state.server.lastSuccess?'Last successful refresh: '+new Date(state.server.lastSuccess).toLocaleTimeString():state.server.error || 'Waiting for a successful refresh.'}</p>{state.settings.serverHost&&<button className="text-button" onClick={()=>void request({type:'server.refresh'})}><RefreshCw size={13}/> Refresh</button>}</section></div>
  </div>;
}
