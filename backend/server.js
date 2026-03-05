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
const NEWS_API_KEY = process.env.NEWS_API_KEY;

// ── Quota tracker ─────────────────────────────────────────────────────
// Pro plan: 24,000 units/month. Airport schedule = Tier 2 = 2 units/call.
const QUOTA = {
  MONTHLY_UNIT_LIMIT: 24000,
  TIER2_COST: 2,
  TIER3_COST: 6,
  used: 0,
};
function trackUsage(tier = 2) {
  const cost = tier === 3 ? QUOTA.TIER3_COST : QUOTA.TIER2_COST;
  QUOTA.used += cost;
  console.log(`[Quota] +${cost} units (Tier ${tier}) | Session total: ${QUOTA.used} | Remaining: ~${QUOTA.MONTHLY_UNIT_LIMIT - QUOTA.used}`);
}
function quotaOk(tier = 2) {
  const cost = tier === 3 ? QUOTA.TIER3_COST : QUOTA.TIER2_COST;
  return (QUOTA.MONTHLY_UNIT_LIMIT - QUOTA.used) >= cost;
}

// ── Cache ─────────────────────────────────────────────────────────────
const cache = new Map();
function getCached(key, ttlMs) {
  const e = cache.get(key);
  if (e && Date.now() - e.ts < ttlMs) return e.data;
  return null;
}
function setCache(key, data) { cache.set(key, { data, ts: Date.now() }); }

