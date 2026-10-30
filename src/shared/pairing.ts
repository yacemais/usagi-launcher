import {z} from 'zod';

export const pairingActionSchema=z.discriminatedUnion('op',[
  z.object({op:z.literal('begin')}).strict(),
  ...(['status','cancel'] as const).map(op=>z.object({op:z.literal(op),id:z.string().uuid()}).strict()),
  z.object({op:z.literal('approve'),id:z.string().uuid(),discordId:z.string().regex(/^\d{17,20}$/)}).strict()
]);
export const pairingResultSchema=z.object({protocol:z.literal(1),id:z.string().uuid(),expiresAt:z.number().int().positive(),state:z.enum(['pending','claimed','linked','cancelled']),discordId:z.string().regex(/^\d{17,20}$/).optional(),code:z.string().regex(/^(?:[A-F\d]{4}-){4}[A-F\d]{4}$/).optional()}).strict();
export type PairingAction=z.infer<typeof pairingActionSchema>;
export type PairingResult=z.infer<typeof pairingResultSchema>;
