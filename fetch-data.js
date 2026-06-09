import fs from "fs";

const STATIONS=[
  {name:"Reading",crs:"RDG"},
  {name:"Reading West",crs:"RDW"},
  {name:"Reading Green Park",crs:"RGP"},
  {name:"Mortimer",crs:"MOR"},
  {name:"Bramley",crs:"BMY"},
  {name:"Basingstoke",crs:"BSK"}
];

const GENERATED_AT = new Date().toISOString();

// RTT date format
const apiDate = new Date().toISOString().slice(0, 10);

const RTT_BASE = (process.env.RTT_BASE || "https://api.rtt.io").replace(/\/$/, "");

const RTT_TOKEN = process.env.RTT_TOKEN || "";
const RTT_USERNAME = process.env.RTT_USERNAME || "";
const RTT_PASSWORD = process.env.RTT_PASSWORD || "";

const AUTH_MODE = process.env.RTT_AUTH_MODE || "auto";

fs.mkdirSync("data",{recursive:true});

const today=new Date();
const ymd = apiDate;

console.log("RTT URL DATE:", ymd);

try{
  if(!RTT_TOKEN && !(RTT_USERNAME && RTT_PASSWORD)){
    console.log("No RTT credentials set. Writing demo data.");
    writeDemo("Demo data until RTT credentials are added");
    process.exit(0);
  }

  const searches={};
  for(const s of STATIONS){
    // RTT public specification pattern:
    // /api/v1/json/search/{location}/{date}
    searches[s.crs]=await rtt(`/api/v1/json/search/${s.crs}/${ymd}`);
  }

  const departures={};
  const trainsById=new Map();

  for(const s of STATIONS){
    const services=extractServices(searches[s.crs]);
    departures[s.crs]=services.slice(0,12).map(service=>normaliseDeparture(service));

    for(const service of services){
      const train=normaliseTrain(service,s);
      const existing=trainsById.get(train.id);
      if(!existing || stationWeight(train.currentCrs)>stationWeight(existing.currentCrs)){
        trainsById.set(train.id,train);
      }
    }
  }

  const trains=[...trainsById.values()].filter(isOnRouteOrLikely);

  fs.writeFileSync("data/line.json",JSON.stringify({
    generatedAt:GENERATED_AT,
    source:"Realtime Trains API via GitHub Actions",
    route:"Reading - Reading West - Reading Green Park - Mortimer - Bramley - Basingstoke",
    trains
  },null,2));

  fs.writeFileSync("data/departures.json",JSON.stringify({
    generatedAt:GENERATED_AT,
    source:"Realtime Trains API via GitHub Actions",
    departures
  },null,2));

  console.log(`Wrote ${trains.length} trains and departures for ${Object.keys(departures).length} stations.`);
}catch(e){
  console.error("RTT fetch failed:", e);
  writeDemo("RTT fetch failed; demo fallback");
}

async function rtt(endpoint){
  const headers={"Accept":"application/json"};

  if(AUTH_MODE==="bearer" || (AUTH_MODE==="auto" && RTT_TOKEN)){
    headers["Authorization"]=`Bearer ${RTT_TOKEN}`;
  } else if(AUTH_MODE==="basic" || (AUTH_MODE==="auto" && RTT_USERNAME && RTT_PASSWORD)){
    const basic=Buffer.from(`${RTT_USERNAME}:${RTT_PASSWORD}`).toString("base64");
    headers["Authorization"]=`Basic ${basic}`;
  }

  const response=await fetch(RTT_BASE+endpoint,{headers});
  if(!response.ok){
    const text=await response.text().catch(()=>"");
    throw new Error(`${response.status} ${endpoint} ${text.slice(0,120)}`);
  }
  return response.json();
}

function extractServices(data){
  if(Array.isArray(data.services)) return data.services;
  if(Array.isArray(data.results)) return data.results;
  if(Array.isArray(data.trains)) return data.trains;
  return [];
}

function normaliseDeparture(s){
  const loc=s.locationDetail||s.location||{};
  const destination=firstName(s.destination)||s.destination?.[0]?.description||s.destination?.description||s.destination||"Unknown";
  const realtime=loc.realtimeDeparture||loc.realtimeArrival||loc.realtimePass;
  const booked=loc.gbttBookedDeparture||loc.gbttBookedArrival||loc.gbttBookedPass||loc.originDeparture;
  const time=formatTime(realtime||booked);
  const status=loc.realtimeDepartureActual||loc.realtimeArrivalActual?"Departed":delayText(loc);
  return {time,destination,platform:loc.platform||"-",status};
}

