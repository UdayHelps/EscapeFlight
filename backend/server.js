const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = "aerodatabox.p.rapidapi.com";
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// ── Cache ─────────────────────────────────────────────────────────────
const cache = new Map();
function getCached(key, ttlMs = 15 * 60 * 1000) {
  const e = cache.get(key);
  if (e && Date.now() - e.ts < ttlMs) return e.data;
  return null;
}
function setCache(key, data) { cache.set(key, { data, ts: Date.now() }); }

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
    console.error("CSV failed:", e.message);
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
    ["SYD","YSSY","Sydney Kingsford Smith","Sydney","AU",-33.9399,151.1753,"large_airport"],
    ["CAI","HECA","Cairo International","Cairo","EG",30.1219,31.4056,"large_airport"],
    ["JNB","FAOR","O.R. Tambo International","Johannesburg","ZA",-26.1392,28.246,"large_airport"],
    ["AMM","OJAM","Queen Alia International","Amman","JO",31.7226,35.9932,"large_airport"],
    ["TLV","LLBG","Ben Gurion International","Tel Aviv","IL",32.0114,34.8867,"large_airport"],
    ["RUH","OERK","King Khalid International","Riyadh","SA",24.9576,46.6988,"large_airport"],
    ["AUH","OMAA","Abu Dhabi International","Abu Dhabi","AE",24.4428,54.6511,"large_airport"],
    ["KWI","OKBK","Kuwait International","Kuwait City","KW",29.2267,47.9689,"large_airport"],
    ["GYD","UBBB","Heydar Aliyev International","Baku","AZ",40.4675,50.0467,"large_airport"],
    ["TBS","UGTB","Tbilisi International","Tbilisi","GE",41.6692,44.9547,"large_airport"],
    ["BEY","OLBA","Beirut Rafic Hariri","Beirut","LB",33.8209,35.4884,"large_airport"],
    ["IST","LTFM","Istanbul Airport","Istanbul","TR",41.2607,28.7418,"large_airport"],
  ];
  f.forEach(([iata,icao,name,city,country,lat,lon,type]) => {
    AIRPORT_DB[iata] = { iata, icao, name, lat, lon, city, country, type };
  });
  DB_LOADED = true;
}

// ── AeroDataBox single 12h window fetch ───────────────────────────────
async function fetchWindow(icao, direction, hoursBack, hoursAhead) {
  const now = new Date();
  const from = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
  const to = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
  const fmt = d => d.toISOString().slice(0, 16);
  const cacheKey = `${icao}-${direction}-${hoursBack}-${hoursAhead}-${Math.floor(Date.now()/(10*60*1000))}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const url = `https://aerodatabox.p.rapidapi.com/flights/airports/icao/${icao}/${fmt(from)}/${fmt(to)}`;
  try {
    const resp = await axios.get(url, {
      params: { withLeg:"true", direction, withCancelled:"true", withCodeshared:"false", withCargo:"false", withPrivate:"false" },
      headers: { "x-rapidapi-key": RAPIDAPI_KEY, "x-rapidapi-host": RAPIDAPI_HOST },
      timeout: 15000,
    });
    const data = resp.data?.arrivals || resp.data?.departures || [];
    setCache(cacheKey, data);
    return data;
  } catch(e) {
    console.error(`[ADB] ${icao} ${direction} ${hoursBack}h-${hoursAhead}h: ${e.response?.status} ${e.message}`);
    return [];
  }
}

// ── Fetch 48h by stitching 4 x 12h windows ───────────────────────────
async function fetch48h(icao, direction) {
  // Window 1: 48h→36h ago
  // Window 2: 36h→24h ago
  // Window 3: 24h→12h ago  
  // Window 4: 12h ago→4h ahead
  const [w1, w2, w3, w4] = await Promise.all([
    fetchWindow(icao, direction, 48, -36), // 48h ago to 36h ago
    fetchWindow(icao, direction, 36, -24), // 36h ago to 24h ago
    fetchWindow(icao, direction, 24, -12), // 24h ago to 12h ago
    fetchWindow(icao, direction, 8, 4),    // 8h ago to 4h ahead
  ]);

  // Dedupe by flight number
  const seen = new Set();
  const all = [];
  [...w1, ...w2, ...w3, ...w4].forEach(f => {
    const key = f.number || f.callSign;
    if (key && !seen.has(key)) { seen.add(key); all.push(f); }
  });
  console.log(`[48h] ${icao} ${direction}: ${all.length} unique flights`);
  return all;
}

