import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { emptySocial,socialSnapshotSchema,socialMessageSchema,socialUserSchema,type SocialAction,type SocialMessage,type SocialState } from '../../shared/social';
export class SocialClient{
  state:SocialState=emptySocial();private socket?:WebSocket;private token?:string;private expiry=0;private retry?:ReturnType<typeof setTimeout>;private heartbeat?:ReturnType<typeof setInterval>;private generation=0;private attempts=0;private stopped=true;
  private pending=new Map<string,{resolve:(v:unknown)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  private seen=new Set<string>();private connecting?:Promise<void>;
  constructor(readonly endpoint:string,private session:()=>Promise<{token:string}>,private changed:()=>void,private notify:(message:string)=>void,private allowLocal=false){if(endpoint){const url=new URL(endpoint);if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.protocol!=='https:'&&!(allowLocal&&url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw new Error('Configure a trusted HTTPS Social origin.');this.state={...emptySocial(),status:'disconnected',message:'Connect with your verified Minecraft account.'};}}
  private emit(){this.changed();}
  async connect(){if(this.connecting)return this.connecting;if(!this.endpoint)throw new Error('The owner has not configured the Social service.');if(this.state.status==='connected')return;this.stopped=false;const generation=++this.generation;this.connecting=this.open(generation).finally(()=>{this.connecting=undefined;});return this.connecting;}
  private async open(generation:number){
    this.state.status='connecting';this.state.message='Connecting to Usagi Social…';this.state.error=undefined;this.emit();
    try{
      if(!this.token||Date.now()+60000>=this.expiry){
        const game=await this.session();if(generation!==this.generation)return;
        const response=await fetch(new URL('/v1/session',this.endpoint),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({minecraftToken:game.token}),redirect:'error',signal:AbortSignal.timeout(25000)});
        if(!response.ok)throw new Error('Social could not verify your Minecraft session. Sign in again.');
        const result=z.object({token:z.string().min(32).max(200),expiresAt:z.number().int().positive()}).strict().parse(await response.json());
        if(generation!==this.generation){await fetch(new URL('/v1/session',this.endpoint),{method:'DELETE',headers:{Authorization:'Bearer '+result.token},redirect:'error',signal:AbortSignal.timeout(5000)}).catch(()=>{});return;}this.token=result.token;this.expiry=result.expiresAt;
      }
      if(generation!==this.generation)return;
      const url=new URL('/v1/realtime',this.endpoint);url.protocol=url.protocol==='https:'?'wss:':'ws:';
      const socket=new WebSocket(url);this.socket=socket;
      await new Promise<void>((resolve,reject)=>{
        let ready=false;const timeout=setTimeout(()=>{socket.close();reject(new Error('Social connection timed out.'));},12000);
        socket.addEventListener('open',()=>{if(generation!==this.generation||this.stopped){socket.close();return;}socket.send(JSON.stringify({type:'authenticate',role:'launcher',token:this.token}));});
        socket.addEventListener('message',event=>{if(generation!==this.generation)return;try{
          if(typeof event.data!=='string'||event.data.length>512000)throw new Error('Invalid Social response.');const value=JSON.parse(event.data);
          if(value.event==='ready'){ready=true;clearTimeout(timeout);this.attempts=0;this.state.status='connected';this.state.message='Connected';this.emit();this.heartbeat=setInterval(()=>void this.action({op:'heartbeat'}).catch(()=>{}),20000);resolve();}
          else if(value.event==='snapshot'){this.state.data=socialSnapshotSchema.parse(value.data);this.emit();}
          else if(value.event==='message'){this.receive(socialMessageSchema.parse(value.message));}
          else if(typeof value.id==='string'){
            const pending=this.pending.get(value.id);if(!pending)return;this.pending.delete(value.id);clearTimeout(pending.timer);if(value.ok===true)pending.resolve(value.data);else pending.reject(new Error(typeof value.error==='string'?value.error.slice(0,400):'Social request failed.'));
          }
          else if(value.ok===false)throw new Error('Social session was rejected.');
        }catch{socket.close(1008,'Invalid Social response');}});
        socket.addEventListener('error',()=>{if(!ready){clearTimeout(timeout);reject(new Error('Social service could not be reached.'));}});
        socket.addEventListener('close',()=>{
          clearTimeout(timeout);
          if(!ready)reject(new Error('Social session was rejected or interrupted.'));
          if(generation!==this.generation||this.stopped)return;
          if(this.heartbeat)clearInterval(this.heartbeat);for(const work of this.pending.values()){clearTimeout(work.timer);work.reject(new Error('Connection interrupted. Retry with the same message request.'));}this.pending.clear();
          this.state.status='disconnected';this.state.message='Reconnecting to Social…';this.emit();this.retry=setTimeout(()=>{this.connecting=this.open(generation).finally(()=>{this.connecting=undefined;});void this.connecting.catch(()=>{});},Math.min(30000,1000*2**Math.min(this.attempts++,5))+Math.random()*300);
        });
      });
    }catch(error){if(generation===this.generation){this.state.status='error';this.state.error=error instanceof Error?error.message:'Social connection failed.';this.state.message=this.state.error;this.emit();}throw error;}
  }
  private receive(message:SocialMessage){
    const me=this.state.data?.me.id;if(!me||message.recipient!==me)return;
    this.merge(message.sender,[message]);
    if(!this.seen.has(message.id)){this.seen.add(message.id);if(this.seen.size>2000)this.seen.delete(this.seen.values().next().value!);if(this.state.data?.preferences.notifications)this.notify('New private message from '+(this.state.data.friends.find(f=>f.id===message.sender)?.username||'a friend')+'.');}
    void this.action({op:'received',messageId:message.id}).catch(()=>{});
  }
  private merge(target:string,messages:SocialMessage[]){const map=new Map((this.state.conversations[target]||[]).map(m=>[m.id,m]));for(const message of messages)map.set(message.id,message);this.state.conversations[target]=[...map.values()].sort((a,b)=>a.seq-b.seq).slice(-200);this.emit();}
  async action(action:SocialAction):Promise<unknown>{
    if(this.socket?.readyState!==WebSocket.OPEN||this.state.status!=='connected')throw new Error('Connect to Social first.');
    const id=randomUUID();const result=await new Promise<unknown>((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Social request timed out. Retry using the same message request.'));},12000);this.pending.set(id,{resolve,reject,timer});this.socket!.send(JSON.stringify({id,action}));});
    if(action.op==='history'){this.state.conversations[action.target]=z.array(socialMessageSchema).max(50).parse(result);this.emit();}
    if(action.op==='message')this.merge(action.target,[socialMessageSchema.parse(result)]);
    if(action.op==='search')return z.array(socialUserSchema).max(5).parse(result);
    return result;
  }
  async disconnect(revoke=true){this.stopped=true;this.generation++;if(this.retry)clearTimeout(this.retry);if(this.heartbeat)clearInterval(this.heartbeat);for(const work of this.pending.values()){clearTimeout(work.timer);work.reject(new Error('Social disconnected.'));}this.pending.clear();this.socket?.close();this.socket=undefined;const token=this.token;this.token=undefined;this.expiry=0;this.seen.clear();this.state={...emptySocial(),status:this.endpoint?'disconnected':'unconfigured',message:this.endpoint?'Connect with your verified Minecraft account.':emptySocial().message};this.emit();await this.connecting?.catch(()=>{});if(revoke&&token)await fetch(new URL('/v1/session',this.endpoint),{method:'DELETE',headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(5000)}).catch(()=>{});}
}
