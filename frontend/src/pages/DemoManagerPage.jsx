import { useState } from "react";
import { Link } from "react-router-dom";
import "./Demo.css";

const C = {
  purple:"#8b5cf6", teal:"#1fbfb8", blue:"#3b82f6",
  green:"#34d399", yellow:"#fbbf24", red:"#f87171",
};

/* ── mock data ── */
const MOCK_TEAM = [
  { name:"Alice Nkosi",    role:"Senior Developer",  rating:4.5, objectives:3, sentiment:"positive", lastReview:"Dec 2024" },
  { name:"Brian Dlamini",  role:"Brand Manager",     rating:4.2, objectives:2, sentiment:"positive", lastReview:"Dec 2024" },
  { name:"Claire Moyo",    role:"Accountant",        rating:3.8, objectives:4, sentiment:"neutral",  lastReview:"Nov 2024" },
  { name:"David Zulu",     role:"QA Engineer",       rating:4.0, objectives:2, sentiment:"positive", lastReview:"Dec 2024" },
  { name:"Evelyn Phiri",   role:"HR Coordinator",    rating:3.5, objectives:3, sentiment:"at_risk",  lastReview:"Oct 2024" },
  { name:"Frank Banda",    role:"Account Executive", rating:4.7, objectives:2, sentiment:"positive", lastReview:"Dec 2024" },
];

const MOCK_COACHING = [
  { employee:"Alice Nkosi",   concern:"Work-life balance",          outcome:"positive", date:"Mar 4",  notes:"Discussed flexible hours; action plan agreed." },
  { employee:"Brian Dlamini", concern:"Career development",          outcome:"positive", date:"Mar 2",  notes:"Identified leadership training opportunity."   },
  { employee:"Claire Moyo",   concern:"Skill gap — data analysis",   outcome:"pending",  date:"Feb 28", notes:"Recommended external course; follow-up due."   },
  { employee:"Evelyn Phiri",  concern:"Workload & stress",           outcome:"pending",  date:"Feb 24", notes:"Referred to wellbeing support; monitoring."     },
];

const MOCK_TOOLKIT = [
  { title:"Performance Review Template",    category:"Templates",  desc:"Structured template for quarterly performance conversations." },
  { title:"Difficult Conversation Guide",   category:"Playbooks",  desc:"Step-by-step guide for managing challenging discussions."    },
  { title:"Goal Setting Framework (OKRs)",  category:"Frameworks", desc:"How to write effective objectives and key results."          },
  { title:"Onboarding Checklist",           category:"Templates",  desc:"30-60-90 day checklist for new team member onboarding."      },
  { title:"Conflict Resolution Playbook",   category:"Playbooks",  desc:"Structured approach to mediating team conflicts."            },
  { title:"Recognition & Reward Guide",     category:"Guides",     desc:"Best practices for recognising employee achievements."       },
];

const MOCK_EVENTS = [
  { title:"Team Stand-up",        date:"Mar 7",  time:"9:00 AM",  color:C.blue   },
  { title:"1:1 Alice Nkosi",      date:"Mar 8",  time:"2:00 PM",  color:C.purple },
  { title:"1:1 Claire Moyo",      date:"Mar 10", time:"3:00 PM",  color:C.purple },
  { title:"Sprint Review",        date:"Mar 12", time:"3:30 PM",  color:C.yellow },
  { title:"Q1 Performance Reviews",date:"Mar 20",time:"9:00 AM",  color:C.green  },
];

const MOCK_TIMESHEETS = [
  { name:"Alice Nkosi",   hours:38, status:"approved"  },
  { name:"Brian Dlamini", hours:42, status:"approved"  },
  { name:"Claire Moyo",   hours:35, status:"submitted" },
  { name:"David Zulu",    hours:40, status:"approved"  },
  { name:"Evelyn Phiri",  hours:0,  status:"draft"     },
  { name:"Frank Banda",   hours:37, status:"submitted" },
];

const OUTCOME_COLORS = { positive:C.green, pending:C.yellow, negative:C.red };
const SENTIMENT_C    = { positive:C.green, neutral:C.yellow, at_risk:C.red };

