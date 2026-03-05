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

const HISTORICAL_TTL = 30 * 60 * 1000;
const LIVE_TTL       = 10 * 60 * 1000;

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
  // Round timestamps to nearest hour so calls within the same hour share cache
  // This prevents debug + routes endpoints generating different keys for same data
  const roundHour = d => {
    const r = new Date(d);
    r.setMinutes(0, 0, 0);
    return r;
  };
  const fmt      = d => d.toISOString().slice(0, 16);
  const cacheKey = `${icao}-${direction}-${fmt(roundHour(fromDate))}-${fmt(roundHour(toDate))}`;
  const ttl      = isHistorical ? HISTORICAL_TTL : LIVE_TTL;
  const cached   = getCached(cacheKey, ttl);
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
        withCodeshared: "true",
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
async function fetchTimeRange(icao, direction, hoursAgo, hoursAhead, isHistorical = true) {
  const now    = new Date();
  const from   = new Date(now.getTime() - hoursAgo   * 3600000);
  const to     = new Date(now.getTime() + hoursAhead * 3600000);
  const CHUNK  = 11.5 * 3600000;
  const totalH = (to - from) / 3600000;

  if (totalH <= 11.5) {
    return fetchWindow(icao, direction, from, to, isHistorical);
  }

  const windows = [];
  let cursor = from;
  while (cursor < to) {
    const end = new Date(Math.min(cursor.getTime() + CHUNK, to.getTime()));
    windows.push({ from: new Date(cursor), to: end });
    cursor = new Date(end.getTime() + 60000);
  }

  console.log(`[ADB] ${totalH.toFixed(0)}h split into ${windows.length} windows for ${icao} — ~${windows.length * 2} units`);
  const results = await Promise.all(
    windows.map(w => fetchWindow(icao, direction, w.from, w.to, isHistorical))
  );
  const seen = new Set(), all = [];
  results.flat().forEach(f => {
    // Use flight number if available, otherwise fall back to airline+depTime
    // Never silently drop flights just because they lack a number
    const num = f.number || f.callSign;
    const dep = f.departure?.scheduledTime?.utc || f.departure?.scheduledTime?.local || "";
    const al  = f.airline?.iata || f.airline?.name || "UNK";
    const key = num || `${al}-${dep.slice(0, 16)}`;
    if (!seen.has(key)) { seen.add(key); all.push(f); }
  });
  return all;
}

// ── Status mapper ─────────────────────────────────────────────────────
function mapStatus(s) {
  if (!s) return "UNKNOWN";
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
  if (l === "unknown" || l === "")                                        return "UNKNOWN";
  return "SCHEDULED";
}

// ── Status priority: which source wins in a conflict ─────────────────
// Higher = more trustworthy / more informative
const STATUS_PRIORITY = {
  LANDED:    10,
  CANCELLED: 9,
  DIVERTED:  8,
  IN_AIR:    7,
  COMPLETED: 6,  // time-inferred
  DELAYED:   5,
  BOARDING:  4,
  SCHEDULED: 2,
  UNKNOWN:   1,
};

function betterStatus(a, b) {
  return (STATUS_PRIORITY[a] || 0) >= (STATUS_PRIORITY[b] || 0) ? a : b;
}

// ── Flight mapper ─────────────────────────────────────────────────────
function mapFlight(f, impliedDep, impliedArr) {
  const rawNum      = f.number || f.callSign;
  const airlineName = f.airline?.name || "Unknown";
  const airlineCode = f.airline?.iata || (rawNum?.length >= 2 ? rawNum.slice(0, 2) : "??");
  const depTimeStr  = (f.departure?.revisedTime?.local || f.departure?.scheduledTime?.local
                    || f.departure?.revisedTime?.utc   || f.departure?.scheduledTime?.utc || "");
  const flightNum   = rawNum || `${airlineCode}${depTimeStr.slice(11,16).replace(":","") || "???"}`;
  const depAirport  = f.departure?.airport?.iata || impliedDep || "?";
  const arrAirport  = f.arrival?.airport?.iata   || impliedArr || "?";
  const depTime     = depTimeStr.slice(11,16) || "--:--";
  const arrTime     = (f.arrival?.revisedTime?.local   || f.arrival?.scheduledTime?.local
                    || f.arrival?.revisedTime?.utc     || f.arrival?.scheduledTime?.utc   || "")?.slice(11,16) || "--:--";
  const depDate     = depTimeStr.slice(0,10) || null;
  return {
    flightNum, airlineCode, airlineName, depTime, arrTime, depDate,
    depAirport, arrAirport,
    depAirportName: f.departure?.airport?.name || AIRPORT_DB[depAirport]?.city || depAirport,
    arrAirportName: f.arrival?.airport?.name   || AIRPORT_DB[arrAirport]?.city || arrAirport,
    status:   mapStatus(f.status),
    rawStatus: f.status || null,  // keep original for debugging
    aircraft: f.aircraft?.model || f.aircraft?.reg || null,
    terminal: f.arrival?.terminal  || f.departure?.terminal || null,
    gate:     f.arrival?.gate      || f.departure?.gate     || null,
    baggage:  f.arrival?.baggageBelt || null,
    isCodeshared: f.isCodeshared || false,
  };
}

