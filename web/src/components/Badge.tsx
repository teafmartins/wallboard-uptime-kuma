import { GroupState, MonitorState } from "../types";
import { iconComponent, inferIcon, isCustomIcon } from "../lib/icons";

type GroupBadge={ kind:"group"; group:GroupState; };
type MonitorBadge={ kind:"monitor"; monitor:MonitorState; groupName:string; };
type Props={ item:GroupBadge|MonitorBadge; config:any };

export function Badge({item,config}:Props){
  const isGroup=item.kind==="group";
  const groupConfig=isGroup
    ? (config?.groups?.[item.group.name] ?? {})
    : (config?.groups?.[item.groupName] ?? {});
  const monitorConfig=!isGroup ? (config?.monitors?.[item.monitor.name] ?? {}) : {};
  const display=isGroup
    ? (groupConfig.display ?? config?.badges?.display ?? "icon_text")
    : (monitorConfig.display ?? groupConfig.monitorDisplay ?? config?.badges?.display ?? "icon_text");

  const inferredIcon=isGroup
    ? inferIcon(groupConfig.label ?? item.group.name, undefined, "monitor")
    : inferIcon(monitorConfig.label ?? item.monitor.name, item.monitor.type, inferIcon(item.groupName, undefined, "server"));
  const icon=isGroup
    ? (groupConfig.icon ?? inferredIcon)
    : (monitorConfig.icon ?? groupConfig.monitorIcon ?? inferredIcon);
  const Icon=iconComponent(icon);

  const label=isGroup
    ? (groupConfig.label ?? item.group.name)
    : (monitorConfig.label ?? item.monitor.name);
  const status=isGroup ? item.group.status : (
    item.monitor.statusLabel==="down" ? "down" :
    (item.monitor.statusLabel==="pending"||item.monitor.statusLabel==="unknown") ? "warning" :
    item.monitor.statusLabel==="maintenance" ? "maintenance" : "up"
  );

  // As cores comunicam o estado; não mostramos OK/NOK nos badges.
  // Nos grupos agregados, o número continua útil para indicar a dimensão do grupo
  // e, quando existe falha, quantos monitores estão em baixo.
  const countText=isGroup
    ? (status==="down" ? `${item.group.down}/${item.group.total}` : String(item.group.total))
    : "";

  const title=isGroup
    ? `${label}: ${item.group.up}/${item.group.total} disponíveis`
    : `${label}: ${status}`;

  return <div className={`badge-card status-${status}`} title={title}>
    <div className="badge-icon-wrap">
      {isCustomIcon(icon) ? <img src={icon} className="badge-custom-icon" alt=""/> : <Icon className="badge-icon" strokeWidth={1.8}/>} 
      <span className="status-dot"/>
    </div>
    {display!=="icon_only" && display!=="count" && <div className="badge-name">{label}</div>}
    {isGroup && display!=="text_only" && <div className="badge-count">{countText}</div>}
  </div>
}
