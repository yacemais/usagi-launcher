import {z} from 'zod';

export const presencePreferencesSchema=z.object({enabled:z.boolean().default(false),showMinecraftActivity:z.boolean().default(false),showDimension:z.boolean().default(false),showPlayerCount:z.boolean().default(false),showPlayerNames:z.boolean().default(false),showEvent:z.boolean().default(false)}).strict();
export type PresencePreferences=z.infer<typeof presencePreferencesSchema>;
export const defaultPresencePreferences=():PresencePreferences=>presencePreferencesSchema.parse({});
export const presenceEventSchema=z.object({id:z.string().regex(/^[a-z0-9_-]{1,64}$/),name:z.string().trim().min(1).max(80),text:z.string().trim().min(2).max(128),startsAt:z.number().int().nonnegative(),endsAt:z.number().int().positive(),assetKey:z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/).optional()}).strict().refine(event=>event.endsAt>event.startsAt);
export type PresenceEvent=z.infer<typeof presenceEventSchema>;
export const gameObservationSchema=z.object({uuid:z.string().regex(/^[a-f0-9]{32}$/),serverSession:z.string().uuid(),observedAt:z.number().int().nonnegative(),expiresAt:z.number().int().positive(),joinedAt:z.number().int().nonnegative(),dimension:z.string().regex(/^[a-z0-9_.-]+:[a-z0-9_./-]+$/).max(256),playerCount:z.number().int().min(0).max(500),playerNames:z.array(z.string().regex(/^[A-Za-z0-9_]{1,20}$/)).max(5),afk:z.boolean(),event:presenceEventSchema.nullable()}).strict();
export type GameObservation=z.infer<typeof gameObservationSchema>;
export type PlayerPresence='offline'|'launcher_online'|'minecraft_online'|'afk'|'do_not_disturb';
export interface PresenceState {status:'disabled'|'connecting'|'connected'|'unavailable';message:string}
