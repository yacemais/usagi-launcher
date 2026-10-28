import { useCallback, useEffect, useState } from 'react';
import type { Command, Snapshot } from '../../shared/types';
export function useLauncher() {
  const [state,setState]=useState<Snapshot>();const [error,setError]=useState('');
  const request=useCallback(async(command:Command)=>{try{const result=await window.celestia.request(command);if(result.ok){if(result.state)setState(result.state);}else setError(result.error);return result;}catch{setError('The launcher connection was interrupted. Restart the application.');return {ok:false as const,error:'Launcher connection interrupted.'};}},[]);
  useEffect(()=>{const unsubscribe=window.celestia.subscribe(setState);void request({type:'snapshot'});return unsubscribe;},[request]);
  return {state,request,error,clearError:()=>setError('')};
}
