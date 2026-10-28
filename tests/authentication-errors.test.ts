import { describe,it,expect } from 'vitest';
import { authenticationDiagnostic,MinecraftAuthError } from '../src/main/authentication/errors';

describe('authentication failure diagnostics without provider payload disclosure',()=>{
  it('identifies the explicit Minecraft registration denial while discarding raw fields',()=>{
    const error={status:403,body:JSON.stringify({errorMessage:'Invalid app registration, see https://aka.ms/AppRegInfo',access_token:'fixture-sensitive-token',username:'FixtureUser'})};
    const result=new MinecraftAuthError('Getting a Minecraft session',error);
    expect(result.diagnostic).toEqual({httpStatus:403,reason:'minecraft_app_registration'});
    expect(result.message).toContain('Invalid app registration');
    expect(result.message).not.toMatch(/fixture-sensitive-token|FixtureUser/);
  });
  it('does not assume that every forbidden response is an app approval problem',()=>{
    const result=new MinecraftAuthError('Getting a Minecraft session',{status:403,body:JSON.stringify({errorMessage:'Forbidden'})});
    expect(result.message).toContain('HTTP 403');expect(result.diagnostic.reason).toBeUndefined();
  });
  it('retains Xbox error numbers without retaining the SDK message or redirect',()=>{
    const result=new MinecraftAuthError('Authorizing Minecraft with Xbox',{XErr:2148916233,message:'Failed to authorize with xbox live, status code: 401: private-provider-body'});
    expect(result.diagnostic).toEqual({httpStatus:401,xboxError:2148916233});expect(result.message).not.toContain('private-provider-body');
  });
  it('rejects unbounded, invalid or credential-shaped provider diagnostics',()=>{
    for(const error of [null,'raw-error',{status:'secret',XErr:'secret',body:'unparsed-secret'},{status:999,XErr:-1,body:'x'.repeat(16385)}])expect(authenticationDiagnostic(error)).toEqual({});
  });
  it('distinguishes rate limiting, service outage and rejected identity tokens',()=>{
    expect(new MinecraftAuthError('Session',{status:429}).message).toContain('rate limiting');
    expect(new MinecraftAuthError('Session',{status:503}).message).toContain('temporarily unavailable');
    expect(authenticationDiagnostic({status:401,body:JSON.stringify({errorMessage:'Invalid identity token'})}).reason).toBe('invalid_identity_token');
  });
});
