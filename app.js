const STATIONS=[
{name:"READING",crs:"RDG"},
{name:"READING WEST",crs:"RDW"},
{name:"READING GREEN PARK",crs:"RGP"},
{name:"MORTIMER",crs:"MOR"},
{name:"BRAMLEY",crs:"BMY"},
{name:"BASINGSTOKE",crs:"BSK"}
];

let state={trains:[],departures:{},generatedAt:null,source:""};
const $=id=>document.getElementById(id);

document.querySelectorAll("nav button").forEach(btn=>{
btn.onclick=()=>{
document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
$(btn.dataset.view).classList.add("active");
};
});

$("closeModal").onclick=()=>$("trainModal").classList.add("hidden");

function clock(){$("localClock").textContent=new Date().toLocaleTimeString("en-GB");}
setInterval(clock,1000); clock();

function boot(){
const sel=$("stationSelect");
STATIONS.forEach(s=>{const opt=document.createElement("option");opt.value=s.crs;opt.textContent=s.name;sel.appendChild(opt);});
sel.value="BMY"; sel.onchange=()=>renderDepartures(sel.value);
refresh(); setInterval(refresh,30000);
if("serviceWorker" in navigator){navigator.serviceWorker.register("./service-worker.js");}
}

async function getJson(url){
const res=await fetch(url+"?t="+Date.now(),{cache:"no-store"});
if(!res.ok) throw new Error(url+" "+res.status);
return res.json();
}

async function refresh(){
$("systemStatus").textContent="SYSTEM: READING GITHUB DATA";
try{
const [line,deps]=await Promise.all([getJson("data/line.json"),getJson("data/departures.json")]);
state.trains=line.trains||[]; state.departures=deps.departures||{};
state.generatedAt=line.generatedAt||deps.generatedAt||"unknown"; state.source=line.source||deps.source||"GitHub data";
$("dataTimestamp").textContent=state.generatedAt; $("systemStatus").textContent="SYSTEM: "+state.source.toUpperCase();
renderRoute(); renderActive(); renderDepartures($("stationSelect").value); renderAllStations(); renderFreight(); renderCrossing();
}catch(e){
$("systemStatus").textContent="SYSTEM: DATA ERROR";
$("activeTrains").innerHTML="<div class='error'>Could not read data/*.json. Check GitHub Actions.</div>";
}
}

function classify(t){const id=(t.id||"").toUpperCase();return t.freight||/^[467]/.test(id)?"freight":"passenger";}

function renderRoute(){
const by={}; STATIONS.forEach(s=>by[s.crs]=[]);
state.trains.forEach(t=>{const c=t.currentCrs||"BMY"; if(by[c]) by[c].push(t);});
$("linePanel").innerHTML=STATIONS.map(s=>`<div class="station-row"><div class="station-name">${s.name}</div><div class="track">${(by[s.crs]||[]).map(pill).join("")||"&nbsp;"}</div></div>`).join("");
}

function pill(t){
const delay=Number(t.delay||0); let cls="train-pill";
if(classify(t)==="freight") cls+=" train-freight"; if(delay>=5) cls+=" train-late"; if(delay>=15) cls+=" train-bad";
const dir=t.direction==="up"?"↑":t.direction==="down"?"↓":"↕";
return `<span class="${cls}" onclick='showTrain(${JSON.stringify(t).replaceAll("'","&apos;")})'>${t.id||"TRAIN"} ${dir}</span>`;
}

function renderActive(){
$("activeTrains").innerHTML=state.trains.length?state.trains.map(t=>`<div class="board-row"><div>${t.id||"--"}</div><div>${t.origin||"Unknown"} → ${t.destination||"Unknown"}<br>${t.location||t.currentCrs||""}</div><div>${classify(t)==="freight"?"FRGT":"PASS"}</div></div>`).join(""):"<div class='warn'>No trains in current data file.</div>";
}

function renderDepartures(crs){
const rows=state.departures[crs]||[]; const station=STATIONS.find(s=>s.crs===crs)?.name||crs;
$("departureBoard").innerHTML=`<h3>${station}</h3>`+(rows.length?rows.map(r=>`<div class="board-row"><div>${r.time||"--:--"}</div><div>${r.destination||"Unknown"} ${r.status&&r.status!=="On time"?`<span class="warn">• ${r.status}</span>`:""}</div><div>P${r.platform||"-"}</div></div>`).join(""):"<div class='warn'>No departures in current data file.</div>");
}

function renderAllStations(){
$("allStations").innerHTML=STATIONS.map(s=>{const rows=(state.departures[s.crs]||[]).slice(0,4);return `<div class="station-card"><h3>${s.name}</h3>`+(rows.length?rows.map(r=>`<div class="board-row"><div>${r.time||"--"}</div><div>${r.destination||"Unknown"}</div><div>P${r.platform||"-"}</div></div>`).join(""):"<div class='warn'>No data</div>")+"</div>";}).join("");
}

function renderFreight(){
const rows=state.trains.filter(t=>classify(t)==="freight");
$("freightBoard").innerHTML=rows.length?rows.map(t=>`<div class="board-row"><div>${t.id}</div><div>${t.origin||"Unknown"} → ${t.destination||"Unknown"}<br>${t.location||""}</div><div>${t.delay?`+${t.delay}`:"OK"}</div></div>`).join(""):"<div class='warn'>No freight in current data file.</div>";
}

function renderCrossing(){
const near=state.trains.filter(t=>["MOR","BMY"].includes(t.currentCrs));
const closed=near.length>0; const el=$("crossingStatus");
el.textContent=closed?"████ CLOSED / TRAIN NEAR ████":"OPEN TO ROAD TRAFFIC"; el.className=closed?"crossing-closed":"crossing-open";
$("crossingDetail").innerHTML=near.length?near.map(t=>`${t.id}: ${t.origin||"?"} → ${t.destination||"?"}`).join("<br>"):"No train close to Bramley in current data.";
}

function showTrain(t){
$("trainDetails").textContent=`HEADCODE: ${t.id||"UNKNOWN"}

TYPE: ${classify(t).toUpperCase()}
FROM: ${t.origin||"Unknown"}
TO: ${t.destination||"Unknown"}
CURRENT: ${t.location||t.currentCrs||"Unknown"}
DIRECTION: ${t.direction||"unknown"}
DELAY: ${t.delay||0} min
SOURCE: ${t.source||state.source}`;
$("trainModal").classList.remove("hidden");
}

boot();
