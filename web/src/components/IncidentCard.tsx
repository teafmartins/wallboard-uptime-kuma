import { AlertTriangle, Clock3, WifiOff } from "lucide-react";
import { MonitorState } from "../types";

function parseTime(t:string){
  const s=t.includes("T")?t:t.replace(" ","T");
  const d=new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s)?s:s+"Z");
  return isNaN(d.getTime())?new Date():d;
}

function since(value:string|null){
  if(!value) return "—";
  const ms=Date.now()-parseTime(value).getTime();
  const m=Math.max(0,Math.floor(ms/60000));
  if(m<60)return `${m}m`;
  const h=Math.floor(m/60), mm=m%60;
  if(h<24)return `${h}h ${mm}m`;
  return `${Math.floor(h/24)}d ${h%24}h`;
}

function compactMessage(message:string){
  const msg=(message||"").trim();
  if(!msg) return "Sem resposta";
  const lower=msg.toLowerCase();
  if(lower.startsWith("ping ") || lower.includes("ping statistics") || lower.includes("bytes of data")) return "Sem resposta ICMP";
  if(lower.includes("timed out") || lower.includes("timeout")) return "Timeout";
  if(lower.includes("connection refused")) return "Ligação recusada";
  if(lower.includes("host unreachable") || lower.includes("destination host unreachable")) return "Host inacessível";
  if(lower.includes("getaddrinfo") || lower.includes("name or service not known") || lower.includes("could not resolve")) return "Erro DNS";
  if(lower.includes("certificate") || lower.includes("ssl") || lower.includes("tls")) return "Erro SSL/TLS";
  const firstLine=msg.split(/\r?\n/)[0].trim();
  return firstLine.length>54 ? `${firstLine.slice(0,51)}…` : firstLine;
}

type TimelinePoint={ts:number;status:number};

function buildTimeline(history:any[], downSince:string|null, windowMinutes:number, currentStatus:number|null):TimelinePoint[]{
  const now=Date.now();
  const cutoff=now-windowMinutes*60_000;
  const points=history
    .map(h=>({ts:parseTime(h.time).getTime(),status:Number(h.status)}))
    .filter(p=>Number.isFinite(p.ts) && p.ts>=cutoff && (p.status===0 || p.status===1))
    .sort((a,b)=>a.ts-b.ts);

  // Nunca inventar um estado UP. Se não houver histórico suficiente mas sabemos
  // que o monitor está DOWN, desenhamos apenas o período DOWN conhecido.
  if(points.length===0 && currentStatus===0){
    const ds=downSince ? parseTime(downSince).getTime() : now;
    const start=Math.max(cutoff,Math.min(ds,now));
    points.push({ts:start,status:0});
  }

  // downSince é calculado no backend a partir de heartbeats DOWN reais. Se a
  // janela visível cortou o primeiro heartbeat da falha, podemos reintroduzir
  // apenas o ponto DOWN — nunca um UP artificial.
  if(currentStatus===0 && downSince){
    const ds=parseTime(downSince).getTime();
    if(Number.isFinite(ds) && ds>=cutoff && !points.some(p=>p.status===0 && Math.abs(p.ts-ds)<1000)){
      points.push({ts:ds,status:0});
      points.sort((a,b)=>a.ts-b.ts);
    }
  }

  if(points.length===1){
    const p=points[0];
    points.unshift({ts:Math.max(cutoff,p.ts-60_000),status:p.status});
  }

  if(points.length){
    // O estado atual do cartão é a autoridade para o extremo direito do gráfico.
    // Isto evita mostrar UP em "agora" quando o incidente continua DOWN.
    const finalStatus=currentStatus===0 || currentStatus===1
      ? currentStatus
      : points[points.length-1].status;
    points.push({ts:now,status:finalStatus});
  }
  return points;
}

function AvailabilityChart({history,downSince,windowMinutes,currentStatus}:{history:any[];downSince:string|null;windowMinutes:number;currentStatus:number|null}){
  const points=buildTimeline(history,downSince,windowMinutes,currentStatus);
  if(!points.length) return <div className="availability-empty">Sem histórico suficiente</div>;

  const minTs=points[0].ts;
  const maxTs=Math.max(points[points.length-1].ts,minTs+60_000);
  const W=1000,H=170;
  const left=72,right=18,top=18,bottom=34;
  const plotW=W-left-right, plotH=H-top-bottom;
  const y=(status:number)=>status===1?top+20:top+plotH-20;
  const x=(ts:number)=>left+((ts-minTs)/(maxTs-minTs))*plotW;

  const pathParts:string[]=[];
  points.forEach((p,i)=>{
    const px=x(p.ts), py=y(p.status);
    if(i===0){ pathParts.push(`M ${px} ${py}`); return; }
    const prev=points[i-1];
    const prevY=y(prev.status);
    pathParts.push(`L ${px} ${prevY}`);
    if(prev.status!==p.status) pathParts.push(`L ${px} ${py}`);
  });

  const tickCount=4;
  const ticks=Array.from({length:tickCount},(_,i)=>minTs+((maxTs-minTs)*i)/(tickCount-1));
  const fmt=(v:number)=>new Date(v).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});

  return <div className="availability-chart" role="img" aria-label="Histórico de disponibilidade do monitor">
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <line x1={left} y1={y(1)} x2={W-right} y2={y(1)} className="availability-grid"/>
      <line x1={left} y1={y(0)} x2={W-right} y2={y(0)} className="availability-grid"/>
      <text x={8} y={y(1)+4} className="availability-ylabel">UP</text>
      <text x={8} y={y(0)+4} className="availability-ylabel">DOWN</text>
      <path d={pathParts.join(" ")} className="availability-line"/>
      {ticks.map((t,i)=><g key={i}>
        <line x1={x(t)} y1={top} x2={x(t)} y2={top+plotH} className="availability-tickline"/>
        <text x={x(t)} y={H-7} textAnchor={i===0?"start":i===tickCount-1?"end":"middle"} className="availability-xlabel">{i===tickCount-1?"agora":fmt(t)}</text>
      </g>)}
    </svg>
  </div>;
}

type Props={monitor:MonitorState; config:any};
export function IncidentCard({monitor,config}:Props){
  const mc=config?.monitors?.[monitor.name] ?? {};
  const windowMinutes=config?.incidents?.graphWindowMinutes ?? 360;
  const showGraph=mc.showGraphOnFailure !== false;
  const fullMessage=monitor.message || "Sem resposta";
  const shortMessage=compactMessage(fullMessage);

  return <article className="incident-card">
    <header className="incident-head">
      <div className="incident-title"><AlertTriangle size={19}/><span>{monitor.name}</span></div>
      <div className="incident-age"><Clock3 size={15}/>{since(monitor.downSince)}</div>
    </header>

    {showGraph
      ? <AvailabilityChart history={monitor.history||[]} downSince={monitor.downSince} windowMinutes={windowMinutes} currentStatus={monitor.status}/>
      : <div className="incident-no-chart"><strong>DOWN</strong><span>Desde {monitor.downSince ? parseTime(monitor.downSince).toLocaleString() : "—"}</span></div>}

    <footer className="incident-foot">
      <span className="incident-message" title={fullMessage}><WifiOff size={14}/><span>{shortMessage}</span></span>
      {monitor.ping!=null && monitor.ping>0 && <span className="incident-ping">{monitor.ping} ms</span>}
    </footer>
  </article>;
}
