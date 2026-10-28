import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
export function redact(text:string) { return text.replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi,'$1[redacted]').replace(/((?:access_token|refresh_token|id_token|client_secret|identityToken|Authorization)["'\s:=]+)[^\s,"'}]+/gi,'$1[redacted]').replace(/(--accessToken\s+)[^\s]+/gi,'$1[redacted]'); }
export class Logger {
  private secrets=new Set<string>();
  constructor(public directory:string) { mkdirSync(directory,{recursive:true}); }
  secret(value:string) { if(value.length>8) this.secrets.add(value); }
  clean(value:string) { let text=redact(value); for(const secret of this.secrets) text=text.split(secret).join('[redacted]'); return text; }
  write(message:string, file='launcher.log') { appendFileSync(path.join(this.directory,file),new Date().toISOString()+' '+this.clean(message)+'\n',{mode:0o600}); }
}