function normaliseTrain(s,station){
  const loc=s.locationDetail||s.location||{};
  const id=(s.trainIdentity||s.headcode||s.serviceUid||s.uid||"TRAIN").toString();
  const origin=firstName(s.origin)||"Unknown";
  const destination=firstName(s.destination)||"Unknown";
  const delay=Number(loc.realtimeDepartureActualLateness||loc.realtimeArrivalActualLateness||loc.realtimePassActualLateness||loc.lateness||0);
  return {
    id,
    serviceUid:s.serviceUid||s.uid||"",
    runDate:s.runDate||"",
    origin,
    destination,
    currentCrs:station.crs,
    location:station.name,
    direction:guessDirection(origin,destination),
    delay:Math.round(delay/60)||0,
    freight:isFreight(s,id),
    source:"Realtime Trains"
  };
}

function firstName(arr){
  if(Array.isArray(arr) && arr.length){
    return arr[0].description||arr[0].name||arr[0].publicName||arr[0].tiploc||arr[0].crs;
  }
  if(arr && typeof arr==="object") return arr.description||arr.name||arr.publicName||arr.tiploc||arr.crs;
  if(typeof arr==="string") return arr;
  return "";
}

function formatTime(v){
  if(!v) return "--:--";
  const str=String(v);
  if(/^\d{4}$/.test(str)) return str.slice(0,2)+":"+str.slice(2);
  if(/^\d{2}:\d{2}/.test(str)) return str.slice(0,5);
  return str;
}

function delayText(loc){
  const late=Number(loc.realtimeDepartureActualLateness||loc.realtimeArrivalActualLateness||loc.realtimePassActualLateness||loc.lateness||0);
  if(late>=60) return `+${Math.round(late/60)}`;
  return "On time";
}

function isFreight(s,id){
  const category=(s.serviceType||s.serviceCategory||s.trainCategory||"").toString().toLowerCase();
  return /^[467]/.test(id)||category.includes("freight")||s.isPassenger===false;
}

function guessDirection(origin,destination){
  const to=(destination||"").toLowerCase();
  if(to.includes("reading")) return "up";
  if(to.includes("basingstoke")||to.includes("southampton")) return "down";
  return "unknown";
}

function isOnRouteOrLikely(t){
  const text=`${t.origin} ${t.destination}`.toLowerCase();
  return STATIONS.some(s=>text.includes(s.name.toLowerCase().replace("reading green park","green park"))) || true;
}

function stationWeight(crs){
  return STATIONS.findIndex(s=>s.crs===crs);
}

function writeDemo(reason){
  const now=new Date();
  const idx=Math.floor(now.getMinutes()/10)%6;
  const trains=[
    {id:"2J79",origin:"Reading",destination:"Basingstoke",currentCrs:STATIONS[idx].crs,location:STATIONS[idx].name,direction:"down",delay:0,source:reason},
    {id:"2J78",origin:"Basingstoke",destination:"Reading",currentCrs:STATIONS[5-idx].crs,location:STATIONS[5-idx].name,direction:"up",delay:2,source:reason},
    {id:"4M78",origin:"Southampton Western Docks",destination:"Trafford Park",currentCrs:STATIONS[(idx+2)%6].crs,location:STATIONS[(idx+2)%6].name,direction:"up",delay:0,freight:true,source:reason},
    {id:"6O41",origin:"Acton",destination:"Southampton MCT",currentCrs:STATIONS[(idx+4)%6].crs,location:STATIONS[(idx+4)%6].name,direction:"down",delay:7,freight:true,source:reason}
  ];
  const departures={};
  for(const s of STATIONS){
    departures[s.crs]=Array.from({length:6}).map((_,i)=>{
      const t=new Date(now.getTime()+(i*17+5)*60000);
      return {time:t.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}),destination:i%2?"Reading":"Basingstoke",platform:s.crs==="RDG"?"2":s.crs==="BSK"?"5":"1",status:i===2?"+3":"On time"};
    });
  }
  fs.writeFileSync("data/line.json",JSON.stringify({generatedAt:GENERATED_AT,source:reason,trains},null,2));
  fs.writeFileSync("data/departures.json",JSON.stringify({generatedAt:GENERATED_AT,source:reason,departures},null,2));
}
