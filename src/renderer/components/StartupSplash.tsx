import { useEffect } from 'react';
import mark from '../assets/usagi-mark.png';
import wordmark from '../assets/usagi-wordmark.png';

export function StartupSplash({complete}:{complete:()=>void}){
  useEffect(()=>{
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
    const finish=()=>complete();
    const timer=window.setTimeout(finish,motion.matches?0:2200);
    const changed=()=>{if(motion.matches){window.clearTimeout(timer);finish();}};
    motion.addEventListener('change',changed);
    return()=>{window.clearTimeout(timer);motion.removeEventListener('change',changed);};
  },[complete]);
  return <div className="startup-splash" role="status" aria-label="Opening Usagi">
    <div className="startup-stars" aria-hidden="true">{Array.from({length:6},(_,i)=><i key={i}/>)}</div>
    <div className="startup-identity"><img className="startup-mark" src={mark} alt=""/><img className="startup-wordmark" src={wordmark} alt="Usagi"/></div>
    <span className="sr-only">Opening Usagi</span>
  </div>;
}
