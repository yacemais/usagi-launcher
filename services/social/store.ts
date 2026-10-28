import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { SocialUser,SocialSnapshot,SocialMessage,SocialAction } from '../../src/shared/social';
export class SocialError extends Error{constructor(readonly code:string,message:string){super(message);}}
type Row=Record<string,any>;
export class SocialStore{
  readonly db:DatabaseSync;
  constructor(file:string,readonly now:()=>number=Date.now){
    this.db=new DatabaseSync(file);this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,uuid TEXT NOT NULL UNIQUE,minecraft_name TEXT NOT NULL,username TEXT NOT NULL UNIQUE COLLATE NOCASE,visibility TEXT NOT NULL DEFAULT 'visible',discoverable INTEGER NOT NULL DEFAULT 1,requests_open INTEGER NOT NULL DEFAULT 1,notifications INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS friends(a TEXT NOT NULL REFERENCES users(id),b TEXT NOT NULL REFERENCES users(id),requester TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL CHECK(status IN ('pending','accepted')),PRIMARY KEY(a,b),CHECK(a<>b));
      CREATE TABLE IF NOT EXISTS blocks(owner TEXT NOT NULL REFERENCES users(id),target TEXT NOT NULL REFERENCES users(id),PRIMARY KEY(owner,target),CHECK(owner<>target));
      CREATE TABLE IF NOT EXISTS messages(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,sender TEXT NOT NULL REFERENCES users(id),recipient TEXT NOT NULL REFERENCES users(id),text TEXT NOT NULL,created_at INTEGER NOT NULL,client_id TEXT NOT NULL,read_at INTEGER,launcher_ack INTEGER NOT NULL DEFAULT 0,minecraft_ack INTEGER NOT NULL DEFAULT 0,UNIQUE(sender,client_id));
      CREATE INDEX IF NOT EXISTS messages_recipient ON messages(recipient,seq);
      CREATE INDEX IF NOT EXISTS messages_pair ON messages(sender,recipient,seq);
      CREATE INDEX IF NOT EXISTS messages_unread ON messages(recipient,sender) WHERE read_at IS NULL;
      CREATE INDEX IF NOT EXISTS pending_launcher ON messages(recipient,seq) WHERE launcher_ack=0;
      CREATE INDEX IF NOT EXISTS pending_minecraft ON messages(recipient,seq) WHERE minecraft_ack=0;
      CREATE INDEX IF NOT EXISTS friends_b ON friends(b);
      CREATE INDEX IF NOT EXISTS minecraft_names ON users(minecraft_name COLLATE NOCASE);
      CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS leases(connection TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),source TEXT NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(connection,user_id));
      CREATE INDEX IF NOT EXISTS leases_user ON leases(user_id,expires,source);
      PRAGMA user_version=1;`);
    this.db.exec('DELETE FROM leases');
  }
  row(sql:string,...args:(string|number)[]):Row|undefined{return this.db.prepare(sql).get(...args) as Row|undefined;}
  rows(sql:string,...args:(string|number)[]):Row[]{return this.db.prepare(sql).all(...args) as Row[];}
  run(sql:string,...args:(string|number|null)[]){return this.db.prepare(sql).run(...args);}
  transaction<T>(work:()=>T):T{this.db.exec('BEGIN IMMEDIATE');try{const result=work();this.db.exec('COMMIT');return result;}catch(error){this.db.exec('ROLLBACK');throw error;}}
  identity(uuid:string,name:string):string{
    if(!/^[a-f0-9]{32}$/i.test(uuid)||!/^[A-Za-z0-9_]{1,16}$/.test(name))throw new SocialError('identity','Invalid verified Minecraft identity.');
    const existing=this.row('SELECT id FROM users WHERE uuid=?',uuid.toLowerCase());
    if(existing){this.run('UPDATE users SET minecraft_name=? WHERE id=?',name,existing.id);return existing.id;}
    const id=randomUUID();let username=name.length>=3?name:'mc_'+name;
    if(this.row('SELECT id FROM users WHERE username=?',username))username='mc_'+uuid.slice(0,12);
    this.run('INSERT INTO users(id,uuid,minecraft_name,username) VALUES(?,?,?,?)',id,uuid.toLowerCase(),name,username);return id;
  }
  user(id:string):Row{const u=this.row('SELECT * FROM users WHERE id=?',id);if(!u)throw new SocialError('not_found','User not found.');return u;}
  publicUser(id:string,viewer:string):SocialUser{const u=this.user(id);const hidden=id!==viewer&&(u.visibility==='invisible'||this.relationship(id,viewer)?.status!=='accepted');const source=hidden?undefined:this.row('SELECT source FROM leases WHERE user_id=? AND expires>? ORDER BY source DESC LIMIT 1',id,this.now())?.source;return {id,username:u.username,minecraftName:u.minecraft_name,presence:source==='playing'?'playing':source==='launcher'?'launcher':'offline'};}
  pair(a:string,b:string){if(a===b)throw new SocialError('self','Choose another user.');return [a,b].sort();}
  blocked(a:string,b:string){return !!this.row('SELECT 1 FROM blocks WHERE (owner=? AND target=?) OR (owner=? AND target=?)',a,b,b,a);}
  relationship(a:string,b:string){const [low,high]=this.pair(a,b);return this.row('SELECT * FROM friends WHERE a=? AND b=?',low,high);}
  allowed(a:string,b:string){if(this.blocked(a,b)||this.relationship(a,b)?.status!=='accepted')throw new SocialError('forbidden','Messaging is only available between friends who have not blocked each other.');}
  friendIds(id:string){return this.rows("SELECT CASE WHEN a=? THEN b ELSE a END AS id FROM friends WHERE (a=? OR b=?) AND status='accepted'",id,id,id).map(r=>r.id as string);}
  snapshot(id:string):SocialSnapshot{
    const u=this.user(id),relations=this.rows('SELECT *,CASE WHEN a=? THEN b ELSE a END AS target FROM friends WHERE a=? OR b=?',id,id,id);
    const unread=(target:string)=>Number(this.row('SELECT COUNT(*) n FROM messages WHERE sender=? AND recipient=? AND read_at IS NULL',target,id)?.n||0);
    return {me:this.publicUser(id,id),friends:relations.filter(r=>r.status==='accepted').map(r=>({...this.publicUser(r.target,id),unread:unread(r.target)})),requests:{incoming:relations.filter(r=>r.status==='pending'&&r.requester!==id).map(r=>this.publicUser(r.target,id)),outgoing:relations.filter(r=>r.status==='pending'&&r.requester===id).map(r=>this.publicUser(r.target,id))},blocked:this.rows('SELECT target FROM blocks WHERE owner=?',id).map(r=>this.publicUser(r.target,id)),preferences:{visibility:u.visibility,discoverable:!!u.discoverable,requestsOpen:!!u.requests_open,notifications:!!u.notifications}};
  }
  search(id:string,name:string){return this.rows('SELECT id FROM users WHERE id<>? AND discoverable=1 AND (username=? COLLATE NOCASE OR minecraft_name=? COLLATE NOCASE) LIMIT 5',id,name,name).filter(r=>!this.blocked(id,r.id)).map(r=>this.publicUser(r.id,id));}
  action(id:string,action:SocialAction):unknown{
    this.user(id);
    if(action.op==='snapshot')return this.snapshot(id);
    if(action.op==='heartbeat')return {};
    if(action.op==='search')return this.search(id,action.name);
    if(action.op==='rename'){try{this.run('UPDATE users SET username=? WHERE id=?',action.name,id);}catch{throw new SocialError('username','That Usagi username is unavailable.');}return this.snapshot(id);}
    if(action.op==='preferences'){this.run('UPDATE users SET visibility=?,discoverable=?,requests_open=?,notifications=? WHERE id=?',action.visibility,+action.discoverable,+action.requestsOpen,+action.notifications,id);return this.snapshot(id);}
    if(action.op==='received'){this.run('UPDATE messages SET launcher_ack=1 WHERE id=? AND recipient=?',action.messageId,id);return {};}
    const target=action.target;this.user(target);this.pair(id,target);
    if(action.op==='unblock'){this.run('DELETE FROM blocks WHERE owner=? AND target=?',id,target);return {};}
    if(action.op==='block'){return this.transaction(()=>{if(this.rows('SELECT target FROM blocks WHERE owner=?',id).length>=1000)throw new SocialError('limit','Blocked-user limit reached.');this.run('INSERT OR IGNORE INTO blocks(owner,target) VALUES(?,?)',id,target);this.remove(id,target);return {};});}
    if(this.blocked(id,target))throw new SocialError('blocked','This interaction is unavailable.');
    const [a,b]=this.pair(id,target),rel=this.relationship(id,target);
    if(action.op==='request'){
      if(!this.user(target).requests_open)throw new SocialError('privacy','This player is not accepting friend requests.');
      if(rel)throw new SocialError('relationship','A request or friendship already exists.');
      if(this.rows('SELECT 1 FROM friends WHERE a=? OR b=?',id,id).length>=250||this.rows('SELECT 1 FROM friends WHERE a=? OR b=?',target,target).length>=250)throw new SocialError('limit','Friend and request limit reached.');
      this.run("INSERT INTO friends(a,b,requester,status) VALUES(?,?,?,'pending')",a,b,id);return {};
    }
    if(['accept','decline','cancel'].includes(action.op)){
      if(!rel||rel.status!=='pending'||(action.op==='cancel'?rel.requester!==id:rel.requester===id))throw new SocialError('forbidden','This request is not yours to change.');
      if(action.op==='accept')this.run("UPDATE friends SET status='accepted' WHERE a=? AND b=?",a,b);else this.run('DELETE FROM friends WHERE a=? AND b=?',a,b);return {};
    }
    if(action.op==='remove'){this.remove(id,target);return {};}
    this.allowed(id,target);
    if(action.op==='message')return this.send(id,target,action.text,action.clientId);
    if(action.op==='history')return this.rows('SELECT * FROM messages WHERE ((sender=? AND recipient=?) OR (sender=? AND recipient=?)) AND seq<? ORDER BY seq DESC LIMIT 50',id,target,target,id,action.before||Number.MAX_SAFE_INTEGER).reverse().map(r=>this.message(r));
    if(action.op==='read'){this.run('UPDATE messages SET read_at=? WHERE recipient=? AND sender=? AND seq<=? AND read_at IS NULL',this.now(),id,target,action.through);return {};}
    throw new SocialError('operation','Unsupported operation.');
  }
  private remove(id:string,target:string){const [a,b]=this.pair(id,target);this.run('DELETE FROM friends WHERE a=? AND b=?',a,b);this.run('UPDATE messages SET launcher_ack=1,minecraft_ack=1,read_at=COALESCE(read_at,?) WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)',this.now(),id,target,target,id);}
  send(sender:string,recipient:string,text:string,clientId:string):SocialMessage{
    this.allowed(sender,recipient);
    const old=this.row('SELECT * FROM messages WHERE sender=? AND client_id=?',sender,clientId);
    if(old){if(old.recipient!==recipient||old.text!==text)throw new SocialError('replay','Message request ID was already used.');return this.message(old);}
    this.run('INSERT INTO messages(id,sender,recipient,text,created_at,client_id) VALUES(?,?,?,?,?,?)',randomUUID(),sender,recipient,text,this.now(),clientId);
    return this.message(this.row('SELECT * FROM messages WHERE sender=? AND client_id=?',sender,clientId)!);
  }
  message(r:Row):SocialMessage{return {id:r.id,seq:Number(r.seq),sender:r.sender,recipient:r.recipient,text:r.text,createdAt:Number(r.created_at),readAt:r.read_at===null?null:Number(r.read_at)};}
  pending(id:string,source:'launcher'|'minecraft'){return this.rows(`SELECT * FROM messages WHERE recipient=? AND ${source==='launcher'?'launcher_ack':'minecraft_ack'}=0 ORDER BY seq LIMIT 100`,id).filter(r=>!this.blocked(id,r.sender)&&this.relationship(id,r.sender)?.status==='accepted').map(r=>this.message(r));}
  ackMinecraft(id:string,messageId:string){this.run('UPDATE messages SET minecraft_ack=1 WHERE recipient=? AND id=?',id,messageId);}
  lease(connection:string,id:string,source:'launcher'|'playing'){this.run('INSERT INTO leases(connection,user_id,source,expires) VALUES(?,?,?,?) ON CONFLICT(connection,user_id) DO UPDATE SET expires=excluded.expires',connection,id,source,this.now()+65000);}
  disconnect(connection:string){this.run('DELETE FROM leases WHERE connection=?',connection);}
  expire(){this.run('DELETE FROM leases WHERE expires<=?',this.now());this.run('DELETE FROM sessions WHERE expires<=?',this.now());}
  close(){this.db.close();}
}
