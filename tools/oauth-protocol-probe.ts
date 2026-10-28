import { PublicClientApplication } from '@azure/msal-node';
import { browserLogin } from '../src/main/authentication/browser';
import { loadProduct } from '../src/main/config/product';
import { promises as fs } from 'node:fs';
async function main(){
  const product=await loadProduct(process.cwd());const client=new PublicClientApplication({auth:{clientId:product.microsoftClientId,authority:'https://login.microsoftonline.com/consumers'},system:{loggerOptions:{piiLoggingEnabled:false,loggerCallback:()=>{}}}});
  const stopped=new Error('Probe stopped before user consent.');let checked=false;
  try{await browserLogin(client,async url=>{const u=new URL(url),redirect=new URL(u.searchParams.get('redirect_uri')!),scopes=(u.searchParams.get('scope')||'').split(' ');if(u.searchParams.get('client_id')!==product.microsoftClientId||u.searchParams.get('response_type')!=='code'||u.searchParams.get('code_challenge_method')!=='S256'||redirect.hostname!=='localhost'||!redirect.port||scopes.indexOf('XboxLive.signin')<0||u.searchParams.has('client_secret'))throw new Error('Real MSAL authorization parameters did not match the expected native PKCE flow.');checked=true;await fs.writeFile('docs/oauth-protocol-results.json',JSON.stringify({realMsal:true,clientId:product.microsoftClientId,authority:u.origin+u.pathname,redirect:'http://localhost:<ephemeral-port>',codeFlow:true,s256Pkce:true,scopes,clientSecretUsed:false,browserOpened:false,realAccountAuthenticated:false},null,2));console.log('REAL MSAL PKCE URL CHECK PASSED; browser consent and Minecraft login were not performed.');throw stopped;},AbortSignal.timeout(30000));}catch(error){if(error!==stopped)throw error;}if(!checked)throw new Error('Authorization URL was not inspected.');
}
main().catch(()=>{console.error('Real Microsoft protocol probe failed; no credentials were used or logged.');process.exitCode=1;});
