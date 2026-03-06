import { useState } from "react";
import { Link } from "react-router-dom";
import "./Demo.css";

/* ── shared colours ── */
const C = {
  purple:"#8b5cf6", teal:"#1fbfb8", blue:"#3b82f6",
  green:"#34d399", yellow:"#fbbf24", red:"#f87171", pink:"#f472b6",
};

/* ── mock data ── */
const DEPT_DATA    = { Engineering:14, Marketing:8, Finance:7, "Human Resources":6, Operations:5, Sales:5 };
const OBJ_STATUS   = { active:5, in_progress:4, completed:2, at_risk:1 };
const STATUS_COLORS= { active:C.purple, in_progress:C.blue, completed:C.green, at_risk:C.yellow };

const MOCK_EMPLOYEES = [
  { name:"Alice Nkosi",    dept:"Engineering",     role:"Senior Developer",   status:"active",   joined:"Jan 2022" },
  { name:"Brian Dlamini",  dept:"Marketing",       role:"Brand Manager",      status:"active",   joined:"Mar 2021" },
  { name:"Claire Moyo",    dept:"Finance",         role:"Accountant",         status:"active",   joined:"Jul 2023" },
  { name:"David Zulu",     dept:"Engineering",     role:"QA Engineer",        status:"active",   joined:"Feb 2022" },
  { name:"Evelyn Phiri",   dept:"HR",              role:"HR Coordinator",     status:"on_leave", joined:"Nov 2020" },
  { name:"Frank Banda",    dept:"Sales",           role:"Account Executive",  status:"active",   joined:"Jun 2023" },
  { name:"Grace Osei",     dept:"Operations",      role:"Ops Analyst",        status:"active",   joined:"Apr 2022" },
  { name:"Henry Mensah",   dept:"Engineering",     role:"Backend Developer",  status:"active",   joined:"Sep 2021" },
];

const MOCK_ANNOUNCEMENTS = [
  { title:"Office Closure — March 15",     body:"The office will be closed for the public holiday. Remote work available.", date:"Mar 4", tag:"Operations", reads:32 },
  { title:"New Leave Policy Update",        body:"Updated leave policy effective April 1. Please review the changes in the Knowledge Base.", date:"Mar 2", tag:"HR", reads:27 },
  { title:"Wellness Challenge Launch",      body:"Join the 30-day wellness challenge! Sign up through the Guided Paths section.", date:"Feb 28", tag:"Wellbeing", reads:41 },
  { title:"Q1 All-Hands — Save the Date",  body:"Our Q1 all-hands meeting is scheduled for March 14 at 10am.", date:"Feb 22", tag:"Leadership", reads:45 },
];

const MOCK_KB = [
  { title:"Leave & Absence Policy",      category:"HR Policies", size:"124 KB", date:"Feb 2025", views:18 },
  { title:"Expense Claims Process",      category:"Finance",     size:"88 KB",  date:"Jan 2025", views:12 },
  { title:"Remote Work Guidelines",      category:"HR Policies", size:"96 KB",  date:"Jan 2025", views:22 },
  { title:"IT Security Policy",          category:"IT",          size:"145 KB", date:"Dec 2024", views:9  },
  { title:"Performance Review Process",  category:"HR Policies", size:"210 KB", date:"Nov 2024", views:31 },
  { title:"Employee Benefits Overview",  category:"Benefits",    size:"176 KB", date:"Oct 2024", views:27 },
];

const MOCK_GUIDED_PATHS = [
  { title:"Onboarding — Week 1",  enrolled:12, completed:8,  category:"Onboarding"  },
  { title:"Mental Health First Aid",enrolled:20,completed:15, category:"Wellbeing"   },
  { title:"Leadership Essentials", enrolled:7,  completed:3,  category:"Leadership"  },
  { title:"Data Privacy & GDPR",   enrolled:45, completed:38, category:"Compliance"  },
];

const MOCK_LEAVE = [
  { name:"Evelyn Phiri",  type:"Annual Leave",  start:"Mar 10", end:"Mar 21", days:10, status:"approved" },
  { name:"Alice Nkosi",   type:"Sick Leave",    start:"Mar 5",  end:"Mar 5",  days:1,  status:"approved" },
  { name:"Frank Banda",   type:"Annual Leave",  start:"Apr 14", end:"Apr 18", days:5,  status:"pending"  },
  { name:"Grace Osei",    type:"Study Leave",   start:"Apr 7",  end:"Apr 8",  days:2,  status:"pending"  },
];

