import { useState } from "react";
import { Link } from "react-router-dom";
import "./Demo.css";

/* ── mock data ── */
const MOCK_OBJECTIVES = [
  { title: "Complete Q1 performance review", progress: 75, status: "on_track", due: "Mar 31" },
  { title: "Finish onboarding checklist",    progress: 100, status: "completed", due: "Mar 1"  },
  { title: "Submit project proposal",        progress: 40, status: "at_risk",   due: "Mar 20" },
  { title: "Complete compliance training",   progress: 60, status: "on_track",  due: "Apr 5"  },
];

const MOCK_EVENTS = [
  { title: "Team Stand-up",       date: "Mar 7",  time: "9:00 AM",  color: "#8b5cf6", type: "Meeting"   },
  { title: "1:1 with Manager",    date: "Mar 8",  time: "2:00 PM",  color: "#3b82f6", type: "1-on-1"    },
  { title: "Wellness Workshop",   date: "Mar 10", time: "11:00 AM", color: "#34d399", type: "Wellbeing" },
  { title: "Sprint Review",       date: "Mar 12", time: "3:30 PM",  color: "#fbbf24", type: "Meeting"   },
  { title: "Company Town Hall",   date: "Mar 14", time: "10:00 AM", color: "#f87171", type: "All-Hands" },
  { title: "Quarterly Planning",  date: "Mar 18", time: "9:00 AM",  color: "#a78bfa", type: "Strategy"  },
];

const MOCK_ANNOUNCEMENTS = [
  { title: "Office Closure — March 15",    body: "The office will be closed for the public holiday. Remote work available.", date: "Mar 4",  tag: "Operations" },
  { title: "New Leave Policy Update",      body: "Updated leave policy effective April 1. Please review the changes in the Knowledge Base.", date: "Mar 2",  tag: "HR"         },
  { title: "Wellness Challenge Launch",    body: "Join the 30-day wellness challenge! Sign up through the Guided Paths section.", date: "Feb 28", tag: "Wellbeing"  },
  { title: "IT System Maintenance",        body: "Scheduled maintenance on Sunday March 16, 12am–4am. Email access may be intermittent.", date: "Feb 26", tag: "IT"         },
  { title: "Q1 All-Hands — Save the Date", body: "Our Q1 all-hands meeting is scheduled for March 14 at 10am. Agenda to follow.", date: "Feb 22", tag: "Leadership" },
];

const MOCK_DOCUMENTS = [
  { name: "Employment Contract",       type: "PDF",  size: "245 KB", date: "Jan 15, 2025", category: "HR"       },
  { name: "Q4 2024 Payslip",           type: "PDF",  size: "112 KB", date: "Jan 31, 2025", category: "Payroll"  },
  { name: "Performance Review 2024",   type: "DOCX", size: "88 KB",  date: "Dec 12, 2024", category: "HR"       },
  { name: "Project Scope — AI Portal", type: "PDF",  size: "320 KB", date: "Feb 3, 2025",  category: "Projects" },
  { name: "Onboarding Checklist",      type: "PDF",  size: "56 KB",  date: "Nov 1, 2024",  category: "HR"       },
  { name: "Q1 2025 Payslip",           type: "PDF",  size: "115 KB", date: "Feb 28, 2025", category: "Payroll"  },
];

const MOCK_KB = [
  { title: "Leave & Absence Policy",       category: "HR Policies",   excerpt: "Full details on annual leave, sick leave, parental leave and unpaid leave entitlements.", date: "Feb 2025" },
  { title: "Expense Claims Process",       category: "Finance",       excerpt: "How to submit, approve and track business expense claims through the finance portal.", date: "Jan 2025" },
  { title: "Remote Work Guidelines",       category: "HR Policies",   excerpt: "Expectations, tools and security guidelines for employees working remotely.", date: "Jan 2025" },
  { title: "IT Security Policy",           category: "IT",            excerpt: "Password requirements, device usage rules and data protection obligations.", date: "Dec 2024" },
  { title: "Performance Review Process",   category: "HR Policies",   excerpt: "Timeline, scoring rubric and guidance for completing the annual performance review.", date: "Nov 2024" },
  { title: "Employee Benefits Overview",   category: "Benefits",      excerpt: "Health insurance, pension, wellness allowance and other employee benefits explained.", date: "Oct 2024" },
];