function mapFlight(f, impliedDep, impliedArr) {
  const flightNum = f.number || f.callSign || "N/A";
  const airlineName = f.airline?.name || "Unknown";
  const airlineCode = f.airline?.iata || flightNum.slice(0,2);
  const depAirport = f.departure?.airport?.iata || impliedDep || "?";
  const arrAirport = f.arrival?.airport?.iata || impliedArr || "?";
  const depTime = (f.departure?.revisedTime?.local || f.departure?.scheduledTime?.local)?.slice(11,16)
    || (f.departure?.revisedTime?.utc || f.departure?.scheduledTime?.utc)?.slice(11,16) || "--:--";
  const arrTime = (f.arrival?.revisedTime?.local || f.arrival?.scheduledTime?.local)?.slice(11,16)
    || (f.arrival?.revisedTime?.utc || f.arrival?.scheduledTime?.utc)?.slice(11,16) || "--:--";
  return {
    flightNum, airlineCode, airlineName, depTime, arrTime,
    depAirport, arrAirport,
    depAirportName: f.departure?.airport?.name || AIRPORT_DB[depAirport]?.city || depAirport,
    arrAirportName: f.arrival?.airport?.name || AIRPORT_DB[arrAirport]?.city || arrAirport,
    status: mapStatus(f.status),
    aircraft: f.aircraft?.model || null,
    terminal: f.arrival?.terminal || f.departure?.terminal || null,
    gate: f.arrival?.gate || f.departure?.gate || null,
    baggage: f.arrival?.baggageBelt || null,
  };
}

function mapStatus(s) {
  if (!s) return "SCHEDULED";
  const l = s.toLowerCase();
  if (l.includes("landed")||l.includes("arrived")) return "LANDED";
  if (l.includes("cancel")) return "CANCELLED";
  if (l.includes("airborne")||l.includes("departed")||l.includes("en route")) return "IN_AIR";
  if (l.includes("delay")) return "DELAYED";
  if (l.includes("diverted")) return "DIVERTED";
  if (l.includes("boarding")||l.includes("gate")) return "BOARDING";
  return "SCHEDULED";
}

function buildFlights(departures, arrivals, originIata, destIata) {
  const seen = new Set();
  const results = [];
  arrivals.forEach(f => {
    if (f.departure?.airport?.iata !== originIata) return;
    const m = mapFlight(f, originIata, destIata);
    if (!seen.has(m.flightNum)) { seen.add(m.flightNum); results.push(m); }
  });
  departures.forEach(f => {
    if (f.arrival?.airport?.iata !== destIata) return;
    const m = mapFlight(f, originIata, destIata);
    if (!seen.has(m.flightNum)) { seen.add(m.flightNum); results.push(m); }
  });
  return results.sort((a,b) => a.depTime.localeCompare(b.depTime));
}

function calcReliability(flights) {
  const landed = flights.filter(f=>f.status==="LANDED").length;
  const inAir = flights.filter(f=>f.status==="IN_AIR").length;
  const cancelled = flights.filter(f=>f.status==="CANCELLED").length;
  const delayed = flights.filter(f=>f.status==="DELAYED").length;
  const scheduled = flights.filter(f=>["SCHEDULED","BOARDING"].includes(f.status)).length;
  const operated = landed + inAir + delayed;
  const total = operated + cancelled;
  return { successRate: total>0?Math.round((operated/total)*100):0, landed, inAir, cancelled, delayed, scheduled, total };
}

function calcAirlineStats(flights) {
  const map = {};
  flights.forEach(f => {
    if (!map[f.airlineName]) map[f.airlineName] = { name:f.airlineName, code:f.airlineCode, total:0, landed:0, inAir:0, cancelled:0, delayed:0 };
    map[f.airlineName].total++;
    if (f.status==="LANDED") map[f.airlineName].landed++;
    if (f.status==="IN_AIR") map[f.airlineName].inAir++;
    if (f.status==="CANCELLED") map[f.airlineName].cancelled++;
    if (f.status==="DELAYED") map[f.airlineName].delayed++;
  });
  return Object.values(map)
    .map(a => ({ ...a, rate: a.total>0?Math.round(((a.landed+a.inAir)/a.total)*100):0 }))
    .sort((a,b) => b.rate-a.rate);
}

// ── /api/routes ───────────────────────────────────────────────────────
app.get("/api/routes", async (req, res) => {
  await loadAirportDB();
  const { origin, destination } = req.query;
  if (!origin||!destination) return res.status(400).json({ error:"origin and destination required" });
  const o = origin.trim().toUpperCase();
  const d = destination.trim().toUpperCase();
  const oAp = AIRPORT_DB[o], dAp = AIRPORT_DB[d];
  if (!oAp) return res.status(400).json({ error:`Airport not found: ${o}` });
  if (!dAp) return res.status(400).json({ error:`Airport not found: ${d}` });
  if (o===d) return res.status(400).json({ error:"Origin and destination must differ" });

  console.log(`\n=== ${o} → ${d} (48h) ===`);
  const [origDeps, destArrs] = await Promise.all([
    fetch48h(oAp.icao, "Departure"),
    fetch48h(dAp.icao, "Arrival"),
  ]);

  const flights = buildFlights(origDeps, destArrs, o, d);
  const stats = calcReliability(flights);
  console.log(`${o}→${d}: ${flights.length} flights, ${stats.successRate}% success`);

  res.json({
    origin: oAp, destination: dAp,
    dataWindow: "48h history + 4h ahead",
    routes: [{
      id:"direct", path:[o,d],
      label:`${oAp.city} → ${dAp.city}`,
      ...stats, flights,
      airlineStats: calcAirlineStats(flights),
      isAlternate: false,
    }],
    dataSource: "aerodatabox",
  });
});

