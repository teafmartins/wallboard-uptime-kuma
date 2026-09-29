import { useEffect, useMemo, useRef, useState } from "react";
import { BellOff, BellRing, Radio, WifiOff, Volume2 } from "lucide-react";
import { Badge } from "./components/Badge";
import { IncidentCard } from "./components/IncidentCard";
import { DashboardConfig, DashboardState, GroupState, MonitorState } from "./types";
import { clearAlert, playSound, shouldPlay, unlockAudio } from "./lib/audio";
import "./styles.css";

const empty:DashboardState={connected:false,authenticated:false,lastUpdate:null,groups:[],ungrouped:[],incidents:[]};
function parseDate(v:string|null){ if(!v)return null; const s=v.includes("T")?v:v.replace(" ","T"); const d=new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s)?s:s+"Z"); return isNaN(d.getTime())?null:d; }
function modeAllows(rule:any,name:string){
  const mode=rule?.mode??"all"; const items=Array.isArray(rule?.items)?rule.items:[];
  if(mode==="include") return items.includes(name);
  if(mode==="exclude") return !items.includes(name);
  return true;
}
function monitorVisible(config:any,m:MonitorState){
  const mc=config?.monitors?.[m.name]??{};
  return mc.hidden!==true && mc.visible!==false && modeAllows(config?.visibility?.monitors,m.name);
}
function groupVisible(config:any,g:GroupState){
  const gc=config?.groups?.[g.name]??{};
  return gc.hidden!==true && gc.visible!==false && modeAllows(config?.visibility?.groups,g.name);
}
function filteredGroup(config:any,g:GroupState):GroupState|null{
  if(!groupVisible(config,g)) return null;
  const monitors=g.monitors
    .filter(m=>monitorVisible(config,m))
    .sort((a,b)=>a.name.localeCompare(b.name,"pt-PT",{sensitivity:"base",numeric:true}));
  if(!monitors.length) return null;
  const down=monitors.filter(m=>m.statusLabel==="down").length;
  const pending=monitors.filter(m=>m.statusLabel==="pending"||m.statusLabel==="unknown").length;
  const maintenance=monitors.filter(m=>m.statusLabel==="maintenance").length;
  const up=monitors.filter(m=>m.statusLabel==="up").length;
  const status:GroupState["status"]=down>0?"down":pending>0?"warning":(monitors.length>0&&maintenance===monitors.length)?"maintenance":up>0?"up":"unknown";
  return {...g,monitors,total:monitors.length,up,down,pending,maintenance,status};
}