const MOCK_TIMESHEETS = [
  { date: "Mar 3", activity: "AI Project",        category: "Development",  hours: 4.0, status: "approved"  },
  { date: "Mar 3", activity: "Team Stand-up",     category: "Meetings",     hours: 0.5, status: "approved"  },
  { date: "Mar 4", activity: "AI Project",        category: "Development",  hours: 6.0, status: "submitted" },
  { date: "Mar 4", activity: "Strategy Planning", category: "Meetings",     hours: 1.5, status: "submitted" },
  { date: "Mar 5", activity: "Client Meeting",    category: "Meetings",     hours: 2.0, status: "draft"     },
  { date: "Mar 5", activity: "Documentation",     category: "Documentation",hours: 2.5, status: "draft"     },
];

const MOCK_MEETINGS = [
  { title: "1:1 with Sarah K.",    date: "Mar 8, 2:00 PM",  type: "1-on-1",    status: "upcoming", with: "Sarah K. (Manager)"     },
  { title: "Sprint Planning",      date: "Mar 10, 9:00 AM", type: "Team",      status: "upcoming", with: "Engineering Team"        },
  { title: "Wellness Check-in",    date: "Mar 10, 11:00 AM",type: "Wellbeing", status: "upcoming", with: "HR Team"                 },
  { title: "Q1 Review",            date: "Feb 28, 2:00 PM", type: "Review",    status: "completed",with: "Sarah K. (Manager)",rating: 4 },
  { title: "Project Kick-off",     date: "Feb 24, 10:00 AM",type: "Team",      status: "completed",with: "Cross-functional Team",  rating: 5 },
];

const MOCK_LEAVE = [
  { type: "Annual Leave",   start: "Apr 14", end: "Apr 18", days: 5, status: "approved"  },
  { type: "Sick Leave",     start: "Feb 3",  end: "Feb 3",  days: 1, status: "approved"  },
  { type: "Annual Leave",   start: "Dec 23", end: "Dec 31", days: 7, status: "approved"  },
];
const LEAVE_BALANCE = [
  { type: "Annual Leave",   used: 6,  total: 21, color: "#8b5cf6" },
  { type: "Sick Leave",     used: 1,  total: 10, color: "#f87171" },
  { type: "Study Leave",    used: 0,  total: 5,  color: "#3b82f6" },
  { type: "Compassionate",  used: 0,  total: 3,  color: "#fbbf24" },
];

const MOCK_CHAT = [
  { role: "assistant", text: "Hi! I'm Rafiki, your workplace AI companion. How can I help you today?" },
  { role: "user",      text: "How many days of annual leave do I have left?"                          },
  { role: "assistant", text: "Based on your records, you've used 6 of your 21 annual leave days this year. You have 15 days remaining. Would you like to apply for leave?"  },
  { role: "user",      text: "Yes, I'd like to take a week off in April"                              },
  { role: "assistant", text: "I can help with that! Your team's leave calendar shows April 14–18 is clear. Shall I prepare a leave application for those dates?" },
];

const CAL_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function greetingText() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function MiniCalendar() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push({ day: daysInPrev - firstDow + 1 + i, outside: true });
  for (let i = 1; i <= daysInMonth; i++) cells.push({ day: i, outside: false });
  const remaining = 7 - (cells.length % 7);
  if (remaining < 7) for (let i = 1; i <= remaining; i++) cells.push({ day: i, outside: true });
  return (
    <div className="demo-cal">
      <div className="demo-cal-header"><span>{monthNames[month].slice(0,3)} {year}</span></div>
      <div className="demo-cal-grid">
        {CAL_DAYS.map(d => <div key={d} className="demo-cal-dh">{d}</div>)}
        {cells.map((c, i) => (
          <div key={i} className={`demo-cal-day${c.outside?" out":""}${!c.outside&&c.day===today.getDate()?" today":""}`}>{c.day}</div>
        ))}
      </div>
    </div>
  );
}

