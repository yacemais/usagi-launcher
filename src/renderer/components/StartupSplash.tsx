import { useEffect,useRef,useState } from 'react';
import mark from '../assets/usagi-mark.png';
import wordmark from '../assets/usagi-wordmark.png';

export function StartupSplash({complete}:{complete:()=>void}){
  const host=useRef<HTMLDivElement>(null);const [running,setRunning]=useState(false);
  useEffect(()=>{
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
    let cancelled=false,timer:number|undefined,firstFrame=0,secondFrame=0;
    const finish=()=>{if(!cancelled)complete();};
    const changed=()=>{if(motion.matches)finish();};
    motion.addEventListener('change',changed);
    if(motion.matches){finish();return()=>{cancelled=true;motion.removeEventListener('change',changed);};}
    async function prepare(){
      try{await Promise.all(Array.from(host.current?.querySelectorAll('img')||[]).map(image=>image.decode()));}catch{finish();return;}
      async function visible(){
        if(cancelled)return;
        try{
          const response=await window.celestia.request({type:'startup.visibility'});
          if(cancelled)return;
          if(response.ok&&response.visible){
            firstFrame=requestAnimationFrame(()=>{secondFrame=requestAnimationFrame(()=>{if(!cancelled)setRunning(true);});});
            return;
          }
        }catch{finish();return;}
        timer=window.setTimeout(()=>void visible(),50);
      }
      await visible();
    }
    void prepare();
    return()=>{cancelled=true;window.clearTimeout(timer);cancelAnimationFrame(firstFrame);cancelAnimationFrame(secondFrame);motion.removeEventListener('change',changed);};
  },[complete]);
  useEffect(()=>{if(!running)return;const fallback=window.setTimeout(complete,2900);return()=>window.clearTimeout(fallback);},[running,complete]);
  return <div ref={host} className={'startup-splash'+(running?' is-running':'')} role="status" aria-label="Opening Usagi" onAnimationEnd={event=>{if(event.target===event.currentTarget&&event.animationName==='startup-out')complete();}}>
    <div className="startup-stars" aria-hidden="true">{Array.from({length:6},(_,i)=><i key={i}/>)}</div>
    <div className="startup-identity"><img className="startup-mark" src={mark} alt=""/><img className="startup-wordmark" src={wordmark} alt="Usagi"/></div>
    <span className="sr-only">Opening Usagi</span>
  </div>;
}
