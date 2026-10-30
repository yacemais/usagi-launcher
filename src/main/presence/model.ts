import type {GameObservation,PresencePreferences} from '../../shared/presence';

export interface DiscordActivity {type:0;details:string;state?:string;timestamps:{start:number};assets?:{large_image:string;large_text:string}}
export interface PresenceInput {preferences:PresencePreferences;accountUuid?:string;gameRunning:boolean;gameStartedAt?:number;launcherStartedAt:number;observation?:GameObservation|null;now:number;visible?:boolean;permitted?:boolean;largeImage?:string;eventAssets?:readonly string[]}
export function dimensionLabel(key:string):string {
  const vanilla:Record<string,string>={'minecraft:overworld':'the Overworld','minecraft:the_nether':'the Nether','minecraft:the_end':'The End'};
  return vanilla[key] ?? (key.split(':')[1] ?? key).replace(/[_./-]+/g,' ').replace(/\b\w/g,letter=>letter.toUpperCase()).slice(0,90);
}
export function buildActivity(input:PresenceInput):DiscordActivity|null {
  const pref=input.preferences;if (!pref.enabled || input.visible===false || input.permitted===false) return null;
  const source=input.observation;const fresh=source && source.uuid===input.accountUuid?.replaceAll('-','').toLowerCase() && source.observedAt<=input.now+30000 && source.observedAt>=input.now-65000 && source.expiresAt>input.now && source.expiresAt<=source.observedAt+65000 && source.joinedAt<=source.observedAt;
  let details='In the Launcher';let start=input.launcherStartedAt;let state:string|undefined;let eventImage:string|undefined;
  if (pref.showMinecraftActivity && (fresh || input.gameRunning)) {
    details=fresh ? source.afk ? 'AFK on Usagi SMP' : pref.showDimension ? 'Exploring '+dimensionLabel(source.dimension) : 'Playing Usagi SMP' : 'Playing Minecraft';
    start=fresh ? source.joinedAt : input.gameStartedAt ?? input.launcherStartedAt;
    if (fresh) {
      const event=source.event;
      if (pref.showEvent && event && event.startsAt<=input.now && input.now<event.endsAt) {details=event.text;if (event.assetKey && input.eventAssets?.includes(event.assetKey)) eventImage=event.assetKey;}
      if (pref.showPlayerNames && source.playerNames.length) state='Playing with '+source.playerNames.slice(0,2).join(', ')+(source.playerNames.length>2 ? ' +'+(source.playerNames.length-2) : '');
      else if (pref.showPlayerCount) state=source.playerCount+' players online';
    }
  }
  const image=eventImage || input.largeImage;
  return {type:0,details:details.slice(0,128),...(state ? {state:state.slice(0,128)} : {}),timestamps:{start:Math.floor(Math.min(input.now,Math.max(0,start))/1000)},...(image ? {assets:{large_image:image,large_text:'Usagi SMP'}} : {})};
}
