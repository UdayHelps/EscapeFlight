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

// ── AeroDataBox single window fetch ───────────────────────────────────
async function fetchWindow(icao, direction, fromDate, toDate) {
  const fmt = d => d.toISOString().slice(0, 16);
  const cacheKey = `${icao}-${direction}-${fmt(fromDate)}-${fmt(toDate)}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const url = `https://aerodatabox.p.rapidapi.com/flights/airports/icao/${icao}/${fmt(fromDate)}/${fmt(toDate)}`;
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
    console.error(`[ADB] ${icao} ${direction}: ${e.response?.status} ${e.message}`);
    return [];
  }
}

// ── Fetch a specific time window (max 12h per call) ───────────────────
async function fetchTimeRange(icao, direction, hoursAgo, hoursAhead) {
  const now = new Date();
  // Split into 12h chunks if range > 12h
  const totalHours = hoursAgo + hoursAhead;
  if (totalHours <= 12) {
    const from = new Date(now.getTime() - hoursAgo * 3600000);
    const to = new Date(now.getTime() + hoursAhead * 3600000);
    return fetchWindow(icao, direction, from, to);
  }
  // Multiple windows
  const windows = [];
  let cursor = new Date(now.getTime() - hoursAgo * 3600000);
  const end = new Date(now.getTime() + hoursAhead * 3600000);
  while (cursor < end) {
    const windowEnd = new Date(Math.min(cursor.getTime() + 12 * 3600000, end.getTime()));
    windows.push(fetchWindow(icao, direction, cursor, windowEnd));
    cursor = windowEnd;
  }
  const results = await Promise.all(windows);
  const seen = new Set();
  const all = [];
  results.flat().forEach(f => {
    const key = f.number || f.callSign;
    if (key && !seen.has(key)) { seen.add(key); all.push(f); }
  });
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
  const depDate = (f.departure?.scheduledTime?.local || f.departure?.scheduledTime?.utc || "")?.slice(0,10);
  return {
    flightNum, airlineCode, airlineName, depTime, arrTime, depDate,
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

function calcStats(flights) {
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
    if (!map[f.airlineName]) map[f.airlineName] = { name:f.airlineName, code:f.airlineCode, total:0, landed:0, inAir:0, cancelled:0, delayed:0, times:[] };
    map[f.airlineName].total++;
    if (f.status==="LANDED") map[f.airlineName].landed++;
    if (f.status==="IN_AIR") map[f.airlineName].inAir++;
    if (f.status==="CANCELLED") map[f.airlineName].cancelled++;
    if (f.status==="DELAYED") map[f.airlineName].delayed++;
    if (f.depTime && f.depTime !== "--:--") map[f.airlineName].times.push(f.depTime);
  });
  return Object.values(map)
    .map(a => ({ ...a, rate: a.total>0?Math.round(((a.landed+a.inAir)/a.total)*100):0 }))
    .sort((a,b) => b.rate-a.rate);
}

// ── Groq AI prediction for a specific flight ─────────────────────────
async function getAIPrediction(flight, historicalFlights, airlineStats, routeStats) {
  if (!GROQ_API_KEY) return null;

  const airlineStat = airlineStats.find(a => a.name === flight.airlineName);
  const sameFlightHistory = historicalFlights.filter(f =>
    f.flightNum === flight.flightNum && f.status !== "SCHEDULED"
  );
  const cancelledSameTime = historicalFlights.filter(f =>
    f.airlineName === flight.airlineName &&
    f.status === "CANCELLED" &&
    f.depTime >= (parseInt(flight.depTime) - 2).toString().padStart(2,"0") + ":00" &&
    f.depTime <= (parseInt(flight.depTime) + 2).toString().padStart(2,"0") + ":59"
  );

  const prompt = `You are an aviation analyst. Predict the probability this flight will operate successfully.

FLIGHT: ${flight.flightNum} by ${flight.airlineName}
Scheduled departure: ${flight.depTime} | Aircraft: ${flight.aircraft || "unknown"}

AIRLINE PERFORMANCE (last 48h on this route):
- Total flights: ${airlineStat?.total || 0}
- Landed: ${airlineStat?.landed || 0}
- Cancelled: ${airlineStat?.cancelled || 0}  
- Delayed: ${airlineStat?.delayed || 0}
- Success rate: ${airlineStat?.rate || 0}%

SAME FLIGHT NUMBER HISTORY:
${sameFlightHistory.length > 0 ? sameFlightHistory.map(f=>`- ${f.depDate} ${f.depTime}: ${f.status}`).join("\n") : "No history found"}

CANCELLATIONS AT SIMILAR TIME BY THIS AIRLINE:
${cancelledSameTime.length} cancellations found in similar time window

OVERALL ROUTE STATS (48h):
- Route success rate: ${routeStats.successRate}%
- Total cancelled on route: ${routeStats.cancelled}

Return ONLY a JSON object, no explanation:
{
  "flyProbability": 78,
  "cancelProbability": 22,
  "confidence": "high",
  "reasoning": "2-3 sentence explanation based on the data above",
  "riskFactors": ["factor1", "factor2"],
  "recommendation": "one line actionable advice"
}`;

  try {
    const resp = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        messages: [{ role:"user", content: prompt }],
        max_tokens: 400,
        temperature: 0.2,
      },
      {
        headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type":"application/json" },
        timeout: 15000,
      }
    );
    const text = resp.data.choices[0].message.content;
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch(e) {
    console.error("Groq prediction error:", e.message);
    return null;
  }
}

