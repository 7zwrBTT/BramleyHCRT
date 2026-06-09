import fs from "fs";

const STATIONS = [
  { name: "Reading", crs: "RDG" },
  { name: "Reading West", crs: "RDW" },
  { name: "Reading Green Park", crs: "RGP" },
  { name: "Mortimer", crs: "MOR" },
  { name: "Bramley", crs: "BMY" },
  { name: "Basingstoke", crs: "BSK" }
];

const GENERATED_AT = new Date().toISOString();
const RTT_BASE = (process.env.RTT_BASE || "https://data.rtt.io").replace(/\/$/, "");
const RTT_TOKEN = process.env.RTT_TOKEN || "";
const RTT_USERNAME = process.env.RTT_USERNAME || "";
const RTT_PASSWORD = process.env.RTT_PASSWORD || "";
const AUTH_MODE = process.env.RTT_AUTH_MODE || "auto";

fs.mkdirSync("data", { recursive: true });

main();

async function main() {
  try {
    if (!RTT_TOKEN && !(RTT_USERNAME && RTT_PASSWORD)) {
      writeDemo("No RTT credentials set");
      return;
    }

    const trainsById = new Map();
    const departures = {};

    for (const station of STATIONS) {
      console.log(`Fetching ${station.name} (${station.crs})...`);
      const data = await fetchStationData(station.crs);
      const services = extractServices(data);

      console.log(`${station.crs}: ${services.length} services returned`);

      departures[station.crs] = services.slice(0, 12).map(normaliseDeparture);

      for (const service of services) {
        const train = normaliseTrain(service, station);
        trainsById.set(`${train.id}-${station.crs}`, train);
      }
    }

    const trains = [...trainsById.values()];

    writeJson("data/line.json", {
      generatedAt: GENERATED_AT,
      source: "Realtime Trains API via GitHub Actions",
      route: "Reading - Reading West - Reading Green Park - Mortimer - Bramley - Basingstoke",
      trains
    });

    writeJson("data/departures.json", {
      generatedAt: GENERATED_AT,
      source: "Realtime Trains API via GitHub Actions",
      departures
    });

    console.log(`Success. Wrote ${trains.length} train records.`);
  } catch (err) {
    console.error("RTT fetch failed:", err.message);
    writeDemo("RTT fetch failed; demo fallback");
  }
}

async function fetchStationData(crs) {
  const endpoint =
    `/rtt/location?code=gb-nr:${encodeURIComponent(crs)}&timeWindow=120&detailed=true`;

  console.log(`Trying ${RTT_BASE}${endpoint}`);
  return await rtt(endpoint);
}

async function rtt(endpoint) {
  const headers = { Accept: "application/json" };

  if (AUTH_MODE === "bearer" || (AUTH_MODE === "auto" && RTT_TOKEN)) {
    headers.Authorization = `Bearer ${RTT_TOKEN}`;
  }

  if (AUTH_MODE === "basic" || (AUTH_MODE === "auto" && RTT_USERNAME && RTT_PASSWORD && !RTT_TOKEN)) {
    headers.Authorization =
      "Basic " + Buffer.from(`${RTT_USERNAME}:${RTT_PASSWORD}`).toString("base64");
  }

  const response = await fetch(RTT_BASE + endpoint, { headers });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${response.status} ${endpoint} ${text.slice(0, 180)}`);
  }

  return response.json();
}

function extractServices(data) {
  if (Array.isArray(data.services)) return data.services;
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.trains)) return data.trains;
  if (Array.isArray(data.locations?.[0]?.services)) return data.locations[0].services;
  if (Array.isArray(data.servicesAtLocation)) return data.servicesAtLocation;
  return [];
}

function normaliseDeparture(service) {
  const loc = service.locationDetail || service.location || service.currentLocation || {};

  return {
    time: formatTime(
      loc.realtimeDeparture ||
      loc.gbttBookedDeparture ||
      loc.realtimeArrival ||
      loc.gbttBookedArrival ||
      service.realtimeDeparture ||
      service.plannedDeparture
    ),
    destination: firstName(service.destination) || service.destinationName || "Unknown",
    platform: loc.platform || service.platform || "-",
    status: delayText(loc, service)
  };
}

function normaliseTrain(service, station) {
  const loc = service.locationDetail || service.location || service.currentLocation || {};
  const id = String(
    service.trainIdentity ||
    service.headcode ||
    service.serviceUid ||
    service.uid ||
    service.rid ||
    "TRAIN"
  );

  const delaySeconds =
    Number(
      loc.realtimeDepartureActualLateness ||
      loc.realtimeArrivalActualLateness ||
      loc.lateness ||
      service.lateness ||
      0
    );

  return {
    id,
    origin: firstName(service.origin) || service.originName || "Unknown",
    destination: firstName(service.destination) || service.destinationName || "Unknown",
    currentCrs: station.crs,
    location: station.name,
    direction: guessDirection(firstName(service.origin), firstName(service.destination)),
    delay: Math.round(delaySeconds / 60),
    freight: /^[467]/.test(id) || String(service.serviceType || "").toLowerCase().includes("freight"),
    source: "Realtime Trains"
  };
}

function firstName(value) {
  if (Array.isArray(value) && value.length) {
    return value[0].description || value[0].name || value[0].publicName || value[0].crs || "";
  }
  if (value && typeof value === "object") {
    return value.description || value.name || value.publicName || value.crs || "";
  }
  if (typeof value === "string") return value;
  return "";
}

function formatTime(value) {
  if (!value) return "--:--";
  const str = String(value);
  if (/^\d{4}$/.test(str)) return str.slice(0, 2) + ":" + str.slice(2);
  if (/^\d{2}:\d{2}/.test(str)) return str.slice(0, 5);
  return str;
}

function delayText(loc, service) {
  const late =
    Number(
      loc.realtimeDepartureActualLateness ||
      loc.realtimeArrivalActualLateness ||
      loc.lateness ||
      service.lateness ||
      0
    );

  if (late >= 60) return `+${Math.round(late / 60)}`;
  return "On time";
}

function guessDirection(origin, destination) {
  const to = String(destination || "").toLowerCase();
  if (to.includes("reading")) return "up";
  if (to.includes("basingstoke") || to.includes("southampton")) return "down";
  return "unknown";
}

function writeJson(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

function writeDemo(reason) {
  const trains = [
    {
      id: "2J79",
      origin: "Reading",
      destination: "Basingstoke",
      currentCrs: "BMY",
      location: "Bramley",
      direction: "down",
      delay: 0,
      source: reason
    },
    {
      id: "4M78",
      origin: "Southampton Western Docks",
      destination: "Trafford Park",
      currentCrs: "MOR",
      location: "Mortimer",
      direction: "up",
      delay: 4,
      freight: true,
      source: reason
    }
  ];

  const departures = {};

  for (const station of STATIONS) {
    departures[station.crs] = [
      {
        time: "09:12",
        destination: "Basingstoke",
        platform: "1",
        status: "On time"
      },
      {
        time: "09:43",
        destination: "Reading",
        platform: "2",
        status: "On time"
      }
    ];
  }

  writeJson("data/line.json", {
    generatedAt: GENERATED_AT,
    source: reason,
    trains
  });

  writeJson("data/departures.json", {
    generatedAt: GENERATED_AT,
    source: reason,
    departures
  });

  console.log("Wrote demo fallback data.");
}