// ── Flight key helper ─────────────────────────────────────────────────
function flightKey(f) {
  const num = f.number || f.callSign;
  if (num && num !== "N/A") return num;
  const dep = f.departure?.scheduledTime?.utc || f.departure?.scheduledTime?.local || "";
  const al  = f.airline?.iata || f.airline?.name || "UNK";
  return `${al}-${dep.slice(0,16)}`;
}

// ── CORE STRATEGY: Build flights using BOTH origin departures AND
//   destination arrivals, then merge — taking the BEST status from
//   either airport feed.
//
//   Why this works:
//   - Origin airport (e.g. DXB) may only have schedule data → status = UNKNOWN
//   - Destination airport (e.g. LHR) may have live arrival data → status = LANDED
//   - We merge both and take the more informative status.
//   - This gives us real LANDED/CANCELLED without relying on a single airport's
//     live feed, which may have poor coverage.
// ─────────────────────────────────────────────────────────────────────
function buildFlights(origDeps, destArrs, originIata, destIata, destDeps = [], origArrs = [], oAp = null, dAp = null) {
  // richness score: how much data does this raw flight object actually have?
  const richness = f => [
    f.departure?.airport?.iata, f.arrival?.airport?.iata,
    f.departure?.scheduledTime?.local, f.arrival?.scheduledTime?.local,
    f.aircraft?.model, f.status,
  ].filter(Boolean).length;

  // codeshare: prefer operating carrier (isCodeshared===false)
  const score = f => (f.isCodeshared ? 0 : 10) + richness(f);

  // flightMap stores the best-known version of each flight
  const flightMap = new Map();

  // upsert: for a given flight, update the map only if this record is richer
  // BUT always upgrade the status if the new source has a better one
  const upsert = (f, impliedDep, impliedArr, sourceLabel) => {
    const key     = flightKey(f);
    const mapped  = mapFlight(f, impliedDep, impliedArr);
    mapped._raw   = f;
    mapped._score = score(f);
    mapped._source = sourceLabel;

    const existing = flightMap.get(key);
    if (!existing) {
      flightMap.set(key, mapped);
    } else {
      // Always pick the better status regardless of which record wins overall
      const upgradedStatus = betterStatus(mapped.status, existing.status);

      if (mapped._score > existing._score) {
        // New record is richer overall — use it, but keep the best status
        flightMap.set(key, { ...mapped, status: upgradedStatus });
      } else {
        // Keep existing record, but upgrade status if the new one is better
        existing.status = upgradedStatus;
        // Also fill in any missing fields from the new record
        if (existing.arrTime === "--:--" && mapped.arrTime !== "--:--") existing.arrTime = mapped.arrTime;
        if (!existing.aircraft && mapped.aircraft) existing.aircraft = mapped.aircraft;
        if (!existing.terminal && mapped.terminal) existing.terminal = mapped.terminal;
        if (!existing.gate && mapped.gate)         existing.gate = mapped.gate;
        if (!existing.baggage && mapped.baggage)   existing.baggage = mapped.baggage;
      }
    }
  };

  // Pass 1: Origin departures — filter to flights going to our destination.
  // AeroDataBox sometimes populates arrival.airport.icao but not .iata, so check both.
  // Also keep flights where arrival airport is completely missing — we can't rule them out,
  // and the ICAO → IATA lookup will fill the gap via AIRPORT_DB.
  origDeps.forEach(f => {
    const arrIata = f.arrival?.airport?.iata;
    const arrIcao = f.arrival?.airport?.icao;
    const arrName = f.arrival?.airport?.name || "";
    // Reject only if we have a confirmed IATA that is NOT our destination
    if (arrIata && arrIata !== destIata) return;
    // Also reject if ICAO is set and doesn't match destination ICAO
    if (!arrIata && arrIcao && arrIcao !== dAp?.icao) return;
    upsert(f, originIata, destIata, "origin-dep");
  });

  // Pass 2: Destination arrivals — filter to flights coming from our origin.
  destArrs.forEach(f => {
    const depIata = f.departure?.airport?.iata;
    const depIcao = f.departure?.airport?.icao;
    // Reject only if we have a confirmed IATA that is NOT our origin
    if (depIata && depIata !== originIata) return;
    if (!depIata && depIcao && depIcao !== oAp?.icao) return;
    upsert(f, originIata, destIata, "dest-arr");
  });

  // FALLBACK: If both primary feeds returned nothing (common for some regional routes
  // where origin airport has no departure data), seed from destDeps filtered by
  // arrival airport = originIata. These are return flights of the same aircraft,
  // meaning the outbound leg operated successfully.
  if (flightMap.size === 0 && destDeps.length > 0) {
    console.log(`[buildFlights] Primary feeds empty — trying destDeps as fallback seed`);
    destDeps.forEach(f => {
      // A flight departing from dest going BACK to origin confirms the outbound ran
      const arrIata = f.arrival?.airport?.iata;
      if (arrIata && arrIata !== originIata) return;
      upsert(f, originIata, destIata, "dest-dep-fallback");
      // Immediately mark as LANDED since this is the return leg
      const key = flightKey(f);
      const existing = flightMap.get(key);
      if (existing) {
        existing.status = "LANDED";
        existing.statusNote = "Inferred: return flight observed at destination";
      }
    });
  }

  // Pass 3: Destination departures — if a flight number that matches our route
  // is seen departing FROM the destination, that strongly confirms it arrived there.
  // We do NOT filter by route here — we match by flight number against already-seeded flights.
  destDeps.forEach(f => {
    const key = flightKey(f);
    const existing = flightMap.get(key);
    if (existing) {
      // This flight number departed from our destination — it must have arrived first
      const upgraded = betterStatus("LANDED", existing.status);
      if (upgraded !== existing.status) {
        existing.status = upgraded;
        existing.statusNote = "Confirmed: aircraft subsequently departed destination airport";
      }
    }
  });

  // Pass 4: Origin arrivals — catch diverted flights that returned to origin
  origArrs.forEach(f => {
    const key = flightKey(f);
    const existing = flightMap.get(key);
    if (existing && mapStatus(f.status) === "DIVERTED") {
      existing.status = "DIVERTED";
      existing.statusNote = "Flight diverted — returned to origin";
    }
  });

  const now = new Date();

  return [...flightMap.values()]
    .map(({ _raw, _score, _source, ...rest }) => {

      // Fix depTime missing when flight came only from destArrs feed
      // The arrival feed has arrival time but not always departure time.
      // Use the raw scheduled departure time if we have it from _raw.
      if (rest.depTime === "--:--" && _raw) {
        const rawDep = _raw.departure?.scheduledTime?.local
                    || _raw.departure?.revisedTime?.local
                    || _raw.departure?.scheduledTime?.utc
                    || _raw.departure?.revisedTime?.utc;
        if (rawDep) {
          rest.depTime = rawDep.slice(11, 16);
          rest.depDate = rawDep.slice(0, 10);
        }
      }

      // Time-based age calculation — use UTC strings to avoid timezone parse issues.
      // API times are local — we can't safely parse them as UTC.
      // Instead use arrTime + typical route duration as a proxy when depTime is missing,
      // or use depDate + depTime with a generous timezone buffer.
      let ageH = null;
      if (rest.depDate && rest.depTime !== "--:--") {
        // Parse as UTC then add 0 offset — we just want "how long ago was this timestamp"
        // Since depTime is local and we don't know the exact offset, we use a conservative
        // approach: treat depTime as UTC. This may be off by a few hours but is safe for
        // the >3h IN_AIR → LANDED inference (a 7h flight is still 7h regardless of tz offset).
        const depDt = new Date(`${rest.depDate}T${rest.depTime}:00Z`);
        ageH = (now - depDt) / 3600000;
      }

      if (ageH !== null) {
        // IN_AIR for more than 3h UTC-adjusted — safe to call LANDED
        // (shortest intercontinental flight is ~3.5h; domestic could be less but
        //  if it's been 3h since departure it's definitely not still airborne)
        if (rest.status === "IN_AIR" && ageH > 3) {
          rest.status = "LANDED";
          rest.statusNote = "Inferred landed — over 3h since departure";
        }

        // Still showing SCHEDULED/UNKNOWN and departure time is well in the past
        if (["SCHEDULED", "UNKNOWN"].includes(rest.status) && ageH > 1.5) {
          rest.status = "OPERATED";
          rest.statusNote = "Schedule only — no live confirmation. Flight time has passed.";
        }
      }

      return rest;
    })
    // Deduplicate codeshares: same depTime + arrTime + depAirport + arrAirport = same physical flight
    // Keep the operating carrier (isCodeshared===false) or the first one if all are codeshares
    .reduce((acc, flight) => {
      const physicalKey = `${flight.depTime}-${flight.arrTime}-${flight.depAirport}-${flight.arrAirport}-${flight.depDate}`;
      const existing = acc.find(f =>
        `${f.depTime}-${f.arrTime}-${f.depAirport}-${f.arrAirport}-${f.depDate}` === physicalKey
      );
      if (!existing) {
        acc.push(flight);
      } else if (!flight.isCodeshared && existing.isCodeshared) {
        // Replace codeshare with operating carrier
        acc.splice(acc.indexOf(existing), 1, flight);
      }
      // else keep existing — either it's already the operating carrier or both are codeshares
      return acc;
    }, [])
    .sort((a, b) => {
      if (a.depTime === "--:--") return 1;
      if (b.depTime === "--:--") return -1;
      return a.depTime.localeCompare(b.depTime);
    });
}