const MOCK_TIMESHEETS = [
  { name:"Alice Nkosi",   dept:"Engineering", hours:38, status:"approved"  },
  { name:"Brian Dlamini", dept:"Marketing",   hours:42, status:"approved"  },
  { name:"Claire Moyo",   dept:"Finance",     hours:35, status:"submitted" },
  { name:"David Zulu",    dept:"Engineering", hours:40, status:"approved"  },
  { name:"Evelyn Phiri",  dept:"HR",          hours:0,  status:"draft"     },
  { name:"Frank Banda",   dept:"Sales",       hours:37, status:"submitted" },
];

const MOCK_USAGE = [
  { module:"Chat",            users:38, total:45, sessions:212 },
  { module:"Meetings",        users:30, total:45, sessions:95  },
  { module:"Documents",       users:22, total:45, sessions:67  },
  { module:"Guided Paths",    users:20, total:45, sessions:58  },
  { module:"Objectives",      users:35, total:45, sessions:148 },
  { module:"Timesheets",      users:41, total:45, sessions:205 },
  { module:"Announcements",   users:43, total:45, sessions:189 },
];

const MOCK_MANAGERS = [
  { name:"Sarah Kariuki",   team:"Engineering", reports:6, sessions:8  },
  { name:"John Mwangi",     team:"Marketing",   reports:4, sessions:5  },
  { name:"Fatima Al-Hassan",team:"Finance",     reports:3, sessions:4  },
  { name:"Kwame Asante",    team:"Sales",       reports:5, sessions:6  },
];

const MOCK_WELLBEING = [
  { name:"Alice Nkosi",   score:82, trend:"up",   flag:false },
  { name:"Brian Dlamini", score:74, trend:"stable",flag:false },
  { name:"Claire Moyo",   score:61, trend:"down",  flag:true  },
  { name:"David Zulu",    score:88, trend:"up",   flag:false },
  { name:"Evelyn Phiri",  score:55, trend:"down",  flag:true  },
  { name:"Frank Banda",   score:79, trend:"stable",flag:false },
];

const MOCK_PAYROLL = [
  { name:"Alice Nkosi",   dept:"Engineering", gross:"$8,200", net:"$6,560", status:"processed" },
  { name:"Brian Dlamini", dept:"Marketing",   gross:"$6,800", net:"$5,440", status:"processed" },
  { name:"Claire Moyo",   dept:"Finance",     gross:"$7,100", net:"$5,680", status:"pending"   },
  { name:"David Zulu",    dept:"Engineering", gross:"$6,500", net:"$5,200", status:"processed" },
  { name:"Evelyn Phiri",  dept:"HR",          gross:"$5,900", net:"$4,720", status:"pending"   },
];

const MOCK_EVENTS = [
  { title:"Q1 All-Hands",        date:"Mar 14", time:"10:00 AM", color:C.purple  },
  { title:"Wellness Workshop",   date:"Mar 10", time:"11:00 AM", color:C.green   },
  { title:"Payroll Deadline",    date:"Mar 28", time:"5:00 PM",  color:C.red     },
  { title:"HR Strategy Meeting", date:"Apr 1",  time:"9:00 AM",  color:C.blue    },
];

const MOCK_ORGCONFIG = [
  { key:"Organisation Name",   value:"Rafiki Technologies Ltd" },
  { key:"Industry",            value:"Technology / HR Software" },
  { key:"Employee Count",      value:"45" },
  { key:"Timezone",            value:"Africa/Nairobi (EAT)" },
  { key:"Fiscal Year Start",   value:"January" },
  { key:"Language",            value:"English" },
  { key:"Leave Year Reset",    value:"January 1" },
  { key:"Working Days",        value:"Monday – Friday" },
];

/* ── helpers ── */
function Badge({ status }) {
  const MAP = {
    active:    { bg:"rgba(52,211,153,.15)",  color:C.green,  label:"Active"     },
    on_leave:  { bg:"rgba(251,191,36,.15)",  color:C.yellow, label:"On Leave"   },
    approved:  { bg:"rgba(52,211,153,.15)",  color:C.green,  label:"Approved"   },
    pending:   { bg:"rgba(251,191,36,.15)",  color:C.yellow, label:"Pending"    },
    submitted: { bg:"rgba(59,130,246,.15)",  color:C.blue,   label:"Submitted"  },
    draft:     { bg:"rgba(148,163,184,.12)", color:"#94a3b8",label:"Draft"      },
    processed: { bg:"rgba(52,211,153,.15)",  color:C.green,  label:"Processed"  },
  };
  const m = MAP[status] || MAP.draft;
  return <span style={{ background:m.bg, color:m.color, borderRadius:999, padding:"2px 9px", fontSize:11, fontWeight:700 }}>{m.label}</span>;
}

