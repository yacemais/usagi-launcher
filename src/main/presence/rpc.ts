import {createConnection,type Socket} from 'node:net';
import {posix} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {DiscordActivity} from './model';
import type {PresenceState} from '../../shared/presence';

export const discordApplicationId='1565378499731263570';
export function ipcPaths(platform=process.platform,environment=process.env):string[] {
  const base=environment.XDG_RUNTIME_DIR||environment.TMPDIR||environment.TMP||environment.TEMP||'/tmp';
  return Array.from({length:10},(_,index)=>platform==='win32' ? '\\\\?\\pipe\\discord-ipc-'+index : posix.join(base,'discord-ipc-'+index));
}
export function rpcFrame(opcode:number,value:unknown):Buffer {const data=Buffer.from(JSON.stringify(value));const header=Buffer.alloc(8);header.writeUInt32LE(opcode,0);header.writeUInt32LE(data.length,4);return Buffer.concat([header,data]);}
export class DiscordPresence {
  private socket?:Socket;private buffer=Buffer.alloc(0);private ready=false;private generation=0;private connecting=false;private retry?:ReturnType<typeof setTimeout>;private throttle?:ReturnType<typeof setTimeout>;private deadline?:ReturnType<typeof setTimeout>;private pending?:string;private sent='';private lastSent=0;private attempts=0;private desired:DiscordActivity|null=null;private stopped=false;
  state:PresenceState={status:'disabled',message:'Discord activity is disabled.'};
  constructor(private readonly changed:(state:PresenceState)=>void=()=>{},private readonly options:{paths?:()=>string[];minimumInterval?:number;retryDelay?:number}={}) {}
  private status(status:PresenceState['status'],message:string):void {if (this.state.status!==status || this.state.message!==message) {this.state={status,message};this.changed(this.state);}}
  update(activity:DiscordActivity|null):void {
    if (this.stopped) return;this.desired=activity;
    if (!activity) {
      clearTimeout(this.retry);clearTimeout(this.throttle);this.retry=undefined;this.throttle=undefined;
      if (this.socket && this.ready) {this.generation++;this.socket.end(rpcFrame(1,{cmd:'SET_ACTIVITY',args:{pid:process.pid,activity:null},nonce:randomUUID()}));const old=this.socket;const timer=setTimeout(()=>old.destroy(),500);timer.unref();}
      else {this.generation++;this.socket?.destroy();}
      this.socket=undefined;this.ready=false;this.pending=undefined;clearTimeout(this.deadline);this.status('disabled','Discord activity is disabled.');return;
    }
    if (this.socket && this.ready) this.flush();else if (!this.socket && !this.retry && !this.connecting) void this.connect();
  }
  private async connect():Promise<void> {
    this.connecting=true;try {
    const generation=++this.generation;this.status('connecting','Connecting to Discord desktop…');
    for (const path of (this.options.paths?.() ?? ipcPaths())) {
      if (this.stopped || !this.desired || generation!==this.generation) return;
      const socket=await new Promise<Socket|undefined>(resolve=>{const candidate=createConnection({path});const timer=setTimeout(()=>{candidate.destroy();resolve(undefined);},500);timer.unref();candidate.once('error',()=>{clearTimeout(timer);candidate.destroy();resolve(undefined);});candidate.once('connect',()=>{clearTimeout(timer);resolve(candidate);});});
      if (!socket) continue;
      if (this.stopped || !this.desired || generation!==this.generation) {socket.destroy();return;}
      this.socket=socket;this.buffer=Buffer.alloc(0);this.ready=false;this.sent='';this.pending=undefined;this.lastSent=0;
      socket.on('error',()=>{});socket.on('close',()=>{if (this.socket===socket) {this.socket=undefined;this.ready=false;this.pending=undefined;clearTimeout(this.deadline);this.schedule();}});
      socket.on('data',chunk=>{if (this.socket===socket) this.receive(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));});
      this.deadline=setTimeout(()=>socket.destroy(),5000);this.deadline.unref();socket.write(rpcFrame(0,{v:1,client_id:discordApplicationId}));return;
    }
    if (generation===this.generation) this.schedule();
    } finally {this.connecting=false;if (this.desired && !this.socket && !this.retry) this.schedule();}
  }
  private schedule():void {
    if (this.stopped || !this.desired || this.retry) return;
    this.status('unavailable','Discord desktop is unavailable. Reconnecting automatically.');
    this.retry=setTimeout(()=>{this.retry=undefined;void this.connect();},this.options.retryDelay ?? Math.min(30000,1000*2**Math.min(this.attempts++,5)));this.retry.unref();
  }
  private receive(chunk:Buffer):void {
    if (this.buffer.length+chunk.length>131072) {this.socket?.destroy();return;}this.buffer=Buffer.concat([this.buffer,chunk]);
    while (this.buffer.length>=8) {
      const opcode=this.buffer.readUInt32LE(0),length=this.buffer.readUInt32LE(4);if (length>65536) {this.socket?.destroy();return;}if (this.buffer.length<8+length) return;
      const body=this.buffer.subarray(8,8+length);this.buffer=this.buffer.subarray(8+length);
      if (opcode===2) {this.socket?.destroy();return;}
      if (opcode===3) {const header=Buffer.alloc(8);header.writeUInt32LE(4,0);header.writeUInt32LE(body.length,4);this.socket?.write(Buffer.concat([header,body]));continue;}
      if (opcode===4) continue;if (opcode!==1) {this.socket?.destroy();return;}
      try {
        const message=JSON.parse(body.toString('utf8'));
        if (!this.ready && message.cmd==='DISPATCH' && message.evt==='READY') {this.ready=true;this.attempts=0;clearTimeout(this.deadline);this.flush();continue;}
        if (message.nonce===this.pending) {clearTimeout(this.deadline);this.pending=undefined;if (message.evt==='ERROR') {this.status('unavailable','Discord refused this activity. Check the application configuration.');this.socket?.destroy();return;}this.status('connected','Discord activity is connected.');this.flush();}
      } catch {this.socket?.destroy();return;}
    }
  }
  private flush():void {
    if (!this.ready || !this.socket || this.pending || !this.desired) return;
    const serialized=JSON.stringify(this.desired);if (serialized===this.sent) return;
    const wait=(this.options.minimumInterval ?? 15000)-(Date.now()-this.lastSent);
    if (wait>0) {if (!this.throttle) {this.throttle=setTimeout(()=>{this.throttle=undefined;this.flush();},wait);this.throttle.unref();}return;}
    if (this.socket.writableLength>65536) {this.socket.destroy();return;}
    const nonce=randomUUID();this.pending=nonce;this.sent=serialized;this.lastSent=Date.now();
    this.deadline=setTimeout(()=>this.socket?.destroy(),5000);this.deadline.unref();this.socket.write(rpcFrame(1,{cmd:'SET_ACTIVITY',args:{pid:process.pid,activity:this.desired},nonce}));
  }
  close():void {this.update(null);this.stopped=true;clearTimeout(this.retry);clearTimeout(this.throttle);clearTimeout(this.deadline);}
}