// ── Stats ─────────────────────────────────────────────────────────────
function calcStats(flights) {
  const landed    = flights.filter(f => f.status === "LANDED").length;
  const inAir     = flights.filter(f => f.status === "IN_AIR").length;
  const operated  = flights.filter(f => f.status === "OPERATED").length;   // inferred
  const completed = flights.filter(f => f.status === "COMPLETED").length;
  const cancelled = flights.filter(f => f.status === "CANCELLED").length;
  const delayed   = flights.filter(f => f.status === "DELAYED").length;
  const diverted  = flights.filter(f => f.status === "DIVERTED").length;
  const scheduled = flights.filter(f => ["SCHEDULED","BOARDING"].includes(f.status)).length;
  const unknown   = flights.filter(f => f.status === "UNKNOWN").length;
  const totalOperated = landed + inAir + operated + completed + delayed + diverted;
  const total     = totalOperated + cancelled;
  return {
    successRate: total > 0 ? Math.round((totalOperated / total) * 100) : 0,
    landed, inAir, operated, completed, cancelled, delayed, diverted, scheduled, unknown, total,
  };
}

function calcAirlineStats(flights) {
  const map = {};
  flights.forEach(f => {
    if (!map[f.airlineName]) map[f.airlineName] = {
      name: f.airlineName, code: f.airlineCode,
      total: 0, landed: 0, operated: 0, inAir: 0, cancelled: 0, delayed: 0, completed: 0,
    };
    map[f.airlineName].total++;
    if (f.status === "LANDED")    map[f.airlineName].landed++;
    if (f.status === "OPERATED")  map[f.airlineName].operated++;
    if (f.status === "IN_AIR")    map[f.airlineName].inAir++;
    if (f.status === "CANCELLED") map[f.airlineName].cancelled++;
    if (f.status === "DELAYED")   map[f.airlineName].delayed++;
    if (f.status === "COMPLETED") map[f.airlineName].completed++;
  });
  return Object.values(map)
    .map(a => {
      const confirmedOp = a.landed + a.inAir + a.completed + a.delayed + a.operated;
      return { ...a, rate: a.total > 0 ? Math.round((confirmedOp / a.total) * 100) : 0 };
    })
    .sort((a, b) => b.rate - a.rate);
}

