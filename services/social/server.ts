import http from 'node:http';
import { randomBytes,randomUUID,createHash,timingSafeEqual } from 'node:crypto';
import { WebSocketServer,WebSocket } from 'ws';
import { z } from 'zod';
import { SocialStore,SocialError } from './store';
import { verifyMinecraftIdentity,type IdentityVerifier } from './identity';
import { socialActionSchema,type SocialAction } from '../../src/shared/social';
const tokenHash=(value:string)=>createHash('sha256').update(value).digest('hex');
const envelope=z.object({id:z.string().uuid(),action:socialActionSchema}).strict();
const playerSchema=z.object({uuid:z.string().regex(/^[a-f0-9]{32}$/),name:z.string().regex(/^[A-Za-z0-9_]{1,16}$/)}).strict();
const bridgeAction=z.discriminatedUnion('op',[
  z.object({op:z.literal('players'),players:z.array(playerSchema).max(500)}).strict(),
  z.object({op:z.literal('command'),uuid:playerSchema.shape.uuid,action:socialActionSchema}).strict(),
  z.object({op:z.literal('ack'),uuid:playerSchema.shape.uuid,messageId:z.string().uuid()}).strict()
]);
type Peer={socket:WebSocket;connection:string;user?:string;session?:string;bridge?:boolean;players:Set<string>;limits:Map<string,{at:number;count:number}>};
export interface SocialServerOptions{file:string;bridgeSecret:string;verifyIdentity?:IdentityVerifier;now?:()=>number}
export function createSocialServer(options:SocialServerOptions){
  if(options.bridgeSecret.length<32||options.bridgeSecret.length>200)throw new Error('Set a random bridge secret of 32–200 characters.');
  const store=new SocialStore(options.file,options.now),verify=options.verifyIdentity||verifyMinecraftIdentity;
  const peers=new Set<Peer>(),ipLimits=new Map<string,{at:number;count:number}>();
  function limit(map:Map<string,{at:number;count:number}>,key:string,max:number,period=60000){const now=store.now();let entry=map.get(key);if(!entry||now-entry.at>=period){entry={at:now,count:0};map.set(key,entry);}if(++entry.count>max)throw new SocialError('rate_limit','Too many requests. Please wait.');}
  const userLimits=new Map<string,{at:number;count:number}>();
  const write=(peer:Peer,value:unknown)=>{if(peer.socket.readyState===WebSocket.OPEN){if(peer.socket.bufferedAmount>1024*1024){peer.socket.close(1013);return;}peer.socket.send(JSON.stringify(value));}};
  function deliver(peer:Peer){
    if(peer.user){for(const message of store.pending(peer.user,'launcher'))write(peer,{event:'message',message});}
    if(peer.bridge)for(const uuid of peer.players){const row=store.row('SELECT id FROM users WHERE uuid=?',uuid);if(row)for(const message of store.pending(row.id,'minecraft'))write(peer,{event:'minecraft.message',uuid,message,sender:store.publicUser(message.sender,row.id)});}
  }
  function update(ids?:string[]){
    const affected=ids?new Set(ids.flatMap(id=>[id,...store.friendIds(id)])):undefined;
    for(const peer of peers){if(peer.user&&(!affected||affected.has(peer.user)))write(peer,{event:'snapshot',data:store.snapshot(peer.user)});if(!affected||peer.user&&affected.has(peer.user)||peer.bridge)deliver(peer);}
  }
  async function json(request:http.IncomingMessage){let size=0;const chunks:Buffer[]=[];for await(const chunk of request){size+=chunk.length;if(size>16384)throw new SocialError('input','Request is too large.');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString());}
  const server=http.createServer(async(request,response)=>{
    response.setHeader('Content-Type','application/json');response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');
    try{
      if(request.headers.origin)throw new SocialError('forbidden','Browser origins are not allowed.');
      const route=new URL(request.url||'/','http://localhost').pathname;
      if(request.method==='GET'&&route==='/health'){response.end(JSON.stringify({ok:true,protocol:1}));return;}
      if(request.method==='POST'&&route==='/v1/session'){
        if(ipLimits.size>10000)ipLimits.clear();limit(ipLimits,request.socket.remoteAddress||'unknown',60);
        const {minecraftToken}=z.object({minecraftToken:z.string().min(16).max(12000)}).strict().parse(await json(request));
        const identity=await verify(minecraftToken);const user=store.identity(identity.uuid,identity.name),token=randomBytes(32).toString('base64url');
        store.run('INSERT INTO sessions(hash,user_id,expires) VALUES(?,?,?)',tokenHash(token),user,store.now()+24*3600000);
        response.end(JSON.stringify({token,expiresAt:store.now()+24*3600000}));return;
      }
      if(request.method==='DELETE'&&route==='/v1/session'){
        const token=request.headers.authorization?.replace(/^Bearer /,'')||'',hash=tokenHash(token);store.run('DELETE FROM sessions WHERE hash=?',hash);for(const peer of peers)if(peer.session===hash)peer.socket.close(1000,'Signed out');response.end('{}');return;
      }
      response.statusCode=404;response.end(JSON.stringify({error:'Not found.'}));
    }catch(error){const known=error instanceof SocialError;response.statusCode=known?(error.code==='rate_limit'?429:403):400;response.end(JSON.stringify({error:known?error.message:'Invalid request.'}));}
  });
  server.requestTimeout=15000;server.headersTimeout=15000;server.maxHeadersCount=40;
  const wss=new WebSocketServer({noServer:true,maxPayload:16384,perMessageDeflate:false});
  server.on('upgrade',(request,socket,head)=>{
    if(request.url!=='/v1/realtime'||request.headers.origin){socket.destroy();return;}
    if(peers.size>=1000){socket.destroy();return;}
    wss.handleUpgrade(request,socket,head,ws=>wss.emit('connection',ws,request));
  });
  wss.on('connection',(socket,request)=>{
    const peer:Peer={socket,connection:randomUUID(),players:new Set(),limits:new Map()};peers.add(peer);
    const timer=setTimeout(()=>{if(!peer.user&&!peer.bridge)socket.close(1008,'Authentication required');},5000);timer.unref();
    socket.on('error',()=>{});
    socket.on('close',()=>{clearTimeout(timer);const ids=store.rows('SELECT user_id FROM leases WHERE connection=?',peer.connection).map(r=>r.user_id);store.disconnect(peer.connection);peers.delete(peer);update(ids);});
    socket.on('message',data=>{
      let requestId:string|undefined;
      try{
        limit(peer.limits,'packets',180,60000);
        const input=JSON.parse(data.toString());
        if(z.string().uuid().safeParse(input?.id).success)requestId=input.id;
        if(!peer.user&&!peer.bridge){
          const auth=z.object({type:z.literal('authenticate'),role:z.enum(['launcher','server']),token:z.string().min(32).max(200)}).strict().parse(input);
          if(auth.role==='server'){
            const expected=Buffer.from(options.bridgeSecret),supplied=Buffer.from(auth.token);if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied))throw new SocialError('auth','Invalid server credentials.');
            if([...peers].some(p=>p!==peer&&p.bridge))throw new SocialError('server','The Minecraft bridge is already connected.');peer.bridge=true;
          }else{
            const hash=tokenHash(auth.token),session=store.row('SELECT * FROM sessions WHERE hash=? AND expires>?',hash,store.now());if(!session)throw new SocialError('auth','Session expired. Connect again.');peer.user=session.user_id;peer.session=hash;store.lease(peer.connection,peer.user!,'launcher');
          }
          clearTimeout(timer);write(peer,{event:'ready'});update(peer.user?[peer.user]:undefined);return;
        }
        if(peer.bridge){
          const rpc=z.object({id:z.string().uuid(),action:bridgeAction}).strict().parse(input);requestId=rpc.id;const action=rpc.action;
          if(action.op==='players'){
            const old=store.rows('SELECT user_id FROM leases WHERE connection=?',peer.connection).map(r=>r.user_id);store.disconnect(peer.connection);peer.players=new Set(action.players.map(p=>p.uuid));
            const ids=action.players.map(p=>{const id=store.identity(p.uuid,p.name);store.lease(peer.connection,id,'playing');return id;});update([...old,...ids]);write(peer,{id:rpc.id,ok:true,data:{}});return;
          }
          if(!peer.players.has(action.uuid))throw new SocialError('identity','The player is not online through this bridge.');
          const id=store.row('SELECT id FROM users WHERE uuid=?',action.uuid)!.id;
          if(action.op==='ack'){store.ackMinecraft(id,action.messageId);write(peer,{id:rpc.id,ok:true,data:{}});return;}
          limit(userLimits,id,120);if(action.action.op==='message')limit(userLimits,id+':messages',30);
          const result=store.action(id,action.action);write(peer,{id:rpc.id,ok:true,data:result});update([id,...('target'in action.action?[action.action.target]:[])]);return;
        }
        const rpc=envelope.parse(input);requestId=rpc.id;
        if(!store.row('SELECT 1 FROM sessions WHERE hash=? AND expires>?',peer.session!,store.now())){socket.close(1008,'Session expired');return;}
        limit(userLimits,peer.user!,120);if(rpc.action.op==='message')limit(userLimits,peer.user+':messages',30);
        if(rpc.action.op==='heartbeat')store.lease(peer.connection,peer.user!,'launcher');
        const result=store.action(peer.user!,rpc.action);write(peer,{id:rpc.id,ok:true,data:result});
        if(!['received','history','search','snapshot'].includes(rpc.action.op))update([peer.user!,...('target'in rpc.action?[rpc.action.target]:[])]);
      }catch(error){write(peer,{id:requestId,ok:false,error:error instanceof SocialError?error.message:'Invalid Social request.',code:error instanceof SocialError?error.code:'input'});if(!peer.user&&!peer.bridge)socket.close(1008,'Authentication failed');}
    });
  });
  const expiry=setInterval(()=>{store.expire();for(const peer of peers){if(peer.user&&!store.row('SELECT 1 FROM sessions WHERE hash=? AND expires>?',peer.session!,store.now()))peer.socket.close(1008,'Session expired');}update();},30000);expiry.unref();
  return {server,store,async close(){clearInterval(expiry);for(const peer of peers)peer.socket.terminate();await new Promise<void>(resolve=>wss.close(()=>resolve()));await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();}};
}
