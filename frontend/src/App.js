import React, { useState, useCallback, useRef, useEffect } from "react";

const API = process.env.REACT_APP_API_URL || "";

// ── Theme tokens ──────────────────────────────────────────────────────
const DARK = {
  bg:        "#020817",
  bgCard:    "#080f1e",
  bgRow0:    "#080f1e",
  bgRow1:    "#040a14",
  bgHover:   "#0f172a",
  bgInput:   "#020817",
  bgHeader:  "#020817f0",
  border:    "#0f172a",
  border2:   "#1e293b",
  text:      "#e2e8f0",
  textSub:   "#94a3b8",
  textMuted: "#475569",
  textDim:   "#334155",
  textDim2:  "#1e293b",
  accent:    "#f97316",
  cyan:      "#22d3ee",
  green:     "#4ade80",
  labelBg:   "#1e293b",
  labelText: "#64748b",
  spinBg:    "#0f172a",
  scrollbar: "#334155",
};

const LIGHT = {
  bg:        "#f8fafc",
  bgCard:    "#ffffff",
  bgRow0:    "#ffffff",
  bgRow1:    "#f8fafc",
  bgHover:   "#f1f5f9",
  bgInput:   "#ffffff",
  bgHeader:  "#ffffffee",
  border:    "#e2e8f0",
  border2:   "#cbd5e1",
  text:      "#0f172a",
  textSub:   "#475569",
  textMuted: "#64748b",
  textDim:   "#94a3b8",
  textDim2:  "#cbd5e1",
  accent:    "#ea580c",
  cyan:      "#0891b2",
  green:     "#16a34a",
  labelBg:   "#f1f5f9",
  labelText: "#64748b",
  spinBg:    "#e2e8f0",
  scrollbar: "#cbd5e1",
};

const SEVERITY = {
  S1:{color:"#60a5fa",bg:"#0c1a40",border:"#1e3a8a",label:"MONITOR"},
  S2:{color:"#4ade80",bg:"#052e16",border:"#166534",label:"LOW"},
  S3:{color:"#facc15",bg:"#2d1f00",border:"#78350f",label:"MODERATE"},
  S4:{color:"#fb923c",bg:"#2d1500",border:"#9a3412",label:"HIGH"},
  S5:{color:"#f87171",bg:"#2d0f0f",border:"#7f1d1d",label:"CRITICAL"},
};
const CAT_ICONS={Conflict:"⚔️",Airspace:"🚫",Weather:"🌪️",Political:"🏛️",Security:"🔒",Infrastructure:"🏗️"};

function StatusBadge({status}){
  const m={
    LANDED:    {bg:"#052e16",c:"#4ade80",b:"#166534"},
    COMPLETED: {bg:"#052e16",c:"#4ade80",b:"#166634"},
    CANCELLED: {bg:"#2d0f0f",c:"#f87171",b:"#7f1d1d"},
    IN_AIR:    {bg:"#0c1a40",c:"#60a5fa",b:"#1e3a8a"},
    SCHEDULED: {bg:"#1e293b",c:"#94a3b8",b:"#334155"},
    DELAYED:   {bg:"#2d1f00",c:"#fbbf24",b:"#78350f"},
    BOARDING:  {bg:"#1a0f2e",c:"#c084fc",b:"#6b21a8"},
    DIVERTED:  {bg:"#1f1000",c:"#fb923c",b:"#c2410c"},
  };
  const s=m[status]||m.SCHEDULED;
  const label=status==="COMPLETED"?"OPERATED":status;
  return <span style={{background:s.bg,color:s.c,border:`1px solid ${s.b}`,fontSize:9,padding:"2px 7px",borderRadius:3,fontWeight:"bold",letterSpacing:"1px",whiteSpace:"nowrap"}}>{label}</span>;
}