function calcFlyScores(futureFlights, historicalFlights, airlineStatsMap) {
  const routeStats = calcStats(historicalFlights);
  return futureFlights.map(f => {
    const airline      = airlineStatsMap[f.airlineName];
    const airlineRate  = airline ? airline.rate : routeStats.successRate;
    const totalSamples = airline ? airline.total : routeStats.total;
    const weight       = Math.min(totalSamples / 10, 1);
    const blended      = Math.round(weight * airlineRate + (1 - weight) * routeStats.successRate);
    let score = blended;
    if (f.status === "DELAYED") score = Math.max(score - 15, 10);
    const cancelledSameTime = historicalFlights.filter(h =>
      h.airlineName === f.airlineName &&
      h.status === "CANCELLED" &&
      h.depTime && f.depTime &&
      Math.abs(parseInt(h.depTime) - parseInt(f.depTime)) <= 1
    ).length;
    if (cancelledSameTime > 0) score = Math.max(score - 10 * cancelledSameTime, 5);
    return {
      flightNum:         f.flightNum,
      flyProbability:    Math.min(score, 99),
      cancelProbability: Math.max(100 - score, 1),
      confidence:        totalSamples >= 5 ? "medium" : "low",
      basedOn:           `${totalSamples} historical flights`,
    };
  });
}