// ── /api/airports ─────────────────────────────────────────────────────
app.get("/api/airports", async (req, res) => {
  await loadAirportDB();
  const q = (req.query.q||"").toUpperCase().trim();
  if (!q||q.length<2) return res.json([]);
  const results = Object.values(AIRPORT_DB)
    .filter(ap => ap.iata?.includes(q)||ap.city?.toUpperCase().includes(q)||ap.name?.toUpperCase().includes(q)||ap.country?.toUpperCase().includes(q))
    .sort((a,b) => {
      if (a.iata===q) return -1; if (b.iata===q) return 1;
      if (a.type==="large_airport"&&b.type!=="large_airport") return -1;
      if (b.type==="large_airport"&&a.type!=="large_airport") return 1;
      return 0;
    })
    .slice(0,12)
    .map(ap => ({ code:ap.iata, icao:ap.icao, city:ap.city, country:ap.country, name:ap.name }));
  res.json(results);
});

// ── /api/events — Real news + Groq AI severity analysis ──────────────
app.get("/api/events", async (req, res) => {
  const cached = getCached("world-events", 20 * 60 * 1000);
  if (cached) return res.json(cached);

  if (!GROQ_API_KEY) return res.status(500).json({ error: "GROQ_API_KEY not set" });
  if (!process.env.NEWS_API_KEY) return res.status(500).json({ error: "NEWS_API_KEY not set" });

  try {
    // Step 1: Fetch real headlines from NewsAPI
    console.log("[Events] Fetching live news...");
    const newsResp = await axios.get("https://newsapi.org/v2/everything", {
      params: {
        q: "airspace OR aviation OR airline OR airport OR war OR conflict OR airstrike OR sanctions OR flight ban OR military",
        language: "en",
        sortBy: "publishedAt",
        pageSize: 20,
        apiKey: process.env.NEWS_API_KEY,
      },
      timeout: 10000,
    });

    const articles = newsResp.data?.articles || [];
    const headlines = articles
      .filter(a => a.title && a.description && !a.title.includes("[Removed]"))
      .slice(0, 15)
      .map(a => `- ${a.title}: ${a.description?.slice(0, 120) || ""}`)
      .join("\n");

    console.log(`[Events] Got ${articles.length} articles, sending to Groq...`);

    // Step 2: Groq analyzes real headlines
    const prompt = `You are a global aviation security analyst. Below are real current news headlines. Analyze them and return a JSON array of the most relevant events for aviation safety and air travel.

REAL HEADLINES:
${headlines}

For each relevant event create an entry. If a headline is not aviation-relevant, skip it. Create 6-10 entries total.

Severity levels:
- S1: Minor, monitor only
- S2: Low — some disruption possible
- S3: Moderate — rerouting advisable  
- S4: High — avoid if possible
- S5: Critical — airspace closed or extremely dangerous

Return ONLY a valid JSON array, no markdown, no explanation:
[
  {
    "id": "evt-1",
    "title": "Short clear title",
    "location": "Country or Region",
    "summary": "2-3 sentences on situation and aviation impact.",
    "severity": "S3",
    "severityLabel": "Moderate",
    "affectedAirports": ["IATA1","IATA2"],
    "affectedRoutes": ["Description of affected corridors"],
    "category": "Conflict",
    "timestamp": "${new Date().toISOString()}",
    "trend": "escalating",
    "source": "Source name"
  }
]

Categories: Conflict, Airspace, Weather, Political, Security, Infrastructure
Trend: escalating, stable, deescalating`;

    const groqResp = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2500,
        temperature: 0.3,
      },
      {
        headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
        timeout: 30000,
      }
    );

    const text = groqResp.data.choices[0].message.content;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array in Groq response");
    const events = JSON.parse(jsonMatch[0]);
    console.log(`[Events] Groq returned ${events.length} events`);
    setCache("world-events", events);
    res.json(events);
  } catch(e) {
    console.error("[Events] Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── /api/health ───────────────────────────────────────────────────────
app.get("/api/health", async (req, res) => {
  await loadAirportDB();
  res.json({
    status:"ok",
    airportsLoaded: Object.keys(AIRPORT_DB).length,
    apiKey: RAPIDAPI_KEY?"set":"NOT SET",
    groqKey: GROQ_API_KEY?"set":"NOT SET",
    newsApiKey: process.env.NEWS_API_KEY?"set":"NOT SET",
    dataWindow: "48h history + 4h ahead (4 API calls per route)",
    time: new Date().toISOString(),
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`✈  Escape Route API on port ${PORT}`);
  await loadAirportDB();
});