function Badge({ status }) {
  const MAP = {
    approved:  { bg:"rgba(52,211,153,.15)",  color:C.green,  label:"Approved"  },
    submitted: { bg:"rgba(59,130,246,.15)",  color:C.blue,   label:"Submitted" },
    draft:     { bg:"rgba(148,163,184,.12)", color:"#94a3b8",label:"Draft"     },
    positive:  { bg:"rgba(52,211,153,.15)",  color:C.green,  label:"Positive"  },
    neutral:   { bg:"rgba(251,191,36,.15)",  color:C.yellow, label:"Neutral"   },
    at_risk:   { bg:"rgba(248,113,113,.12)", color:C.red,    label:"At Risk"   },
    pending:   { bg:"rgba(251,191,36,.15)",  color:C.yellow, label:"Pending"   },
  };
  const m = MAP[status] || MAP.draft;
  return <span style={{ background:m.bg, color:m.color, borderRadius:999, padding:"2px 9px", fontSize:11, fontWeight:700 }}>{m.label}</span>;
}

function Avatar({ name, size=30 }) {
  const initials = name.split(" ").map(n=>n[0]).join("").slice(0,2);
  return (
    <div style={{ width:size, height:size, borderRadius:8, background:"linear-gradient(135deg,#3b82f6,#8b5cf6)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:size*0.38, flexShrink:0 }}>
      {initials}
    </div>
  );
}

/* ══════════════════════════ TABS ══════════════════════════ */

function DashboardTab() {
  return (
    <>
      <div className="demo-greeting"><h1>Manager Dashboard</h1><div className="demo-greeting-meta">Performance overview and coaching tools for your team.</div></div>
      <div className="demo-stats">
        {[{v:"6",label:"Team Members",color:C.blue},{v:"4.3",label:"Avg Rating",color:C.purple},{v:"4",label:"Coaching Sessions",color:C.green},{v:"3",label:"Upcoming Deadlines",color:C.yellow}]
          .map(s=><div key={s.label} className="demo-stat" style={{"--stat-color":s.color}}><div className="demo-stat-value">{s.v}</div><div className="demo-stat-label">{s.label}</div></div>)}
      </div>
      <div className="demo-mgr-actions">
        {[{title:"My Team",desc:"View team performance and manage direct reports."},{title:"AI Coaching",desc:"Get AI-powered coaching suggestions for your team."},{title:"HR Toolkit",desc:"Access HR templates, policies and toolkits."}]
          .map(a=><div key={a.title} className="demo-mgr-action-card"><strong>{a.title}</strong><p>{a.desc}</p></div>)}
      </div>
      <div className="demo-card" style={{ marginTop:20 }}>
        <div className="demo-card-title">Team Timesheet Status</div>
        <table className="demo-mgr-table">
          <thead><tr><th>Employee</th><th>Hours This Week</th><th>Status</th></tr></thead>
          <tbody>
            {MOCK_TIMESHEETS.map(t=>(
              <tr key={t.name}>
                <td>{t.name}</td><td>{t.hours}h</td>
                <td><span className={`demo-mgr-badge ${t.status==="approved"?"yes":"no"}`}>{t.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="demo-card" style={{ marginTop:16 }}>
        <div className="demo-card-title">Recent Coaching Sessions</div>
        {MOCK_COACHING.slice(0,3).map(c=>(
          <div key={c.employee+c.date} className="demo-mgr-coaching-row">
            <div className="demo-mgr-coaching-info">
              <span className="demo-mgr-coaching-name">{c.employee}</span>
              <span className="demo-mgr-coaching-concern">{c.concern}</span>
            </div>
            <span className="demo-mgr-coaching-outcome" style={{ color:OUTCOME_COLORS[c.outcome] }}>{c.outcome}</span>
            <span className="demo-mgr-coaching-date">{c.date}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function MyTeamTab() {
  const [selected, setSelected] = useState(null);
  return (
    <>
      <div className="demo-greeting"><h1>My Team</h1><div className="demo-greeting-meta">View and manage your 6 direct reports.</div></div>
      <div style={{ display:"grid", gap:12 }}>
        {MOCK_TEAM.map(m=>(
          <div key={m.name} className="demo-card" style={{ display:"flex", alignItems:"center", gap:14, cursor:"pointer" }} onClick={()=>setSelected(selected?.name===m.name?null:m)}>
            <Avatar name={m.name} size={42} />
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:14, marginBottom:2 }}>{m.name}</div>
              <div style={{ fontSize:12, color:"#94a3b8" }}>{m.role}</div>
            </div>
            <div style={{ textAlign:"center", padding:"0 12px" }}>
              <div style={{ fontSize:20, fontWeight:800, color:C.blue }}>{m.rating}</div>
              <div style={{ fontSize:11, color:"#71717a" }}>Rating</div>
            </div>
            <div style={{ textAlign:"center", padding:"0 12px" }}>
              <div style={{ fontSize:20, fontWeight:800, color:C.purple }}>{m.objectives}</div>
              <div style={{ fontSize:11, color:"#71717a" }}>Objectives</div>
            </div>
            <Badge status={m.sentiment} />
          </div>
        ))}
      </div>
      {selected && (
        <div style={{ marginTop:16 }} className="demo-card">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ fontWeight:700, fontSize:15 }}>{selected.name} — Profile</div>
            <button onClick={()=>setSelected(null)} style={{ background:"rgba(255,255,255,0.06)", border:"none", borderRadius:6, padding:"4px 10px", color:"#94a3b8", cursor:"pointer", fontSize:12 }}>✕ Close</button>
          </div>
          {[["Role",selected.role],["Last Review",selected.lastReview],["Rating",selected.rating],["Active Objectives",selected.objectives],["Sentiment",selected.sentiment]].map(([k,v])=>(
            <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid rgba(255,255,255,0.06)", fontSize:13 }}>
              <span style={{ color:"#94a3b8" }}>{k}</span><span style={{ fontWeight:600 }}>{String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function CoachingTab() {
  const [chat, setChat] = useState([{ role:"assistant", text:"Hi! I'm Rafiki's coaching assistant. Select a team member below or ask me anything about managing your team." }]);
  const [input, setInput] = useState("");
  const [employee, setEmployee] = useState("");
  const REPLIES = [
    "Based on the data for your team member, I'd recommend starting with a strengths-based conversation to build rapport before discussing areas for growth.",
    "For performance concerns, the SBI model (Situation–Behavior–Impact) is highly effective. Would you like me to draft a coaching script?",
    "Regular 1:1s with a structured agenda show measurable improvement in engagement scores. I can suggest an agenda template.",
    "I've analysed your team's wellbeing data and identified two employees who may benefit from proactive check-ins this week.",
  ];
  const send = () => {
    if (!input.trim()) return;
    const reply = { role:"assistant", text:REPLIES[chat.length%REPLIES.length] };
    setChat(c=>[...c, {role:"user",text:input}, reply]);
    setInput("");
  };
  return (
    <>
      <div className="demo-greeting"><h1>Coaching Assistant</h1><div className="demo-greeting-meta">AI-powered coaching guidance for your team.</div></div>
      <div className="demo-card" style={{ marginBottom:16 }}>
        <div className="demo-card-title">Recent Sessions</div>
        {MOCK_COACHING.map(c=>(
          <div key={c.employee+c.date} className="demo-mgr-coaching-row">
            <div className="demo-mgr-coaching-info">
              <span className="demo-mgr-coaching-name">{c.employee}</span>
              <span className="demo-mgr-coaching-concern">{c.concern}</span>
            </div>
            <span style={{ fontSize:12, color:"#94a3b8", flex:1, marginLeft:12 }}>{c.notes}</span>
            <span className="demo-mgr-coaching-outcome" style={{ color:OUTCOME_COLORS[c.outcome] }}>{c.outcome}</span>
            <span className="demo-mgr-coaching-date">{c.date}</span>
          </div>
        ))}
      </div>
      <div className="demo-card">
        <div className="demo-card-title">AI Coaching Chat</div>
        <select value={employee} onChange={e=>setEmployee(e.target.value)} style={{ width:"100%", padding:"8px 12px", borderRadius:8, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.05)", color:"#e4e4e7", fontSize:13, marginBottom:12, outline:"none" }}>
          <option value="">Select team member…</option>
          {MOCK_TEAM.map(m=><option key={m.name} value={m.name}>{m.name}</option>)}
        </select>
        <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:12, maxHeight:260, overflowY:"auto" }}>
          {chat.map((m,i)=>(
            <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
              <div style={{ maxWidth:"78%", padding:"9px 13px", borderRadius:m.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px", background:m.role==="user"?"linear-gradient(135deg,#3b82f6,#8b5cf6)":"rgba(255,255,255,0.06)", border:m.role==="assistant"?"1px solid rgba(255,255,255,0.08)":"none", color:"#e4e4e7", fontSize:13, lineHeight:1.55 }}>{m.text}</div>
            </div>
          ))}
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Ask for coaching guidance…"
            style={{ flex:1, padding:"9px 13px", borderRadius:9, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.05)", color:"#e4e4e7", fontSize:13, outline:"none" }} />
          <button onClick={send} style={{ padding:"9px 18px", borderRadius:9, background:`linear-gradient(135deg,${C.blue},${C.purple})`, border:"none", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer" }}>Send</button>
        </div>
      </div>
    </>
  );
}

function HRToolkitTab() {
  const cats = ["All", ...new Set(MOCK_TOOLKIT.map(t=>t.category))];
  const [filter, setFilter] = useState("All");
  const filtered = filter==="All" ? MOCK_TOOLKIT : MOCK_TOOLKIT.filter(t=>t.category===filter);
  const CAT_C = { Templates:C.blue, Playbooks:C.purple, Frameworks:C.teal, Guides:C.green };
  return (
    <>
      <div className="demo-greeting"><h1>HR Toolkit</h1><div className="demo-greeting-meta">Templates, playbooks and frameworks for effective management.</div></div>
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        {cats.map(c=>(
          <button key={c} onClick={()=>setFilter(c)} style={{ padding:"5px 14px", borderRadius:999, border:"1px solid rgba(255,255,255,0.1)", background:filter===c?`linear-gradient(135deg,${C.blue},${C.purple})`:"rgba(255,255,255,0.04)", color:filter===c?"#fff":"#94a3b8", fontSize:12, fontWeight:600, cursor:"pointer" }}>{c}</button>
        ))}
      </div>
      <div style={{ display:"grid", gap:12 }}>
        {filtered.map(t=>(
          <div key={t.title} className="demo-card" style={{ display:"flex", alignItems:"center", gap:14, cursor:"pointer" }}>
            <div style={{ width:40, height:40, borderRadius:10, background:`${CAT_C[t.category]||C.blue}22`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>
              {t.category==="Templates"?"📄":t.category==="Playbooks"?"📖":t.category==="Frameworks"?"🧩":"📌"}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:3 }}>{t.title}</div>
              <div style={{ fontSize:12, color:"#94a3b8" }}>{t.desc}</div>
            </div>
            <span style={{ background:`${CAT_C[t.category]||C.blue}22`, color:CAT_C[t.category]||C.blue, borderRadius:999, padding:"2px 10px", fontSize:11, fontWeight:600, flexShrink:0 }}>{t.category}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function CalendarTab() {
  const today = new Date();
  const year=today.getFullYear(), month=today.getMonth();
  const monthNames=["January","February","March","April","May","June","July","August","September","October","November","December"];
  const firstDow=new Date(year,month,1).getDay(), daysInMonth=new Date(year,month+1,0).getDate();
  const cells=[];
  for(let i=0;i<firstDow;i++) cells.push(null);
  for(let i=1;i<=daysInMonth;i++) cells.push(i);
  while(cells.length%7!==0) cells.push(null);
  const eventDays={7:[C.blue],8:[C.purple],10:[C.purple],12:[C.yellow],20:[C.green]};
  return (
    <>
      <div className="demo-greeting"><h1>Calendar</h1><div className="demo-greeting-meta">{monthNames[month]} {year} — Team schedule overview.</div></div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
        <div className="demo-card">
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, textAlign:"center", fontSize:12 }}>
            {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d=><div key={d} style={{ padding:"6px 0", fontWeight:700, color:"#71717a", fontSize:11 }}>{d}</div>)}
            {cells.map((day,i)=>(
              <div key={i} style={{ padding:"8px 4px", borderRadius:8, textAlign:"center", fontSize:13, background:day===today.getDate()?"linear-gradient(135deg,#3b82f6,#8b5cf6)":"transparent", color:!day?"rgba(255,255,255,0.15)":day===today.getDate()?"#fff":"#e4e4e7", fontWeight:day===today.getDate()?700:400 }}>
                {day||""}
                {day&&eventDays[day]&&<div style={{ display:"flex", justifyContent:"center", gap:2, marginTop:2 }}>{eventDays[day].map((c,j)=><span key={j} style={{ width:4,height:4,borderRadius:99,background:c,display:"inline-block" }}/>)}</div>}
              </div>
            ))}
          </div>
        </div>
        <div className="demo-card">
          <div className="demo-card-title">Upcoming</div>
          {MOCK_EVENTS.map(e=>(
            <div key={e.title} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ width:36,height:36,borderRadius:8,background:`${e.color}22`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                <span style={{ width:10,height:10,borderRadius:99,background:e.color,display:"block" }}/>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:13 }}>{e.title}</div>
                <div style={{ fontSize:11, color:"#71717a" }}>{e.date} · {e.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function TimesheetsTab() {
  const [filter, setFilter] = useState("all");
  const filtered = filter==="all" ? MOCK_TIMESHEETS : MOCK_TIMESHEETS.filter(e=>e.status===filter);
  return (
    <>
      <div className="demo-greeting"><h1>Team Timesheets</h1><div className="demo-greeting-meta">Review and approve your team's submissions — Mar 3–9, 2025.</div></div>
      <div className="demo-stats" style={{ marginBottom:16 }}>
        {[{v:MOCK_TIMESHEETS.reduce((s,e)=>s+e.hours,0)+"h",label:"Total Hours",color:C.blue},{v:MOCK_TIMESHEETS.filter(e=>e.status==="submitted").length,label:"Awaiting Approval",color:C.yellow},{v:MOCK_TIMESHEETS.filter(e=>e.status==="approved").length,label:"Approved",color:C.green},{v:MOCK_TIMESHEETS.length,label:"Team Members",color:C.purple}]
          .map(s=><div key={s.label} className="demo-stat" style={{"--stat-color":s.color}}><div className="demo-stat-value">{s.v}</div><div className="demo-stat-label">{s.label}</div></div>)}
      </div>
      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        {["all","submitted","approved","draft"].map(s=>(
          <button key={s} onClick={()=>setFilter(s)} style={{ padding:"5px 14px", borderRadius:999, border:"1px solid rgba(255,255,255,0.1)", background:filter===s?`linear-gradient(135deg,${C.blue},${C.purple})`:"rgba(255,255,255,0.04)", color:filter===s?"#fff":"#94a3b8", fontSize:12, fontWeight:600, cursor:"pointer" }}>
            {s==="all"?"All":s.charAt(0).toUpperCase()+s.slice(1)}
          </button>
        ))}
      </div>
      <div className="demo-card" style={{ padding:0, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead><tr style={{ background:"rgba(255,255,255,0.03)" }}>
            {["Employee","Hours","Status","Actions"].map(h=><th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:11, fontWeight:700, color:"#71717a", textTransform:"uppercase", letterSpacing:".5px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {filtered.map(e=>(
              <tr key={e.name}>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}><Avatar name={e.name}/><span style={{ fontWeight:600 }}>{e.name}</span></div>
                </td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", fontWeight:700 }}>{e.hours}h</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}><Badge status={e.status}/></td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                  {e.status==="submitted"&&<div style={{ display:"flex", gap:6 }}>
                    <button style={{ padding:"3px 10px", borderRadius:6, background:"rgba(52,211,153,.15)", color:C.green, border:"none", fontSize:11, fontWeight:700, cursor:"pointer" }}>✓ Approve</button>
                    <button style={{ padding:"3px 10px", borderRadius:6, background:"rgba(248,113,113,.12)", color:C.red, border:"none", fontSize:11, fontWeight:700, cursor:"pointer" }}>✗ Reject</button>
                  </div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ══════════════════════════ ROOT ══════════════════════════ */
const MGR_TABS = [
  { label:"Dashboard",    component:DashboardTab  },
  { label:"My Team",      component:MyTeamTab     },
  { label:"Coaching",     component:CoachingTab   },
  { label:"HR Toolkit",   component:HRToolkitTab  },
  { label:"Calendar",     component:CalendarTab   },
  { label:"Timesheets",   component:TimesheetsTab },
];

export default function DemoManagerPage() {
  const [activeTab, setActiveTab] = useState(0);
  const ActiveComponent = MGR_TABS[activeTab].component;
  return (
    <div className="demo-mgr">
      <div className="demo-banner">
        <div className="demo-banner__label"><span className="demo-banner__dot"/>Demo Mode — Manager Portal</div>
        <Link to="/" className="demo-banner__exit">Exit Demo</Link>
      </div>
      <div className="demo-mgr-body">
        <aside className="demo-mgr-sidebar">
          <div className="demo-mgr-brand">
            <div className="demo-mgr-brand-dot"/>
            <div><div className="demo-mgr-brand-title">Rafiki</div><div className="demo-mgr-brand-sub">Manager Portal</div></div>
          </div>
          <nav className="demo-mgr-nav">
            {MGR_TABS.map((t,i)=>(
              <span key={t.label} className={`demo-mgr-nav-link${activeTab===i?" active":""}`} style={{ cursor:"pointer" }} onClick={()=>setActiveTab(i)}>{t.label}</span>
            ))}
          </nav>
          <div className="demo-mgr-nav-footer">
            <Link to="/demo/employee" className="demo-mgr-footer-link">Employee Portal</Link>
            <Link to="/demo/hr" className="demo-mgr-footer-link">HR Portal</Link>
          </div>
        </aside>
        <div className="demo-mgr-content"><ActiveComponent /></div>
      </div>
    </div>
  );
}