const GLOBAL_STATS = { flightsTracked: 0, cancellationsCaught: 0, routesScanned: 0 };

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

// /api/routes — 4 feeds: origin deps + arrivals, dest arrivals + deps
// = 4 fetches × 2 windows each = 8 calls = 16 units per unique route
// Cached 30min so repeat searches cost 0.
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

  // ── DUAL-AIRPORT DUAL-DIRECTION STRATEGY ────────────────────────────
  // We now fetch ALL FOUR combinations to maximise status coverage:
  //
  //  1. Origin  DEPARTURES → catches flights leaving origin
  //  2. Origin  ARRIVALS   → catches return legs / same-aircraft flights
  //  3. Dest    ARRIVALS   → KEY: destination arrival confirms the flight landed
  //  4. Dest    DEPARTURES → catches flights that departed destination (confirms operated)
  //
  // buildFlights() merges all four, always picking the BEST status.
  // If origin says UNKNOWN but destination says LANDED → we show LANDED.
  // ────────────────────────────────────────────────────────────────────
  console.log(`\n=== ROUTE ${o}→${d} | 24h | dual-airport strategy | ~16 units ===`);
  const [origDeps, origArrs, destArrs, destDeps] = await Promise.all([
    fetchTimeRange(oAp.icao, "Departure", 24, 0, true),
    fetchTimeRange(oAp.icao, "Arrival",   24, 0, true),
    fetchTimeRange(dAp.icao, "Arrival",   24, 0, true),
    fetchTimeRange(dAp.icao, "Departure", 24, 0, true),
  ]);

  console.log(`  Raw feeds:`);
  console.log(`    origDeps (${o} departures): ${origDeps.length}`);
  console.log(`    origArrs (${o} arrivals):   ${origArrs.length}`);
  console.log(`    destArrs (${d} arrivals):   ${destArrs.length}`);
  console.log(`    destDeps (${d} departures): ${destDeps.length}`);

  // All 4 feeds go into buildFlights — it handles merging, status upgrading,
  // destDeps confirmation, and origArrs divert detection internally.
  const flights = buildFlights(origDeps, destArrs, o, d, destDeps, origArrs, oAp, dAp);

  const stats        = calcStats(flights);
  const airlineStats = calcAirlineStats(flights);

  console.log(`  Matched: ${flights.length} | LANDED:${stats.landed} CANCELLED:${stats.cancelled} OPERATED:${stats.operated} IN_AIR:${stats.inAir} UNKNOWN:${stats.unknown}`);

  GLOBAL_STATS.flightsTracked      += stats.total;
  GLOBAL_STATS.cancellationsCaught += stats.cancelled;
  GLOBAL_STATS.routesScanned       += 1;

  const payload = {
    origin: oAp, destination: dAp,
    dataWindow: "24h history",
    stats, airlineStats, flights,
    last24h: flights,
    dataSource: "aerodatabox",
    globalStats: GLOBAL_STATS,
    statusKey: {
      LANDED:    "Confirmed landed at destination",
      CANCELLED: "Confirmed cancelled",
      IN_AIR:    "Airborne at time of query",
      OPERATED:  "Schedule-only — flight time passed, no live confirmation",
      DELAYED:   "Confirmed delayed",
      DIVERTED:  "Flight diverted",
      SCHEDULED: "Future / upcoming flight",
      UNKNOWN:   "No status data available",
    },
    debug: {
      rawDepsFromOrigin:  origDeps.length,
      rawArrsAtOrigin:    origArrs.length,
      rawArrsAtDest:      destArrs.length,
      rawDepsFromDest:    destDeps.length,
      matched:            flights.length,
      // How many origDeps had no arrival IATA (common in AeroDataBox — may be our route)
      origDepsNullArrIata: origDeps.filter(f => !f.arrival?.airport?.iata).length,
      origDepsToOurDest:   origDeps.filter(f => f.arrival?.airport?.iata === d).length,
      destArrsNullDepIata: destArrs.filter(f => !f.departure?.airport?.iata).length,
      destArrsFromOurOrig: destArrs.filter(f => f.departure?.airport?.iata === o).length,
      strategy:           "dual-airport-dual-direction",
      unitsThisCall:      QUOTA.used - (QUOTA.used - 16 < 0 ? 0 : QUOTA.used - 16),
      sessionTotal:       QUOTA.used,
    },
  };
  setCache(routeCacheKey, payload);
  res.json(payload);
});