const HISTORICAL_TTL = 30 * 60 * 1000; // 30 min — past flights won't change
const LIVE_TTL       = 10 * 60 * 1000; // 10 min — future/live data

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
      const row     = parseCSVLine(lines[i]);
      if (!row || row.length < 14) continue;
      const iata    = row[13]?.replace(/"/g, "").trim();
      const icao    = row[1]?.replace(/"/g, "").trim();
      const type    = row[2]?.replace(/"/g, "").trim();
      const name    = row[3]?.replace(/"/g, "").trim();
      const lat     = parseFloat(row[4]);
      const lon     = parseFloat(row[5]);
      const city    = row[10]?.replace(/"/g, "").trim();
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
    ["BKK","VTBS","Suvarnabhumi","Bangkok","TH",13.6811,100.7472,"large_airport"],
    ["KUL","WMKK","Kuala Lumpur International","Kuala Lumpur","MY",2.7456,101.7099,"large_airport"],
  ];
  f.forEach(([iata,icao,name,city,country,lat,lon,type]) => {
    AIRPORT_DB[iata] = { iata, icao, name, lat, lon, city, country, type };
  });
  DB_LOADED = true;
}

// ── Core fetch — single window, max 12h, Tier 2 = 2 units ────────────
async function fetchWindow(icao, direction, fromDate, toDate, isHistorical = true) {
  const fmt        = d => d.toISOString().slice(0, 16);
  const cacheKey   = `${icao}-${direction}-${fmt(fromDate)}-${fmt(toDate)}`;
  const ttl        = isHistorical ? HISTORICAL_TTL : LIVE_TTL;
  const cached     = getCached(cacheKey, ttl);
  if (cached) {
    console.log(`[Cache HIT] ${cacheKey}`);
    return cached;
  }

  if (!quotaOk(2)) {
    console.warn(`[Quota GUARD] Not enough units for ${cacheKey} — returning empty`);
    return [];
  }

  const url = `https://aerodatabox.p.rapidapi.com/flights/airports/icao/${icao}/${fmt(fromDate)}/${fmt(toDate)}`;
  try {
    const resp = await axios.get(url, {
      params: {
        withLeg:        "true",
        direction,
        withCancelled:  "true",
        withCodeshared: "false",
        withCargo:      "false",
        withPrivate:    "false",
        withLocation:   "false",
      },
      headers: { "x-rapidapi-key": RAPIDAPI_KEY, "x-rapidapi-host": RAPIDAPI_HOST },
      timeout: 20000,
    });

    trackUsage(2);

    let data = [];
    if (direction === "Arrival"   && resp.data?.arrivals)   data = resp.data.arrivals;
    else if (direction === "Departure" && resp.data?.departures) data = resp.data.departures;
    else data = resp.data?.arrivals || resp.data?.departures || [];

    console.log(`[ADB] ${icao} ${direction} ${fmt(fromDate)}→${fmt(toDate)}: ${data.length} flights`);
    setCache(cacheKey, data);
    return data;
  } catch (e) {
    console.error(`[ADB ERROR] ${icao} ${direction}: HTTP ${e.response?.status} — ${e.message}`);
    if (e.response?.data) console.error("[ADB Body]", JSON.stringify(e.response.data).slice(0, 400));
    return [];
  }
}

// ── Fetch range in 11.5h chunks ───────────────────────────────────────
// Pro tip: for 24h we get exactly 2 chunks = 2 calls per airport = 4 calls total = 8 units
// Do NOT use 48h — that doubles to 16 units per search
async function fetchTimeRange(icao, direction, hoursAgo, hoursAhead, isHistorical = true) {
  const now    = new Date();
  const from   = new Date(now.getTime() - hoursAgo   * 3600000);
  const to     = new Date(now.getTime() + hoursAhead * 3600000);
  const CHUNK  = 11.5 * 3600000; // just under 12h limit
  const totalH = (to - from) / 3600000;

  if (totalH <= 11.5) {
    return fetchWindow(icao, direction, from, to, isHistorical);
  }

  const windows = [];
  let cursor = from;
  while (cursor < to) {
    const end = new Date(Math.min(cursor.getTime() + CHUNK, to.getTime()));
    windows.push({ from: new Date(cursor), to: end });
    cursor = new Date(end.getTime() + 60000); // 1min gap prevents overlap
  }

  console.log(`[ADB] ${totalH.toFixed(0)}h split into ${windows.length} windows for ${icao} — ~${windows.length * 2} units`);

  const results = await Promise.all(
    windows.map(w => fetchWindow(icao, direction, w.from, w.to, isHistorical))
  );

  const seen = new Set(), all = [];
  results.flat().forEach(f => {
    const key = f.number || f.callSign;
    if (key && !seen.has(key)) { seen.add(key); all.push(f); }
  });
  return all;
}

// ── Status mapper ─────────────────────────────────────────────────────
function mapStatus(s) {
  if (!s) return "SCHEDULED";
  const l = s.toLowerCase().replace(/[\s_\-]/g, "");
  if (l === "landed" || l === "arrived")                                  return "LANDED";
  if (l === "cancelled" || l === "canceled")                              return "CANCELLED";
  if (["enroute","airborne","departed","inflightx","active"].includes(l)) return "IN_AIR";
  if (l.includes("delay"))                                                return "DELAYED";
  if (l === "diverted")                                                   return "DIVERTED";
  if (["boarding","gateclosed","taxiing","gateopen"].includes(l))         return "BOARDING";
  if (l.includes("land") || l.includes("arriv"))                         return "LANDED";
  if (l.includes("cancel"))                                               return "CANCELLED";
  if (l.includes("air") || l.includes("route") || l.includes("depart"))  return "IN_AIR";
  return "SCHEDULED";
}

// ── Flight mapper ─────────────────────────────────────────────────────
function mapFlight(f, impliedDep, impliedArr) {
  const flightNum   = f.number || f.callSign || "N/A";
  const airlineName = f.airline?.name || "Unknown";
  const airlineCode = f.airline?.iata || (flightNum.length >= 2 ? flightNum.slice(0, 2) : "??");
  const depAirport  = f.departure?.airport?.iata || impliedDep || "?";
  const arrAirport  = f.arrival?.airport?.iata   || impliedArr || "?";
  const depTime     = (f.departure?.revisedTime?.local || f.departure?.scheduledTime?.local
                    || f.departure?.revisedTime?.utc   || f.departure?.scheduledTime?.utc || "")?.slice(11,16) || "--:--";
  const arrTime     = (f.arrival?.revisedTime?.local   || f.arrival?.scheduledTime?.local
                    || f.arrival?.revisedTime?.utc     || f.arrival?.scheduledTime?.utc   || "")?.slice(11,16) || "--:--";
  const depDate     = (f.departure?.revisedTime?.local || f.departure?.scheduledTime?.local
                    || f.departure?.revisedTime?.utc   || f.departure?.scheduledTime?.utc || "")?.slice(0,10) || null;
  return {
    flightNum, airlineCode, airlineName, depTime, arrTime, depDate,
    depAirport, arrAirport,
    depAirportName: f.departure?.airport?.name || AIRPORT_DB[depAirport]?.city || depAirport,
    arrAirportName: f.arrival?.airport?.name   || AIRPORT_DB[arrAirport]?.city || arrAirport,
    status:   mapStatus(f.status),
    aircraft: f.aircraft?.model || f.aircraft?.reg || null,
    terminal: f.arrival?.terminal  || f.departure?.terminal || null,
    gate:     f.arrival?.gate      || f.departure?.gate     || null,
    baggage:  f.arrival?.baggageBelt || null,
  };
}

// ── Match flights from both airport feeds ─────────────────────────────
function buildFlights(departures, arrivals, originIata, destIata) {
  const flightMap = new Map();
  const richness  = f => [
    f.departure?.airport?.iata, f.arrival?.airport?.iata,
    f.departure?.scheduledTime?.local, f.arrival?.scheduledTime?.local,
    f.aircraft?.model, f.status,
  ].filter(Boolean).length;

  departures.forEach(f => {
    const arr = f.arrival?.airport?.iata;
    if (arr && arr !== destIata) return; // confirmed wrong dest — skip
    const m   = mapFlight(f, originIata, destIata);
    m._raw    = f;
    const ex  = flightMap.get(m.flightNum);
    if (!ex || richness(f) > richness(ex._raw)) flightMap.set(m.flightNum, m);
  });

  arrivals.forEach(f => {
    const dep = f.departure?.airport?.iata;
    if (dep && dep !== originIata) return; // confirmed wrong origin — skip
    const m   = mapFlight(f, originIata, destIata);
    const ex  = flightMap.get(m.flightNum);
    if (!ex) {
      m._raw = f; flightMap.set(m.flightNum, m);
    } else if (richness(f) > richness(ex._raw)) {
      const merged = { ...ex, ...m };
      if (ex.depAirport !== "?" && m.depAirport === "?") merged.depAirport = ex.depAirport;
      if (ex.arrAirport !== "?" && m.arrAirport === "?") merged.arrAirport = ex.arrAirport;
      if (ex.depTime !== "--:--" && m.depTime === "--:--") merged.depTime = ex.depTime;
      if (ex.arrTime !== "--:--" && m.arrTime === "--:--") merged.arrTime = ex.arrTime;
      if (!m.aircraft && ex.aircraft) merged.aircraft = ex.aircraft;
      merged._raw = f;
      flightMap.set(m.flightNum, merged);
    }
  });

  return [...flightMap.values()]
    .map(({ _raw, ...rest }) => rest)
    .sort((a, b) => {
      if (a.depTime === "--:--") return 1;
      if (b.depTime === "--:--") return -1;
      return a.depTime.localeCompare(b.depTime);
    });
}

function calcStats(flights) {
  const landed    = flights.filter(f => f.status === "LANDED").length;
  const inAir     = flights.filter(f => f.status === "IN_AIR").length;
  const cancelled = flights.filter(f => f.status === "CANCELLED").length;
  const delayed   = flights.filter(f => f.status === "DELAYED").length;
  const scheduled = flights.filter(f => ["SCHEDULED","BOARDING"].includes(f.status)).length;
  const operated  = landed + inAir + delayed;
  const total     = operated + cancelled;
  return { successRate: total > 0 ? Math.round((operated / total) * 100) : 0, landed, inAir, cancelled, delayed, scheduled, total };
}

function calcAirlineStats(flights) {
  const map = {};
  flights.forEach(f => {
    if (!map[f.airlineName]) map[f.airlineName] = { name: f.airlineName, code: f.airlineCode, total: 0, landed: 0, inAir: 0, cancelled: 0, delayed: 0 };
    map[f.airlineName].total++;
    if (f.status === "LANDED")    map[f.airlineName].landed++;
    if (f.status === "IN_AIR")    map[f.airlineName].inAir++;
    if (f.status === "CANCELLED") map[f.airlineName].cancelled++;
    if (f.status === "DELAYED")   map[f.airlineName].delayed++;
  });
  return Object.values(map)
    .map(a => ({ ...a, rate: a.total > 0 ? Math.round(((a.landed + a.inAir) / a.total) * 100) : 0 }))
    .sort((a, b) => b.rate - a.rate);
}

// ── AI Prediction (Groq — free, no AeroDataBox units consumed) ────────
async function getAIPrediction(flight, historicalFlights, airlineStats, routeStats) {
  if (!GROQ_API_KEY) return null;
  const airlineStat       = airlineStats.find(a => a.name === flight.airlineName);
  const sameFlightHistory = historicalFlights.filter(f => f.flightNum === flight.flightNum && f.status !== "SCHEDULED");
  const cancelledSameTime = historicalFlights.filter(f => {
    if (f.airlineName !== flight.airlineName || f.status !== "CANCELLED") return false;
    return Math.abs(parseInt(f.depTime) - parseInt(flight.depTime)) <= 2;
  });

  const prompt = `You are an aviation analyst. Predict flight operation probability.
FLIGHT: ${flight.flightNum} by ${flight.airlineName} | DEP: ${flight.depTime} | Aircraft: ${flight.aircraft || "unknown"}
AIRLINE (last 24h): ${airlineStat?.total || 0} flights | ${airlineStat?.landed || 0} landed | ${airlineStat?.cancelled || 0} cancelled | ${airlineStat?.rate || 0}% success
SAME FLIGHT HISTORY: ${sameFlightHistory.map(f => `${f.depDate} ${f.depTime}: ${f.status}`).join(", ") || "none"}
SIMILAR TIME CANCELLATIONS: ${cancelledSameTime.length}
ROUTE: ${routeStats.successRate}% success | ${routeStats.cancelled} cancelled / ${routeStats.total} total
Return ONLY JSON: {"flyProbability":78,"cancelProbability":22,"confidence":"high","reasoning":"2-3 sentences","riskFactors":["factor1"],"recommendation":"one line"}`;

  try {
    const resp  = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      { model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: prompt }], max_tokens: 400, temperature: 0.2 },
      { headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" }, timeout: 15000 }
    );
    const text  = resp.data.choices[0].message.content;
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch (e) {
    console.error("Groq error:", e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════

// /api/routes — 24h history, ~8 units per unique route (cached 30 min)
app.get("/api/routes", async (req, res) => {
  await loadAirportDB();
  const { origin, destination } = req.query;
  if (!origin || !destination) return res.status(400).json({ error: "origin and destination required" });
  const o   = origin.trim().toUpperCase();
  const d   = destination.trim().toUpperCase();
  const oAp = AIRPORT_DB[o], dAp = AIRPORT_DB[d];
  if (!oAp) return res.status(400).json({ error: `Airport not found: ${o}` });
  if (!dAp) return res.status(400).json({ error: `Airport not found: ${d}` });
  if (o === d) return res.status(400).json({ error: "Origin and destination must differ" });

  const routeCacheKey = `route-${o}-${d}`;
  const routeCached   = getCached(routeCacheKey, HISTORICAL_TTL);
  if (routeCached) {
    console.log(`[Cache HIT] Route ${o}→${d} — 0 units`);
    return res.json({ ...routeCached, fromCache: true });
  }

  // 24h history = 2 chunks × 2 airports = 4 calls = 8 units
  console.log(`\n=== ROUTE ${o}→${d} | 24h | ~8 units ===`);
  const [origDeps, destArrs] = await Promise.all([
    fetchTimeRange(oAp.icao, "Departure", 24, 0, true),
    fetchTimeRange(dAp.icao, "Arrival",   24, 0, true),
  ]);

  console.log(`  Raw: ${origDeps.length} deps / ${destArrs.length} arrs`);
  const flights      = buildFlights(origDeps, destArrs, o, d);
  const stats        = calcStats(flights);
  const airlineStats = calcAirlineStats(flights);
  console.log(`  Matched: ${flights.length} flights`);

  // Split into two 12h buckets for the tabs
  const now           = new Date();
  const mid12hCutoff  = new Date(now.getTime() - 12 * 3600000);
  const last12h       = flights.filter(f => f.depDate && f.depTime !== "--:--" && new Date(`${f.depDate}T${f.depTime}`) >= mid12hCutoff);
  const prev12h       = flights.filter(f => f.depDate && f.depTime !== "--:--" && new Date(`${f.depDate}T${f.depTime}`) <  mid12hCutoff);

  const payload = {
    origin: oAp, destination: dAp,
    dataWindow: "24h history",
    stats, airlineStats, flights,
    last24h: flights,   // frontend compat alias
    last12h, prev12h,
    prev24h: prev12h,   // frontend compat alias
    dataSource: "aerodatabox",
    debug: {
      rawDepartures: origDeps.length,
      rawArrivals:   destArrs.length,
      matched:       flights.length,
      unitsThisCall: 8,
      sessionTotal:  QUOTA.used,
    },
  };
  setCache(routeCacheKey, payload);
  res.json(payload);
});

// /api/future — next 12h, ~4 units (cached 10 min)
app.get("/api/future", async (req, res) => {
  await loadAirportDB();
  const { origin, destination } = req.query;
  if (!origin || !destination) return res.status(400).json({ error: "required" });
  const o   = origin.trim().toUpperCase();
  const d   = destination.trim().toUpperCase();
  const oAp = AIRPORT_DB[o], dAp = AIRPORT_DB[d];
  if (!oAp || !dAp) return res.status(400).json({ error: "Airport not found" });

  const futureCacheKey = `future-${o}-${d}`;
  const futureCached   = getCached(futureCacheKey, LIVE_TTL);
  if (futureCached) {
    console.log(`[Cache HIT] Future ${o}→${d} — 0 units`);
    return res.json({ ...futureCached, fromCache: true });
  }

  // Next 24h = 2 windows × 2 airports = 4 calls = 8 units
  console.log(`[Future] ${o}→${d} | ~8 units`);
  const [origDeps, destArrs] = await Promise.all([
    fetchTimeRange(oAp.icao, "Departure", 0, 24, false),
    fetchTimeRange(dAp.icao, "Arrival",   0, 24, false),
  ]);

  const flights = buildFlights(origDeps, destArrs, o, d)
    .filter(f => ["SCHEDULED","BOARDING","DELAYED"].includes(f.status));

  const payload = { origin: oAp, destination: dAp, flights, window: "next 24h" };
  setCache(futureCacheKey, payload);
  res.json(payload);
});

// /api/predict — re-uses cached route data so costs 0 extra units
app.get("/api/predict", async (req, res) => {
  await loadAirportDB();
  const { origin, destination, flightNum } = req.query;
  if (!origin || !destination || !flightNum) return res.status(400).json({ error: "required" });
  const o   = origin.trim().toUpperCase();
  const d   = destination.trim().toUpperCase();
  const oAp = AIRPORT_DB[o], dAp = AIRPORT_DB[d];
  if (!oAp || !dAp) return res.status(400).json({ error: "Airport not found" });

  // Pull from cache first — free
  const routeCached     = getCached(`route-${o}-${d}`, HISTORICAL_TTL);
  let historicalFlights = routeCached?.flights || [];

  if (historicalFlights.length === 0) {
    const [deps, arrs] = await Promise.all([
      fetchTimeRange(oAp.icao, "Departure", 24, 0, true),
      fetchTimeRange(dAp.icao, "Arrival",   24, 0, true),
    ]);
    historicalFlights = buildFlights(deps, arrs, o, d);
  }

  const airlineStats = calcAirlineStats(historicalFlights);
  const routeStats   = calcStats(historicalFlights);
  const targetFlight = historicalFlights.find(f => f.flightNum === flightNum)
    || { flightNum, airlineName: flightNum.slice(0, 2), depTime: "--:--", aircraft: null };

  const prediction = await getAIPrediction(targetFlight, historicalFlights, airlineStats, routeStats);
  if (!prediction) return res.status(500).json({ error: "AI prediction failed" });
  res.json({ flight: targetFlight, prediction, basedOn: `${historicalFlights.length} flights analyzed` });
});

// /api/events
app.get("/api/events", async (req, res) => {
  const cached = getCached("world-events", 20 * 60 * 1000);
  if (cached) return res.json(cached);
  if (!GROQ_API_KEY) return res.status(500).json({ error: "GROQ_API_KEY not set" });
  if (!NEWS_API_KEY) return res.status(500).json({ error: "NEWS_API_KEY not set" });
  try {
    const newsResp = await axios.get("https://newsapi.org/v2/everything", {
      params: { q: "airspace OR aviation OR airline OR airport OR war OR conflict OR airstrike OR sanctions OR flight ban OR military", language: "en", sortBy: "publishedAt", pageSize: 20, apiKey: NEWS_API_KEY },
      timeout: 10000,
    });
    const headlines = (newsResp.data?.articles || [])
      .filter(a => a.title && !a.title.includes("[Removed]"))
      .slice(0, 15)
      .map(a => `- ${a.title}: ${a.description?.slice(0, 120) || ""}`)
      .join("\n");

    const groqResp = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      { model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: `You are a global aviation security analyst. Analyze these real news headlines and return a JSON array of 6-10 aviation-relevant events.\n\nHEADLINES:\n${headlines}\n\nSeverity: S1=monitor, S2=low, S3=moderate, S4=high, S5=critical\nReturn ONLY valid JSON array:\n[{"id":"evt-1","title":"short title","location":"Country","summary":"2-3 sentences","severity":"S3","severityLabel":"Moderate","affectedAirports":["IATA"],"affectedRoutes":["corridor"],"category":"Conflict","timestamp":"${new Date().toISOString()}","trend":"escalating","source":"source"}]\nCategories: Conflict, Airspace, Weather, Political, Security, Infrastructure` }],
        max_tokens: 2500, temperature: 0.3 },
      { headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" }, timeout: 30000 }
    );
    const match = groqResp.data.choices[0].message.content.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("No JSON in response");
    const events = JSON.parse(match[0]);
    setCache("world-events", events);
    res.json(events);
  } catch (e) {
    console.error("[Events]", e.message);
    res.status(500).json({ error: e.message });
  }
});

// /api/airports
app.get("/api/airports", async (req, res) => {
  await loadAirportDB();
  const q = (req.query.q || "").toUpperCase().trim();
  if (!q || q.length < 2) return res.json([]);
  const results = Object.values(AIRPORT_DB)
    .filter(ap => ap.iata?.includes(q) || ap.city?.toUpperCase().includes(q) || ap.name?.toUpperCase().includes(q))
    .sort((a, b) => {
      if (a.iata === q) return -1; if (b.iata === q) return 1;
      if (a.type === "large_airport" && b.type !== "large_airport") return -1;
      if (b.type === "large_airport" && a.type !== "large_airport") return 1;
      return 0;
    })
    .slice(0, 12)
    .map(ap => ({ code: ap.iata, icao: ap.icao, city: ap.city, country: ap.country, name: ap.name }));
  res.json(results);
});

// /api/health
app.get("/api/health", async (req, res) => {
  await loadAirportDB();
  const remaining = QUOTA.MONTHLY_UNIT_LIMIT - QUOTA.used;
  res.json({
    status: "ok",
    airportsLoaded:  Object.keys(AIRPORT_DB).length,
    aeroDataBox:     RAPIDAPI_KEY  ? "set" : "NOT SET",
    groq:            GROQ_API_KEY  ? "set" : "NOT SET",
    newsApi:         NEWS_API_KEY  ? "set" : "NOT SET",
    quota: {
      plan:                  "Pro",
      monthlyUnitLimit:      QUOTA.MONTHLY_UNIT_LIMIT,
      tier2CostPerCall:      QUOTA.TIER2_COST,
      usedThisSession:       QUOTA.used,
      remainingEstimate:     remaining,
      unitsPerRouteSearch:   8,
      unitsPerFutureLookup:  4,
      estimatedSearchesLeft: Math.floor(remaining / 8),
    },
    cacheEntries: cache.size,
    time: new Date().toISOString(),
  });
});

// /api/quota — quick quota check
app.get("/api/quota", (req, res) => {
  const remaining = QUOTA.MONTHLY_UNIT_LIMIT - QUOTA.used;
  res.json({
    used: QUOTA.used,
    remaining,
    limit:                QUOTA.MONTHLY_UNIT_LIMIT,
    percentUsed:          Math.round((QUOTA.used / QUOTA.MONTHLY_UNIT_LIMIT) * 100),
    estimatedSearchesLeft: Math.floor(remaining / 8),
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`✈  Escape Route API — port ${PORT}`);
  console.log(`   Pro plan: ${QUOTA.MONTHLY_UNIT_LIMIT} units/month`);
  console.log(`   Tier 2 = ${QUOTA.TIER2_COST} units/call | Route search ~8 units | Future ~4 units`);
  console.log(`   Max ~${Math.floor(QUOTA.MONTHLY_UNIT_LIMIT / 8)} route searches/month without cache`);
  await loadAirportDB();
});
