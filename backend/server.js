const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// ── Cache to avoid hammering OpenSky ─────────────────────────────────
const cache = new Map();
function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < 10 * 60 * 1000) return entry.data; // 10 min cache
  return null;
}
function setCache(key, data) { cache.set(key, { data, ts: Date.now() }); }

function osAuth() {
  if (process.env.OPENSKY_USER && process.env.OPENSKY_PASS)
    return { username: process.env.OPENSKY_USER, password: process.env.OPENSKY_PASS };
  return undefined;
}

// ── Airport DB ────────────────────────────────────────────────────────
let AIRPORT_DB = {};
let DB_LOADED = false;

async function loadAirportDB() {
  if (DB_LOADED) return;
  try {
    const resp = await axios.get(
      "https://davidmegginson.github.io/ourairports-data/airports.csv",
      { timeout: 30000, responseType: "text" }
    );
    const lines = resp.data.split("\n");
    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i]);
      if (!row || row.length < 14) continue;
      const iata = row[13]?.replace(/"/g, "").trim();
      const icao = row[1]?.replace(/"/g, "").trim();
      const type = row[2]?.replace(/"/g, "").trim();
      const name = row[3]?.replace(/"/g, "").trim();
      const lat = parseFloat(row[4]);
      const lon = parseFloat(row[5]);
      const city = row[10]?.replace(/"/g, "").trim();
      const country = row[8]?.replace(/"/g, "").trim();
      if (iata && iata.length === 3 && icao && !isNaN(lat) && !isNaN(lon)) {
        AIRPORT_DB[iata] = { iata, icao, name, lat, lon, city, country, type };
      }
    }
    DB_LOADED = true;
    console.log(`Airport DB: ${Object.keys(AIRPORT_DB).length} airports`);
  } catch (e) {
    console.error("CSV failed, using fallback:", e.message);
    loadFallbackAirports();
  }
}

function parseCSVLine(line) {
  const result = [];
  let current = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === "," && !inQuotes) { result.push(current); current = ""; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

function loadFallbackAirports() {
  const f = [
    ["DXB","OMDB","Dubai International","Dubai","AE",25.2532,55.3657,"large_airport"],
    ["BOM","VABB","Chhatrapati Shivaji","Mumbai","IN",19.0896,72.8656,"large_airport"],
    ["DOH","OTHH","Hamad International","Doha","QA",25.2731,51.6083,"large_airport"],
    ["MCT","OOMS","Muscat International","Muscat","OM",23.5933,58.2844,"large_airport"],
    ["DEL","VIDP","Indira Gandhi International","Delhi","IN",28.5562,77.1,"large_airport"],
    ["LHR","EGLL","Heathrow","London","GB",51.4775,-0.4614,"large_airport"],
    ["CDG","LFPG","Charles de Gaulle","Paris","FR",49.0097,2.5479,"large_airport"],
    ["FRA","EDDF","Frankfurt","Frankfurt","DE",50.0379,8.5622,"large_airport"],
    ["AMS","EHAM","Schiphol","Amsterdam","NL",52.3086,4.7639,"large_airport"],
    ["IST","LTFM","Istanbul Airport","Istanbul","TR",41.2607,28.7418,"large_airport"],
    ["SIN","WSSS","Changi","Singapore","SG",1.3644,103.9915,"large_airport"],
    ["HKG","VHHH","Hong Kong International","Hong Kong","HK",22.308,113.9185,"large_airport"],
    ["NRT","RJAA","Narita","Tokyo","JP",35.7653,140.3857,"large_airport"],
    ["JFK","KJFK","JFK International","New York","US",40.6413,-73.7781,"large_airport"],
    ["LAX","KLAX","Los Angeles International","Los Angeles","US",33.9425,-118.408,"large_airport"],
    ["ORD","KORD","O'Hare International","Chicago","US",41.9742,-87.9073,"large_airport"],
    ["MIA","KMIA","Miami International","Miami","US",25.7959,-80.287,"large_airport"],
    ["SYD","YSSY","Sydney Kingsford Smith","Sydney","AU",-33.9399,151.1753,"large_airport"],
    ["CAI","HECA","Cairo International","Cairo","EG",30.1219,31.4056,"large_airport"],
    ["JNB","FAOR","O.R. Tambo International","Johannesburg","ZA",-26.1392,28.246,"large_airport"],
    ["ADD","HAAB","Bole International","Addis Ababa","ET",8.9779,38.799,"large_airport"],
    ["NBO","HKJK","Jomo Kenyatta International","Nairobi","KE",-1.3192,36.9275,"large_airport"],
    ["AMM","OJAM","Queen Alia International","Amman","JO",31.7226,35.9932,"large_airport"],
    ["KHI","OPKC","Jinnah International","Karachi","PK",24.9065,67.1608,"large_airport"],
    ["TLV","LLBG","Ben Gurion International","Tel Aviv","IL",32.0114,34.8867,"large_airport"],
    ["GRU","SBGR","Guarulhos International","Sao Paulo","BR",-23.4356,-46.4731,"large_airport"],
    ["EZE","SAEZ","Ministro Pistarini","Buenos Aires","AR",-34.8222,-58.5358,"large_airport"],
    ["MEX","MMMX","Mexico City International","Mexico City","MX",19.4363,-99.0721,"large_airport"],
    ["YYZ","CYYZ","Toronto Pearson","Toronto","CA",43.6777,-79.6248,"large_airport"],
    ["ICN","RKSI","Incheon International","Seoul","KR",37.4602,126.4407,"large_airport"],
    ["PEK","ZBAA","Beijing Capital","Beijing","CN",40.0799,116.6031,"large_airport"],
    ["PVG","ZSPD","Shanghai Pudong","Shanghai","CN",31.1443,121.8083,"large_airport"],
    ["RUH","OERK","King Khalid International","Riyadh","SA",24.9576,46.6988,"large_airport"],
    ["JED","OEJN","King Abdulaziz International","Jeddah","SA",21.6796,39.1565,"large_airport"],
    ["AUH","OMAA","Abu Dhabi International","Abu Dhabi","AE",24.4428,54.6511,"large_airport"],
    ["KWI","OKBK","Kuwait International","Kuwait City","KW",29.2267,47.9689,"large_airport"],
    ["BAH","OBBI","Bahrain International","Manama","BH",26.2708,50.6336,"large_airport"],
    ["BKK","VTBS","Suvarnabhumi","Bangkok","TH",13.6811,100.7472,"large_airport"],
    ["KUL","WMKK","Kuala Lumpur International","Kuala Lumpur","MY",2.7456,101.7099,"large_airport"],
    ["ZRH","LSZH","Zurich Airport","Zurich","CH",47.4647,8.5492,"large_airport"],
    ["VIE","LOWW","Vienna International","Vienna","AT",48.1103,16.5697,"large_airport"],
    ["MAD","LEMD","Madrid Barajas","Madrid","ES",40.4936,-3.5668,"large_airport"],
    ["FCO","LIRF","Fiumicino","Rome","IT",41.8003,12.2389,"large_airport"],
    ["ATH","LGAV","Athens International","Athens","GR",37.9364,23.9445,"large_airport"],
    ["SVO","UUEE","Sheremetyevo","Moscow","RU",55.9726,37.4146,"large_airport"],
    ["CPT","FACT","Cape Town International","Cape Town","ZA",-33.9648,18.6017,"large_airport"],
    ["LOS","DNMM","Murtala Muhammed","Lagos","NG",6.5774,3.3212,"large_airport"],
    ["BOG","SKBO","El Dorado International","Bogota","CO",4.7016,-74.1469,"large_airport"],
    ["GYD","UBBB","Heydar Aliyev International","Baku","AZ",40.4675,50.0467,"large_airport"],
    ["EVN","UDYZ","Zvartnots International","Yerevan","AM",40.1473,44.3959,"large_airport"],
    ["TBS","UGTB","Tbilisi International","Tbilisi","GE",41.6692,44.9547,"large_airport"],
    ["BEY","OLBA","Beirut Rafic Hariri","Beirut","LB",33.8209,35.4884,"large_airport"],
    ["CGK","WIII","Soekarno-Hatta","Jakarta","ID",-6.1256,106.6559,"large_airport"],
    ["MNL","RPLL","Ninoy Aquino International","Manila","PH",14.5086,121.0197,"large_airport"],
    ["BCN","LEBL","Barcelona El Prat","Barcelona","ES",41.2971,2.0785,"large_airport"],
    ["ACC","DGAA","Kotoka International","Accra","GH",5.6052,-0.1668,"large_airport"],
    ["MEL","YMML","Melbourne Airport","Melbourne","AU",-37.6733,144.8433,"large_airport"],
    ["SCL","SCEL","Arturo Merino Benitez","Santiago","CL",-33.3928,-70.7856,"large_airport"],
    ["LIM","SPJC","Jorge Chavez International","Lima","PE",-12.0219,-77.1143,"large_airport"],
  ];
  f.forEach(([iata,icao,name,city,country,lat,lon,type]) => {
    AIRPORT_DB[iata] = { iata, icao, name, lat, lon, city, country, type };
  });
  DB_LOADED = true;
  console.log(`Fallback DB: ${Object.keys(AIRPORT_DB).length} airports`);
}

const AIRLINE_NAMES = {
  EK:"Emirates",QR:"Qatar Airways",EY:"Etihad Airways",AI:"Air India",
  "6E":"IndiGo",UK:"Vistara",SG:"SpiceJet",IX:"Air India Express",
  LH:"Lufthansa",BA:"British Airways",AF:"Air France",KL:"KLM",
  TK:"Turkish Airlines",SQ:"Singapore Airlines",MH:"Malaysia Airlines",
  CX:"Cathay Pacific",NH:"ANA",JL:"Japan Airlines",OZ:"Asiana Airlines",
  KE:"Korean Air",CA:"Air China",CZ:"China Southern",MU:"China Eastern",
  QF:"Qantas",VA:"Virgin Australia",NZ:"Air New Zealand",
  AA:"American Airlines",UA:"United Airlines",DL:"Delta Air Lines",
  WN:"Southwest Airlines",B6:"JetBlue",AS:"Alaska Airlines",
  ET:"Ethiopian Airlines",MS:"EgyptAir",KQ:"Kenya Airways",
  RJ:"Royal Jordanian",GF:"Gulf Air",WY:"Oman Air",
  FZ:"flydubai",G9:"Air Arabia",SV:"Saudia",IR:"Iran Air",
  PK:"Pakistan International",TG:"Thai Airways",VN:"Vietnam Airlines",
  GA:"Garuda Indonesia",PR:"Philippine Airlines",
  LA:"LATAM Airlines",AV:"Avianca",CM:"Copa Airlines",
  AM:"Aeromexico",AC:"Air Canada",WS:"WestJet",
  IB:"Iberia",VY:"Vueling",FR:"Ryanair",U2:"easyJet",
  W6:"Wizz Air",OS:"Austrian Airlines",LX:"SWISS",SK:"SAS",
  AY:"Finnair",DY:"Norwegian",PC:"Pegasus Airlines",
  TP:"TAP Air Portugal",A3:"Aegean Airlines",
  SU:"Aeroflot",S7:"S7 Airlines",KC:"Air Astana",HY:"Uzbekistan Airways",
};

// ── OpenSky fetch — one airport at a time, with cache ─────────────────
async function fetchOpenSky(icaoCode, type) {
  const cacheKey = `${icaoCode}-${type}-${Math.floor(Date.now() / (10*60*1000))}`;
  const cached = getCached(cacheKey);
  if (cached) { console.log(`[Cache hit] ${icaoCode} ${type}`); return cached; }

  const now = Math.floor(Date.now() / 1000);
  const begin = now - 86400;

  try {
    console.log(`[OpenSky] Fetching ${type} for ${icaoCode}...`);
    const resp = await axios.get(
      `https://opensky-network.org/api/flights/${type}`,
      {
        params: { airport: icaoCode, begin, end: now },
        auth: osAuth(),
        timeout: 60000, // 60 second timeout
        headers: { "Accept": "application/json", "User-Agent": "EscapeRouteFinder/1.0" },
      }
    );
    const data = Array.isArray(resp.data) ? resp.data : [];
    console.log(`[OpenSky] ${icaoCode} ${type}: ${data.length} records`);
    setCache(cacheKey, data);
    return data;
  } catch (e) {
    console.error(`[OpenSky] ${icaoCode} ${type} failed: ${e.message}`);
    return [];
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function buildFlights(departures, arrivals) {
  const depMap = {};
  departures.forEach(d => { const cs = d.callsign?.trim(); if (cs) depMap[cs] = d; });

  const results = [];
  const seen = new Set();

  // Matched: departed from origin AND arrived at destination
  arrivals.forEach(a => {
    const cs = a.callsign?.trim();
    if (!cs || seen.has(cs)) return;
    seen.add(cs);
    const dep = depMap[cs];
    const twoLetter = cs.slice(0, 2).toUpperCase();
    results.push({
      flightNum: cs,
      airline: twoLetter,
      airlineName: AIRLINE_NAMES[twoLetter] || twoLetter,
      depTime: dep?.firstSeen ? new Date(dep.firstSeen * 1000).toISOString().slice(11,16) : "--:--",
      arrTime: a.lastSeen ? new Date(a.lastSeen * 1000).toISOString().slice(11,16) : "--:--",
      status: "LANDED",
    });
  });

  // Departed but not yet arrived = IN_AIR
  departures.forEach(d => {
    const cs = d.callsign?.trim();
    if (!cs || seen.has(cs)) return;
    seen.add(cs);
    const twoLetter = cs.slice(0, 2).toUpperCase();
    results.push({
      flightNum: cs,
      airline: twoLetter,
      airlineName: AIRLINE_NAMES[twoLetter] || twoLetter,
      depTime: d.firstSeen ? new Date(d.firstSeen * 1000).toISOString().slice(11,16) : "--:--",
      arrTime: "--:--",
      status: "IN_AIR",
    });
  });

  return results;
}

function calcReliability(flights) {
  const landed = flights.filter(f => f.status === "LANDED").length;
  const inAir = flights.filter(f => f.status === "IN_AIR").length;
  const cancelled = flights.filter(f => f.status === "CANCELLED").length;
  const scheduled = flights.filter(f => f.status === "SCHEDULED").length;
  const total = landed + inAir + cancelled;
  return { successRate: total > 0 ? Math.round(((landed+inAir)/total)*100) : 0, landed, inAir, cancelled, scheduled, total };
}

function calcAirlineStats(flights) {
  const map = {};
  flights.forEach(f => {
    const k = f.airlineName || f.airline;
    if (!map[k]) map[k] = { name:k, code:f.airline, total:0, landed:0, inAir:0, cancelled:0 };
    map[k].total++;
    if (f.status==="LANDED") map[k].landed++;
    if (f.status==="IN_AIR") map[k].inAir++;
    if (f.status==="CANCELLED") map[k].cancelled++;
  });
  return Object.values(map)
    .map(a => ({ ...a, rate: a.total>0 ? Math.round(((a.landed+a.inAir)/a.total)*100) : 0 }))
    .sort((a,b) => b.rate - a.rate);
}

const MAJOR_HUBS = [
  "DXB","DOH","AUH","IST","LHR","CDG","FRA","AMS","ZRH","VIE","MAD","FCO",
  "SIN","HKG","BKK","KUL","NRT","ICN","PEK","PVG","DEL",
  "JFK","LAX","ORD","MIA",
  "SYD","MEL","CAI","ADD","JNB","NBO",
  "GRU","EZE","BOG","MEX",
  "RUH","KWI","BAH","MCT","JED","SVO","YYZ","GYD",
];

function findViaHubs(o, d, max=2) {
  const oAp = AIRPORT_DB[o], dAp = AIRPORT_DB[d];
  if (!oAp || !dAp) return [];
  const distOD = Math.hypot(dAp.lat-oAp.lat, dAp.lon-oAp.lon);
  return MAJOR_HUBS
    .filter(h => h!==o && h!==d && AIRPORT_DB[h])
    .map(h => {
      const hub = AIRPORT_DB[h];
      const dOH = Math.hypot(hub.lat-oAp.lat, hub.lon-oAp.lon);
      const dHD = Math.hypot(dAp.lat-hub.lat, dAp.lon-hub.lon);
      return { code:h, detour:(dOH+dHD)/Math.max(distOD,0.01) };
    })
    .filter(h => h.detour < 1.8)
    .sort((a,b) => a.detour-b.detour)
    .slice(0, max)
    .map(h => h.code);
}

// ── /api/airports ─────────────────────────────────────────────────────
app.get("/api/airports", async (req, res) => {
  await loadAirportDB();
  const q = (req.query.q||"").toUpperCase().trim();
  if (!q || q.length < 2) return res.json([]);
  const results = Object.values(AIRPORT_DB)
    .filter(ap =>
      ap.iata?.includes(q) ||
      ap.city?.toUpperCase().includes(q) ||
      ap.name?.toUpperCase().includes(q) ||
      ap.country?.toUpperCase().includes(q)
    )
    .sort((a,b) => {
      if (a.iata===q) return -1;
      if (b.iata===q) return 1;
      if (a.type==="large_airport"&&b.type!=="large_airport") return -1;
      if (b.type==="large_airport"&&a.type!=="large_airport") return 1;
      return 0;
    })
    .slice(0,12)
    .map(ap => ({ code:ap.iata, icao:ap.icao, city:ap.city, country:ap.country, name:ap.name }));
  res.json(results);
});

// ── /api/routes — main endpoint ───────────────────────────────────────
app.get("/api/routes", async (req, res) => {
  await loadAirportDB();
  const { origin, destination } = req.query;
  if (!origin||!destination) return res.status(400).json({ error:"origin and destination required" });

  const o = origin.trim().toUpperCase();
  const d = destination.trim().toUpperCase();
  const oAp = AIRPORT_DB[o];
  const dAp = AIRPORT_DB[d];

  if (!oAp) return res.status(400).json({ error:`Airport not found: ${o}` });
  if (!dAp) return res.status(400).json({ error:`Airport not found: ${d}` });
  if (o===d) return res.status(400).json({ error:"Origin and destination must differ" });

  const result = { origin:oAp, destination:dAp, routes:[], dataSource:"opensky", errors:[] };

  // ── Direct route: fetch arrivals at dest + departures from origin ──
  console.log(`\n=== Route: ${o} → ${d} ===`);
  const [destArrivals, origDepartures] = await Promise.all([
    fetchOpenSky(dAp.icao, "arrivals"),
    fetchOpenSky(oAp.icao, "departures"),
  ]);

  const directFlights = buildFlights(origDepartures, destArrivals);
  const ds = calcReliability(directFlights);
  console.log(`Direct: ${directFlights.length} flights, ${ds.successRate}% success`);

  result.routes.push({
    id:"direct", path:[o,d],
    label:`${oAp.city} → ${dAp.city}`,
    ...ds, flights:directFlights,
    airlineStats:calcAirlineStats(directFlights),
    isAlternate:false,
  });

  // ── Alternate routes via hubs (max 2, sequential with delay) ─────
  const vias = findViaHubs(o, d, 2);
  for (const via of vias) {
    await sleep(500); // small delay between hub requests
    const vAp = AIRPORT_DB[via];
    const [viaArrivals, viaDepartures] = await Promise.all([
      fetchOpenSky(vAp.icao, "arrivals"),
      fetchOpenSky(vAp.icao, "departures"),
    ]);
    const leg1 = buildFlights(origDepartures, viaArrivals);   // origin → via
    const leg2 = buildFlights(viaDepartures, destArrivals);   // via → dest
    const s1 = calcReliability(leg1);
    const s2 = calcReliability(leg2);
    const combinedRate = Math.round((s1.successRate/100)*(s2.successRate/100)*100);
    console.log(`Via ${via}: leg1=${s1.successRate}%, leg2=${s2.successRate}%, combined=${combinedRate}%`);

    result.routes.push({
      id:via, path:[o,via,d],
      label:`${oAp.city} → ${vAp.city} → ${dAp.city}`,
      successRate:combinedRate,
      landed:Math.min(s1.landed,s2.landed),
      cancelled:Math.max(s1.cancelled,s2.cancelled),
      inAir:Math.min(s1.inAir,s2.inAir),
      scheduled:0, total:Math.min(s1.total,s2.total),
      flights:[...leg1,...leg2],
      airlineStats:calcAirlineStats([...leg1,...leg2]),
      isAlternate:true, via:vAp.city, viaCode:via,
    });
  }

  result.routes.sort((a,b) => b.successRate - a.successRate);
  res.json(result);
});

// ── /api/health ───────────────────────────────────────────────────────
app.get("/api/health", async (req, res) => {
  await loadAirportDB();
  res.json({
    status:"ok",
    airportsLoaded: Object.keys(AIRPORT_DB).length,
    openSkyAuth: !!process.env.OPENSKY_USER,
    time: new Date().toISOString(),
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`✈  Escape Route API on port ${PORT}`);
  await loadAirportDB();
});
