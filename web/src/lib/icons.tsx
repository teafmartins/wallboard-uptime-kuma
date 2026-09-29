import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";

const aliases: Record<string, keyof typeof Icons> = {
  server:"Server", srv:"Server", servidor:"Server",
  database:"Database", db:"Database", sql:"Database", mysql:"Database", postgres:"Database", postgresql:"Database", oracle:"Database", db2:"Database",
  api:"Braces", service:"Gauge", app:"PanelsTopLeft", application:"PanelsTopLeft", aplicacao:"PanelsTopLeft",
  website:"Globe2", web:"Globe2", http:"Globe2", https:"Globe2", globe:"Globe2", internet:"Globe2",
  cloud:"Cloud", router:"Router", gateway:"Router", gatewayrouter:"Router",
  switch:"Network", network:"Network", rede:"Network", ethernet:"Network",
  wifi:"Wifi", wireless:"Wifi", wlan:"Wifi", ap:"Wifi", accesspoint:"Wifi",
  firewall:"ShieldCheck", fortigate:"ShieldCheck", fortinet:"ShieldCheck",
  vpn:"LockKeyhole",
  printer:"Printer", impressora:"Printer",
  camera:"Cctv", cctv:"Cctv",
  nas:"HardDrive", storage:"HardDrive", disco:"HardDrive", disk:"HardDrive",
  mail:"Mail", email:"Mail", smtp:"Mail", imap:"Mail",
  dns:"Waypoints",
  docker:"Container", container:"Container",
  vm:"Boxes", vmware:"Boxes", esxi:"Boxes", hyperv:"Boxes", virtual:"Boxes",
  phone:"Smartphone", telefone:"Smartphone", mobile:"Smartphone",
  industrial:"Factory", fabrica:"Factory", plc:"Cpu",
  ups:"BatteryCharging", power:"Zap", energia:"Zap", temperature:"Thermometer", temperatura:"Thermometer",
  erp:"DatabaseZap", monitor:"Activity", linux:"Terminal", windows:"MonitorCog",
  ssh:"Terminal", ftp:"Terminal", sftp:"Terminal", terminal:"Terminal",
  backup:"HardDrive", bck:"HardDrive", ficheiros:"HardDrive", files:"HardDrive"
};

const inferenceRules: Array<{ terms:string[]; icon:string }> = [
  { terms:["firewall","fortigate","fortinet"], icon:"firewall" },
  { terms:["access point","accesspoint","wireless","wifi","wlan"], icon:"wifi" },
  { terms:["router","gateway","gw "], icon:"router" },
  { terms:["switch","ethernet","network","rede"], icon:"network" },
  { terms:["vpn"], icon:"vpn" },
  { terms:["database","postgresql","postgres","mysql","oracle","sql server","sqlserver"," db2","db2"," sql"," db"], icon:"database" },
  { terms:["api","rest","soap","endpoint","webservice","web service"], icon:"api" },
  { terms:["website","web site","http","https","www","portal","site"], icon:"website" },
  { terms:["internet","wan"], icon:"internet" },
  { terms:["server","servidor"," srv","srv-","srv_"], icon:"server" },
  { terms:["nas","storage","disk","disco","ficheiros","files","backup","bck"], icon:"nas" },
  { terms:["smtp","imap","mail","email","correio"], icon:"mail" },
  { terms:["dns"], icon:"dns" },
  { terms:["docker","container"], icon:"docker" },
  { terms:["vmware","esxi","hyper-v","hyperv","virtual machine"," vm ","vm-","vm_"], icon:"vm" },
  { terms:["printer","impressora"], icon:"printer" },
  { terms:["camera","cctv"], icon:"camera" },
  { terms:["ups"], icon:"ups" },
  { terms:["power","energia","electric"], icon:"power" },
  { terms:["temperature","temperatura","temp "], icon:"temperature" },
  { terms:["plc"], icon:"plc" },
  { terms:["factory","fabrica","fábrica","industrial"], icon:"industrial" },
  { terms:["erp"], icon:"erp" },
  { terms:["linux","ubuntu","debian","centos","rhel"], icon:"linux" },
  { terms:["windows","win server","iis"], icon:"windows" },
  { terms:["ssh","ftp","sftp"], icon:"terminal" },
  { terms:["cloud","azure","aws","gcp"], icon:"cloud" },
  { terms:["phone","mobile","telefone","android","iphone"], icon:"phone" }
];

export function inferIcon(name?: string, type?: string, fallback="monitor") {
  const haystack=`${name ?? ""} ${type ?? ""}`.toLowerCase().replace(/[_/\\]+/g," ");
  for (const rule of inferenceRules) {
    if (rule.terms.some(term => haystack.includes(term))) return rule.icon;
  }
  return fallback;
}

export function iconComponent(name?: string): LucideIcon {
  if (!name) return Icons.Activity;
  const normalized=name.toLowerCase().replace(/[\s_-]+/g,"");
  const directAlias=aliases[name.toLowerCase()] ?? aliases[normalized];
  const key = directAlias ?? (name as keyof typeof Icons);
  const candidate = Icons[key] as unknown;

  // Os componentes do lucide-react podem ser forwardRef objects em runtime,
  // não apenas functions. Testar typeof === "function" fazia todos os ícones
  // cair no fallback Activity. Se a exportação existir, é um ícone válido.
  return (candidate ?? Icons.Activity) as LucideIcon;
}

export function isCustomIcon(value?: string) {
  return !!value && (value.startsWith("/") || value.startsWith("http://") || value.startsWith("https://"));
}