function Avatar({ name, size=28 }) {
  const initials = name.split(" ").map(n=>n[0]).join("").slice(0,2);
  return (
    <div style={{ width:size, height:size, borderRadius:8, background:"linear-gradient(135deg,#8b5cf6,#1fbfb8)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:size*0.38, flexShrink:0 }}>
      {initials}
    </div>
  );
}

function BarChart({ data, color }) {
  const max = Math.max(...Object.values(data), 1);
  return Object.entries(data).sort((a,b)=>b[1]-a[1]).map(([label, value]) => (
    <div className="demo-bar-row" key={label}>
      <span className="demo-bar-label" title={label}>{label}</span>
      <div className="demo-bar-track"><div className="demo-bar-fill" style={{ width:`${(value/max)*100}%`, background:color }} /></div>
      <span className="demo-bar-value">{value}</span>
    </div>
  ));
}

function SegmentedBar({ data, colorMap }) {
  const total = Object.values(data).reduce((s,v)=>s+v,0)||1;
  return (
    <>
      <div className="demo-seg">
        {Object.entries(data).map(([k,v]) => (
          <div key={k} className="demo-seg-part" style={{ width:`${(v/total)*100}%`, background:colorMap[k]||"#94a3b8" }} />
        ))}
      </div>
      <div className="demo-seg-legend">
        {Object.entries(data).map(([k,v]) => (
          <span key={k} className="demo-seg-item">
            <span className="demo-seg-dot" style={{ background:colorMap[k]||"#94a3b8" }} />{k} ({v})
          </span>
        ))}
      </div>
    </>
  );
}

/* ══════════════════════════ TAB VIEWS ══════════════════════════ */

function DashboardTab() {
  return (
    <>
      <div className="demo-greeting"><h1>HR Portal Dashboard</h1><div className="demo-greeting-meta">Organisation overview and quick analytics.</div></div>
      <div className="demo-stats">
        {[{v:"45",label:"Total Employees",color:C.purple},{v:"12",label:"Active Objectives",color:C.blue},{v:"320",label:"Hours Logged (30d)",color:C.green},{v:"8",label:"KB Documents",color:C.yellow},{v:"3",label:"Announcements",color:C.red}]
          .map(s => (
            <div key={s.label} className="demo-stat" style={{"--stat-color":s.color}}>
              <div className="demo-stat-value">{s.v}</div><div className="demo-stat-label">{s.label}</div>
            </div>
          ))}
      </div>
      <div className="demo-body">
        <div className="demo-card"><div className="demo-card-title">Employees by Department</div><BarChart data={DEPT_DATA} color={C.purple} /></div>
        <div className="demo-card"><div className="demo-card-title">Objectives by Status</div><SegmentedBar data={OBJ_STATUS} colorMap={STATUS_COLORS} /></div>
      </div>
      <div className="demo-links">
        {[
          {title:"Knowledge Base",desc:"Upload and manage organisation documents."},
          {title:"Announcements",desc:"Broadcast updates and track read receipts."},
          {title:"Employees",desc:"Manage employee profiles and records."},
          {title:"Guided Paths",desc:"Create guided wellbeing modules."},
          {title:"Org Config",desc:"Configure organisation context."},
          {title:"Managers",desc:"Assign manager roles and access."},
        ].map(l => <div key={l.title} className="demo-link demo-link--clickable"><strong>{l.title}</strong><p>{l.desc}</p></div>)}
      </div>
    </>
  );
}

function UsageReportTab() {
  return (
    <>
      <div className="demo-greeting"><h1>Usage Report</h1><div className="demo-greeting-meta">Platform engagement across all modules — last 30 days.</div></div>
      <div className="demo-stats">
        {[{v:"45",label:"Total Users",color:C.purple},{v:"974",label:"Total Sessions",color:C.blue},{v:"86%",label:"Avg Adoption",color:C.green},{v:"22",label:"Active Today",color:C.teal}]
          .map(s=><div key={s.label} className="demo-stat" style={{"--stat-color":s.color}}><div className="demo-stat-value">{s.v}</div><div className="demo-stat-label">{s.label}</div></div>)}
      </div>
      <div className="demo-card">
        <div className="demo-card-title">Module Adoption</div>
        {MOCK_USAGE.map(m => (
          <div key={m.module} style={{ marginBottom:14 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}>
              <span style={{ fontWeight:600 }}>{m.module}</span>
              <span style={{ color:"#94a3b8" }}>{m.users}/{m.total} users · {m.sessions} sessions</span>
            </div>
            <div style={{ height:8, background:"rgba(255,255,255,0.07)", borderRadius:99, overflow:"hidden" }}>
              <div style={{ width:`${(m.users/m.total)*100}%`, height:"100%", background:`linear-gradient(90deg,${C.purple},${C.teal})`, borderRadius:99 }} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function KnowledgeBaseTab() {
  const [search, setSearch] = useState("");
  const filtered = MOCK_KB.filter(d => d.title.toLowerCase().includes(search.toLowerCase()) || d.category.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <div className="demo-greeting"><h1>Knowledge Base</h1><div className="demo-greeting-meta">Manage and publish organisational documents.</div></div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, gap:12 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search documents…"
          style={{ flex:1, padding:"9px 14px", borderRadius:10, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.05)", color:"#e4e4e7", fontSize:13, outline:"none" }} />
        <button style={{ padding:"9px 18px", borderRadius:10, background:`linear-gradient(135deg,${C.purple},${C.teal})`, border:"none", color:"#fff", fontWeight:700, fontSize:12, cursor:"pointer", flexShrink:0 }}>+ Upload</button>
      </div>
      <div className="demo-card" style={{ padding:0, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead><tr style={{ background:"rgba(255,255,255,0.03)" }}>
            {["Document","Category","Size","Date","Views",""].map(h=><th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:11, fontWeight:700, color:"#71717a", textTransform:"uppercase", letterSpacing:".5px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {filtered.map(d => (
              <tr key={d.title}>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", fontWeight:600 }}>📄 {d.title}</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}><span style={{ background:"rgba(139,92,246,.12)", color:"#a78bfa", borderRadius:999, padding:"2px 8px", fontSize:11, fontWeight:600 }}>{d.category}</span></td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", color:"#94a3b8" }}>{d.size}</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", color:"#94a3b8" }}>{d.date}</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", color:"#94a3b8" }}>{d.views}</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                  <button style={{ padding:"4px 10px", borderRadius:6, border:"1px solid rgba(255,255,255,0.1)", background:"transparent", color:"#94a3b8", fontSize:11, cursor:"pointer" }}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AnnouncementsTab() {
  const TAG_C = { HR:C.purple, Operations:C.blue, Wellbeing:C.green, Leadership:C.red };
  return (
    <>
      <div className="demo-greeting"><h1>Announcements</h1><div className="demo-greeting-meta">Broadcast updates and track employee read receipts.</div></div>
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:16 }}>
        <button style={{ padding:"9px 18px", borderRadius:10, background:`linear-gradient(135deg,${C.purple},${C.teal})`, border:"none", color:"#fff", fontWeight:700, fontSize:12, cursor:"pointer" }}>+ New Announcement</button>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {MOCK_ANNOUNCEMENTS.map(a => (
          <div key={a.title} className="demo-card">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, marginBottom:6 }}>
              <div style={{ fontWeight:700, fontSize:14 }}>{a.title}</div>
              <span style={{ background:`${TAG_C[a.tag]||"#71717a"}22`, color:TAG_C[a.tag]||"#71717a", borderRadius:999, padding:"2px 9px", fontSize:11, fontWeight:600, flexShrink:0 }}>{a.tag}</span>
            </div>
            <div style={{ fontSize:13, color:"#94a3b8", marginBottom:8 }}>{a.body}</div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#71717a" }}>
              <span>{a.date}</span>
              <span>👁 {a.reads} reads</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function EmployeesTab() {
  const [search, setSearch] = useState("");
  const filtered = MOCK_EMPLOYEES.filter(e => e.name.toLowerCase().includes(search.toLowerCase()) || e.dept.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <div className="demo-greeting"><h1>Employees</h1><div className="demo-greeting-meta">Manage employee profiles and records.</div></div>
      <div style={{ display:"flex", justifyContent:"space-between", gap:12, marginBottom:16 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search employees…"
          style={{ flex:1, padding:"9px 14px", borderRadius:10, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.05)", color:"#e4e4e7", fontSize:13, outline:"none" }} />
        <button style={{ padding:"9px 18px", borderRadius:10, background:`linear-gradient(135deg,${C.purple},${C.teal})`, border:"none", color:"#fff", fontWeight:700, fontSize:12, cursor:"pointer", flexShrink:0 }}>+ Add Employee</button>
      </div>
      <div className="demo-card" style={{ padding:0, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead><tr style={{ background:"rgba(255,255,255,0.03)" }}>
            {["Employee","Department","Role","Joined","Status"].map(h=><th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:11, fontWeight:700, color:"#71717a", textTransform:"uppercase", letterSpacing:".5px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {filtered.map(e => (
              <tr key={e.name}>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <Avatar name={e.name} />
                    <span style={{ fontWeight:600 }}>{e.name}</span>
                  </div>
                </td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", color:"#94a3b8" }}>{e.dept}</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>{e.role}</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", color:"#94a3b8" }}>{e.joined}</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}><Badge status={e.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function GuidedPathsTab() {
  return (
    <>
      <div className="demo-greeting"><h1>Guided Paths</h1><div className="demo-greeting-meta">Create and manage guided learning and wellbeing modules.</div></div>
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:16 }}>
        <button style={{ padding:"9px 18px", borderRadius:10, background:`linear-gradient(135deg,${C.purple},${C.teal})`, border:"none", color:"#fff", fontWeight:700, fontSize:12, cursor:"pointer" }}>+ New Path</button>
      </div>
      <div style={{ display:"grid", gap:14 }}>
        {MOCK_GUIDED_PATHS.map(p => {
          const pct = Math.round((p.completed/p.enrolled)*100);
          return (
            <div key={p.title} className="demo-card">
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:14, marginBottom:3 }}>{p.title}</div>
                  <span style={{ background:"rgba(139,92,246,.12)", color:"#a78bfa", borderRadius:999, padding:"2px 8px", fontSize:11, fontWeight:600 }}>{p.category}</span>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:20, fontWeight:800, color:C.purple }}>{pct}%</div>
                  <div style={{ fontSize:11, color:"#71717a" }}>completion</div>
                </div>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#94a3b8", marginBottom:6 }}>
                <span>{p.enrolled} enrolled</span><span>{p.completed} completed</span>
              </div>
              <div style={{ height:6, background:"rgba(255,255,255,0.07)", borderRadius:99, overflow:"hidden" }}>
                <div style={{ width:`${pct}%`, height:"100%", background:`linear-gradient(90deg,${C.purple},${C.teal})`, borderRadius:99 }} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function OrgConfigTab() {
  return (
    <>
      <div className="demo-greeting"><h1>Org Config</h1><div className="demo-greeting-meta">Configure your organisation's settings and context.</div></div>
      <div className="demo-card" style={{ marginBottom:16 }}>
        <div className="demo-card-title">Organisation Details</div>
        {MOCK_ORGCONFIG.map(item => (
          <div key={item.key} style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid rgba(255,255,255,0.06)", fontSize:13 }}>
            <span style={{ color:"#94a3b8", fontWeight:600 }}>{item.key}</span>
            <span style={{ fontWeight:700 }}>{item.value}</span>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
        <button style={{ padding:"9px 18px", borderRadius:10, border:"1px solid rgba(255,255,255,0.1)", background:"transparent", color:"#94a3b8", fontSize:13, cursor:"pointer" }}>Cancel</button>
        <button style={{ padding:"9px 18px", borderRadius:10, background:`linear-gradient(135deg,${C.purple},${C.teal})`, border:"none", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer" }}>Save Changes</button>
      </div>
    </>
  );
}

function ManagersTab() {
  return (
    <>
      <div className="demo-greeting"><h1>Managers</h1><div className="demo-greeting-meta">Manage manager roles, teams, and coaching sessions.</div></div>
      <div style={{ display:"grid", gap:12 }}>
        {MOCK_MANAGERS.map(m => (
          <div key={m.name} className="demo-card" style={{ display:"flex", alignItems:"center", gap:14 }}>
            <Avatar name={m.name} size={40} />
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:14, marginBottom:2 }}>{m.name}</div>
              <div style={{ fontSize:12, color:"#94a3b8" }}>Team: {m.team}</div>
            </div>
            <div style={{ textAlign:"center", padding:"0 16px" }}>
              <div style={{ fontSize:20, fontWeight:800, color:C.blue }}>{m.reports}</div>
              <div style={{ fontSize:11, color:"#71717a" }}>Direct Reports</div>
            </div>
            <div style={{ textAlign:"center", padding:"0 16px" }}>
              <div style={{ fontSize:20, fontWeight:800, color:C.green }}>{m.sessions}</div>
              <div style={{ fontSize:11, color:"#71717a" }}>Coaching Sessions</div>
            </div>
            <button style={{ padding:"6px 14px", borderRadius:8, border:"1px solid rgba(139,92,246,.3)", background:"rgba(139,92,246,.08)", color:"#a78bfa", fontSize:12, fontWeight:600, cursor:"pointer" }}>View Team</button>
          </div>
        ))}
      </div>
    </>
  );
}

function PayrollTab() {
  const total = MOCK_PAYROLL.reduce((s,e) => s + parseFloat(e.gross.replace(/[$,]/g,"")), 0);
  return (
    <>
      <div className="demo-greeting"><h1>Payroll</h1><div className="demo-greeting-meta">Payroll processing for March 2025.</div></div>
      <div className="demo-stats" style={{ marginBottom:16 }}>
        {[{v:`$${(total/1000).toFixed(0)}k`,label:"Total Gross",color:C.purple},{v:MOCK_PAYROLL.filter(e=>e.status==="processed").length,label:"Processed",color:C.green},{v:MOCK_PAYROLL.filter(e=>e.status==="pending").length,label:"Pending",color:C.yellow},{v:MOCK_PAYROLL.length,label:"Employees",color:C.blue}]
          .map(s=><div key={s.label} className="demo-stat" style={{"--stat-color":s.color}}><div className="demo-stat-value">{s.v}</div><div className="demo-stat-label">{s.label}</div></div>)}
      </div>
      <div className="demo-card" style={{ padding:0, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead><tr style={{ background:"rgba(255,255,255,0.03)" }}>
            {["Employee","Department","Gross","Net","Status"].map(h=><th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:11, fontWeight:700, color:"#71717a", textTransform:"uppercase", letterSpacing:".5px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {MOCK_PAYROLL.map(e => (
              <tr key={e.name}>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}><div style={{ display:"flex", alignItems:"center", gap:8 }}><Avatar name={e.name} /><span style={{ fontWeight:600 }}>{e.name}</span></div></td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", color:"#94a3b8" }}>{e.dept}</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", fontWeight:700 }}>{e.gross}</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", color:"#94a3b8" }}>{e.net}</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}><Badge status={e.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function LeaveManagementTab() {
  return (
    <>
      <div className="demo-greeting"><h1>Leave Management</h1><div className="demo-greeting-meta">Review and approve employee leave requests.</div></div>
      <div className="demo-stats" style={{ marginBottom:16 }}>
        {[{v:MOCK_LEAVE.filter(l=>l.status==="pending").length,label:"Pending Approval",color:C.yellow},{v:MOCK_LEAVE.filter(l=>l.status==="approved").length,label:"Approved",color:C.green},{v:MOCK_LEAVE.reduce((s,l)=>s+l.days,0),label:"Total Days",color:C.blue},{v:1,label:"On Leave Now",color:C.purple}]
          .map(s=><div key={s.label} className="demo-stat" style={{"--stat-color":s.color}}><div className="demo-stat-value">{s.v}</div><div className="demo-stat-label">{s.label}</div></div>)}
      </div>
      <div className="demo-card" style={{ padding:0, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead><tr style={{ background:"rgba(255,255,255,0.03)" }}>
            {["Employee","Type","Start","End","Days","Status","Actions"].map(h=><th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:11, fontWeight:700, color:"#71717a", textTransform:"uppercase", letterSpacing:".5px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {MOCK_LEAVE.map(l => (
              <tr key={l.name+l.start}>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", fontWeight:600 }}>{l.name}</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>{l.type}</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", color:"#94a3b8" }}>{l.start}</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", color:"#94a3b8" }}>{l.end}</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", fontWeight:700 }}>{l.days}</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}><Badge status={l.status} /></td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                  {l.status==="pending" && (
                    <div style={{ display:"flex", gap:6 }}>
                      <button style={{ padding:"3px 10px", borderRadius:6, background:"rgba(52,211,153,.15)", color:C.green, border:"none", fontSize:11, fontWeight:700, cursor:"pointer" }}>✓</button>
                      <button style={{ padding:"3px 10px", borderRadius:6, background:"rgba(248,113,113,.12)", color:C.red, border:"none", fontSize:11, fontWeight:700, cursor:"pointer" }}>✗</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function WellbeingTab() {
  return (
    <>
      <div className="demo-greeting"><h1>Wellbeing</h1><div className="demo-greeting-meta">Monitor team wellbeing scores and flag at-risk employees.</div></div>
      <div className="demo-stats" style={{ marginBottom:16 }}>
        {[{v:"74",label:"Avg Score",color:C.green},{v:MOCK_WELLBEING.filter(e=>e.flag).length,label:"Flagged",color:C.red},{v:MOCK_WELLBEING.filter(e=>e.trend==="up").length,label:"Improving",color:C.teal},{v:MOCK_WELLBEING.length,label:"Tracked",color:C.blue}]
          .map(s=><div key={s.label} className="demo-stat" style={{"--stat-color":s.color}}><div className="demo-stat-value">{s.v}</div><div className="demo-stat-label">{s.label}</div></div>)}
      </div>
      <div style={{ display:"grid", gap:10 }}>
        {MOCK_WELLBEING.map(e => (
          <div key={e.name} className="demo-card" style={{ display:"flex", alignItems:"center", gap:14 }}>
            <Avatar name={e.name} size={36} />
            <div style={{ flex:1 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ fontWeight:700, fontSize:13 }}>{e.name}</span>
                <span style={{ fontSize:13, fontWeight:800, color: e.score>=75?C.green:e.score>=60?C.yellow:C.red }}>{e.score}</span>
              </div>
              <div style={{ height:6, background:"rgba(255,255,255,0.07)", borderRadius:99, overflow:"hidden" }}>
                <div style={{ width:`${e.score}%`, height:"100%", background: e.score>=75?C.green:e.score>=60?C.yellow:C.red, borderRadius:99 }} />
              </div>
            </div>
            <span style={{ fontSize:13 }}>{e.trend==="up"?"↑":e.trend==="down"?"↓":"→"}</span>
            {e.flag && <span style={{ background:"rgba(248,113,113,.15)", color:C.red, borderRadius:999, padding:"2px 9px", fontSize:11, fontWeight:700 }}>⚠ At Risk</span>}
          </div>
        ))}
      </div>
    </>
  );
}

function CalendarTab() {
  const today = new Date();
  const year = today.getFullYear(), month = today.getMonth();
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const firstDow = new Date(year,month,1).getDay();
  const daysInMonth = new Date(year,month+1,0).getDate();
  const cells = [];
  for(let i=0;i<firstDow;i++) cells.push(null);
  for(let i=1;i<=daysInMonth;i++) cells.push(i);
  while(cells.length%7!==0) cells.push(null);
  const eventDays = {14:[C.purple],10:[C.green],28:[C.red]};
  return (
    <>
      <div className="demo-greeting"><h1>Calendar</h1><div className="demo-greeting-meta">{monthNames[month]} {year}</div></div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
        <div className="demo-card">
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, textAlign:"center", fontSize:12 }}>
            {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d=><div key={d} style={{ padding:"6px 0", fontWeight:700, color:"#71717a", fontSize:11 }}>{d}</div>)}
            {cells.map((day,i)=>(
              <div key={i} style={{ padding:"8px 4px", borderRadius:8, textAlign:"center", fontSize:13, position:"relative",
                background: day===today.getDate()?"linear-gradient(135deg,#8b5cf6,#1fbfb8)":"transparent",
                color: !day?"rgba(255,255,255,0.15)":day===today.getDate()?"#fff":"#e4e4e7", fontWeight:day===today.getDate()?700:400 }}>
                {day||""}
                {day&&eventDays[day]&&<div style={{ display:"flex", justifyContent:"center", gap:2, marginTop:2 }}>{eventDays[day].map((c,j)=><span key={j} style={{ width:4,height:4,borderRadius:99,background:c,display:"inline-block" }}/>)}</div>}
              </div>
            ))}
          </div>
        </div>
        <div className="demo-card">
          <div className="demo-card-title">Upcoming Events</div>
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
      <div className="demo-greeting"><h1>Timesheets</h1><div className="demo-greeting-meta">Review and approve org-wide timesheet submissions — Mar 3–9, 2025.</div></div>
      <div className="demo-stats" style={{ marginBottom:16 }}>
        {[{v:MOCK_TIMESHEETS.reduce((s,e)=>s+e.hours,0)+"h",label:"Total Hours",color:C.purple},{v:MOCK_TIMESHEETS.length,label:"Employees",color:C.blue},{v:MOCK_TIMESHEETS.filter(e=>e.status==="submitted").length,label:"Awaiting Approval",color:C.yellow},{v:MOCK_TIMESHEETS.filter(e=>e.status==="approved").length,label:"Approved",color:C.green}]
          .map(s=><div key={s.label} className="demo-stat" style={{"--stat-color":s.color}}><div className="demo-stat-value">{s.v}</div><div className="demo-stat-label">{s.label}</div></div>)}
      </div>
      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        {["all","submitted","approved","draft"].map(s=>(
          <button key={s} onClick={()=>setFilter(s)} style={{ padding:"5px 14px", borderRadius:999, border:"1px solid rgba(255,255,255,0.1)", background: filter===s?`linear-gradient(135deg,${C.purple},${C.teal})`:"rgba(255,255,255,0.04)", color: filter===s?"#fff":"#94a3b8", fontSize:12, fontWeight:600, cursor:"pointer" }}>
            {s==="all"?"All":s.charAt(0).toUpperCase()+s.slice(1)}
          </button>
        ))}
      </div>
      <div className="demo-card" style={{ padding:0, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead><tr style={{ background:"rgba(255,255,255,0.03)" }}>
            {["Employee","Department","Hours","Status","Actions"].map(h=><th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:11, fontWeight:700, color:"#71717a", textTransform:"uppercase", letterSpacing:".5px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {filtered.map(e=>(
              <tr key={e.name}>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}><div style={{ display:"flex", alignItems:"center", gap:8 }}><Avatar name={e.name}/><span style={{ fontWeight:600 }}>{e.name}</span></div></td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", color:"#94a3b8" }}>{e.dept}</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", fontWeight:700 }}>{e.hours}h</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}><Badge status={e.status}/></td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                  {e.status==="submitted"&&<div style={{ display:"flex", gap:6 }}>
                    <button style={{ padding:"3px 10px", borderRadius:6, background:"rgba(52,211,153,.15)", color:C.green, border:"none", fontSize:11, fontWeight:700, cursor:"pointer" }}>✓</button>
                    <button style={{ padding:"3px 10px", borderRadius:6, background:"rgba(248,113,113,.12)", color:C.red, border:"none", fontSize:11, fontWeight:700, cursor:"pointer" }}>✗</button>
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
const HR_TABS = [
  { label:"Dashboard",       component:DashboardTab       },
  { label:"Usage Report",    component:UsageReportTab     },
  { label:"Knowledge Base",  component:KnowledgeBaseTab   },
  { label:"Announcements",   component:AnnouncementsTab   },
  { label:"Employees",       component:EmployeesTab       },
  { label:"Guided Paths",    component:GuidedPathsTab     },
  { label:"Org Config",      component:OrgConfigTab       },
  { label:"Managers",        component:ManagersTab        },
  { label:"Payroll",         component:PayrollTab         },
  { label:"Leave Management",component:LeaveManagementTab },
  { label:"Wellbeing",       component:WellbeingTab       },
  { label:"Calendar",        component:CalendarTab        },
  { label:"Timesheets",      component:TimesheetsTab      },
];

export default function DemoHRPage() {
  const [activeTab, setActiveTab] = useState(0);
  const ActiveComponent = HR_TABS[activeTab].component;
  return (
    <div className="demo-hr">
      <div className="demo-banner">
        <div className="demo-banner__label"><span className="demo-banner__dot"/>Demo Mode — HR Admin Portal</div>
        <Link to="/" className="demo-banner__exit">Exit Demo</Link>
      </div>
      <div className="demo-hr-body">
        <aside className="demo-hr-sidebar">
          <div className="demo-hr-brand">
            <div className="demo-hr-brand-dot"/>
            <div><div className="demo-hr-brand-title">Rafiki</div><div className="demo-hr-brand-sub">HR Portal</div></div>
          </div>
          <nav className="demo-hr-nav">
            {HR_TABS.map((t,i)=>(
              <span key={t.label} className={`demo-hr-nav-link${activeTab===i?" active":""}`} style={{ cursor:"pointer" }} onClick={()=>setActiveTab(i)}>{t.label}</span>
            ))}
          </nav>
          <div className="demo-hr-nav-footer">
            <Link to="/demo/manager" className="demo-hr-footer-link">Manager Portal</Link>
            <Link to="/demo/employee" className="demo-hr-footer-link">Employee Portal</Link>
          </div>
        </aside>
        <div className="demo-hr-content"><ActiveComponent /></div>
      </div>
    </div>
  );
}
