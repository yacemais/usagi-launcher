import { z } from 'zod';
import { socialActionSchema } from './social';
const url = z.string().max(2048).refine(v => !v || (() => { try { const u=new URL(v); return u.protocol==='https:' && !u.username && !u.password && !u.hash; } catch { return false; } })(), 'Use an HTTPS URL without credentials.');
export const settingsSchema = z.object({
  ramMb:z.number().int().min(2048).max(65536), width:z.number().int().min(640).max(7680), height:z.number().int().min(360).max(4320), fullscreen:z.boolean(),
  gameDirectory:z.string().min(1).max(1000), javaPath:z.string().max(1000), minimizeOnLaunch:z.boolean(), launchBehavior:z.enum(['stay','minimize']),
  concurrency:z.number().int().min(1).max(12), notifications:z.boolean(), language:z.literal('en'),
  appUpdateChannel:z.enum(['stable','beta']).default('stable'),
  manifestUrl:url, manifestPublicKey:z.string().max(4096), newsUrl:url, serverHost:z.string().max(253).refine(v=>!v || /^[a-zA-Z0-9.:-]+$/.test(v),'Enter a hostname or IP address.'),
  serverPort:z.number().int().min(1).max(65535), microsoftClientId:z.string().refine(v=>!v || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),'Enter an application client ID.'), optionalFiles:z.array(z.string().max(200)).max(1000), autoJoin:z.boolean()
}).strict();
const simple = ['startup.visibility','snapshot','directory.choose','java.choose','install','verify','updates.check','cancel','launch','auth.cancel','server.refresh','news.refresh','appUpdates.check','appUpdates.download','appUpdates.cancel','appUpdates.install'] as const;
export const commandSchema = z.union([
  z.object({type:z.literal('social.connect')}).strict(),z.object({type:z.literal('social.disconnect')}).strict(),z.object({type:z.literal('social.action'),action:socialActionSchema}).strict(),
  ...simple.map(type=>z.object({type:z.literal(type)}).strict()),
  z.object({type:z.literal('auth.login'),method:z.enum(['browser','device']).optional()}).strict(),
  z.object({type:z.literal('settings.save'),settings:settingsSchema}).strict(),
  z.object({type:z.enum(['auth.logout','auth.select']),accountId:z.string().min(1).max(300)}).strict(),
  z.object({type:z.literal('external.open'),url:z.string().url().max(2048)}).strict(),
  z.object({type:z.literal('folder.open'),folder:z.enum(['logs','game','crashes'])}).strict(),
  z.object({type:z.literal('window'),action:z.enum(['minimize','maximize','close'])}).strict()
]);
