export interface AuthenticationDiagnostic {
  httpStatus?:number;
  xboxError?:number;
  reason?:'minecraft_app_registration'|'invalid_identity_token';
}

export function authenticationDiagnostic(error:unknown):AuthenticationDiagnostic {
  if(!error||typeof error!=='object')return {};
  const source=error as {status?:unknown;body?:unknown;message?:unknown;XErr?:unknown};
  const result:AuthenticationDiagnostic={};
  const status=typeof source.status==='number'?source.status:typeof source.message==='string'?Number(/status code:\s*(\d{3})\b/i.exec(source.message)?.[1]):NaN;
  if(Number.isInteger(status)&&status>=100&&status<=599)result.httpStatus=status;
  if(typeof source.XErr==='number'&&Number.isSafeInteger(source.XErr)&&source.XErr>0)result.xboxError=source.XErr;
  if(typeof source.body==='string'&&source.body.length<=16384){
    try{
      const body=JSON.parse(source.body) as {errorMessage?:unknown;developerMessage?:unknown};
      const messages=[body?.errorMessage,body?.developerMessage].filter((value):value is string=>typeof value==='string').join(' ');
      if(/invalid app(?:lication)? registration/i.test(messages))result.reason='minecraft_app_registration';
      else if(/invalid identity token/i.test(messages))result.reason='invalid_identity_token';
    }catch{}
  }
  return result;
}

export class MinecraftAuthError extends Error {
  readonly diagnostic:AuthenticationDiagnostic;
  constructor(step:string,error:unknown){
    const detail=authenticationDiagnostic(error);
    const codes=[detail.httpStatus?`HTTP ${detail.httpStatus}`:'',detail.xboxError?`Xbox XErr ${detail.xboxError}`:''].filter(Boolean);
    const reason=detail.reason==='minecraft_app_registration'
      ? 'Minecraft Services rejected Usagi: Invalid app registration. The owner must request Minecraft Java API access for Usagi\'s registered client ID (https://aka.ms/AppRegInfo).'
      : detail.reason==='invalid_identity_token'
        ? 'Minecraft Services rejected the Xbox identity token. Sign in again; if this continues, review the Xbox session exchange.'
        : detail.httpStatus===429
          ? 'The service is rate limiting requests. Wait before signing in again.'
          : detail.httpStatus&&detail.httpStatus>=500
            ? 'The authentication service is temporarily unavailable. Try again later.'
            : 'Check Xbox account setup, family permissions, network access and Usagi\'s Minecraft API access.';
    super(`${step} failed${codes.length?' ('+codes.join(', ')+')':''}. ${reason}`);
    this.name='MinecraftAuthError';
    this.diagnostic=detail;
  }
}
