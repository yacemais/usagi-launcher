import net from 'node:net';
import type { ServerStatus } from '../../shared/types';
export function varInt(value:number) { const bytes=[]; do{let b=value&127;value>>>=7;if(value)b|=128;bytes.push(b);}while(value);return Buffer.from(bytes); }
function readVarInt(buffer:Buffer,offset=0):{value:number;end:number}|undefined { let value=0;for(let i=0;i<5;i++){if(offset+i>=buffer.length)return;const b=buffer[offset+i];value|=(b&127)<<(i*7);if(!(b&128))return {value,end:offset+i+1};}throw new Error('Invalid server packet.'); }
function packet(data:Buffer) { return Buffer.concat([varInt(data.length),data]); }
export async function queryServer(host:string,port:number):Promise<ServerStatus> {
  if(!host) return {state:'unconfigured'};
  return new Promise(resolve=>{
    const socket=net.createConnection({host,port}); let buffer=Buffer.alloc(0),settled=false;
    const done=(result:ServerStatus)=>{if(settled)return;settled=true;socket.destroy();resolve({...result,checkedAt:new Date().toISOString()});};
    socket.setTimeout(4000,()=>done({state:'offline',error:'Server status request timed out.'})); socket.on('error',()=>done({state:'offline',error:'The server could not be reached.'}));
    socket.on('connect',()=>{ const address=Buffer.from(host,'utf8'),portBytes=Buffer.alloc(2);portBytes.writeUInt16BE(port); socket.write(packet(Buffer.concat([varInt(0),varInt(763),varInt(address.length),address,portBytes,varInt(1)])));socket.write(packet(varInt(0))); });
    socket.on('data',chunk=>{
      try {buffer=Buffer.concat([buffer,Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk)]);if(buffer.length>262144)throw new Error('Server response too large.');const frame=readVarInt(buffer);if(!frame || buffer.length<frame.end+frame.value)return;if(frame.value<0 || frame.value>262144)throw new Error('Invalid server frame.');const id=readVarInt(buffer,frame.end);if(!id || id.value!==0)throw new Error('Unexpected status packet.');const length=readVarInt(buffer,id.end);if(!length || length.value<0 || length.end+length.value>frame.end+frame.value)throw new Error('Invalid status JSON.');const data=JSON.parse(buffer.subarray(length.end,length.end+length.value).toString('utf8'));
        if(!Number.isInteger(data.players?.online) || !Number.isInteger(data.players?.max) || data.players.online<0 || data.players.max<0)throw new Error('Invalid player counts.');
        done({state:'online',online:data.players.online,max:data.players.max,version:typeof data.version?.name==='string'?data.version.name.slice(0,80):undefined,lastSuccess:new Date().toISOString()});
      }catch{done({state:'offline',error:'Server returned an invalid status response.'});}
    });socket.on('close',()=>{if(!settled)done({state:'offline',error:'Server closed the status request.'});});
  });
}
