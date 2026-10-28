import { describe,it,expect,vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { AuthenticationResult,PublicClientApplication } from '@azure/msal-node';
import { browserLogin,microsoftBrowserUrl } from '../src/main/authentication/browser';
describe('real loopback HTTP browser authorization using mocked Microsoft token APIs',()=>{
  it('uses a random state, nonce and S256 PKCE; exchanges only the validated code',async()=>{
    let parameters:any,redirect='';
    const client={getAuthCodeUrl:vi.fn(async p=>{parameters=p;redirect=p.redirectUri;return 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize';}),acquireTokenByCode:vi.fn(async(_request:any)=>({accessToken:'fixture-only'} as AuthenticationResult))};
    const result=await browserLogin(client,async()=>{
      const wrong=await fetch(redirect+'/?code=forged&state=wrong');expect(wrong.status).toBe(400);expect(client.acquireTokenByCode).not.toHaveBeenCalled();
      const duplicate=await fetch(redirect+'/?code=first&code=second&state='+parameters.state);expect(duplicate.status).toBe(400);
      const response=await fetch(redirect+'/?code=real-fixture-code&state='+parameters.state);expect(response.status).toBe(200);expect(await response.text()).toContain('Return to Usagi');
      const replay=await fetch(redirect+'/?code=real-fixture-code&state='+parameters.state);expect(replay.status).toBe(409);
    },new AbortController().signal);
    expect(result.accessToken).toBe('fixture-only');const request=client.acquireTokenByCode.mock.calls[0][0] as any;expect(request.code).toBe('real-fixture-code');expect(request.nonce).toBe(parameters.nonce);expect(request.state.length).toBeGreaterThan(30);expect(createHash('sha256').update(request.codeVerifier).digest('base64url')).toBe(parameters.codeChallenge);expect(parameters.codeChallengeMethod).toBe('S256');
    await expect(fetch(redirect)).rejects.toThrow();
  });
  it('cancels and closes the loopback listener without redeeming a code',async()=>{
    const abort=new AbortController();let redirect='';const client={getAuthCodeUrl:vi.fn(async p=>{redirect=p.redirectUri;return 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize';}),acquireTokenByCode:vi.fn()};
    await expect(browserLogin(client as Pick<PublicClientApplication,'getAuthCodeUrl'|'acquireTokenByCode'>,async()=>{abort.abort();},abort.signal)).rejects.toThrow(/cancelled/);expect(client.acquireTokenByCode).not.toHaveBeenCalled();await expect(fetch(redirect)).rejects.toThrow();
  });
  it('rejects browser destinations outside Microsoft HTTPS hosts',()=>{for(const url of ['https://evil.example','http://login.live.com','https://login.live.com.evil.example','https://user:secret@login.live.com'])expect(()=>microsoftBrowserUrl(url)).toThrow();expect(microsoftBrowserUrl('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize')).toContain('microsoftonline.com');});
});