export default function App(){
  const [state,setState]=useState<DashboardState>(empty); const [config,setConfig]=useState<DashboardConfig>({});
  const [configLoaded,setConfigLoaded]=useState(false);
  const [audio,setAudio]=useState(false); const [badgePage,setBadgePage]=useState(0); const [incidentPage,setIncidentPage]=useState(0); const [now,setNow]=useState(new Date());
  const prevDown=useRef(new Set<number>());
  const startupAudioAttempted=useRef(false);

  useEffect(()=>{ Promise.all([fetch("/api/state").then(r=>r.json()),fetch("/api/config").then(r=>r.json())]).then(([s,c])=>{setState(s);setConfig(c);setConfigLoaded(true)}); const es=new EventSource("/api/events"); es.addEventListener("state",(e:any)=>setState(JSON.parse(e.data))); es.addEventListener("config",(e:any)=>{setConfig(JSON.parse(e.data));setConfigLoaded(true)}); return()=>es.close();},[]);
  useEffect(()=>{const t=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(t)},[]);
  useEffect(()=>{
    if(!configLoaded || startupAudioAttempted.current) return;
    startupAudioAttempted.current=true;
    const audioCfg:any=(config as any)?.audio??{};
    if(audioCfg.enabledByDefault===false){
      setAudio(false);
      return;
    }
    (async()=>{
      const unlocked=await unlockAudio();
      setAudio(unlocked);
      if(!unlocked){
        console.warn("[AUDIO] Startup audio could not be enabled automatically. The display engine may block autoplay.");
        return;
      }
      console.info("[AUDIO] Startup audio enabled automatically.");
      if(audioCfg.testOnStartup===true){
        const volume=Math.max(0,Math.min(1,Number(audioCfg.startupVolume??0.15)));
        const ok=await playSound("builtin:recovery",volume);
        console.info(ok?"[AUDIO] Startup sound test played successfully.":"[AUDIO] Startup sound test could not be played.");
      }
    })();
  },[configLoaded,config]);


  const visibleGroups=useMemo(()=>state.groups
    .map(g=>filteredGroup(config,g))
    .filter(Boolean)
    .sort((a:any,b:any)=>a.name.localeCompare(b.name,"pt-PT",{sensitivity:"base",numeric:true})) as GroupState[],[state.groups,config]);
  const visibleUngrouped=useMemo(()=>state.ungrouped
    .filter(m=>monitorVisible(config,m))
    .sort((a,b)=>a.name.localeCompare(b.name,"pt-PT",{sensitivity:"base",numeric:true})),[state.ungrouped,config]);
  const visibleMonitorIds=useMemo(()=>new Set([
    ...visibleGroups.flatMap(g=>g.monitors.map(m=>m.id)),
    ...visibleUngrouped.map(m=>m.id)
  ]),[visibleGroups,visibleUngrouped]);
  const visibleIncidents=useMemo(()=>state.incidents.filter(m=>visibleMonitorIds.has(m.id) && (config as any)?.monitors?.[m.name]?.showIncident!==false),[state.incidents,visibleMonitorIds,config]);
  const badgeItems=useMemo(()=>{
    const grouped=visibleGroups.flatMap(g=>{
      const gc:any=(config as any)?.groups?.[g.name]??{};
      if(gc.aggregate!==false){
        return [{kind:"group" as const,group:g,id:`g:${g.id}`,status:g.status}];
      }
      return g.monitors.map(m=>({
        kind:"monitor" as const,
        monitor:m,
        groupName:g.name,
        id:`m:${m.id}`,
        status:m.statusLabel==="down"?"down":(m.statusLabel==="pending"||m.statusLabel==="unknown")?"warning":m.statusLabel==="maintenance"?"maintenance":"up"
      }));
    });
    const ungrouped=visibleUngrouped.map(m=>({
      kind:"monitor" as const,
      monitor:m,
      groupName:"",
      id:`m:${m.id}`,
      status:m.statusLabel==="down"?"down":(m.statusLabel==="pending"||m.statusLabel==="unknown")?"warning":m.statusLabel==="maintenance"?"maintenance":"up"
    }));
    // Real groups are already sorted by group name, then monitor name.
    // Ungrouped monitors remain individual and are appended sorted by their own name.
    return [...grouped,...ungrouped];
  },[visibleGroups,visibleUngrouped,config]);
  const problemBadges=badgeItems.filter(b=>b.status==="down");
  const healthyBadges=badgeItems.filter(b=>b.status!=="down");

  useEffect(()=>{
    const current=new Set(visibleIncidents.map(i=>i.id)); const cfg:any=config; const volume=cfg?.alert?.volume??.75; const repeat=cfg?.alert?.repeatAfterSeconds??300; const max=cfg?.alert?.maxRepeats??3;
    for(const m of visibleIncidents){
      const mc=cfg?.monitors?.[m.name]??{}; if(mc.sound===false) continue;
      const group=visibleGroups.find(g=>g.monitors.some(x=>x.id===m.id)); const gc=group?cfg?.groups?.[group.name]??{}:{}; if(gc.sound===false) continue;
      const since=parseDate(m.downSince); const threshold=(mc.alertAfterSeconds??cfg?.alert?.alertAfterSeconds??10)*1000;
      if(since && Date.now()-since.getTime()<threshold) continue;
      const key=`down-${m.id}`; const soundName=typeof mc.sound==="string"?mc.sound:(typeof gc.sound==="string"?gc.sound:cfg?.alert?.defaultSound??"critical");
      const ref=cfg?.sounds?.[soundName] ?? (soundName?.startsWith("/")?soundName:`builtin:${soundName}`);
      if(audio && cfg?.alert?.enabled!==false && shouldPlay(key,repeat,max)) playSound(ref,volume);
    }
    for(const id of prevDown.current){if(!current.has(id)){clearAlert(`down-${id}`); const rec=cfg?.alert?.recoverySound; if(audio&&rec){const ref=cfg?.sounds?.[rec]??`builtin:${rec}`;playSound(ref,volume)}}}
    prevDown.current=current;
  },[visibleIncidents,config,audio,visibleGroups]);

  const orientation=(config as any)?.dashboard?.orientation??"auto";
  useEffect(()=>{document.documentElement.dataset.orientation=orientation;},[orientation]);

  const incidentCfg:any=(config as any)?.incidents??{}; const maxInc=Math.max(1,incidentCfg.maxVisible??6); const incidentPages=Math.max(1,Math.ceil(visibleIncidents.length/maxInc));
  useEffect(()=>{const sec=incidentCfg.rotateEverySeconds??10;if(incidentPages<=1)return;const t=setInterval(()=>setIncidentPage(p=>(p+1)%incidentPages),sec*1000);return()=>clearInterval(t)},[incidentPages,incidentCfg.rotateEverySeconds]);
  const shownIncidents=visibleIncidents.slice((incidentPage%incidentPages)*maxInc,(incidentPage%incidentPages+1)*maxInc);

  const [capacity,setCapacity]=useState(8);
  useEffect(()=>{
    const calc=()=>{
      const configuredOrientation=(config as any)?.dashboard?.orientation??"auto";
      const portrait=configuredOrientation==="portrait"?true:configuredOrientation==="landscape"?false:innerHeight>innerWidth;
      const badgeCfg:any=(config as any)?.badges??{};
      const columns=portrait?2:Math.max(1,Math.floor((innerWidth-40)/150));

      // Se o número de linhas não estiver parametrizado, usamos 1 linha quando
      // todos os badges cabem e passamos automaticamente para 2 linhas quando
      // necessário. Só depois disso entra a rotação.
      const orientationRows=portrait?badgeCfg.rowsPortrait:badgeCfg.rowsLandscape;
      const configuredRows=orientationRows ?? badgeCfg.rows;
      const autoRows=badgeItems.length>columns?2:1;
      const parsedRows=Number(configuredRows);
      const rows=configuredRows===undefined || configuredRows===null || configuredRows===""
        ? autoRows
        : Math.max(1,Math.floor(parsedRows)||1);

      setCapacity(Math.max(1,columns*rows));
    };
    calc();
    addEventListener("resize",calc);
    return()=>removeEventListener("resize",calc);
  },[config,badgeItems.length]);
  const pin=(config as any)?.badges?.pinProblems!==false; const slots=Math.max(1,capacity-(pin?Math.min(problemBadges.length,capacity-1):0)); const pages=Math.max(1,Math.ceil(healthyBadges.length/slots));
  useEffect(()=>{const cfg:any=(config as any)?.badges?.rotation??{};if(cfg.enabled===false||pages<=1)return;const t=setInterval(()=>setBadgePage(p=>(p+1)%pages),(cfg.intervalSeconds??8)*1000);return()=>clearInterval(t)},[pages,(config as any)?.badges?.rotation?.intervalSeconds]);
  const pageHealthy=healthyBadges.slice((badgePage%pages)*slots,(badgePage%pages+1)*slots);
  const badgeOrder=useMemo(()=>new Map(badgeItems.map((b,i)=>[b.id,i])),[badgeItems]);
  const shownBadges=(pin
    ? [...problemBadges.slice(0,capacity-1),...pageHealthy].slice(0,capacity)
    : badgeItems.slice((badgePage%pages)*capacity,(badgePage%pages+1)*capacity)
  ).sort((a,b)=>(badgeOrder.get(a.id)??0)-(badgeOrder.get(b.id)??0));

  const dashboardCfg:any=(config as any)?.dashboard??{};
  const title=dashboardCfg.title??"Infrastructure Monitor";
  const logo=typeof dashboardCfg.logo==="string"&&dashboardCfg.logo.trim()?dashboardCfg.logo.trim():null;
  const logoAlt=dashboardCfg.logoAlt??title;
  const logoHeight=Math.max(18,Math.min(96,Number(dashboardCfg.logoHeight)||34));
  const showTitle=dashboardCfg.showTitle!==false;
  const allOk=state.authenticated&&visibleIncidents.length===0&&(visibleGroups.length>0||visibleUngrouped.length>0)&&visibleGroups.every(g=>g.status!=="down")&&visibleUngrouped.every(m=>m.statusLabel!=="down");
  const toggleSound=async()=>{ if(audio){setAudio(false); return;} const enabled=await unlockAudio(); setAudio(enabled); if(enabled) playSound("builtin:recovery",.35); };

  return <main className="wallboard">
    <header className="topbar">
      <div className="brand">
        {logo ? <img className="brand-logo" src={logo} alt={logoAlt} style={{height:`${logoHeight}px`}}/> : <Radio size={21}/>}
        {showTitle&&<strong>{title}</strong>}
      </div>
      <div className="top-actions">
        {!state.connected||!state.authenticated?<span className="connection bad"><WifiOff size={16}/>Kuma</span>:<span className="connection good"><span className="mini-dot"/>Live</span>}
        {(config as any)?.dashboard?.showClock!==false&&<time>{now.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</time>}
        <button className={`sound-btn ${audio?"on":""}`} onClick={toggleSound} title={audio?"Desativar alertas sonoros":"Ativar alertas sonoros"} aria-pressed={audio}>{audio?<Volume2 size={19}/>:<BellOff size={19}/>}</button>
      </div>
    </header>

    <section className="badges-zone">
      <div className="badges-grid">{shownBadges.map((b:any)=><Badge key={b.id} item={b.kind==="group"?{kind:"group",group:b.group}:{kind:"monitor",monitor:b.monitor,groupName:b.groupName}} config={config}/>)}</div>
      {pages>1&&<div className="pager">{Array.from({length:pages},(_,i)=><span key={i} className={i===badgePage%pages?"active":""}/>)}</div>}
    </section>

    {allOk ? <section className="all-ok"><div className="ok-orb"><span/></div><div><strong>OK</strong><small>{visibleGroups.reduce((n,g)=>n+g.total,0)+visibleUngrouped.length} monitores</small></div></section>
    : visibleIncidents.length>0 ? <section className="incidents-zone">
        <div className="incidents-label"><BellRing size={17}/><span>{visibleIncidents.length} {visibleIncidents.length===1?"incidente":"incidentes"}</span>{incidentPages>1&&<small>{incidentPage%incidentPages+1}/{incidentPages}</small>}</div>
        <div className={`incidents-grid count-${Math.min(shownIncidents.length,6)}`}>{shownIncidents.map((m:MonitorState)=><IncidentCard key={m.id} monitor={m} config={config}/>)}</div>
      </section>
    : <section className="loading-state">A aguardar estado dos monitores…</section>}

  </main>
}
