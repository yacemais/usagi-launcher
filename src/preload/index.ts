import { contextBridge, ipcRenderer } from 'electron';
import type { Command, Snapshot } from '../shared/types';
contextBridge.exposeInMainWorld('celestia',Object.freeze({
  request:(command:Command)=>ipcRenderer.invoke('celestia:request',command),
  subscribe:(listener:(state:Snapshot)=>void)=>{const handle=(_event:unknown,state:Snapshot)=>listener(state);ipcRenderer.on('celestia:state',handle);return()=>ipcRenderer.removeListener('celestia:state',handle);}
}));
