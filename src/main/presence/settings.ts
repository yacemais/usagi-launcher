import {z} from 'zod';
import {join} from 'node:path';
import {exists,atomicWrite,readJson} from '../security/files';
import {presencePreferencesSchema,defaultPresencePreferences,type PresencePreferences} from '../../shared/presence';

const schema=z.object({version:z.literal(1),profiles:z.record(z.string().regex(/^(?:launcher|[a-f0-9]{32})$/),presencePreferencesSchema).refine(value=>Object.keys(value).length<=1000)}).strict();
export class PresenceSettings {
  private data:z.infer<typeof schema>={version:1,profiles:{}};
  constructor(private readonly root:string) {}
  async load():Promise<void> {const path=join(this.root,'discord-presence.json');if (await exists(path)) this.data=schema.parse(await readJson(path));}
  get(scope:string):PresencePreferences {return this.data.profiles[scope] ?? defaultPresencePreferences();}
  async save(scope:string,value:PresencePreferences):Promise<void> {
    const next=schema.parse({version:1,profiles:{...this.data.profiles,[scope]:presencePreferencesSchema.parse(value)}});
    await atomicWrite(join(this.root,'discord-presence.json'),JSON.stringify(next,null,2));this.data=next;
  }
}