// ── /api/routes — returns historical data in time buckets ─────────────
app.get("/api/routes", async (req, res) => {
  await loadAirportDB();
  const { origin, destination, window: win } = req.query;
  if (!origin||!destination) return res.status(400).json({ error:"origin and destination required" });
  const o = origin.trim().toUpperCase();
  const d = destination.trim().toUpperCase();
  const oAp = AIRPORT_DB[o], dAp = AIRPORT_DB[d];
  if (!oAp) return res.status(400).json({ error:`Airport not found: ${o}` });
  if (!dAp) return res.status(400).json({ error:`Airport not found: ${d}` });
  if (o===d) return res.status(400).json({ error:"Origin and destination must differ" });

  // Window: "24h" | "48h" | default = both
  const hoursBack = win === "24h" ? 24 : 48;
  const hoursAhead = 0; // historical only for past windows

  console.log(`\n=== ${o}→${d} | ${hoursBack}h history ===`);
  const [origDeps, destArrs] = await Promise.all([
    fetchTimeRange(oAp.icao, "Departure", hoursBack, 0),
    fetchTimeRange(dAp.icao, "Arrival", hoursBack, 0),
  ]);

  const flights = buildFlights(origDeps, destArrs, o, d);
  const stats = calcStats(flights);
  const airlineStats = calcAirlineStats(flights);

  // Split into time buckets
  const now = new Date();
  const last24hCutoff = new Date(now.getTime() - 24 * 3600000);
  const last24h = flights.filter(f => {
    if (!f.depDate) return false;
    return new Date(f.depDate + "T" + f.depTime) >= last24hCutoff;
  });
  const prev24h = flights.filter(f => {
    if (!f.depDate) return false;
    const t = new Date(f.depDate + "T" + f.depTime);
    return t < last24hCutoff;
  });

  res.json({
    origin: oAp, destination: dAp,
    dataWindow: `${hoursBack}h history`,
    stats,
    airlineStats,
    flights,        // all flights
    last24h,        // last 24h bucket
    prev24h,        // 24-48h bucket
    dataSource: "aerodatabox",
  });
});

// ── /api/future — upcoming scheduled flights ──────────────────────────
app.get("/api/future", async (req, res) => {
  await loadAirportDB();
  const { origin, destination } = req.query;
  if (!origin||!destination) return res.status(400).json({ error:"required" });
  const o = origin.trim().toUpperCase();
  const d = destination.trim().toUpperCase();
  const oAp = AIRPORT_DB[o], dAp = AIRPORT_DB[d];
  if (!oAp||!dAp) return res.status(400).json({ error:"Airport not found" });

  console.log(`[Future] ${o}→${d}`);
  const [origDeps, destArrs] = await Promise.all([
    fetchTimeRange(oAp.icao, "Departure", 0, 24),
    fetchTimeRange(dAp.icao, "Arrival", 0, 24),
  ]);

  const flights = buildFlights(origDeps, destArrs, o, d)
    .filter(f => ["SCHEDULED","BOARDING","DELAYED"].includes(f.status));

  res.json({ origin: oAp, destination: dAp, flights, window: "next 24h" });
});

