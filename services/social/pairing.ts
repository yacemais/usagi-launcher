import {createHash,createHmac,randomBytes} from 'node:crypto';
import {pairingActionSchema,pairingResultSchema} from '../../src/shared/pairing';
import {SocialError} from './store';

export class PairingProxy {
  private readonly endpoint:URL;
  constructor(private readonly config:{backendOrigin:string;guildId:string;secret:string;environment:string},private readonly now=()=>Date.now()) {
    const url=new URL(config.backendOrigin),local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if(url.username || url.password || url.hash || url.search || url.pathname!=='/' || url.protocol!=='https:' && !(config.environment!=='production' && url.protocol==='http:' && local) || !/^\d{17,20}$/.test(config.guildId) || config.secret.length<32 || config.secret.length>200)throw new Error('Invalid account pairing configuration.');
    this.endpoint=new URL('/v1/link/launcher',url);
  }
  async request(input:unknown,uuid:string,sessionHash:string) {
    const action=pairingActionSchema.parse(input),path=this.endpoint.pathname;
    const body=JSON.stringify({...action,protocol:1,guildId:this.config.guildId,minecraftUuid:uuid,sessionHash});
    const timestamp=String(this.now()),nonce=randomBytes(16).toString('hex');
    const canonical=['POST',path,'usagi-social-pairing',this.config.environment,timestamp,nonce,createHash('sha256').update(body).digest('hex')].join('\n');
    const signature=createHmac('sha256',this.config.secret).update(canonical).digest('hex');
    let response:Response;
    try {response=await fetch(this.endpoint,{method:'POST',headers:{'content-type':'application/json','x-usagi-server':'usagi-social-pairing','x-usagi-environment':this.config.environment,'x-usagi-timestamp':timestamp,'x-usagi-nonce':nonce,'x-usagi-signature':signature},body,redirect:'error',signal:AbortSignal.timeout(5000)});}catch {throw new SocialError('unavailable','Discord account linking is unavailable. Check its status before retrying.');}
    if(!response.ok){await response.body?.cancel();throw new SocialError(response.status===429 ? 'rate_limit' : 'pairing','Account linking was refused. The code may have expired, a link may already exist, or linking may be disabled. Start again in the Launcher.');}
    const text=await response.text();if(text.length>4096)throw new SocialError('pairing','Invalid linking response.');
    return pairingResultSchema.parse(JSON.parse(text));
  }
}