// /api/future — next 24h scheduled flights
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

  console.log(`[Future] ${o}→${d} | dual feed | ~8 units`);
  const [origDeps, destArrs] = await Promise.all([
    fetchTimeRange(oAp.icao, "Departure", 0, 24, false),
    fetchTimeRange(dAp.icao, "Arrival",   0, 24, false),
  ]);

  const flights = buildFlights(origDeps, destArrs, o, d)
    .filter(f => ["SCHEDULED","BOARDING","DELAYED"].includes(f.status));

  const historicalCached  = getCached(`route-${o}-${d}`, HISTORICAL_TTL);
  const historicalFlights = historicalCached?.flights || [];
  const airlineStatsMap   = Object.fromEntries(
    calcAirlineStats(historicalFlights).map(a => [a.name, a])
  );
  const flyScores = calcFlyScores(flights, historicalFlights, airlineStatsMap);

  const payload = { origin: oAp, destination: dAp, flights, flyScores, window: "next 24h" };
  setCache(futureCacheKey, payload);
  res.json(payload);
});

// /api/predict
app.get("/api/predict", async (req, res) => {
  await loadAirportDB();
  const { origin, destination, flightNum } = req.query;
  if (!origin || !destination || !flightNum) return res.status(400).json({ error: "required" });
  const o   = origin.trim().toUpperCase();
  const d   = destination.trim().toUpperCase();
  const oAp = AIRPORT_DB[o], dAp = AIRPORT_DB[d];
  if (!oAp || !dAp) return res.status(400).json({ error: "Airport not found" });

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
      unitsPerRouteSearch:   16,
      unitsPerFutureLookup:  8,
      estimatedSearchesLeft: Math.floor(remaining / 16),
    },
    cacheEntries: cache.size,
    strategy: "dual-airport-dual-direction",
    time: new Date().toISOString(),
  });
});

app.get("/api/stats", (req, res) => res.json(GLOBAL_STATS));

app.get("/api/quota", (req, res) => {
  const remaining = QUOTA.MONTHLY_UNIT_LIMIT - QUOTA.used;
  res.json({
    used: QUOTA.used,
    remaining,
    limit:                 QUOTA.MONTHLY_UNIT_LIMIT,
    percentUsed:           Math.round((QUOTA.used / QUOTA.MONTHLY_UNIT_LIMIT) * 100),
    estimatedSearchesLeft: Math.floor(remaining / 16),
  });
});

