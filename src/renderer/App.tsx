import { useCallback,useState } from 'react';
import { Download,Home as HomeIcon,Minus,Newspaper,Settings as SettingsIcon,Square,Copy,UserRound,Users,X } from 'lucide-react';
import type { Page } from '../shared/types';
import { useLauncher } from './hooks/useLauncher';
import { Home } from './pages/Home';
import { Updates } from './pages/Updates';
import { News } from './pages/News';
import { Settings } from './pages/Settings';
import { Account } from './pages/Account';
import { ErrorBanner } from './components/ui';
import mark from './assets/usagi-mark.png';
import wordmark from './assets/usagi-wordmark.png';
import { StartupSplash } from './components/StartupSplash';
import { Social } from './pages/Social';
const navigation=[{id:'home',label:'Home',icon:HomeIcon},{id:'social',label:'Social',icon:Users},{id:'news',label:'News',icon:Newspaper},{id:'updates',label:'Updates',icon:Download},{id:'settings',label:'Settings',icon:SettingsIcon}] as const;
export function App(){
  const {state,request,error,clearError}=useLauncher();const [page,setPage]=useState<Page>('home');
  const [opening,setOpening]=useState(true);const opened=useCallback(()=>setOpening(false),[]);
  const profile=state?.profiles.find(p=>p.accountId===state.selectedAccount);
  return <>{opening&&<StartupSplash complete={opened}/>}<div className="app-shell" inert={opening}>
    <aside className="sidebar"><button className="brand" aria-label="Usagi home" onClick={()=>setPage('home')}><img className="brand-rabbit" src={mark} alt=""/><img className="brand-wordmark" src={wordmark} alt="Usagi"/></button>
      <nav aria-label="Main navigation">{navigation.map(item=><button key={item.id} className={'nav-item '+(page===item.id?'active':'')} aria-current={page===item.id?'page':undefined} onClick={()=>setPage(item.id)}><item.icon size={18}/><span>{item.label}</span>{item.id==='social'&&!!state?.social?.data?.friends.some(f=>f.unread>0)&&<span className="social-nav-unread" aria-label="Unread private messages">{Math.min(99,state.social.data.friends.reduce((sum,f)=>sum+f.unread,0))}</span>}{item.id==='updates'&&(state?.installation==='repair'||state?.appUpdate?.phase==='available')&&<i className="nav-indicator"/>}</button>)}</nav>
      <div className="sidebar-bottom"><span>Made for Usagi SMP</span><button onClick={()=>setPage('updates')}>Usagi {state?.appUpdate?.currentVersion || '…'}</button></div>
    </aside>
    <div className="workspace"><header className="titlebar"><div className="titlebar-drag"><span className="breadcrumb">Usagi <i>/</i> <strong>{page==='account'?'Account':page.charAt(0).toUpperCase()+page.slice(1)}</strong></span></div>
      <button className="account-button" onClick={()=>setPage('account')}>{profile?.avatar?<img src={profile.avatar} alt="Your Minecraft avatar"/>:<span className="small-avatar"><UserRound size={16}/></span>}<span>{profile?.name || 'Sign in'}</span></button>
      <div className="window-controls"><button aria-label="Minimize window" onClick={()=>void request({type:'window',action:'minimize'})}><Minus size={15}/></button><button aria-label={state?.maximized?'Restore window':'Maximize window'} onClick={()=>void request({type:'window',action:'maximize'})}>{state?.maximized?<Copy size={12}/>:<Square size={12}/>}</button><button className="close-window" aria-label="Close launcher" onClick={()=>void request({type:'window',action:'close'})}><X size={16}/></button></div>
    </header>
    <main id="main-content" tabIndex={-1}>{error&&<ErrorBanner message={error} onClose={clearError}/>} {state?.error&&state.error!==error&&<ErrorBanner message={state.error}/>}
      {!state?<div className="boot-state"><img src={mark} alt=""/><p>Opening Usagi…</p><span className="spinner"/></div>:page==='home'?<Home state={state} request={request} navigate={setPage}/>:page==='social'?<Social state={state} request={request}/>:page==='updates'?<Updates state={state} request={request}/>:page==='news'?<News state={state} request={request} navigate={setPage}/>:page==='settings'?<Settings state={state} request={request}/>:<Account state={state} request={request} navigate={setPage}/>}
    </main><footer className="app-footer"><span><i className={state?.phase==='playing'?'positive-dot':'muted-dot'}/>{state?.phase==='playing'?'Minecraft is running':'Minecraft Java Edition'}</span><button onClick={()=>void request({type:'folder.open',folder:'logs'})}>Open logs</button></footer>
    </div>
  </div></>;
}
