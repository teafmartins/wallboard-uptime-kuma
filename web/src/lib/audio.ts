let ctx: AudioContext | null = null;
let unlocked = false;
const played = new Map<string, number>();

export async function unlockAudio() {
  try {
    if (!ctx) ctx = new AudioContext();
    await ctx.resume();
    unlocked = ctx.state === "running";
    return unlocked;
  } catch (error) {
    unlocked = false;
    console.warn("[AUDIO] Autoplay/audio context activation was blocked:", error);
    return false;
  }
}
export function audioUnlocked(){ return unlocked; }

function beep(freq:number, at:number, duration:number, gainValue:number) {
  if (!ctx) return;
  const osc = ctx.createOscillator(); const gain = ctx.createGain();
  osc.type="sine"; osc.frequency.value=freq; gain.gain.value=gainValue;
  osc.connect(gain); gain.connect(ctx.destination); osc.start(at); osc.stop(at+duration);
}

async function playBuiltin(kind:string, volume:number) {
  if (!ctx) ctx = new AudioContext();
  await ctx.resume();
  const now = ctx.currentTime + 0.02;
  const g = Math.max(0.02, Math.min(1, volume)) * 0.18;
  if (kind === "recovery") { beep(520, now, .12, g); beep(760, now+.16, .16, g); return; }
  if (kind === "warning") { beep(620, now, .16, g); beep(620, now+.25, .16, g); return; }
  beep(760, now, .16, g); beep(520, now+.23, .18, g); beep(760, now+.48, .2, g);
}

export async function playSound(ref:string|undefined, volume=.75) {
  if (!unlocked || !ref) return false;
  if (ref.startsWith("builtin:")) { await playBuiltin(ref.split(":")[1] || "critical", volume); return true; }
  const audio = new Audio(ref); audio.volume = Math.max(0, Math.min(1, volume));
  try { await audio.play(); return true; } catch { return false; }
}

export function shouldPlay(key:string, repeatSeconds:number, maxRepeats:number) {
  const item = played.get(key) ?? 0;
  const countKey = `${key}:count`;
  const count = played.get(countKey) ?? 0;
  const now = Date.now();
  if (count >= maxRepeats) return false;
  if (item && now-item < repeatSeconds*1000) return false;
  played.set(key, now); played.set(countKey, count+1); return true;
}
export function clearAlert(key:string){ played.delete(key); played.delete(`${key}:count`); }
