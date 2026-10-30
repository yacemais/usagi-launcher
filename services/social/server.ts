import http from 'node:http';
import { randomBytes,randomUUID,createHash,timingSafeEqual } from 'node:crypto';
import { WebSocketServer,WebSocket } from 'ws';
import { z } from 'zod';
import { SocialStore,SocialError } from './store';
import { verifyMinecraftIdentity,type IdentityVerifier } from './identity';
import { socialActionSchema,type SocialAction } from '../../src/shared/social';
import {presenceEventSchema,type GameObservation} from '../../src/shared/presence';
import {PresenceControl} from './presence-control';
import {PairingProxy} from './pairing';
const tokenHash=(value:string)=>createHash('sha256').update(value).digest('hex');
const envelope=z.object({id:z.string().uuid(),action:socialActionSchema}).strict();
const playerSchema=z.object({uuid:z.string().regex(/^[a-f0-9]{32}$/),name:z.string().regex(/^[A-Za-z0-9_]{1,16}$/),dimension:z.string().regex(/^[a-z0-9_.-]+:[a-z0-9_./-]+$/).max(256).optional(),joinedAt:z.number().int().nonnegative().optional(),afk:z.boolean().optional()}).strict();
const bridgeAction=z.discriminatedUnion('op',[
  z.object({op:z.literal('capabilities'),features:z.array(z.literal('rich_presence.v1')).max(1)}).strict(),
  z.object({op:z.literal('players'),players:z.array(playerSchema).max(500),event:presenceEventSchema.nullable().optional()}).strict(),
  z.object({op:z.literal('command'),uuid:playerSchema.shape.uuid,action:socialActionSchema}).strict(),
  z.object({op:z.literal('ack'),uuid:playerSchema.shape.uuid,messageId:z.string().uuid()}).strict()
]);
type Peer={socket:WebSocket;connection:string;user?:string;session?:string;bridge?:boolean;discord?:boolean;presenceCapable?:boolean;players:Set<string>;limits:Map<string,{at:number;count:number}>};
export interface SocialServerOptions{file:string;bridgeSecret:string;discordGatewaySecret?:string;presenceControlGuildId?:string;pairing?:{backendOrigin:string;guildId:string};environment?:string;verifyIdentity?:IdentityVerifier;now?:()=>number}
export function createSocialServer(options:SocialServerOptions){
  if(options.bridgeSecret.length<32||options.bridgeSecret.length>200)throw new Error('Set a random bridge secret of 32–200 characters.');
  if(options.discordGatewaySecret&&(options.discordGatewaySecret.length<32||options.discordGatewaySecret.length>200||options.discordGatewaySecret===options.bridgeSecret))throw new Error('Set a separate Discord gateway credential of 32–200 characters.');
  const store=new SocialStore(options.file,options.now),verify=options.verifyIdentity||verifyMinecraftIdentity;
  const pairing=options.pairing && options.discordGatewaySecret ? new PairingProxy({...options.pairing,secret:options.discordGatewaySecret,environment:options.environment ?? 'development'},()=>store.now()) : undefined;
  const presenceControl=new PresenceControl(store,{guildId:options.presenceControlGuildId,key:options.discordGatewaySecret,environment:options.environment ?? 'development'});
  const peers=new Set<Peer>(),ipLimits=new Map<string,{at:number;count:number}>();
  const observations=new Map<string,GameObservation>();
  function limit(map:Map<string,{at:number;count:number}>,key:string,max:number,period=60000){const now=store.now();let entry=map.get(key);if(!entry||now-entry.at>=period){entry={at:now,count:0};map.set(key,entry);}if(++entry.count>max)throw new SocialError('rate_limit','Too many requests. Please wait.');}
  const userLimits=new Map<string,{at:number;count:number}>();
  const write=(peer:Peer,value:unknown)=>{if(peer.socket.readyState===WebSocket.OPEN){if(peer.socket.bufferedAmount>1024*1024){peer.socket.close(1013);return;}peer.socket.send(JSON.stringify(value));}};
  function deliver(peer:Peer){
    if(peer.user&&!peer.discord){for(const message of store.pending(peer.user,'launcher'))write(peer,{event:'message',message});}
    if(peer.bridge)for(const uuid of peer.players){const row=store.row('SELECT id FROM users WHERE uuid=?',uuid);if(row)for(const message of store.pending(row.id,'minecraft'))write(peer,{event:'minecraft.message',uuid,message,sender:store.publicUser(message.sender,row.id)});}
  }
  function update(ids?:string[]){
    const affected=ids?new Set(ids.flatMap(id=>[id,...store.friendIds(id)])):undefined;
    for(const peer of peers){if(peer.user&&(!affected||affected.has(peer.user))) {write(peer,{event:'snapshot',data:snapshotFor(peer)});if(!peer.discord&&peer.presenceCapable)write(peer,{event:'activity',data:ownActivity(peer.user),permitted:presenceControl.permitted,policyExpiresAt:presenceControl.expiry});}if(!affected||peer.user&&affected.has(peer.user)||peer.bridge)deliver(peer);}
  }
  function snapshotFor(peer:Peer){const snapshot=store.snapshot(peer.user!);if(!peer.presenceCapable)delete snapshot.preferences.presence;return snapshot;}
  function ownActivity(userId:string):GameObservation|null {
    const user=store.user(userId),pref=store.presencePreferences(userId),source=observations.get(user.uuid);
    if (!presenceControl.permitted || !pref.enabled || !pref.showMinecraftActivity || user.visibility==='invisible' || !source || source.expiresAt<=store.now()) return null;
    const names:string[]=[];
    if (pref.showPlayerNames) for (const id of store.friendIds(userId)) {const friend=store.user(id),policy=store.presencePreferences(id),online=observations.get(friend.uuid);if (online && online.expiresAt>store.now() && policy.enabled && policy.showPlayerNames && policy.showMinecraftActivity && friend.visibility==='visible' && !store.blocked(userId,id)) names.push(friend.minecraft_name);if (names.length>=5) break;}
    return {...source,dimension:pref.showDimension ? source.dimension : 'usagi:hidden',playerCount:pref.showPlayerCount ? source.playerCount : 0,playerNames:names,event:pref.showEvent ? source.event : null};
  }
  async function json(request:http.IncomingMessage){let size=0;const chunks:Buffer[]=[];for await(const chunk of request){size+=chunk.length;if(size>16384)throw new SocialError('input','Request is too large.');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString());}
  const server=http.createServer(async(request,response)=>{
    response.setHeader('Content-Type','application/json');response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');
    try{
      if(request.headers.origin)throw new SocialError('forbidden','Browser origins are not allowed.');
      const route=new URL(request.url||'/','http://localhost').pathname;
      if(request.method==='GET'&&route==='/health'){response.end(JSON.stringify({ok:true,protocol:1,richPresence:presenceControl.permitted}));return;}
      if(request.method==='POST'&&route==='/v1/presence/policy') {limit(ipLimits,'presence:'+(request.socket.remoteAddress||'unknown'),60);const signature=request.headers['x-usagi-signature'];presenceControl.accept(await json(request),typeof signature==='string' ? signature : undefined);update();response.end(JSON.stringify({ok:true}));return;}
      if(request.method==='POST'&&route==='/v1/discord/pairing') {
        limit(ipLimits,'pairing:'+(request.socket.remoteAddress||'unknown'),1200);
        if(!pairing)throw new SocialError('pairing','The owner has not configured Discord account linking.');
        const authorization=request.headers.authorization;
        if(!authorization || !/^Bearer [A-Za-z0-9_-]{32,200}$/.test(authorization))throw new SocialError('auth','Connect to Social with your Minecraft account first.');
        const input=await json(request);
        const hash=tokenHash(authorization.slice(7)),session=store.row('SELECT user_id FROM sessions WHERE hash=? AND expires>?',hash,store.now());
        if(!session)throw new SocialError('auth','Your Minecraft session expired. Connect again.');
        const uuid=store.user(session.user_id).uuid;
        limit(userLimits,'pairing:'+uuid,90);
        const result=await pairing.request(input,uuid,hash);
        if(!store.row('SELECT 1 FROM sessions WHERE hash=? AND expires>?',hash,store.now()))throw new SocialError('auth','The account changed or signed out.');
        response.end(JSON.stringify(result));return;
      }
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
  const wss=new WebSocketServer({noServer:true,maxPayload:131072,perMessageDeflate:false});
  server.on('upgrade',(request,socket,head)=>{
    if(request.url!=='/v1/realtime'||request.headers.origin){socket.destroy();return;}
    if(peers.size>=1000){socket.destroy();return;}
    wss.handleUpgrade(request,socket,head,ws=>wss.emit('connection',ws,request));
  });
  wss.on('connection',(socket,request)=>{
    const peer:Peer={socket,connection:randomUUID(),players:new Set(),limits:new Map()};peers.add(peer);
    const timer=setTimeout(()=>{if(!peer.user&&!peer.bridge)socket.close(1008,'Authentication required');},5000);timer.unref();
    socket.on('error',()=>{});
    socket.on('close',()=>{clearTimeout(timer);const ids=store.rows('SELECT user_id FROM leases WHERE connection=?',peer.connection).map(r=>r.user_id);store.disconnect(peer.connection);if(peer.bridge)for(const uuid of peer.players)observations.delete(uuid);peers.delete(peer);update(ids);});
    socket.on('message',data=>{
      let requestId:string|undefined;
      try{
        limit(peer.limits,'packets',180,60000);
        const input=JSON.parse(data.toString());
        if(z.string().uuid().safeParse(input?.id).success)requestId=input.id;
        if(!peer.user&&!peer.bridge){
          const auth=z.discriminatedUnion('role',[
            z.object({type:z.literal('authenticate'),role:z.enum(['launcher','server']),token:z.string().min(32).max(200)}).strict(),
            z.object({type:z.literal('authenticate'),role:z.literal('discord'),token:z.string().min(32).max(200),uuid:playerSchema.shape.uuid}).strict()
          ]).parse(input);
          if(auth.role==='server'){
            const expected=Buffer.from(options.bridgeSecret),supplied=Buffer.from(auth.token);if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied))throw new SocialError('auth','Invalid server credentials.');
            if([...peers].some(p=>p!==peer&&p.bridge))throw new SocialError('server','The Minecraft bridge is already connected.');peer.bridge=true;
          }else if(auth.role==='discord'){
            if(!options.discordGatewaySecret)throw new SocialError('auth','Discord access is not configured.');
            const expected=Buffer.from(options.discordGatewaySecret),supplied=Buffer.from(auth.token);if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied))throw new SocialError('auth','Invalid Discord gateway credentials.');
            const account=store.row('SELECT id FROM users WHERE uuid=?',auth.uuid);if(!account)throw new SocialError('identity','Join Usagi SMP or sign into the Launcher before using Social from Discord.');
            peer.user=account.id;peer.discord=true;
          }else{
            const hash=tokenHash(auth.token),session=store.row('SELECT * FROM sessions WHERE hash=? AND expires>?',hash,store.now());if(!session)throw new SocialError('auth','Session expired. Connect again.');peer.user=session.user_id;peer.session=hash;store.lease(peer.connection,peer.user!,'launcher');
          }
          clearTimeout(timer);write(peer,{event:'ready'});update(peer.user?[peer.user]:undefined);return;
        }
        if(peer.bridge){
          const rpc=z.object({id:z.string().uuid(),action:bridgeAction}).strict().parse(input);requestId=rpc.id;const action=rpc.action;
          if(action.op==='capabilities'){write(peer,{id:rpc.id,ok:true,data:{features:['rich_presence.v1']}});return;}
          if(action.op==='players'){
            if (new Set(action.players.map(player=>player.uuid)).size!==action.players.length || action.players.some(player=>(player.joinedAt ?? 0)>store.now()+30000)) throw new SocialError('input','Invalid player observations.');
            const old=store.rows('SELECT user_id FROM leases WHERE connection=?',peer.connection).map(r=>r.user_id);store.disconnect(peer.connection);peer.players=new Set(action.players.map(p=>p.uuid));
            for (const uuid of observations.keys()) if(!peer.players.has(uuid)) observations.delete(uuid);
            for (const player of action.players) {
              if (!player.dimension) {observations.delete(player.uuid);continue;}
              const now=store.now(),previous=observations.get(player.uuid);
              observations.set(player.uuid,{uuid:player.uuid,serverSession:peer.connection,observedAt:now,expiresAt:now+45000,joinedAt:player.joinedAt ?? previous?.joinedAt ?? now,dimension:player.dimension,playerCount:action.players.length,playerNames:[],afk:player.afk ?? false,event:action.event ?? null});
            }
            const ids=action.players.map(p=>{const id=store.identity(p.uuid,p.name);store.lease(peer.connection,id,'playing');return id;});update([...old,...ids]);write(peer,{id:rpc.id,ok:true,data:{}});return;
          }
          if(!peer.players.has(action.uuid))throw new SocialError('identity','The player is not online through this bridge.');
          const id=store.row('SELECT id FROM users WHERE uuid=?',action.uuid)!.id;
          if(action.op==='ack'){store.ackMinecraft(id,action.messageId);write(peer,{id:rpc.id,ok:true,data:{}});return;}
          limit(userLimits,id,120);if(action.action.op==='message')limit(userLimits,id+':messages',30);
          const result=store.action(id,action.action);write(peer,{id:rpc.id,ok:true,data:result});update([id,...('target'in action.action?[action.action.target]:[])]);return;
        }
        const rpc=envelope.parse(input);requestId=rpc.id;
        if(peer.discord&&['received','heartbeat','rename'].includes(rpc.action.op))throw new SocialError('forbidden','This action is not available through Discord.');
        if(!peer.discord&&!store.row('SELECT 1 FROM sessions WHERE hash=? AND expires>?',peer.session!,store.now())){socket.close(1008,'Session expired');return;}
        limit(userLimits,peer.user!,120);
        if(rpc.action.op==='capabilities'){peer.presenceCapable=rpc.action.features.includes('rich_presence.v1');write(peer,{id:rpc.id,ok:true,data:{features:peer.presenceCapable ? ['rich_presence.v1'] : []}});write(peer,{event:'snapshot',data:snapshotFor(peer)});if(!peer.discord&&peer.presenceCapable)write(peer,{event:'activity',data:ownActivity(peer.user!),permitted:presenceControl.permitted,policyExpiresAt:presenceControl.expiry});return;}
        if(rpc.action.op==='message')limit(userLimits,peer.user+':messages',30);
        if(rpc.action.op==='heartbeat')store.lease(peer.connection,peer.user!,'launcher');
        const result=store.action(peer.user!,rpc.action);write(peer,{id:rpc.id,ok:true,data:['snapshot','preferences','rename'].includes(rpc.action.op) ? snapshotFor(peer) : result});
        if(!['received','history','search','snapshot'].includes(rpc.action.op))update([peer.user!,...('target'in rpc.action?[rpc.action.target]:[])]);
      }catch(error){write(peer,{id:requestId,ok:false,error:error instanceof SocialError?error.message:'Invalid Social request.',code:error instanceof SocialError?error.code:'input'});if(!peer.user&&!peer.bridge)socket.close(1008,'Authentication failed');}
    });
  });
  const expiry=setInterval(()=>{store.expire();for(const peer of peers){if(peer.user&&!peer.discord&&!store.row('SELECT 1 FROM sessions WHERE hash=? AND expires>?',peer.session!,store.now()))peer.socket.close(1008,'Session expired');}for(const [uuid,observation] of observations)if(observation.expiresAt<=store.now())observations.delete(uuid);update();},30000);expiry.unref();
  return {server,store,async close(){clearInterval(expiry);for(const peer of peers)peer.socket.terminate();await new Promise<void>(resolve=>wss.close(()=>resolve()));await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();}};
}