// /api/debug — inspect raw feed data for a route without building flights
// Uses same fetch calls as /api/routes so it benefits from / populates the same cache.
app.get("/api/debug", async (req, res) => {
  await loadAirportDB();
  const { origin, destination } = req.query;
  if (!origin || !destination) return res.status(400).json({ error: "origin and destination required" });
  const o   = origin.trim().toUpperCase();
  const d   = destination.trim().toUpperCase();
  const oAp = AIRPORT_DB[o], dAp = AIRPORT_DB[d];
  if (!oAp || !dAp) return res.status(400).json({ error: "Airport not found" });

  // Identical fetch calls to /api/routes — will hit cache if routes was called first
  const [origDeps, origArrs, destArrs, destDeps] = await Promise.all([
    fetchTimeRange(oAp.icao, "Departure", 24, 0, true),
    fetchTimeRange(oAp.icao, "Arrival",   24, 0, true),
    fetchTimeRange(dAp.icao, "Arrival",   24, 0, true),
    fetchTimeRange(dAp.icao, "Departure", 24, 0, true),
  ]);

  const toDestSample = origDeps
    .filter(f => f.arrival?.airport?.iata === d)
    .slice(0, 20)
    .map(f => ({
      num: f.number || f.callSign, airline: f.airline?.name,
      arrIata: f.arrival?.airport?.iata, depTime: f.departure?.scheduledTime?.local,
      status: f.status, isCS: f.isCodeshared,
    }));

  const fromOrigSample = destArrs
    .filter(f => f.departure?.airport?.iata === o)
    .slice(0, 20)
    .map(f => ({
      num: f.number || f.callSign, airline: f.airline?.name,
      depIata: f.departure?.airport?.iata, arrTime: f.arrival?.scheduledTime?.local,
      status: f.status,
    }));

  // Show status breakdown of ALL destArrs to understand what statuses exist
  const destArrsStatusBreakdown = destArrs.reduce((acc, f) => {
    const s = f.status || "null";
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const origDepsStatusBreakdown = origDeps
    .filter(f => f.arrival?.airport?.iata === d)
    .reduce((acc, f) => {
      const s = f.status || "null";
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

  res.json({
    route: `${o}→${d}`,
    origDeps: {
      total: origDeps.length,
      nullArrIata:   origDeps.filter(f => !f.arrival?.airport?.iata).length,
      matchedToDest: origDeps.filter(f => f.arrival?.airport?.iata === d).length,
      toOtherDest:   origDeps.filter(f => f.arrival?.airport?.iata && f.arrival.airport.iata !== d).length,
      statusBreakdownForOurRoute: origDepsStatusBreakdown,
      sample: toDestSample,
    },
    origArrs: { total: origArrs.length },
    destArrs: {
      total: destArrs.length,
      nullDepIata:  destArrs.filter(f => !f.departure?.airport?.iata).length,
      fromOrigin:   destArrs.filter(f => f.departure?.airport?.iata === o).length,
      toOtherOrig:  destArrs.filter(f => f.departure?.airport?.iata && f.departure.airport.iata !== o).length,
      statusBreakdownAll: destArrsStatusBreakdown,
      sample: fromOrigSample,
    },
    destDeps: { total: destDeps.length },
    quotaUsed: QUOTA.used,
  });
});
// Use this after deploying code changes, or when you suspect stale data.
// Optional ?route=DXB-DOH to clear a specific route only.
app.get("/api/cache-clear", (req, res) => {
  const { route } = req.query;
  if (route) {
    // Clear specific route keys
    const [o, d] = route.toUpperCase().split("-");
    const keysDeleted = [];
    for (const key of cache.keys()) {
      if (key.includes(o) || key.includes(d)) {
        cache.delete(key);
        keysDeleted.push(key);
      }
    }
    console.log(`[Cache CLEAR] Route ${route}: deleted ${keysDeleted.length} keys`);
    return res.json({ cleared: keysDeleted.length, keys: keysDeleted });
  }
  // Clear everything
  const total = cache.size;
  cache.clear();
  console.log(`[Cache CLEAR] All ${total} entries cleared`);
  res.json({ cleared: total, message: "Full cache cleared — next requests will hit API" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`✈  Escape Route API — port ${PORT}`);
  console.log(`   Strategy: dual-airport dual-direction (4 feeds per route)`);
  console.log(`   Pro plan: ${QUOTA.MONTHLY_UNIT_LIMIT} units/month`);
  console.log(`   Route search ~16 units | Future ~8 units | Max ~${Math.floor(QUOTA.MONTHLY_UNIT_LIMIT / 16)} unique route searches/month`);
  await loadAirportDB();
});