// ── /api/predict — AI prediction for a specific flight ───────────────
app.get("/api/predict", async (req, res) => {
  await loadAirportDB();
  const { origin, destination, flightNum } = req.query;
  if (!origin||!destination||!flightNum) return res.status(400).json({ error:"required" });
  const o = origin.trim().toUpperCase();
  const d = destination.trim().toUpperCase();
  const oAp = AIRPORT_DB[o], dAp = AIRPORT_DB[d];
  if (!oAp||!dAp) return res.status(400).json({ error:"Airport not found" });

  // Get 48h historical data for context
  const [origDeps, destArrs] = await Promise.all([
    fetchTimeRange(oAp.icao, "Departure", 48, 0),
    fetchTimeRange(dAp.icao, "Arrival", 48, 0),
  ]);
  const historicalFlights = buildFlights(origDeps, destArrs, o, d);
  const airlineStats = calcAirlineStats(historicalFlights);
  const routeStats = calcStats(historicalFlights);

  // Find the target flight
  const targetFlight = historicalFlights.find(f => f.flightNum === flightNum)
    || { flightNum, airlineName: flightNum.slice(0,2), depTime: "--:--", aircraft: null };

  const prediction = await getAIPrediction(targetFlight, historicalFlights, airlineStats, routeStats);
  if (!prediction) return res.status(500).json({ error: "AI prediction failed" });

  res.json({ flight: targetFlight, prediction, basedOn: `${historicalFlights.length} flights analyzed` });
});

// ── /api/events ───────────────────────────────────────────────────────
app.get("/api/events", async (req, res) => {
  const cached = getCached("world-events", 20 * 60 * 1000);
  if (cached) return res.json(cached);
  if (!GROQ_API_KEY) return res.status(500).json({ error:"GROQ_API_KEY not set" });
  if (!NEWS_API_KEY) return res.status(500).json({ error:"NEWS_API_KEY not set" });

  try {
    const newsResp = await axios.get("https://newsapi.org/v2/everything", {
      params: {
        q: "airspace OR aviation OR airline OR airport OR war OR conflict OR airstrike OR sanctions OR flight ban OR military",
        language: "en", sortBy: "publishedAt", pageSize: 20, apiKey: NEWS_API_KEY,
      },
      timeout: 10000,
    });
    const articles = newsResp.data?.articles || [];
    const headlines = articles
      .filter(a => a.title && !a.title.includes("[Removed]"))
      .slice(0, 15)
      .map(a => `- ${a.title}: ${a.description?.slice(0,120)||""}`)
      .join("\n");

    const groqResp = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        messages: [{ role:"user", content: `You are a global aviation security analyst. Analyze these real news headlines and return a JSON array of 6-10 aviation-relevant events with severity ratings.\n\nHEADLINES:\n${headlines}\n\nSeverity: S1=monitor, S2=low, S3=moderate, S4=high, S5=critical\n\nReturn ONLY valid JSON array:\n[{"id":"evt-1","title":"short title","location":"Country","summary":"2-3 sentences on situation and aviation impact","severity":"S3","severityLabel":"Moderate","affectedAirports":["IATA"],"affectedRoutes":["corridor description"],"category":"Conflict","timestamp":"${new Date().toISOString()}","trend":"escalating","source":"source name"}]\n\nCategories: Conflict, Airspace, Weather, Political, Security, Infrastructure\nTrend: escalating, stable, deescalating` }],
        max_tokens: 2500, temperature: 0.3,
      },
      { headers: { "Authorization":`Bearer ${GROQ_API_KEY}`, "Content-Type":"application/json" }, timeout: 30000 }
    );
    const text = groqResp.data.choices[0].message.content;
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("No JSON in response");
    const events = JSON.parse(match[0]);
    setCache("world-events", events);
    res.json(events);
  } catch(e) {
    console.error("[Events]", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── /api/airports ─────────────────────────────────────────────────────
app.get("/api/airports", async (req, res) => {
  await loadAirportDB();
  const q = (req.query.q||"").toUpperCase().trim();
  if (!q||q.length<2) return res.json([]);
  const results = Object.values(AIRPORT_DB)
    .filter(ap => ap.iata?.includes(q)||ap.city?.toUpperCase().includes(q)||ap.name?.toUpperCase().includes(q))
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

// ── /api/health ───────────────────────────────────────────────────────
app.get("/api/health", async (req, res) => {
  await loadAirportDB();
  res.json({
    status:"ok",
    airportsLoaded: Object.keys(AIRPORT_DB).length,
    aeroDataBox: RAPIDAPI_KEY?"set":"NOT SET",
    groq: GROQ_API_KEY?"set":"NOT SET",
    newsApi: NEWS_API_KEY?"set":"NOT SET",
    time: new Date().toISOString(),
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`✈  Escape Route API on port ${PORT}`);
  await loadAirportDB();
});