function AirportInput({label,value,onChange,color,T}){
  const [suggestions,setSuggestions]=useState([]);
  const [open,setOpen]=useState(false);
  const ref=useRef();
  useEffect(()=>{
    const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false)};
    document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);
  },[]);
  const handleChange=async v=>{
    const val=v.toUpperCase();onChange(val);
    if(val.length>=2){
      try{const r=await fetch(`${API}/api/airports?q=${val}`);const d=await r.json();setSuggestions(d);setOpen(d.length>0);}
      catch{setSuggestions([]);setOpen(false);}
    }else setOpen(false);
  };
  return(
    <div ref={ref} style={{flex:1,minWidth:130,position:"relative"}}>
      <div style={{fontSize:9,color:T.textMuted,marginBottom:5,letterSpacing:"3px"}}>{label}</div>
      <input value={value} onChange={e=>handleChange(e.target.value)} onFocus={()=>value.length>=2&&suggestions.length>0&&setOpen(true)}
        maxLength={3} placeholder="IATA"
        style={{width:"100%",boxSizing:"border-box",background:T.bgInput,border:`1px solid ${color}44`,borderRadius:8,padding:"10px 12px",color,fontSize:22,fontFamily:"'JetBrains Mono',monospace",fontWeight:"bold",letterSpacing:"4px",outline:"none"}}/>
      {open&&suggestions.length>0&&(
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:T.bgCard,border:`1px solid ${T.border2}`,borderRadius:8,zIndex:200,overflow:"hidden",boxShadow:"0 12px 32px #0004"}}>
          {suggestions.map(s=>(
            <div key={s.code} onClick={()=>{onChange(s.code);setOpen(false);}}
              style={{padding:"8px 14px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,background:T.bgCard}}
              onMouseEnter={e=>e.currentTarget.style.background=T.bgHover}
              onMouseLeave={e=>e.currentTarget.style.background=T.bgCard}>
              <span style={{color:T.cyan,fontWeight:"bold",fontSize:13,fontFamily:"'JetBrains Mono',monospace"}}>{s.code}</span>
              <span style={{color:T.textMuted,fontSize:11}}>{s.city}, {s.country}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PredictionPanel({flight,prediction,T}){
  if(!prediction)return null;
  const flyColor=prediction.flyProbability>=70?"#4ade80":prediction.flyProbability>=50?"#facc15":"#f87171";
  return(
    <tr>
      <td colSpan={7} style={{padding:"0 12px 12px",background:T.bgRow1}}>
        <div style={{background:T.bgCard,border:`1px solid ${T.border2}`,borderRadius:12,padding:"16px 18px",marginTop:4}}>
          <div style={{fontSize:9,color:T.textMuted,letterSpacing:"3px",marginBottom:12}}>▸ PREDICTION · {flight.flightNum} · {flight.airlineName}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            <div style={{background:"#052e16",border:"1px solid #166534",borderRadius:8,padding:12,textAlign:"center"}}>
              <div style={{fontSize:9,color:"#4ade80",letterSpacing:"2px",marginBottom:4}}>CHANCE OF FLYING</div>
              <div style={{fontSize:32,fontWeight:"bold",color:flyColor,fontFamily:"'JetBrains Mono',monospace"}}>{prediction.flyProbability}%</div>
            </div>
            <div style={{background:"#2d0f0f",border:"1px solid #7f1d1d",borderRadius:8,padding:12,textAlign:"center"}}>
              <div style={{fontSize:9,color:"#f87171",letterSpacing:"2px",marginBottom:4}}>CHANCE OF CANCEL</div>
              <div style={{fontSize:32,fontWeight:"bold",color:"#f87171",fontFamily:"'JetBrains Mono',monospace"}}>{prediction.cancelProbability}%</div>
            </div>
          </div>
          <div style={{background:T.bgRow1,borderRadius:4,height:6,overflow:"hidden",marginBottom:14}}>
            <div style={{height:"100%",width:`${prediction.flyProbability}%`,background:`linear-gradient(90deg,#f97316,${flyColor})`,borderRadius:4,transition:"width 0.8s ease"}}/>
          </div>
          <p style={{color:T.textSub,fontSize:12,lineHeight:1.7,marginBottom:10}}>{prediction.reasoning}</p>
          {prediction.riskFactors?.length>0&&(
            <div style={{marginBottom:10}}>
              <div style={{fontSize:9,color:T.textMuted,letterSpacing:"2px",marginBottom:6}}>RISK FACTORS</div>
              {prediction.riskFactors.map((r,i)=>(
                <div key={i} style={{color:T.textSub,fontSize:11,marginBottom:3}}>⚠ {r}</div>
              ))}
            </div>
          )}
          {prediction.recommendation&&(
            <div style={{background:T.bgHover,border:`1px solid ${T.border2}`,borderRadius:6,padding:"8px 12px",fontSize:11,color:T.cyan}}>
              💡 {prediction.recommendation}
            </div>
          )}
          <div style={{marginTop:8,fontSize:10,color:T.textDim}}>Confidence: {prediction.confidence}</div>
        </div>
      </td>
    </tr>
  );
}

function FlightTable({flights,T}){
  if(!flights||flights.length===0)
    return <div style={{padding:40,textAlign:"center",color:T.textDim,fontSize:12}}>No flights in this window.</div>;
  return(
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:500}}>
        <thead>
          <tr style={{borderBottom:`1px solid ${T.border}`}}>
            {["FLIGHT","AIRLINE","DEP","ARR","AIRCRAFT","STATUS"].map(h=>(
              <th key={h} style={{padding:"9px 12px",textAlign:"left",color:T.textDim,fontSize:9,letterSpacing:"2px",fontWeight:"normal",whiteSpace:"nowrap"}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {flights.map((f,i)=>(
            <tr key={`${f.flightNum}-${i}`}
              style={{borderBottom:`1px solid ${T.border}88`,background:i%2===0?T.bgRow0:T.bgRow1}}
              onMouseEnter={e=>e.currentTarget.style.background=T.bgHover}
              onMouseLeave={e=>e.currentTarget.style.background=i%2===0?T.bgRow0:T.bgRow1}>
              <td style={{padding:"9px 12px",color:T.cyan,fontWeight:"bold",fontFamily:"'JetBrains Mono',monospace",whiteSpace:"nowrap"}}>{f.flightNum}</td>
              <td style={{padding:"9px 12px",color:T.textSub,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.airlineName}</td>
              <td style={{padding:"9px 12px",color:T.textMuted,fontFamily:"'JetBrains Mono',monospace"}}>{f.depTime}</td>
              <td style={{padding:"9px 12px",color:T.textMuted,fontFamily:"'JetBrains Mono',monospace"}}>{f.arrTime}</td>
              <td style={{padding:"9px 12px",color:T.textDim,fontSize:10,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.aircraft||"—"}</td>
              <td style={{padding:"9px 12px",whiteSpace:"nowrap"}}><StatusBadge status={f.status}/></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PredictionMini({score,T}){
  if(!score)return null;
  const c=score.flyProbability>=75?"#4ade80":score.flyProbability>=50?"#facc15":"#f87171";
  return(
    <tr>
      <td colSpan={7} style={{padding:"0 12px 8px",background:T.bgRow1}}>
        <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 14px",display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:80,height:5,background:T.bgHover,borderRadius:3,overflow:"hidden"}}>
              <div style={{width:`${score.flyProbability}%`,height:"100%",background:c,borderRadius:3,transition:"width 0.6s ease"}}/>
            </div>
            <span style={{color:c,fontSize:11,fontFamily:"'JetBrains Mono',monospace",fontWeight:"bold"}}>{score.flyProbability}% fly</span>
            <span style={{color:"#f87171",fontSize:11,fontFamily:"'JetBrains Mono',monospace"}}>{score.cancelProbability}% cancel</span>
          </div>
          <span style={{color:T.textDim,fontSize:10}}>Based on {score.basedOn} · {score.confidence} confidence</span>
        </div>
      </td>
    </tr>
  );
}

function FutureFlightTable({flights,flyScores,T}){
  if(!flights||flights.length===0)
    return <div style={{padding:40,textAlign:"center",color:T.textDim,fontSize:12}}>No upcoming flights found.</div>;
  const scoreMap=Object.fromEntries((flyScores||[]).map(s=>[s.flightNum,s]));
  return(
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:500}}>
        <thead>
          <tr style={{borderBottom:`1px solid ${T.border}`}}>
            {["FLIGHT","AIRLINE","DEP","ARR","AIRCRAFT","STATUS","FLY %"].map(h=>(
              <th key={h} style={{padding:"9px 12px",textAlign:"left",color:T.textDim,fontSize:9,letterSpacing:"2px",fontWeight:"normal",whiteSpace:"nowrap"}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {flights.map((f,i)=>{
            const score=scoreMap[f.flightNum];
            const pct=score?.flyProbability;
            const pctColor=pct>=75?"#4ade80":pct>=50?"#facc15":"#f87171";
            return(
              <React.Fragment key={`${f.flightNum}-${i}`}>
                <tr style={{borderBottom:`1px solid ${T.border}88`,background:i%2===0?T.bgRow0:T.bgRow1}}
                  onMouseEnter={e=>e.currentTarget.style.background=T.bgHover}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2===0?T.bgRow0:T.bgRow1}>
                  <td style={{padding:"9px 12px",color:T.cyan,fontWeight:"bold",fontFamily:"'JetBrains Mono',monospace",whiteSpace:"nowrap"}}>{f.flightNum}</td>
                  <td style={{padding:"9px 12px",color:T.textSub,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.airlineName}</td>
                  <td style={{padding:"9px 12px",color:T.textMuted,fontFamily:"'JetBrains Mono',monospace"}}>{f.depTime}</td>
                  <td style={{padding:"9px 12px",color:T.textMuted,fontFamily:"'JetBrains Mono',monospace"}}>{f.arrTime}</td>
                  <td style={{padding:"9px 12px",color:T.textDim,fontSize:10,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.aircraft||"—"}</td>
                  <td style={{padding:"9px 12px",whiteSpace:"nowrap"}}><StatusBadge status={f.status}/></td>
                  <td style={{padding:"9px 12px"}}>
                    {pct!=null?(
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:12,fontWeight:"bold",color:pctColor,fontFamily:"'JetBrains Mono',monospace"}}>{pct}%</span>
                        <div style={{width:36,height:4,background:T.bgHover,borderRadius:2,overflow:"hidden"}}>
                          <div style={{width:`${pct}%`,height:"100%",background:pctColor,borderRadius:2}}/>
                        </div>
                        {score.confidence==="low"&&<span style={{fontSize:9,color:T.textDim}}>~</span>}
                      </div>
                    ):<span style={{color:T.textDim,fontSize:10}}>—</span>}
                  </td>
                </tr>
                {score&&<PredictionMini score={score} T={T}/>}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EventCard({event,expanded,onToggle}){
  const s=SEVERITY[event.severity]||SEVERITY.S1;
  const trend=event.trend==="escalating"?"↑ escalating":event.trend==="deescalating"?"↓ easing":"→ stable";
  const trendC=event.trend==="escalating"?"#f87171":event.trend==="deescalating"?"#4ade80":"#94a3b8";
  return(
    <div onClick={onToggle} style={{background:s.bg,border:`1px solid ${s.border}`,borderRadius:10,padding:"12px 14px",cursor:"pointer",transition:"all 0.2s",marginBottom:0,boxShadow:expanded?`0 0 12px ${s.color}22`:"none"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
            <span style={{fontSize:13}}>{CAT_ICONS[event.category]||"⚠️"}</span>
            <span style={{color:s.color,fontSize:12,fontWeight:"bold",lineHeight:1.3}}>{event.title}</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <span style={{color:"#64748b",fontSize:10}}>📍 {event.location}</span>
            <span style={{color:trendC,fontSize:10,fontWeight:"bold"}}>{trend}</span>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
          <span style={{background:s.bg,color:s.color,border:`1px solid ${s.border}`,fontSize:10,padding:"2px 8px",borderRadius:4,fontWeight:"bold",letterSpacing:"1px",fontFamily:"'JetBrains Mono',monospace"}}>{event.severity}</span>
          <span style={{color:"#475569",fontSize:9}}>{expanded?"▲":"▼"}</span>
        </div>
      </div>
      {expanded&&(
        <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${s.border}`}}>
          <p style={{color:"#cbd5e1",fontSize:12,lineHeight:1.7,marginBottom:10}}>{event.summary}</p>
          {event.affectedAirports?.length>0&&(
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
              <span style={{color:"#64748b",fontSize:10}}>Airports:</span>
              {event.affectedAirports.map(a=>(
                <span key={a} style={{background:"#1e293b",color:"#22d3ee",fontSize:10,padding:"1px 6px",borderRadius:3,fontFamily:"'JetBrains Mono',monospace"}}>{a}</span>
              ))}
            </div>
          )}
          {event.affectedRoutes?.length>0&&(
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
              <span style={{color:"#64748b",fontSize:10}}>Routes:</span>
              {event.affectedRoutes.map((r,i)=><span key={i} style={{color:"#94a3b8",fontSize:10}}>{r}</span>)}
            </div>
          )}
          {event.source&&<div style={{fontSize:10,color:"#334155",marginTop:4}}>📰 {event.source}</div>}
        </div>
      )}
    </div>
  );
}

export default function App(){
  const [darkMode,setDarkMode]=useState(true);
  const T=darkMode?DARK:LIGHT;

  const [originInput,setOriginInput]=useState("DXB");
  const [destInput,setDestInput]=useState("BOM");
  const [result,setResult]=useState(null);
  const [futureFlights,setFutureFlights]=useState([]);
  const [loading,setLoading]=useState(false);
  const [futureLoading,setFutureLoading]=useState(false);
  const [error,setError]=useState("");
  const [activeTab,setActiveTab]=useState("24h");
  const [flyScores,setFlyScores]=useState([]);
  const [eventsExpanded,setEventsExpanded]=useState(false);
  const [bragging,setBragging]=useState({flightsTracked:0,cancellationsCaught:0,routesScanned:0});
  const [events,setEvents]=useState([]);
  const [eventsLoading,setEventsLoading]=useState(false);
  const [expandedEvent,setExpandedEvent]=useState(null);

  useEffect(()=>{
    loadEvents();
    fetch(`${API}/api/stats`).then(r=>r.json()).then(d=>setBragging({
      flightsTracked:      d.flightsTracked||0,
      cancellationsCaught: d.cancellationsCaught||0,
      routesScanned:       d.routesScanned||0,
    })).catch(()=>{});
  },[]);

  const loadEvents=async()=>{
    setEventsLoading(true);
    try{const r=await fetch(`${API}/api/events`);const d=await r.json();if(Array.isArray(d))setEvents(d);}
    catch(e){console.error(e);}
    finally{setEventsLoading(false);}
  };

  const handleSearch=useCallback(async()=>{
    const o=originInput.trim().toUpperCase();
    const d=destInput.trim().toUpperCase();
    if(o.length!==3||d.length!==3){setError("Enter valid 3-letter IATA codes");return;}
    if(o===d){setError("Origin and destination must differ");return;}
    setError("");setLoading(true);setResult(null);setFutureFlights([]);setFlyScores([]);setActiveTab("24h");
    try{
      const r=await fetch(`${API}/api/routes?origin=${o}&destination=${d}`);
      if(!r.ok){const e=await r.json();throw new Error(e.error||"API error");}
      const data=await r.json();
      setResult(data);
      if(data.globalStats) setBragging({
        flightsTracked:      data.globalStats.flightsTracked||0,
        cancellationsCaught: data.globalStats.cancellationsCaught||0,
        routesScanned:       data.globalStats.routesScanned||0,
      });
      if(data.debug) console.log(`[Debug] ${o}→${d}: ${data.debug.rawDepartures} dep / ${data.debug.rawArrivals} arr → ${data.debug.matched} matched`);
    }catch(e){setError(e.message);}
    finally{setLoading(false);}
  },[originInput,destInput]);

  const loadFuture=useCallback(async()=>{
    const o=originInput.trim().toUpperCase();
    const d=destInput.trim().toUpperCase();
    setFutureLoading(true);
    try{
      const r=await fetch(`${API}/api/future?origin=${o}&destination=${d}`);
      if(!r.ok)throw new Error("Future fetch failed");
      const data=await r.json();
      setFutureFlights(data.flights||[]);
      setFlyScores(data.flyScores||[]);
    }catch(e){console.error(e);}
    finally{setFutureLoading(false);}
  },[originInput,destInput]);

  const stats=result?.stats;
  const last24h=result?.last24h||[];
  const airlineStats=result?.airlineStats||[];
  const quickPairs=[["DXB","BOM"],["LHR","JFK"],["SIN","SYD"],["IST","CAI"],["DOH","DEL"],["TLV","AMM"]];

  return(
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,transition:"background 0.25s,color 0.25s"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;500;600;700&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes blink{50%{opacity:0}}
        @keyframes glow{0%,100%{box-shadow:0 0 8px #f9731622}50%{box-shadow:0 0 20px #f9731644}}
        .fade-in{animation:fadein 0.3s ease forwards}
        .pulse-dot{animation:pulse 2s infinite}
        .blink{animation:blink 1s step-end infinite}
        button{cursor:pointer;font-family:inherit}
        input{font-family:inherit}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-thumb{background:${T.scrollbar};border-radius:2px}
        @media(max-width:700px){
          .stats-flex{flex-wrap:wrap!important;gap:10px!important}
          .tab-label{display:none!important}
        }
      `}</style>

      {/* ── HEADER ── */}
      <header style={{borderBottom:`1px solid ${T.border}`,background:T.bgHeader,backdropFilter:"blur(16px)",position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:1200,margin:"0 auto",padding:"11px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:32,height:32,borderRadius:7,background:"linear-gradient(135deg,#f97316,#dc2626)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,animation:"glow 3s ease infinite"}}>✈</div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,letterSpacing:"-0.5px",color:T.text}}>ESCAPE<span style={{color:T.accent}}>ROUTE</span></div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <span style={{display:"flex",alignItems:"center",gap:5,color:T.textDim,fontSize:10,fontFamily:"'JetBrains Mono',monospace",whiteSpace:"nowrap"}}>
              <span className="pulse-dot" style={{width:5,height:5,borderRadius:"50%",background:"#4ade80",display:"inline-block",flexShrink:0}}/>
              {new Date().toUTCString().slice(5,22)} UTC
            </span>
            <button onClick={()=>setDarkMode(m=>!m)}
              title={darkMode?"Switch to light mode":"Switch to dark mode"}
              style={{background:T.bgCard,border:`1px solid ${T.border2}`,borderRadius:20,padding:"4px 10px",color:T.textSub,fontSize:13,display:"flex",alignItems:"center",gap:5,transition:"all 0.2s"}}>
              {darkMode?"☀️ Light":"🌙 Dark"}
            </button>
          </div>
        </div>
      </header>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"20px 14px 60px"}}>
        <div className="fade-in">

          {/* ── INTRO — clean 2 lines, no box, no icon ── */}
          <div style={{marginBottom:20,paddingBottom:18,borderBottom:`1px solid ${T.border}`}}>
            <p style={{margin:"0 0 4px",fontSize:13,color:T.textMuted,lineHeight:1.7}}>
              Real-time flight intelligence for any route — live departures, cancellation rates, airline reliability, and AI-assessed world events.
            </p>
            <p style={{margin:0,fontSize:12,color:T.textDim}}>
              Enter two airport codes below to check the last 24 hours of flights, or see what's scheduled next.
            </p>
          </div>

          {/* ── SEARCH PANEL ── */}
          <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12,padding:"16px 18px",marginBottom:16}}>
            <div style={{fontSize:9,color:T.textDim,letterSpacing:"3px",marginBottom:12,fontFamily:"'JetBrains Mono',monospace"}}>▸ ROUTE ANALYSIS</div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
              <AirportInput label="ORIGIN" value={originInput} onChange={setOriginInput} color={T.cyan} T={T}/>
              <div style={{fontSize:20,color:T.textDim2,paddingBottom:10,flexShrink:0}}>→</div>
              <AirportInput label="DESTINATION" value={destInput} onChange={setDestInput} color={T.green} T={T}/>
              <button onClick={handleSearch} disabled={loading}
                style={{background:loading?"#1e293b":"linear-gradient(135deg,#f97316,#dc2626)",border:"none",borderRadius:8,padding:"11px 22px",color:"#fff",fontSize:12,fontFamily:"'JetBrains Mono',monospace",fontWeight:"bold",letterSpacing:"2px",whiteSpace:"nowrap",alignSelf:"flex-end",opacity:loading?0.6:1}}>
                {loading?"SCANNING...":"CHECK FLIGHTS ▸"}
              </button>
            </div>
            {error&&<div style={{marginTop:10,color:"#f87171",fontSize:12,background:"#2d0f0f",padding:"8px 12px",borderRadius:6,border:"1px solid #7f1d1d"}}>⚠ {error}</div>}
            <div style={{marginTop:10,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{fontSize:9,color:T.textDim2,fontFamily:"'JetBrains Mono',monospace"}}>QUICK:</span>
              {quickPairs.map(([o,d])=>(
                <button key={`${o}-${d}`} onClick={()=>{setOriginInput(o);setDestInput(d);}}
                  style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:4,padding:"3px 9px",fontSize:10,color:T.textMuted,fontFamily:"'JetBrains Mono',monospace",transition:"all 0.15s"}}
                  onMouseEnter={e=>{e.target.style.borderColor=T.accent;e.target.style.color=T.accent}}
                  onMouseLeave={e=>{e.target.style.borderColor=T.border;e.target.style.color=T.textMuted}}>
                  {o}→{d}
                </button>
              ))}
            </div>
          </div>

          {/* ── LOADING ── */}
          {loading&&(
            <div style={{textAlign:"center",padding:"60px 20px"}}>
              <div style={{width:34,height:34,border:`3px solid ${T.spinBg}`,borderTop:"3px solid #f97316",borderRadius:"50%",margin:"0 auto 14px",animation:"spin 0.8s linear infinite"}}/>
              <div style={{fontSize:11,color:T.textDim,letterSpacing:"3px",fontFamily:"'JetBrains Mono',monospace"}}>FETCHING 24H DATA<span className="blink">_</span></div>
            </div>
          )}

          {/* ── RESULTS ── */}
          {!loading&&result&&(
            <div className="fade-in">
              <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12,padding:"14px 18px",marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
                  <div>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:20}}>
                      <span style={{color:T.cyan}}>{result.origin?.city}</span>
                      <span style={{color:T.textDim2,margin:"0 8px"}}>→</span>
                      <span style={{color:T.green}}>{result.destination?.city}</span>
                    </div>
                    <div style={{fontSize:9,color:T.textDim,marginTop:3,fontFamily:"'JetBrains Mono',monospace"}}>
                      {result.origin?.iata} → {result.destination?.iata} · 24H HISTORY
                      {result.debug&&<span style={{marginLeft:10,color:T.textDim}}>· {result.debug.rawDepartures} dep · {result.debug.rawArrivals} arr · {result.debug.matched} matched</span>}
                    </div>
                  </div>
                  <div className="stats-flex" style={{display:"flex",gap:14,flexWrap:"wrap"}}>
                    {[
                      {l:"SUCCESS",v:`${stats?.successRate||0}%`,c:stats?.successRate>=75?"#4ade80":stats?.successRate>=50?"#facc15":"#f87171"},
                      {l:"TOTAL",v:stats?.total||0,c:T.textSub},
                      {l:"LANDED",v:(stats?.landed||0)+(stats?.completed||0),c:"#4ade80"},
                      {l:"IN AIR",v:stats?.inAir||0,c:"#60a5fa"},
                      {l:"CANCEL",v:stats?.cancelled||0,c:"#f87171"},
                      {l:"DELAYED",v:stats?.delayed||0,c:"#fbbf24"},
                    ].map(s=>(
                      <div key={s.l} style={{textAlign:"center"}}>
                        <div style={{fontSize:8,color:T.textDim,letterSpacing:"2px",fontFamily:"'JetBrains Mono',monospace"}}>{s.l}</div>
                        <div style={{fontSize:18,fontWeight:"bold",color:s.c,fontFamily:"'JetBrains Mono',monospace"}}>{s.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div style={{display:"flex",gap:4,marginBottom:12,overflowX:"auto",paddingBottom:2}}>
                {[
                  {id:"24h",label:"Last 24h",count:last24h.length},
                  {id:"future",label:"Next 24h",count:futureFlights.length,future:true},
                  {id:"airlines",label:"Airlines"},
                ].map(tab=>(
                  <button key={tab.id}
                    onClick={()=>{setActiveTab(tab.id);if(tab.future&&futureFlights.length===0)loadFuture();}}
                    style={{background:activeTab===tab.id?T.bgHover:"transparent",border:`1px solid ${activeTab===tab.id?T.accent:T.border}`,borderRadius:7,padding:"7px 14px",color:activeTab===tab.id?T.accent:T.textMuted,fontSize:11,whiteSpace:"nowrap",transition:"all 0.2s",display:"flex",alignItems:"center",gap:6}}>
                    {tab.label}
                    {tab.count!==undefined&&<span style={{background:T.labelBg,color:T.labelText,fontSize:9,padding:"1px 5px",borderRadius:10,fontFamily:"'JetBrains Mono',monospace"}}>{tab.count}</span>}
                    {tab.future&&futureFlights.length===0&&<span style={{fontSize:9,color:T.textDim}}>tap to load</span>}
                  </button>
                ))}
              </div>

              {activeTab==="24h"&&(
                <div className="fade-in" style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
                  <div style={{padding:"9px 14px",borderBottom:`1px solid ${T.border}`,fontSize:9,color:T.textDim,letterSpacing:"3px",fontFamily:"'JetBrains Mono',monospace"}}>
                    ▸ LAST 24H · {last24h.length} FLIGHTS
                  </div>
                  <FlightTable flights={last24h} T={T}/>
                </div>
              )}

              {activeTab==="future"&&(
                <div className="fade-in" style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
                  <div style={{padding:"9px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:9,color:T.textDim,letterSpacing:"3px",fontFamily:"'JetBrains Mono',monospace"}}>▸ NEXT 24H · {futureFlights.length} SCHEDULED</span>
                    <button onClick={loadFuture} disabled={futureLoading}
                      style={{background:T.bgHover,border:`1px solid ${T.border2}`,borderRadius:5,padding:"3px 10px",color:T.accent,fontSize:10}}>
                      {futureLoading?"loading...":"↻ refresh"}
                    </button>
                  </div>
                  {futureLoading?(
                    <div style={{padding:30,textAlign:"center"}}>
                      <div style={{width:28,height:28,border:`2px solid ${T.spinBg}`,borderTop:"2px solid #f97316",borderRadius:"50%",margin:"0 auto 10px",animation:"spin 0.8s linear infinite"}}/>
                      <div style={{fontSize:10,color:T.textDim}}>Fetching upcoming flights...</div>
                    </div>
                  ):(
                    <>
                      <FutureFlightTable flights={futureFlights} flyScores={flyScores} T={T}/>
                      <div style={{padding:"10px 14px",borderTop:`1px solid ${T.border}`,fontSize:10,color:T.textDim2}}>
                        Scheduled flights from AeroDataBox · next 24h
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab==="airlines"&&(
                <div className="fade-in" style={{display:"grid",gap:10}}>
                  {airlineStats.length===0?(
                    <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12,padding:40,textAlign:"center",color:T.textDim}}>No airline data.</div>
                  ):airlineStats.map((a,i)=>(
                    <div key={a.name} style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12,padding:"14px 16px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
                        <div>
                          <div style={{fontWeight:600,fontSize:14,display:"flex",alignItems:"center",gap:8,color:T.text}}>
                            {a.name}
                            {i===0&&<span style={{fontSize:9,color:"#facc15",fontFamily:"'JetBrains Mono',monospace"}}>★ TOP</span>}
                          </div>
                          <div style={{fontSize:11,color:T.textDim,marginTop:3}}>
                            {a.landed} landed · {a.inAir} airborne · {a.cancelled} cancelled · {a.delayed} delayed · {a.total} total
                          </div>
                        </div>
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:8,color:T.textDim,letterSpacing:"2px",fontFamily:"'JetBrains Mono',monospace"}}>SUCCESS</div>
                          <div style={{fontSize:24,fontWeight:"bold",color:a.rate>=75?"#4ade80":a.rate>=50?"#facc15":"#f87171",fontFamily:"'JetBrains Mono',monospace"}}>{a.rate}%</div>
                        </div>
                      </div>
                      <div style={{background:T.bg,borderRadius:3,height:4,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${a.rate}%`,background:a.rate>=75?"#4ade80":a.rate>=50?"#facc15":"#f87171",borderRadius:3,transition:"width 0.8s ease"}}/>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── EMPTY STATE ── */}
          {!loading&&!result&&(
            <div style={{textAlign:"center",padding:"60px 20px"}}>
              <div style={{fontSize:50,marginBottom:12,opacity:0.15}}>✈</div>
              <div style={{fontSize:11,letterSpacing:"4px",color:T.textDim2,fontFamily:"'JetBrains Mono',monospace"}}>ENTER A ROUTE TO BEGIN</div>
            </div>
          )}

          {/* ── WORLD EVENTS ── */}
          <div style={{marginTop:24}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:T.text}}>WORLD EVENT FEED</div>
                <div style={{fontSize:9,color:T.textDim,marginTop:2,fontFamily:"'JetBrains Mono',monospace"}}>LIVE NEWS · AI-ASSESSED · AVIATION IMPACT</div>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                {["S1","S2","S3","S4","S5"].map(s=>{
                  const sv=SEVERITY[s];
                  const count=events.filter(e=>e.severity===s).length;
                  if(count===0)return null;
                  return(
                    <div key={s} style={{display:"flex",alignItems:"center",gap:3}}>
                      <span style={{background:sv.bg,color:sv.color,border:`1px solid ${sv.border}`,fontSize:9,padding:"1px 5px",borderRadius:3,fontFamily:"'JetBrains Mono',monospace",fontWeight:"bold"}}>{s}</span>
                      <span style={{color:T.textDim,fontSize:10}}>{count}</span>
                    </div>
                  );
                })}
                <button onClick={loadEvents} disabled={eventsLoading}
                  style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:6,padding:"4px 10px",color:T.textMuted,fontSize:10,transition:"all 0.15s"}}
                  onMouseEnter={e=>{e.currentTarget.style.color=T.accent;e.currentTarget.style.borderColor=T.accent}}
                  onMouseLeave={e=>{e.currentTarget.style.color=T.textMuted;e.currentTarget.style.borderColor=T.border}}>
                  {eventsLoading?"loading...":"↻ refresh"}
                </button>
              </div>
            </div>

            {eventsLoading&&(
              <div style={{textAlign:"center",padding:"30px 20px"}}>
                <div style={{width:28,height:28,border:`3px solid ${T.spinBg}`,borderTop:"3px solid #f97316",borderRadius:"50%",margin:"0 auto 10px",animation:"spin 0.8s linear infinite"}}/>
                <div style={{fontSize:10,color:T.textDim,letterSpacing:"2px",fontFamily:"'JetBrains Mono',monospace"}}>AI ANALYSING LIVE NEWS<span className="blink">_</span></div>
              </div>
            )}

            {!eventsLoading&&events.length>0&&(()=>{
              const sorted=[
                ...events.filter(e=>["S4","S5"].includes(e.severity)),
                ...events.filter(e=>e.severity==="S3"),
                ...events.filter(e=>["S1","S2"].includes(e.severity)),
              ];
              const visible=eventsExpanded?sorted:sorted.slice(0,3);
              return(
                <>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10,marginBottom:10}}>
                    {visible.map(ev=>(
                      <EventCard key={ev.id} event={ev} expanded={expandedEvent===ev.id} onToggle={()=>setExpandedEvent(expandedEvent===ev.id?null:ev.id)}/>
                    ))}
                  </div>
                  {sorted.length>3&&(
                    <button onClick={()=>setEventsExpanded(x=>!x)}
                      style={{width:"100%",background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px",color:T.textMuted,fontSize:11,fontFamily:"'JetBrains Mono',monospace",letterSpacing:"1px",transition:"all 0.15s"}}
                      onMouseEnter={e=>{e.currentTarget.style.borderColor=T.accent;e.currentTarget.style.color=T.accent}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.textMuted}}>
                      {eventsExpanded?`▲ SHOW LESS`:`▼ VIEW ${sorted.length-3} MORE EVENTS`}
                    </button>
                  )}
                </>
              );
            })()}

            {!eventsLoading&&events.length===0&&(
              <div style={{textAlign:"center",padding:"30px 20px",background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12}}>
                <div style={{fontSize:24,marginBottom:8}}>🌍</div>
                <button onClick={loadEvents} style={{background:"transparent",border:`1px solid ${T.accent}`,borderRadius:7,padding:"6px 16px",color:T.accent,fontSize:11}}>LOAD EVENTS</button>
              </div>
            )}
          </div>

          {/* ── FOOTER STATS — scrolls with page, no fixed bar ── */}
          {bragging.flightsTracked>0&&(
            <div style={{marginTop:52,paddingTop:28,borderTop:`1px solid ${T.border}`}}>
              <div style={{display:"flex",gap:48,justifyContent:"center",flexWrap:"wrap"}}>
                {[
                  {value:bragging.flightsTracked.toLocaleString(),label:"flights tracked"},
                  {value:bragging.cancellationsCaught.toLocaleString(),label:"cancellations caught"},
                  {value:bragging.routesScanned.toLocaleString(),label:"routes scanned"},
                ].map(s=>(
                  <div key={s.label} style={{textAlign:"center"}}>
                    <div style={{
                      fontSize:28,fontWeight:800,
                      fontFamily:"'Syne',sans-serif",
                      color:T.text,
                      letterSpacing:"-1px",
                      lineHeight:1,
                    }}>{s.value}</div>
                    <div style={{fontSize:11,color:T.textDim,marginTop:6}}>{s.label}</div>
                  </div>
                ))}
              </div>
              <p style={{textAlign:"center",marginTop:16,fontSize:11,color:T.textDim2,margin:"16px 0 0"}}>
                Data sourced from global aviation feeds · refreshes every few minutes
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
