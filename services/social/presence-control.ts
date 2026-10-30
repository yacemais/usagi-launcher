import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {SocialError,type SocialStore} from './store';

const schema=z.object({protocol:z.literal(1),guildId:z.string().regex(/^\d{17,20}$/),environment:z.enum(['development','staging','production']),enabled:z.boolean(),issuedAt:z.number().int().nonnegative(),nonce:z.string().uuid()}).strict();
export class PresenceControl {
  private enabled=false;private expiresAt=0;
  constructor(private readonly store:SocialStore,private readonly options:{guildId?:string;key?:string;environment:string}) {
    if(options.guildId && (!/^\d{17,20}$/.test(options.guildId) || !options.key))throw new Error('Invalid managed presence configuration.');
    store.db.exec('CREATE TABLE IF NOT EXISTS presence_control_nonces(nonce TEXT PRIMARY KEY,issued_at INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS presence_control_state(id INTEGER PRIMARY KEY CHECK(id=1),issued_at INTEGER NOT NULL);');
  }
  get permitted():boolean {return !this.options.guildId || this.enabled && this.expiresAt>this.store.now();}
  get expiry():number|null {return this.options.guildId ? this.expiresAt : null;}
  accept(input:unknown,signature:string|undefined):void {
    const body=schema.safeParse(input);if(!this.options.guildId || !this.options.key || !body.success || !signature || !/^[a-f\d]{64}$/.test(signature))throw new SocialError('auth','Presence policy refused.');
    const value=body.data;const now=this.store.now();
    const expected=createHmac('sha256',this.options.key).update('/v1/presence/policy\n'+JSON.stringify(value)).digest();
    if(!timingSafeEqual(expected,Buffer.from(signature,'hex')) || value.guildId!==this.options.guildId || value.environment!==this.options.environment || Math.abs(now-value.issuedAt)>30000)throw new SocialError('auth','Presence policy refused.');
    this.store.transaction(()=>{
      this.store.run('DELETE FROM presence_control_nonces WHERE issued_at<?',now-120000);
      if(this.store.row('SELECT 1 FROM presence_control_nonces WHERE nonce=?',value.nonce) || Number(this.store.row('SELECT issued_at FROM presence_control_state WHERE id=1')?.issued_at ?? -1)>=value.issuedAt)throw new SocialError('auth','Presence policy refused.');
      this.store.run('INSERT INTO presence_control_nonces VALUES (?,?)',value.nonce,value.issuedAt);this.store.run('INSERT INTO presence_control_state VALUES (1,?) ON CONFLICT(id) DO UPDATE SET issued_at=excluded.issued_at',value.issuedAt);
    });
    this.enabled=value.enabled;this.expiresAt=now+65000;
  }
}
