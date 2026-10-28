import { z } from 'zod';
export const socialName=z.string().trim().regex(/^[A-Za-z0-9_]{3,20}$/);
const id=z.string().uuid();
export const socialActionSchema=z.discriminatedUnion('op',[
  z.object({op:z.literal('snapshot')}).strict(),
  z.object({op:z.literal('search'),name:socialName}).strict(),
  z.object({op:z.literal('request'),target:id}).strict(),
  ...(['accept','decline','cancel','remove','block','unblock'] as const).map(op=>z.object({op:z.literal(op),target:id}).strict()),
  z.object({op:z.literal('message'),target:id,text:z.string().trim().min(1).max(1000).refine(s=>!/[\u0000-\u0008\u000b-\u001f\u007f]/.test(s)),clientId:id}).strict(),
  z.object({op:z.literal('history'),target:id,before:z.number().int().positive().optional()}).strict(),
  z.object({op:z.literal('read'),target:id,through:z.number().int().positive()}).strict(),
  z.object({op:z.literal('received'),messageId:id}).strict(),
  z.object({op:z.literal('preferences'),visibility:z.enum(['visible','invisible']),discoverable:z.boolean(),requestsOpen:z.boolean(),notifications:z.boolean()}).strict(),
  z.object({op:z.literal('rename'),name:socialName}).strict(),
  z.object({op:z.literal('heartbeat')}).strict()
]);
export type SocialAction=z.infer<typeof socialActionSchema>;
export interface SocialUser{id:string;username:string;minecraftName:string;presence:'offline'|'launcher'|'playing'}
export interface SocialMessage{id:string;seq:number;sender:string;recipient:string;text:string;createdAt:number;readAt:number|null}
export interface SocialSnapshot{
  me:SocialUser;friends:(SocialUser&{unread:number})[];
  requests:{incoming:SocialUser[];outgoing:SocialUser[]};blocked:SocialUser[];
  preferences:{visibility:'visible'|'invisible';discoverable:boolean;requestsOpen:boolean;notifications:boolean};
}
export interface SocialState{status:'unconfigured'|'disconnected'|'connecting'|'connected'|'error';message:string;data?:SocialSnapshot;conversations:Record<string,SocialMessage[]>;error?:string}
export const socialUserSchema=z.object({id,username:z.string().min(1).max(20),minecraftName:z.string().min(1).max(16),presence:z.enum(['offline','launcher','playing'])}).strict();
export const socialMessageSchema=z.object({id,seq:z.number().int().positive(),sender:id,recipient:id,text:z.string().min(1).max(1000),createdAt:z.number().int().nonnegative(),readAt:z.number().int().nonnegative().nullable()}).strict();
export const socialSnapshotSchema=z.object({me:socialUserSchema,friends:z.array(socialUserSchema.extend({unread:z.number().int().nonnegative()})).max(250),requests:z.object({incoming:z.array(socialUserSchema).max(250),outgoing:z.array(socialUserSchema).max(250)}).strict(),blocked:z.array(socialUserSchema).max(1000),preferences:z.object({visibility:z.enum(['visible','invisible']),discoverable:z.boolean(),requestsOpen:z.boolean(),notifications:z.boolean()}).strict()}).strict();
export const emptySocial=():SocialState=>({status:'unconfigured',message:'The Social service has not been configured.',conversations:{}});
