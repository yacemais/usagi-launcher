import http from 'node:http';
import { randomBytes,timingSafeEqual } from 'node:crypto';
import { CryptoProvider, type PublicClientApplication, type AuthenticationResult } from '@azure/msal-node';
export const scopes=['XboxLive.signin','offline_access'];
export function microsoftBrowserUrl(value:string){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||!['login.microsoftonline.com','login.live.com','microsoft.com','www.microsoft.com'].includes(u.hostname))throw new Error('Unexpected Microsoft sign-in URL.');return u.href;}
export async function browserLogin(client:Pick<PublicClientApplication,'getAuthCodeUrl'|'acquireTokenByCode'>,openBrowser:(url:string)=>Promise<void>,signal:AbortSignal):Promise<AuthenticationResult>{
  signal.throwIfAborted();
  const state=randomBytes(32).toString('base64url'),nonce=randomBytes(32).toString('base64url');
  const pkce=await new CryptoProvider().generatePkceCodes();
  let redirectUri='',received=false,finish:(value:{code:string}|Error)=>void=()=>{};
  const response=new Promise<{code:string}>((resolve,reject)=>{finish=value=>value instanceof Error?reject(value):resolve(value);});
  void response.catch(()=>{});
  const server=http.createServer({maxHeaderSize:16384},(request,res)=>{
    res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');
    let u:URL;try{u=new URL(request.url || '/',redirectUri);}catch{res.writeHead(400);res.end('Invalid callback.');return;}
    if(request.method!=='GET'||u.origin!==new URL(redirectUri).origin||u.pathname!=='/'||request.headers.host!==new URL(redirectUri).host){res.writeHead(404);res.end('Not found.');return;}
    if(received){res.writeHead(409);res.end('This sign-in response was already received. Return to Usagi.');return;}
    const supplied=Buffer.from(u.searchParams.get('state') || '');const expected=Buffer.from(state);
    if(u.searchParams.getAll('state').length!==1||supplied.length!==expected.length || !timingSafeEqual(supplied,expected)){res.writeHead(400);res.end('Sign-in request did not match. Return to Usagi and try again.');return;}
    const code=u.searchParams.get('code');
    if(u.searchParams.has('error')){received=true;res.writeHead(400);res.end('Microsoft sign-in was declined. Return to Usagi.');finish(new Error('authorization_declined'));}
    else if(u.searchParams.getAll('code').length!==1||!code || code.length>8192){res.writeHead(400);res.end('Invalid sign-in response.');}
    else{received=true;res.end('Microsoft authorization received. Return to Usagi to finish verifying Minecraft Java ownership. You can close this tab.');finish({code});}
  });
  server.requestTimeout=10000;server.headersTimeout=10000;server.maxConnections=8;
  const abort=()=>finish(new Error('Sign-in cancelled.'));signal.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>finish(new Error('Sign-in timed out. Try again.')),5*60*1000);timer.unref();
  try{
    await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);resolve();});});
    redirectUri='http://localhost:'+(server.address() as import('node:net').AddressInfo).port;
    server.on('error',error=>finish(error));signal.throwIfAborted();
    const url=await client.getAuthCodeUrl({scopes,redirectUri,state,nonce,codeChallenge:pkce.challenge,codeChallengeMethod:'S256',prompt:'select_account',responseMode:'query'});
    await openBrowser(microsoftBrowserUrl(url));
    const {code}=await response;signal.throwIfAborted();
    return await client.acquireTokenByCode({scopes,redirectUri,code,codeVerifier:pkce.verifier,nonce,state});
  }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
