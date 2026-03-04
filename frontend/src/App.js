import React, { useState, useCallback, useRef } from "react";

const API = process.env.REACT_APP_API_URL || "";

function StatusBadge({ status }) {
  const styles = {
    LANDED:    { background:"#052e16", color:"#4ade80", border:"1px solid #166534" },
    CANCELLED: { background:"#2d0f0f", color:"#f87171", border:"1px solid #7f1d1d" },
    IN_AIR:    { background:"#0c1a40", color:"#60a5fa", border:"1px solid #1e3a8a" },
    SCHEDULED: { background:"#0f172a", color:"#94a3b8", border:"1px solid #334155" },
    DELAYED:   { background:"#2d1f00", color:"#fbbf24", border:"1px solid #78350f" },
  };
  const s = styles[status] || styles.SCHEDULED;
  return <span style={{...s,fontSize:10,padding:"2px 8px",borderRadius:4,fontWeight:"bold",letterSpacing:"1px",fontFamily:"inherit",whiteSpace:"nowrap"}}>{status}</span>;
}

function GaugeArc({ pct, size=80 }) {
  const r = size/2-8, circ = Math.PI*r;
  const color = pct>=75?"#4ade80":pct>=50?"#facc15":"#f87171";
  return (
    <svg width={size} height={size/2+12} viewBox={`0 0 ${size} ${size/2+12}`}>
      <path d={`M 8,${size/2} A ${r} ${r} 0 0 1 ${size-8},${size/2}`} fill="none" stroke="#1e293b" strokeWidth="6" strokeLinecap="round"/>
      <path d={`M 8,${size/2} A ${r} ${r} 0 0 1 ${size-8},${size/2}`} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${(pct/100)*circ} ${circ}`} style={{transition:"stroke-dasharray 1s ease"}}/>
      <text x={size/2} y={size/2+10} textAnchor="middle" fill={color} fontSize="13" fontFamily="JetBrains Mono,monospace" fontWeight="bold">{pct}%</text>
    </svg>
  );
}

const COORDS = {
  DXB:[55.37,25.25],BOM:[72.87,19.09],DOH:[51.61,25.27],MCT:[58.28,23.59],
  DEL:[77.10,28.56],LHR:[-0.46,51.48],CDG:[2.55,49.01],FRA:[8.56,50.04],
  AMS:[4.76,52.31],IST:[28.74,41.26],SIN:[103.99,1.36],BKK:[100.75,13.68],
  KUL:[101.71,2.75],HKG:[113.92,22.31],NRT:[140.39,35.77],JFK:[-73.78,40.64],
  LAX:[-118.41,33.94],ORD:[-87.91,41.97],MIA:[-80.29,25.80],SYD:[151.18,-33.94],
  CAI:[31.41,30.12],JNB:[28.25,-26.14],NBO:[36.93,-1.32],ADD:[38.80,8.98],
  AMM:[35.99,31.72],KHI:[67.16,24.91],TLV:[34.89,32.01],GRU:[-46.47,-23.44],
  EZE:[-58.54,-34.82],MEX:[-99.07,19.44],YYZ:[-79.62,43.68],ICN:[126.44,37.46],
  PEK:[116.60,40.08],PVG:[121.81,31.14],RUH:[46.70,24.96],AUH:[54.65,24.44],
  KWI:[47.97,29.23],BAH:[50.63,26.27],BEY:[35.49,33.82],SVO:[37.41,55.97],
  ZRH:[8.55,47.46],VIE:[16.57,48.11],MAD:[-3.57,40.49],FCO:[12.24,41.80],
  ATH:[23.94,37.94],GYD:[50.05,40.47],EVN:[44.40,40.15],TBS:[44.95,41.67],
  CGK:[106.66,-6.13],MNL:[121.02,14.51],BOG:[-74.15,4.70],LIM:[-77.11,-12.02],
  LOS:[3.32,6.58],ACC:[-0.17,5.61],CPT:[18.60,-33.96],BCN:[2.08,41.30],
  MEL:[144.84,-37.67],SCL:[-70.79,-33.39],
};

function RouteMapSVG({ path }) {
  const coords = path.map(p => COORDS[p]).filter(Boolean);
  if (coords.length < 2) return null;
  const lons=coords.map(c=>c[0]), lats=coords.map(c=>c[1]);
  const minLon=Math.min(...lons)-4, maxLon=Math.max(...lons)+4;
  const minLat=Math.min(...lats)-4, maxLat=Math.max(...lats)+4;
  const W=300,H=110;
  const toX=lon=>((lon-minLon)/(maxLon-minLon))*(W-40)+20;
  const toY=lat=>H-((lat-minLat)/(maxLat-minLat))*(H-30)-15;
  const d=coords.map((c,i)=>`${i===0?"M":"L"} ${toX(c[0])} ${toY(c[1])}`).join(" ");
  const uid=path.join("");
  return (
    <svg width={W} height={H} style={{width:"100%"}} viewBox={`0 0 ${W} ${H}`}>
      <defs><marker id={`a${uid}`} markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#f97316"/></marker></defs>
      <path d={d} fill="none" stroke="#f9731644" strokeWidth="2" strokeDasharray="4 3"/>
      <path d={d} fill="none" stroke="#f97316" strokeWidth="1.5" markerEnd={`url(#a${uid})`}/>
      {coords.map((c,i)=>(
        <g key={i}>
          <circle cx={toX(c[0])} cy={toY(c[1])} r={i===0||i===coords.length-1?5:4}
            fill={i===0?"#22d3ee":i===coords.length-1?"#4ade80":"#f97316"} stroke="#0f172a" strokeWidth="1.5"/>
          <text x={toX(c[0])} y={toY(c[1])-8} textAnchor="middle" fill="#e2e8f0" fontSize="9" fontFamily="JetBrains Mono,monospace">{path[i]}</text>
        </g>
      ))}
    </svg>
  );
}

function AirportInput({ label, value, onChange, color }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const handleChange = async v => {
    const val = v.toUpperCase();
    onChange(val);
    if (val.length >= 2) {
      try {
        const res = await fetch(`${API}/api/airports?q=${val}`);
        const data = await res.json();
        setSuggestions(data); setOpen(data.length>0);
      } catch { setSuggestions([]); setOpen(false); }
    } else setOpen(false);
  };
  React.useEffect(() => {
    const h = e => { if(ref.current&&!ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown",h); return ()=>document.removeEventListener("mousedown",h);
  },[]);
  return (
    <div ref={ref} style={{flex:1,minWidth:180,position:"relative"}}>
      <div style={{fontSize:10,color:"#64748b",marginBottom:6,letterSpacing:"2px"}}>{label}</div>
      <input value={value} onChange={e=>handleChange(e.target.value)}
        onFocus={()=>value.length>=2&&suggestions.length>0&&setOpen(true)}
        maxLength={3} placeholder="e.g. DXB"
        style={{width:"100%",background:"#030712",border:"1px solid #334155",borderRadius:8,
          padding:"10px 14px",color,fontSize:20,fontFamily:"JetBrains Mono,monospace",
          fontWeight:"bold",letterSpacing:"4px",outline:"none"}}/>
      {open&&suggestions.length>0&&(
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"#1e293b",
          border:"1px solid #334155",borderRadius:8,zIndex:200,overflow:"hidden",boxShadow:"0 8px 24px #00000088"}}>
          {suggestions.map(s=>(
            <div key={s.code} onClick={()=>{onChange(s.code);setOpen(false);}}
              style={{padding:"8px 14px",cursor:"pointer",display:"flex",justifyContent:"space-between",
                alignItems:"center",borderBottom:"1px solid #0f172a",gap:8}}
              onMouseEnter={e=>e.currentTarget.style.background="#334155"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{color:"#22d3ee",fontWeight:"bold",fontSize:14}}>{s.code}</span>
              <span style={{color:"#94a3b8",fontSize:11}}>{s.city}, {s.country}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function predictFlight(flight, airlineStats, routeSuccessRate) {
  const stat = airlineStats.find(a=>a.name===flight.airlineName||a.code===flight.airline);
  const ar = stat ? stat.rate/100 : 0.65;
  const rr = routeSuccessRate/100;
  const pct = Math.min(96,Math.max(15,Math.round((ar*0.55+rr*0.35+0.1)*100)));
  const reasons = [];
  if (stat) reasons.push(`${stat.name} has a ${stat.rate}% success rate on this data`);
  if (routeSuccessRate<60) reasons.push("Route shows elevated disruption history");
  if (routeSuccessRate>=80) reasons.push("Route is historically stable");
  return { chanceOp:pct, chanceCancel:100-pct, reason:reasons.length?reasons.join(". ")+".":`Based on recent route and airline performance.` };
}

// ── MAIN APP ──────────────────────────────────────────────────────────
export default function App() {
  const [originInput, setOriginInput] = useState("DXB");
  const [destInput, setDestInput] = useState("BOM");
  const [result, setResult] = useState(null);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("flights");

  const handleSearch = useCallback(async () => {
    const o = originInput.trim().toUpperCase();
    const d = destInput.trim().toUpperCase();
    if (o.length!==3||d.length!==3) { setError("Enter valid 3-letter IATA codes"); return; }
    if (o===d) { setError("Origin and destination must differ"); return; }
    setError(""); setLoading(true); setResult(null); setSelectedRoute(null);
    try {
      const res = await fetch(`${API}/api/routes?origin=${o}&destination=${d}`);
      if (!res.ok) { const e=await res.json(); throw new Error(e.error||"API error"); }
      const data = await res.json();
      setResult(data);
      setSelectedRoute(data.routes[0]||null);
      setActiveTab("flights");
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, [originInput, destInput]);

  const airlineStats = selectedRoute?.airlineStats||[];
  const upcomingFlights = selectedRoute ? selectedRoute.flights.filter(f=>["SCHEDULED","IN_AIR"].includes(f.status)).slice(0,4) : [];
  const quickPairs = [["DXB","BOM"],["LHR","JFK"],["SIN","SYD"],["IST","CAI"],["DOH","DEL"],["TLV","AMM"],["TBS","GYD"]];

  return (
    <div style={{minHeight:"100vh",background:"#030712",color:"#e2e8f0"}}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes blink{50%{opacity:0}}
        .fade-in{animation:fadein 0.4s ease forwards}
        .pulse-dot{animation:pulse 2s infinite}
        .blink{animation:blink 1s step-end infinite}
        .rc{transition:all 0.2s ease}.rc:hover{transform:translateY(-2px)}
        button:hover{opacity:.85} input:focus{border-color:#f97316!important}
        @media(max-width:768px){.mg{grid-template-columns:1fr!important}}
      `}</style>

      <header style={{borderBottom:"1px solid #1e293b",background:"#030712ee",backdropFilter:"blur(12px)",position:"sticky",top:0,zIndex:50}}>
        <div style={{maxWidth:1400,margin:"0 auto",padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:36,height:36,borderRadius:8,background:"linear-gradient(135deg,#f97316,#ef4444)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>✈</div>
            <div>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,letterSpacing:"-0.5px",color:"#f1f5f9"}}>ESCAPE<span style={{color:"#f97316"}}>ROUTE</span></div>
              <div style={{fontSize:9,color:"#64748b",letterSpacing:"2px"}}>REAL-TIME FLIGHT INTELLIGENCE · ANY ROUTE WORLDWIDE</div>
            </div>
          </div>
          <span style={{display:"flex",alignItems:"center",gap:4,color:"#64748b",fontSize:11}}>
            <span className="pulse-dot" style={{width:6,height:6,borderRadius:"50%",background:"#4ade80",display:"inline-block"}}/>
            {new Date().toUTCString().slice(0,25)} UTC
          </span>
        </div>
      </header>

      <div style={{maxWidth:1400,margin:"0 auto",padding:"20px 16px"}}>
        <div style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:16,padding:"20px 24px",marginBottom:24}}>
          <div style={{fontSize:11,color:"#64748b",letterSpacing:"3px",marginBottom:4}}>▸ ROUTE ANALYSIS</div>
          <div style={{fontSize:11,color:"#475569",marginBottom:16}}>Type IATA code or city name — covers 6,000+ airports worldwide</div>
          <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end"}}>
            <AirportInput label="ORIGIN" value={originInput} onChange={setOriginInput} color="#22d3ee"/>
            <div style={{fontSize:28,color:"#334155",paddingBottom:12}}>→</div>
            <AirportInput label="DESTINATION" value={destInput} onChange={setDestInput} color="#4ade80"/>
            <button onClick={handleSearch} disabled={loading}
              style={{background:loading?"#334155":"linear-gradient(135deg,#f97316,#ef4444)",border:"none",borderRadius:8,
                padding:"10px 28px",color:"#fff",fontSize:13,fontFamily:"JetBrains Mono,monospace",
                fontWeight:"bold",letterSpacing:"2px",cursor:loading?"not-allowed":"pointer",whiteSpace:"nowrap"}}>
              {loading?"SCANNING...":"FIND ROUTES ▸"}
            </button>
          </div>
          {error&&<div style={{marginTop:12,color:"#f87171",fontSize:12,background:"#2d0f0f",padding:"8px 14px",borderRadius:6,border:"1px solid #7f1d1d"}}>⚠ {error}</div>}
          <div style={{marginTop:16,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:10,color:"#475569"}}>QUICK:</span>
            {quickPairs.map(([o,d])=>(
              <button key={`${o}-${d}`} onClick={()=>{setOriginInput(o);setDestInput(d);}}
                style={{background:"#1e293b",border:"1px solid #334155",borderRadius:4,padding:"3px 10px",fontSize:11,color:"#94a3b8",cursor:"pointer",fontFamily:"JetBrains Mono,monospace"}}>
                {o}→{d}
              </button>
            ))}
          </div>
        </div>

        {loading&&(
          <div style={{textAlign:"center",padding:"80px 20px"}}>
            <div style={{fontSize:11,color:"#64748b",letterSpacing:"3px",marginBottom:20}}>FETCHING LIVE FLIGHT DATA<span className="blink">_</span></div>
            <div style={{width:40,height:40,border:"3px solid #1e293b",borderTop:"3px solid #f97316",borderRadius:"50%",margin:"0 auto",animation:"spin 0.8s linear infinite"}}/>
            <div style={{marginTop:16,fontSize:11,color:"#334155"}}>Querying OpenSky Network — may take 20–40 seconds for fresh data</div>
          </div>
        )}

        {!loading&&result&&(
          <div className="fade-in">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
              <div style={{fontSize:11,color:"#64748b"}}>{result.origin?.city} → {result.destination?.city} · Last 24h real flight data</div>
              <span style={{fontSize:10,color:"#4ade80",border:"1px solid #4ade8044",borderRadius:4,padding:"2px 8px"}}>◉ OPENSKY NETWORK LIVE</span>
            </div>

            <div className="mg" style={{display:"grid",gridTemplateColumns:"clamp(280px,30%,360px) 1fr",gap:20}}>
              <div>
                <div style={{fontSize:10,color:"#64748b",letterSpacing:"3px",marginBottom:12}}>▸ ESCAPE ROUTES RANKED</div>
                {result.routes.map((route,idx)=>(
                  <div key={route.id} className="rc"
                    onClick={()=>{setSelectedRoute(route);setActiveTab("flights");}}
                    style={{background:selectedRoute?.id===route.id?"#1e293b":"#0f172a",
                      border:`1px solid ${selectedRoute?.id===route.id?"#f97316":"#1e293b"}`,
                      borderRadius:12,padding:"14px 16px",marginBottom:10,cursor:"pointer"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                      <div>
                        <div style={{fontSize:10,color:"#64748b",marginBottom:4}}>{idx===0?"🟢 BEST ROUTE":idx===1?"🟡 ALTERNATE":"🔴 FALLBACK"}</div>
                        <div style={{fontSize:12,lineHeight:1.7}}>
                          {route.path.map((p,i)=>(
                            <span key={p}>
                              <span style={{color:i===0?"#22d3ee":i===route.path.length-1?"#4ade80":"#f97316",fontWeight:"bold"}}>{p}</span>
                              {i<route.path.length-1&&<span style={{color:"#475569"}}> → </span>}
                            </span>
                          ))}
                        </div>
                        <div style={{fontSize:10,color:"#64748b",marginTop:2}}>{route.label}</div>
                      </div>
                      <GaugeArc pct={route.successRate} size={70}/>
                    </div>
                    <RouteMapSVG path={route.path}/>
                    <div style={{display:"flex",gap:12,marginTop:10,fontSize:11,color:"#64748b",flexWrap:"wrap"}}>
                      <span><span style={{color:"#4ade80"}}>↓{route.landed}</span> landed</span>
                      <span><span style={{color:"#60a5fa"}}>✈{route.inAir||0}</span> in air</span>
                      <span><span style={{color:"#f87171"}}>✗{route.cancelled}</span> cancelled</span>
                    </div>
                  </div>
                ))}
                <div style={{background:"#7c2d12",border:"1px solid #9a3412",borderRadius:10,padding:"12px 14px",marginTop:8,fontSize:11}}>
                  <div style={{color:"#fb923c",fontWeight:"bold",marginBottom:4}}>⚠ ZONE ADVISORY</div>
                  <div style={{color:"#fdba74",lineHeight:1.5}}>Verify active NOTAMs before travel. Data reflects last 24h actual operations.</div>
                </div>
              </div>

              {selectedRoute&&(
                <div>
                  <div style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:12,padding:"16px 20px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
                    <div>
                      <div style={{fontSize:10,color:"#64748b",letterSpacing:"3px",marginBottom:4}}>▸ SELECTED ROUTE</div>
                      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:20}}>{selectedRoute.label}</div>
                      {selectedRoute.isAlternate&&<div style={{fontSize:11,color:"#f97316",marginTop:2}}>via {selectedRoute.via}</div>}
                    </div>
                    <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
                      {[
                        {label:"SUCCESS RATE",val:`${selectedRoute.successRate}%`,color:selectedRoute.successRate>=75?"#4ade80":selectedRoute.successRate>=50?"#facc15":"#f87171"},
                        {label:"LANDED",val:selectedRoute.landed,color:"#4ade80"},
                        {label:"IN AIR",val:selectedRoute.inAir||0,color:"#60a5fa"},
                        {label:"CANCELLED",val:selectedRoute.cancelled,color:"#f87171"},
                      ].map(s=>(
                        <div key={s.label} style={{textAlign:"center"}}>
                          <div style={{fontSize:10,color:"#64748b",letterSpacing:"2px"}}>{s.label}</div>
                          <div style={{fontSize:24,fontWeight:"bold",color:s.color}}>{s.val}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{display:"flex",gap:4,marginBottom:16}}>
                    {[{id:"flights",label:"✈ FLIGHTS"},{id:"airlines",label:"◈ AIRLINES"},{id:"predict",label:"◎ PREDICTIONS"}].map(tab=>(
                      <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
                        style={{background:activeTab===tab.id?"#1e293b":"transparent",
                          border:`1px solid ${activeTab===tab.id?"#f97316":"#1e293b"}`,
                          borderRadius:6,padding:"7px 16px",color:activeTab===tab.id?"#f97316":"#64748b",
                          fontSize:11,fontFamily:"inherit",cursor:"pointer",letterSpacing:"1px"}}>
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {activeTab==="flights"&&(
                    <div className="fade-in" style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:12,overflow:"hidden"}}>
                      <div style={{padding:"12px 20px",borderBottom:"1px solid #1e293b",fontSize:10,color:"#64748b",letterSpacing:"3px"}}>
                        ▸ FLIGHT STATUS — LAST 24H ({selectedRoute.flights.length} flights)
                      </div>
                      {selectedRoute.flights.length===0?(
                        <div style={{padding:40,textAlign:"center",color:"#64748b",fontSize:12,lineHeight:2}}>
                          No flight data returned from OpenSky for this route.<br/>
                          This can happen on low-traffic routes or during OpenSky's quiet periods.<br/>
                          <span style={{color:"#f97316"}}>Try a busier route or check back in a few minutes.</span>
                        </div>
                      ):(
                        <div style={{overflowX:"auto"}}>
                          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                            <thead>
                              <tr style={{borderBottom:"1px solid #1e293b"}}>
                                {["FLIGHT","AIRLINE","DEP","ARR","STATUS"].map(h=>(
                                  <th key={h} style={{padding:"10px 16px",textAlign:"left",color:"#475569",fontSize:10,letterSpacing:"2px",fontWeight:"normal"}}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {selectedRoute.flights.map((f,i)=>(
                                <tr key={i} style={{borderBottom:"1px solid #0f172a22",background:i%2===0?"#0f172a":"#080f1a"}}>
                                  <td style={{padding:"10px 16px",color:"#22d3ee",fontWeight:"bold"}}>{f.flightNum}</td>
                                  <td style={{padding:"10px 16px",color:"#94a3b8"}}>{f.airlineName}</td>
                                  <td style={{padding:"10px 16px",color:"#64748b"}}>{f.depTime}</td>
                                  <td style={{padding:"10px 16px",color:"#64748b"}}>{f.arrTime||"—"}</td>
                                  <td style={{padding:"10px 16px"}}><StatusBadge status={f.status}/></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab==="airlines"&&(
                    <div className="fade-in">
                      <div style={{fontSize:10,color:"#64748b",letterSpacing:"3px",marginBottom:12}}>▸ AIRLINE RELIABILITY — REAL DATA</div>
                      {airlineStats.length===0?(
                        <div style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:12,padding:40,textAlign:"center",color:"#64748b",fontSize:12}}>No airline data available for this route.</div>
                      ):(
                        <div style={{display:"grid",gap:12}}>
                          {airlineStats.map((a,i)=>(
                            <div key={a.name} style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:12,padding:"16px 20px"}}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                                <div>
                                  <div style={{fontSize:14,fontWeight:"bold"}}>{a.name}</div>
                                  <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{a.landed} landed · {a.inAir||0} in air · {a.total} total</div>
                                </div>
                                <div style={{display:"flex",alignItems:"center",gap:12}}>
                                  {i===0&&<span style={{fontSize:10,color:"#facc15"}}>★ TOP</span>}
                                  <GaugeArc pct={a.rate} size={80}/>
                                </div>
                              </div>
                              <div style={{background:"#030712",borderRadius:6,height:6,overflow:"hidden"}}>
                                <div style={{height:"100%",borderRadius:6,width:`${a.rate}%`,
                                  background:a.rate>=80?"linear-gradient(90deg,#4ade80,#22d3ee)":a.rate>=60?"linear-gradient(90deg,#facc15,#f97316)":"linear-gradient(90deg,#f87171,#ef4444)",
                                  transition:"width 0.8s ease"}}/>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab==="predict"&&(
                    <div className="fade-in">
                      <div style={{fontSize:10,color:"#64748b",letterSpacing:"3px",marginBottom:12}}>▸ UPCOMING FLIGHT PREDICTIONS</div>
                      {upcomingFlights.length===0?(
                        <div style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:12,padding:40,textAlign:"center",color:"#64748b",fontSize:12}}>No upcoming flights in current window.</div>
                      ):(
                        <div style={{display:"grid",gap:14}}>
                          {upcomingFlights.map(f=>{
                            const pred=predictFlight(f,airlineStats,selectedRoute.successRate);
                            return (
                              <div key={f.flightNum} style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:12,padding:"18px 20px"}}>
                                <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}>
                                  <div>
                                    <div style={{fontSize:18,fontWeight:"bold",color:"#22d3ee"}}>{f.flightNum}</div>
                                    <div style={{fontSize:12,color:"#64748b",marginTop:2}}>{f.airlineName} · Dep {f.depTime}</div>
                                  </div>
                                  <StatusBadge status={f.status}/>
                                </div>
                                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                                  <div style={{background:"#052e16",border:"1px solid #166534",borderRadius:8,padding:"12px 16px",textAlign:"center"}}>
                                    <div style={{fontSize:10,color:"#4ade80",letterSpacing:"2px",marginBottom:4}}>CHANCE OF FLYING</div>
                                    <div style={{fontSize:32,fontWeight:"bold",color:"#4ade80"}}>{pred.chanceOp}%</div>
                                  </div>
                                  <div style={{background:"#2d0f0f",border:"1px solid #7f1d1d",borderRadius:8,padding:"12px 16px",textAlign:"center"}}>
                                    <div style={{fontSize:10,color:"#f87171",letterSpacing:"2px",marginBottom:4}}>CHANCE OF CANCEL</div>
                                    <div style={{fontSize:32,fontWeight:"bold",color:"#f87171"}}>{pred.chanceCancel}%</div>
                                  </div>
                                </div>
                                <div style={{background:"#030712",borderRadius:6,height:8,overflow:"hidden",marginBottom:12}}>
                                  <div style={{height:"100%",width:`${pred.chanceOp}%`,background:"linear-gradient(90deg,#f97316,#4ade80)",borderRadius:6,transition:"width 0.8s ease"}}/>
                                </div>
                                <div style={{background:"#1e293b",borderRadius:8,padding:"10px 14px",fontSize:11,color:"#94a3b8",lineHeight:1.6}}>
                                  <span style={{color:"#f97316"}}>◎ ASSESSMENT: </span>{pred.reason}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {!loading&&!result&&(
          <div style={{textAlign:"center",padding:"80px 20px",color:"#475569"}}>
            <div style={{fontSize:60,marginBottom:16,opacity:.3}}>✈</div>
            <div style={{fontSize:13,letterSpacing:"3px"}}>ENTER ANY ROUTE TO BEGIN</div>
            <div style={{fontSize:11,marginTop:8}}>Real ADS-B data · 6,000+ airports · Powered by OpenSky Network</div>
          </div>
        )}

        <div style={{marginTop:40,padding:"20px 0",borderTop:"1px solid #1e293b",display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8,fontSize:10,color:"#334155"}}>
          <span>ESCAPEROUTE FLIGHT INTELLIGENCE © 2026</span>
          <span>POWERED BY: OpenSky Network</span>
          <span>FOR INFORMATIONAL USE ONLY</span>
        </div>
      </div>
    </div>
  );
}