const STATUS_BADGE = {
  on_track:  { bg: "rgba(52,211,153,.15)",  color: "#34d399", label: "On Track"  },
  completed: { bg: "rgba(139,92,246,.15)",  color: "#a78bfa", label: "Completed" },
  at_risk:   { bg: "rgba(251,191,36,.15)",  color: "#fbbf24", label: "At Risk"   },
  upcoming:  { bg: "rgba(59,130,246,.15)",  color: "#3b82f6", label: "Upcoming"  },
  approved:  { bg: "rgba(52,211,153,.15)",  color: "#34d399", label: "Approved"  },
  submitted: { bg: "rgba(59,130,246,.15)",  color: "#3b82f6", label: "Submitted" },
  draft:     { bg: "rgba(148,163,184,.12)", color: "#94a3b8", label: "Draft"     },
  pending:   { bg: "rgba(251,191,36,.15)",  color: "#fbbf24", label: "Pending"   },
};

function Badge({ status }) {
  const m = STATUS_BADGE[status] || STATUS_BADGE.draft;
  return (
    <span style={{ background: m.bg, color: m.color, borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 700 }}>
      {m.label}
    </span>
  );
}

/* ══════════════════════════════════════════
   TAB VIEWS
══════════════════════════════════════════ */

function HomeTab() {
  const today = new Date().toLocaleDateString(undefined, { weekday:"long", month:"long", day:"numeric", year:"numeric" });
  return (
    <>
      <div className="demo-greeting">
        <h1>{greetingText()}, Demo Employee</h1>
        <div className="demo-greeting-meta"><span>{today}</span></div>
      </div>
      <div className="demo-stats">
        {[
          { value: "3",   label: "My Objectives",    color: "#8b5cf6" },
          { value: "8.5", label: "Hours This Week",  color: "#3b82f6" },
          { value: "5",   label: "Upcoming Events",  color: "#34d399" },
          { value: "1",   label: "Unread Messages",  color: "#f87171" },
        ].map(s => (
          <div key={s.label} className="demo-stat" style={{ "--stat-color": s.color }}>
            <div className="demo-stat-value">{s.value}</div>
            <div className="demo-stat-label">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="demo-body">
        <div className="demo-card">
          <div className="demo-card-title">Active Objectives</div>
          {MOCK_OBJECTIVES.slice(0,3).map(o => (
            <div key={o.title} className="demo-obj">
              <div className="demo-obj-top">
                <span className="demo-obj-name">{o.title}</span>
                <span className="demo-obj-pct">{o.progress}%</span>
              </div>
              <div className="demo-obj-track"><div className="demo-obj-fill" style={{ width:`${o.progress}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="demo-card">
          <div className="demo-card-title">Upcoming Events</div>
          {MOCK_EVENTS.map(e => (
            <div key={e.title} className="demo-ev">
              <span className="demo-ev-dot" style={{ background: e.color }} />
              <span className="demo-ev-title">{e.title}</span>
              <span className="demo-ev-date">{e.date}</span>
            </div>
          ))}
        </div>
        <div className="demo-card">
          <div className="demo-card-title">Recent Announcements</div>
          {MOCK_ANNOUNCEMENTS.slice(0,3).map(a => (
            <div key={a.title} className="demo-ann">
              <div className="demo-ann-title">{a.title}</div>
              <div className="demo-ann-body">{a.body}</div>
              <div className="demo-ann-date">{a.date}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ChatTab() {
  const [messages, setMessages] = useState(MOCK_CHAT);
  const [input, setInput] = useState("");
  const DEMO_REPLIES = [
    "That's a great question! Based on your HR records, I can see the relevant details. Would you like me to summarise them?",
    "I've checked your profile and can confirm that information. Is there anything else you'd like to know?",
    "I can help with that. Let me pull up the relevant policy from the knowledge base for you.",
    "Sure! I've found 3 matching documents in your organisation's knowledge base. Shall I summarise the key points?",
  ];
  const send = () => {
    if (!input.trim()) return;
    const userMsg = { role: "user", text: input };
    const reply = { role: "assistant", text: DEMO_REPLIES[messages.length % DEMO_REPLIES.length] };
    setMessages(m => [...m, userMsg, reply]);
    setInput("");
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 130px)" }}>
      <div className="demo-card-title" style={{ marginBottom:12 }}>Chat with Rafiki AI</div>
      <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:12, paddingBottom:8 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display:"flex", justifyContent: m.role==="user"?"flex-end":"flex-start" }}>
            <div style={{
              maxWidth:"72%", padding:"10px 14px", borderRadius: m.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px",
              background: m.role==="user" ? "linear-gradient(135deg,#8b5cf6,#6d28d9)" : "rgba(255,255,255,0.06)",
              border: m.role==="assistant" ? "1px solid rgba(255,255,255,0.08)" : "none",
              color:"#e4e4e7", fontSize:13, lineHeight:1.55,
            }}>{m.text}</div>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:8, marginTop:8 }}>
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key==="Enter" && send()}
          placeholder="Ask Rafiki anything…"
          style={{ flex:1, padding:"10px 14px", borderRadius:10, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.05)", color:"#e4e4e7", fontSize:13, outline:"none" }}
        />
        <button onClick={send} style={{ padding:"10px 20px", borderRadius:10, background:"linear-gradient(135deg,#8b5cf6,#1fbfb8)", border:"none", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer" }}>
          Send
        </button>
      </div>
    </div>
  );
}

function KnowledgeBaseTab() {
  const [search, setSearch] = useState("");
  const filtered = MOCK_KB.filter(d =>
    d.title.toLowerCase().includes(search.toLowerCase()) ||
    d.category.toLowerCase().includes(search.toLowerCase())
  );
  const cats = [...new Set(MOCK_KB.map(d => d.category))];
  return (
    <>
      <div className="demo-card-title">Knowledge Base</div>
      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="🔍 Search documents…"
        style={{ width:"100%", padding:"9px 14px", borderRadius:10, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.05)", color:"#e4e4e7", fontSize:13, outline:"none", marginBottom:16, boxSizing:"border-box" }}
      />
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:18 }}>
        {cats.map(c => (
          <span key={c} onClick={() => setSearch(search===c?"":c)}
            style={{ padding:"4px 12px", borderRadius:999, border:"1px solid rgba(139,92,246,.25)", background:"rgba(139,92,246,.08)", color:"#a78bfa", fontSize:11, fontWeight:600, cursor:"pointer" }}>
            {c}
          </span>
        ))}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {filtered.map(d => (
          <div key={d.title} className="demo-card" style={{ cursor:"pointer" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
              <div>
                <div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>📄 {d.title}</div>
                <div style={{ fontSize:12, color:"#94a3b8", marginBottom:6, lineHeight:1.5 }}>{d.excerpt}</div>
                <div style={{ fontSize:11, color:"#71717a" }}>{d.date}</div>
              </div>
              <span style={{ background:"rgba(139,92,246,.12)", color:"#a78bfa", borderRadius:999, padding:"3px 10px", fontSize:11, fontWeight:600, flexShrink:0 }}>{d.category}</span>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ color:"#71717a", fontSize:13, padding:"20px 0", textAlign:"center" }}>No documents match "{search}"</div>}
      </div>
    </>
  );
}

function MyDocumentsTab() {
  const cats = ["All", ...new Set(MOCK_DOCUMENTS.map(d => d.category))];
  const [filter, setFilter] = useState("All");
  const filtered = filter==="All" ? MOCK_DOCUMENTS : MOCK_DOCUMENTS.filter(d => d.category===filter);
  return (
    <>
      <div className="demo-card-title">My Documents</div>
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        {cats.map(c => (
          <button key={c} onClick={() => setFilter(c)}
            style={{ padding:"5px 14px", borderRadius:999, border:"1px solid rgba(255,255,255,0.1)", background: filter===c?"linear-gradient(135deg,#8b5cf6,#1fbfb8)":"rgba(255,255,255,0.04)", color: filter===c?"#fff":"#94a3b8", fontSize:12, fontWeight:600, cursor:"pointer" }}>
            {c}
          </button>
        ))}
      </div>
      <div className="demo-card" style={{ padding:0, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"rgba(255,255,255,0.03)" }}>
              {["Document","Type","Size","Date","Category"].map(h => (
                <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:11, fontWeight:700, color:"#71717a", textTransform:"uppercase", letterSpacing:".5px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(d => (
              <tr key={d.name} style={{ cursor:"pointer", transition:"background .15s" }}
                onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,0.03)"}
                onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ color:"#a78bfa", marginRight:6 }}>📄</span>{d.name}
                </td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", color:"#94a3b8" }}>{d.type}</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", color:"#94a3b8" }}>{d.size}</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", color:"#94a3b8" }}>{d.date}</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ background:"rgba(139,92,246,.12)", color:"#a78bfa", borderRadius:999, padding:"2px 8px", fontSize:11, fontWeight:600 }}>{d.category}</span>
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
  const tags = ["All", ...new Set(MOCK_ANNOUNCEMENTS.map(a => a.tag))];
  const [filter, setFilter] = useState("All");
  const filtered = filter==="All" ? MOCK_ANNOUNCEMENTS : MOCK_ANNOUNCEMENTS.filter(a => a.tag===filter);
  const TAG_COLORS = { HR:"#a78bfa", Operations:"#3b82f6", Wellbeing:"#34d399", IT:"#fbbf24", Leadership:"#f87171", Benefits:"#1fbfb8" };
  return (
    <>
      <div className="demo-card-title">Announcements</div>
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        {tags.map(t => (
          <button key={t} onClick={() => setFilter(t)}
            style={{ padding:"5px 14px", borderRadius:999, border:"1px solid rgba(255,255,255,0.1)", background: filter===t?"linear-gradient(135deg,#8b5cf6,#1fbfb8)":"rgba(255,255,255,0.04)", color: filter===t?"#fff":"#94a3b8", fontSize:12, fontWeight:600, cursor:"pointer" }}>
            {t}
          </button>
        ))}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {filtered.map(a => (
          <div key={a.title} className="demo-card">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, marginBottom:6 }}>
              <div style={{ fontWeight:700, fontSize:14 }}>{a.title}</div>
              <span style={{ background:`${TAG_COLORS[a.tag]||"#71717a"}22`, color: TAG_COLORS[a.tag]||"#71717a", borderRadius:999, padding:"2px 9px", fontSize:11, fontWeight:600, flexShrink:0 }}>{a.tag}</span>
            </div>
            <div style={{ fontSize:13, color:"#94a3b8", lineHeight:1.6, marginBottom:6 }}>{a.body}</div>
            <div style={{ fontSize:11, color:"#71717a" }}>{a.date}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function ObjectivesTab() {
  const STATUS_C = { on_track:"#34d399", completed:"#a78bfa", at_risk:"#fbbf24" };
  return (
    <>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div className="demo-card-title" style={{ margin:0 }}>My Objectives</div>
        <span style={{ fontSize:12, color:"#71717a" }}>Q1 2025 · 4 objectives</span>
      </div>
      <div style={{ display:"grid", gap:14 }}>
        {MOCK_OBJECTIVES.map(o => (
          <div key={o.title} className="demo-card">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, marginBottom:10 }}>
              <div style={{ fontWeight:700, fontSize:14 }}>{o.title}</div>
              <Badge status={o.status} />
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#94a3b8", marginBottom:8 }}>
              <span>Due {o.due}</span>
              <span style={{ fontWeight:700, color: STATUS_C[o.status] }}>{o.progress}%</span>
            </div>
            <div style={{ height:8, background:"rgba(255,255,255,0.07)", borderRadius:99, overflow:"hidden" }}>
              <div style={{ width:`${o.progress}%`, height:"100%", background:`linear-gradient(90deg,${STATUS_C[o.status]},${STATUS_C[o.status]}99)`, borderRadius:99, transition:"width .6s" }} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function CalendarTab() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);
  while (cells.length % 7 !== 0) cells.push(null);

  const eventDays = { 7:["#8b5cf6"], 8:["#3b82f6"], 10:["#34d399"], 12:["#fbbf24"], 14:["#f87171"], 18:["#a78bfa"] };

  return (
    <>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div className="demo-card-title" style={{ margin:0 }}>Calendar — {monthNames[month]} {year}</div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
        {/* Big calendar */}
        <div className="demo-card">
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, textAlign:"center", fontSize:12 }}>
            {CAL_DAYS.map(d => <div key={d} style={{ padding:"6px 0", fontWeight:700, color:"#71717a", fontSize:11 }}>{d}</div>)}
            {cells.map((day, i) => (
              <div key={i} style={{
                padding:"8px 4px", borderRadius:8, textAlign:"center", fontSize:13, position:"relative",
                background: day===today.getDate() ? "linear-gradient(135deg,#8b5cf6,#1fbfb8)" : "transparent",
                color: !day ? "rgba(255,255,255,0.15)" : day===today.getDate() ? "#fff" : "#e4e4e7",
                fontWeight: day===today.getDate() ? 700 : 400,
              }}>
                {day || ""}
                {day && eventDays[day] && (
                  <div style={{ display:"flex", justifyContent:"center", gap:2, marginTop:2 }}>
                    {eventDays[day].map((c,j) => <span key={j} style={{ width:4, height:4, borderRadius:99, background:c, display:"inline-block" }} />)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        {/* Upcoming events list */}
        <div className="demo-card">
          <div className="demo-card-title">Upcoming Events</div>
          {MOCK_EVENTS.map(e => (
            <div key={e.title} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ width:36, height:36, borderRadius:8, background:`${e.color}22`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <span style={{ width:10, height:10, borderRadius:99, background:e.color, display:"block" }} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:13 }}>{e.title}</div>
                <div style={{ fontSize:11, color:"#71717a" }}>{e.date} · {e.time}</div>
              </div>
              <span style={{ fontSize:11, background:`${e.color}22`, color:e.color, borderRadius:999, padding:"2px 8px", fontWeight:600 }}>{e.type}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function TimesheetsTab() {
  const totalHours = MOCK_TIMESHEETS.reduce((s,e) => s+e.hours,0);
  const drafts = MOCK_TIMESHEETS.filter(e => e.status==="draft").length;
  return (
    <>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div className="demo-card-title" style={{ margin:0 }}>My Timesheets — Mar 3–9, 2025</div>
        <button style={{ padding:"7px 16px", borderRadius:8, background:"linear-gradient(135deg,#8b5cf6,#1fbfb8)", border:"none", color:"#fff", fontWeight:700, fontSize:12, cursor:"pointer" }}>
          + Log Time
        </button>
      </div>
      <div className="demo-stats" style={{ marginBottom:16 }}>
        {[
          { value:`${totalHours}h`, label:"Total Hours",   color:"#8b5cf6" },
          { value:MOCK_TIMESHEETS.length, label:"Entries", color:"#3b82f6" },
          { value:drafts,           label:"Drafts",        color:"#fbbf24" },
          { value:MOCK_TIMESHEETS.filter(e=>e.status==="approved").length, label:"Approved", color:"#34d399" },
        ].map(s => (
          <div key={s.label} className="demo-stat" style={{ "--stat-color":s.color }}>
            <div className="demo-stat-value">{s.value}</div>
            <div className="demo-stat-label">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="demo-card" style={{ padding:0, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"rgba(255,255,255,0.03)" }}>
              {["Date","Activity / Project","Category","Hours","Status"].map(h => (
                <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:11, fontWeight:700, color:"#71717a", textTransform:"uppercase", letterSpacing:".5px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_TIMESHEETS.map((e,i) => (
              <tr key={i}>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", color:"#94a3b8" }}>{e.date}</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", fontWeight:600 }}>{e.activity}</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", color:"#94a3b8" }}>{e.category}</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", fontWeight:700 }}>{e.hours}h</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}><Badge status={e.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {drafts > 0 && (
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:12, padding:"12px 16px", background:"rgba(139,92,246,.08)", border:"1px solid rgba(139,92,246,.2)", borderRadius:10 }}>
          <span style={{ fontSize:13, color:"#94a3b8" }}>{drafts} draft{drafts!==1?"s":""} ready to submit</span>
          <button style={{ padding:"7px 16px", borderRadius:8, background:"linear-gradient(135deg,#8b5cf6,#1fbfb8)", border:"none", color:"#fff", fontWeight:700, fontSize:12, cursor:"pointer" }}>
            Submit All Drafts
          </button>
        </div>
      )}
    </>
  );
}

function MeetingsTab() {
  const upcoming = MOCK_MEETINGS.filter(m => m.status==="upcoming");
  const past     = MOCK_MEETINGS.filter(m => m.status==="completed");
  const TYPE_C   = { "1-on-1":"#8b5cf6", Team:"#3b82f6", Wellbeing:"#34d399", Review:"#fbbf24", "All-Hands":"#f87171" };
  return (
    <>
      <div className="demo-card-title">Meetings</div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:12, fontWeight:700, color:"#71717a", textTransform:"uppercase", letterSpacing:".6px", marginBottom:10 }}>Upcoming</div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {upcoming.map(m => (
            <div key={m.title} className="demo-card" style={{ display:"flex", alignItems:"center", gap:14 }}>
              <div style={{ width:40, height:40, borderRadius:10, background:`${TYPE_C[m.type]||"#8b5cf6"}22`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:18 }}>
                {m.type==="1-on-1"?"👤":m.type==="Team"?"👥":m.type==="Wellbeing"?"💚":"📋"}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:14, marginBottom:2 }}>{m.title}</div>
                <div style={{ fontSize:12, color:"#94a3b8" }}>{m.date} · with {m.with}</div>
              </div>
              <Badge status="upcoming" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize:12, fontWeight:700, color:"#71717a", textTransform:"uppercase", letterSpacing:".6px", marginBottom:10 }}>Past Meetings</div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {past.map(m => (
            <div key={m.title} className="demo-card" style={{ display:"flex", alignItems:"center", gap:14 }}>
              <div style={{ width:40, height:40, borderRadius:10, background:"rgba(255,255,255,0.04)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:18 }}>
                {m.type==="1-on-1"?"👤":"👥"}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:14, marginBottom:2 }}>{m.title}</div>
                <div style={{ fontSize:12, color:"#94a3b8" }}>{m.date} · with {m.with}</div>
              </div>
              {m.rating && (
                <div style={{ display:"flex", gap:2 }}>
                  {[1,2,3,4,5].map(s => <span key={s} style={{ fontSize:14, opacity: s<=m.rating?1:0.2 }}>⭐</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function LeaveTab() {
  return (
    <>
      <div className="demo-card-title">Leave Management</div>
      {/* Balance cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:12, marginBottom:20 }}>
        {LEAVE_BALANCE.map(b => (
          <div key={b.type} className="demo-card">
            <div style={{ fontSize:11, fontWeight:700, color:"#71717a", textTransform:"uppercase", letterSpacing:".5px", marginBottom:8 }}>{b.type}</div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6 }}>
              <span style={{ fontSize:24, fontWeight:800, color: b.color }}>{b.total - b.used}</span>
              <span style={{ fontSize:11, color:"#71717a" }}>{b.used} used / {b.total} total</span>
            </div>
            <div style={{ height:5, background:"rgba(255,255,255,0.07)", borderRadius:99, overflow:"hidden" }}>
              <div style={{ width:`${(b.used/b.total)*100}%`, height:"100%", background:b.color, borderRadius:99 }} />
            </div>
          </div>
        ))}
      </div>
      {/* Apply button */}
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:16 }}>
        <button style={{ padding:"9px 20px", borderRadius:10, background:"linear-gradient(135deg,#8b5cf6,#1fbfb8)", border:"none", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer" }}>
          + Apply for Leave
        </button>
      </div>
      {/* Leave history */}
      <div className="demo-card-title" style={{ marginBottom:10 }}>Leave History</div>
      <div className="demo-card" style={{ padding:0, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"rgba(255,255,255,0.03)" }}>
              {["Type","Start","End","Days","Status"].map(h => (
                <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:11, fontWeight:700, color:"#71717a", textTransform:"uppercase", letterSpacing:".5px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_LEAVE.map((l,i) => (
              <tr key={i}>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", fontWeight:600 }}>{l.type}</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", color:"#94a3b8" }}>{l.start}</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", color:"#94a3b8" }}>{l.end}</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", fontWeight:700 }}>{l.days}</td>
                <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}><Badge status={l.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════
   ROOT COMPONENT
══════════════════════════════════════════ */
const TABS = [
  { label: "Home",           component: HomeTab          },
  { label: "Chat",           component: ChatTab          },
  { label: "Knowledge Base", component: KnowledgeBaseTab },
  { label: "My Documents",   component: MyDocumentsTab   },
  { label: "Announcements",  component: AnnouncementsTab },
  { label: "Objectives",     component: ObjectivesTab    },
  { label: "Calendar",       component: CalendarTab      },
  { label: "Timesheets",     component: TimesheetsTab    },
  { label: "Meetings",       component: MeetingsTab      },
  { label: "Leave",          component: LeaveTab         },
];

const MOCK_MESSAGES_SIDEBAR = [
  { name: "Sarah K.",  preview: "Can you review the doc?",   time: "2h" },
  { name: "James M.",  preview: "Meeting moved to 3pm",       time: "5h" },
  { name: "HR Team",   preview: "Payslip for February ready", time: "1d" },
];

export default function DemoEmployeePage() {
  const [activeTab, setActiveTab] = useState(0);
  const ActiveComponent = TABS[activeTab].component;
  const showSidebar = activeTab === 0; // only home shows sidebar

  return (
    <div className="demo-emp">
      {/* Banner */}
      <div className="demo-banner">
        <div className="demo-banner__label">
          <span className="demo-banner__dot" />
          Demo Mode — Employee Portal
        </div>
        <Link to="/" className="demo-banner__exit">Exit Demo</Link>
      </div>

      {/* Nav Bar */}
      <nav className="demo-emp-nav">
        <div className="demo-emp-nav-links">
          {TABS.map((t, i) => (
            <span
              key={t.label}
              className={`demo-emp-nav-link${activeTab===i?" active":""}`}
              style={{ cursor:"pointer" }}
              onClick={() => setActiveTab(i)}
            >
              {t.label}
            </span>
          ))}
        </div>
        <div className="demo-portal-switcher">
          <Link to="/demo/hr"      className="demo-portal-link">HR Admin</Link>
          <Link to="/demo/manager" className="demo-portal-link">Manager Portal</Link>
        </div>
      </nav>

      {/* Body */}
      <div className="demo-emp-body">
        {showSidebar && (
          <aside className="demo-emp-sidebar">
            <div className="demo-msgs">
              <div className="demo-msgs-title">Messages</div>
              {MOCK_MESSAGES_SIDEBAR.map(m => (
                <div key={m.name} className="demo-msg-item">
                  <div>
                    <div className="demo-msg-name">{m.name}</div>
                    <div className="demo-msg-preview">{m.preview}</div>
                  </div>
                  <span className="demo-msg-time">{m.time}</span>
                </div>
              ))}
            </div>
            <MiniCalendar />
          </aside>
        )}
        <div className="demo-emp-content">
          <ActiveComponent />
        </div>
      </div>
    </div>
  );
}
