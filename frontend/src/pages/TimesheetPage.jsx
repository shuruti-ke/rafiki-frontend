import { useState, useEffect } from "react";
import { API, authFetch } from "../api.js";
import "./TimesheetPage.css";

/* ─────────────────────────────────────────────────────────────
   ACTIVITY STRUCTURE
   type = "project"  → employee picks from org projects / creates new one
   type = "activity" → standard organisational activity (no project needed)
───────────────────────────────────────────────────────────── */
const ACTIVITY_GROUPS = [
  {
    group: "📁 Project Work",
    type: "project",
    items: [], // populated dynamically from API
  },
  {
    group: "🏢 Corporate & Management",
    type: "activity",
    items: [
      "Board / Executive Meeting",
      "Strategy Planning",
      "Budget Review",
      "Performance Review",
      "One-on-One Meeting",
      "Team Meeting",
      "Interdepartmental Meeting",
      "Policy Development",
      "Compliance & Governance",
      "Reporting & Presentations",
      "Travel (Business)",
      "General Administration",
    ],
  },
  {
    group: "📣 Marketing & Communications",
    type: "activity",
    items: [
      "Client Meeting",
      "Prospect Meeting",
      "Campaign Planning",
      "Content Creation",
      "Social Media Management",
      "Brand & Design Work",
      "Market Research",
      "Events & Exhibitions",
      "PR & Media Relations",
      "Email / Newsletter",
      "Partnership / Sponsorship",
    ],
  },
  {
    group: "💰 Finance & Accounting",
    type: "activity",
    items: [
      "Bookkeeping & Data Entry",
      "Accounts Payable / Receivable",
      "Payroll Processing",
      "Financial Reporting",
      "Audit Preparation",
      "Tax Filing",
      "Budget Forecasting",
      "Bank Reconciliation",
      "Invoice Management",
      "Expense Claims Processing",
    ],
  },
  {
    group: "🧑‍💼 HR & People",
    type: "activity",
    items: [
      "Recruitment & Interviews",
      "Onboarding",
      "Employee Relations",
      "Training & Development",
      "Leave & Attendance Admin",
      "HR Policy Review",
      "Wellbeing Programme",
      "Performance Management",
    ],
  },
  {
    group: "⚖️ Legal & Compliance",
    type: "activity",
    items: [
      "Contract Drafting / Review",
      "Legal Research",
      "Regulatory Compliance",
      "Risk Assessment",
      "Data Protection (GDPR)",
      "Litigation Support",
    ],
  },
  {
    group: "🛠️ Operations & IT",
    type: "activity",
    items: [
      "System Administration",
      "IT Support",
      "Infrastructure / DevOps",
      "Procurement",
      "Vendor Management",
      "Facilities Management",
      "Health & Safety",
      "Process Improvement",
    ],
  },
  {
    group: "🤝 Sales & Business Development",
    type: "activity",
    items: [
      "Sales Call / Pitch",
      "Proposal Writing",
      "Contract Negotiation",
      "Account Management",
      "Lead Generation",
      "CRM Management",
      "After-Sales Support",
    ],
  },
  {
    group: "🎓 Learning & Development",
    type: "activity",
    items: [
      "Internal Training",
      "External Course / Conference",
      "Mentoring / Coaching",
      "Certification Study",
    ],
  },
];

/* Auto-suggest a category based on the chosen activity */
function suggestCategory(activity) {
  if (!activity) return "Other";
  const a = activity.toLowerCase();
  if (a.includes("meeting") || a.includes("board") || a.includes("one-on-one")) return "Meetings";
  if (a.includes("training") || a.includes("course") || a.includes("certification") || a.includes("coaching")) return "Training";
  if (a.includes("design") || a.includes("brand") || a.includes("content") || a.includes("campaign")) return "Design";
  if (a.includes("report") || a.includes("documentation") || a.includes("proposal") || a.includes("policy")) return "Documentation";
  if (a.includes("research") || a.includes("market research")) return "Research";
  if (a.includes("admin") || a.includes("administration") || a.includes("procurement") || a.includes("facilities")) return "Admin";
  if (a.includes("support") || a.includes("it support") || a.includes("after-sales")) return "Support";
  if (a.includes("development") || a.includes("devops") || a.includes("system")) return "Development";
  return "Other";
}

const CATEGORIES = [
  "Development", "Meetings", "Code Review", "Documentation",
  "Testing", "Design", "Research", "Admin",
  "Training", "Support", "Other",
];

function fmtDate(d) { return d.toISOString().slice(0, 10); }
function monday(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
  dt.setDate(diff);
  return dt;
}

/* ─────────────────────────────────────────────────────────────
   MAIN PAGE  (unchanged from original)
───────────────────────────────────────────────────────────── */
export default function TimesheetPage() {
  const [weekStart, setWeekStart] = useState(monday(new Date()));
  const [entries,   setEntries]   = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [summary,   setSummary]   = useState(null);
  const [projects,  setProjects]  = useState([]);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const loadEntries = async () => {
    const res = await authFetch(`${API}/api/v1/timesheets/?start=${fmtDate(weekStart)}&end=${fmtDate(weekEnd)}`);
    if (res.ok) setEntries(await res.json());
  };
  const loadSummary = async () => {
    const res = await authFetch(`${API}/api/v1/timesheets/summary/weekly?week_start=${fmtDate(weekStart)}`);
    if (res.ok) setSummary(await res.json());
  };
  const loadProjects = async () => {
    const res = await authFetch(`${API}/api/v1/timesheets/projects`);
    if (res.ok) setProjects(await res.json());
  };

  useEffect(() => { loadEntries(); loadSummary(); }, [weekStart.toISOString()]);
  useEffect(() => { loadProjects(); }, []);

  const prevWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); };
  const nextWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); };
  const thisWeek = () => setWeekStart(monday(new Date()));

  const draftEntries = entries.filter(e => e.status === "draft");

  const handleDelete = async (id) => {
    if (!confirm("Delete this entry?")) return;
    const res = await authFetch(`${API}/api/v1/timesheets/${id}`, { method: "DELETE" });
    if (res.ok) { loadEntries(); loadSummary(); }
  };

  const handleSubmit = async () => {
    if (draftEntries.length === 0) return;
    const res = await authFetch(`${API}/api/v1/timesheets/submit`, {
      method: "POST",
      body: JSON.stringify({ entry_ids: draftEntries.map(e => e.id) }),
    });
    if (res.ok) { loadEntries(); loadSummary(); }
  };

  const openCreate = () => { setEditEntry(null); setShowModal(true); };
  const openEdit   = (e) => { setEditEntry(e);   setShowModal(true); };

  const weekLabel = `${weekStart.toLocaleDateString([], { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div className="tsp-page">
      <div className="tsp-header">
        <h1>Timesheets</h1>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="tsp-btn tsp-btn-ghost" onClick={thisWeek}>This Week</button>
          <button className="tsp-btn tsp-btn-primary" onClick={openCreate}>+ Log Time</button>
        </div>
      </div>

      <div className="tsp-week-nav">
        <button onClick={prevWeek}>&lsaquo;</button>
        <div className="tsp-week-label">{weekLabel}</div>
        <button onClick={nextWeek}>&rsaquo;</button>
      </div>

      {summary && (
        <div className="tsp-kpis">
          <div className="tsp-kpi">
            <div className="tsp-kpi-value">{summary.total_hours || 0}</div>
            <div className="tsp-kpi-label">Hours This Week</div>
          </div>
          <div className="tsp-kpi">
            <div className="tsp-kpi-value">{summary.entries || 0}</div>
            <div className="tsp-kpi-label">Entries</div>
          </div>
          <div className="tsp-kpi">
            <div className="tsp-kpi-value">{Object.keys(summary.by_day || {}).length}</div>
            <div className="tsp-kpi-label">Days Logged</div>
          </div>
          <div className="tsp-kpi">
            <div className="tsp-kpi-value">{draftEntries.length}</div>
            <div className="tsp-kpi-label">Drafts</div>
          </div>
        </div>
      )}

      <div className="tsp-table-wrap">
        <table className="tsp-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Activity / Project</th>
              <th>Category</th>
              <th>Hours</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr><td colSpan={6} className="tsp-empty">No entries this week. Click "Log Time" to start.</td></tr>
            )}
            {entries.map(e => (
              <tr key={e.id}>
                <td>{e.date}</td>
                <td>{e.project}</td>
                <td>{e.category}</td>
                <td>{Number(e.hours).toFixed(1)}</td>
                <td><span className={`tsp-status tsp-status-${e.status}`}>{e.status}</span></td>
                <td>
                  <div className="tsp-actions">
                    {(e.status === "draft" || e.status === "rejected") && (
                      <>
                        <button className="tsp-btn tsp-btn-ghost tsp-btn-sm" onClick={() => openEdit(e)}>Edit</button>
                        <button className="tsp-btn tsp-btn-ghost tsp-btn-sm" onClick={() => handleDelete(e.id)}>Del</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {draftEntries.length > 0 && (
        <div className="tsp-submit-bar">
          <span>{draftEntries.length} draft{draftEntries.length !== 1 ? "s" : ""} ready to submit</span>
          <button className="tsp-btn tsp-btn-primary" onClick={handleSubmit}>Submit All Drafts</button>
        </div>
      )}

      {showModal && (
        <EntryModal
          entry={editEntry}
          projects={projects}
          weekStart={weekStart}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); loadEntries(); loadSummary(); loadProjects(); }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   ENTRY MODAL  — smart activity selector
───────────────────────────────────────────────────────────── */
function EntryModal({ entry, projects, weekStart, onClose, onSaved }) {
  const isEdit = !!entry;

  /* Detect if an existing entry's project matches a known activity */
  const detectActivityType = (proj) => {
    if (!proj) return "project";
    for (const g of ACTIVITY_GROUPS) {
      if (g.type === "activity" && g.items.includes(proj)) return "activity";
    }
    return "project";
  };

  const [date,        setDate]        = useState(entry?.date || fmtDate(new Date()));
  const [actType,     setActType]     = useState(isEdit ? detectActivityType(entry.project) : "project");
  const [actGroup,    setActGroup]    = useState(() => {
    if (isEdit && detectActivityType(entry.project) === "activity") {
      const g = ACTIVITY_GROUPS.find(g => g.type === "activity" && g.items.includes(entry.project));
      return g?.group || "";
    }
    return "";
  });
  const [activity,    setActivity]    = useState(isEdit && detectActivityType(entry.project) === "activity" ? entry.project : "");
  const [project,     setProject]     = useState(isEdit && detectActivityType(entry.project) === "project"  ? entry.project : "");
  const [newProject,  setNewProject]  = useState("");
  const [category,    setCategory]    = useState(entry?.category || "");
  const [hours,       setHours]       = useState(entry ? String(Number(entry.hours)) : "");
  const [description, setDescription] = useState(entry?.description || "");
  const [saving,      setSaving]      = useState(false);

  /* When an activity is chosen, auto-fill category */
  const handleActivityChange = (val) => {
    setActivity(val);
    if (!category || category === "Other") setCategory(suggestCategory(val));
  };

  /* Resolve the final "project" field sent to the backend */
  const resolvedActivity = (() => {
    if (actType === "project") return project === "__new" ? newProject.trim() : project;
    return activity;
  })();

  const canSave = resolvedActivity.trim() && hours && parseFloat(hours) > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    const body = {
      date,
      project: resolvedActivity,
      category: category || suggestCategory(resolvedActivity) || "Other",
      hours: parseFloat(hours),
      description,
    };
    const url    = isEdit ? `${API}/api/v1/timesheets/${entry.id}` : `${API}/api/v1/timesheets/`;
    const method = isEdit ? "PUT" : "POST";
    const res    = await authFetch(url, { method, body: JSON.stringify(body) });
    setSaving(false);
    if (res.ok) onSaved();
  };

  /* Groups for the activity path (exclude the "project" group) */
  const activityGroups = ACTIVITY_GROUPS.filter(g => g.type === "activity");
  const selectedGroup  = activityGroups.find(g => g.group === actGroup);

  return (
    <div className="tsp-modal-overlay" onClick={onClose}>
      <div className="tsp-modal tsp-modal--wide" onClick={e => e.stopPropagation()}>
        <h2>{isEdit ? "Edit Entry" : "Log Time"}</h2>

        {/* Date */}
        <div className="tsp-form-row">
          <label>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>

        {/* Activity type toggle */}
        <div className="tsp-form-row">
          <label>What are you logging?</label>
          <div className="tsp-type-toggle">
            <button
              type="button"
              className={`tsp-type-btn${actType === "project" ? " tsp-type-btn--active" : ""}`}
              onClick={() => setActType("project")}
            >
              📁 Project Work
            </button>
            <button
              type="button"
              className={`tsp-type-btn${actType === "activity" ? " tsp-type-btn--active" : ""}`}
              onClick={() => setActType("activity")}
            >
              🏢 Organisational Activity
            </button>
          </div>
        </div>

        {/* ── PROJECT PATH ── */}
        {actType === "project" && (
          <>
            <div className="tsp-form-row">
              <label>Project</label>
              <select value={project} onChange={e => setProject(e.target.value)}>
                <option value="">Select project…</option>
                {projects.map(p => <option key={p} value={p}>{p}</option>)}
                <option value="__new">+ New project</option>
              </select>
            </div>
            {project === "__new" && (
              <div className="tsp-form-row">
                <label>New Project Name</label>
                <input
                  value={newProject}
                  onChange={e => setNewProject(e.target.value)}
                  placeholder="e.g. Website Redesign"
                />
              </div>
            )}
          </>
        )}

        {/* ── ORGANISATIONAL ACTIVITY PATH ── */}
        {actType === "activity" && (
          <>
            <div className="tsp-form-row">
              <label>Department / Function</label>
              <select value={actGroup} onChange={e => { setActGroup(e.target.value); setActivity(""); }}>
                <option value="">Select area…</option>
                {activityGroups.map(g => (
                  <option key={g.group} value={g.group}>{g.group}</option>
                ))}
              </select>
            </div>

            {actGroup && selectedGroup && (
              <div className="tsp-form-row">
                <label>Activity</label>
                <select value={activity} onChange={e => handleActivityChange(e.target.value)}>
                  <option value="">Select activity…</option>
                  {selectedGroup.items.map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                  <option value="__other">Other (type below)</option>
                </select>
              </div>
            )}

            {activity === "__other" && (
              <div className="tsp-form-row">
                <label>Describe activity</label>
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Brief description of the activity"
                />
              </div>
            )}
          </>
        )}

        {/* Category — auto-filled but editable */}
        <div className="tsp-form-row">
          <label>
            Category
            {actType === "activity" && activity && activity !== "__other" && (
              <span className="tsp-label-hint"> (auto-suggested)</span>
            )}
          </label>
          <select value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">Select category…</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Hours */}
        <div className="tsp-form-row">
          <label>Hours</label>
          <input
            type="number" step="0.5" min="0.5" max="24"
            value={hours} onChange={e => setHours(e.target.value)}
            placeholder="e.g. 2.5"
          />
        </div>

        {/* Description */}
        <div className="tsp-form-row">
          <label>Notes <span className="tsp-label-hint">(optional)</span></label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Any additional context…"
          />
        </div>

        <div className="tsp-modal-actions">
          <button className="tsp-btn tsp-btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="tsp-btn tsp-btn-primary"
            onClick={handleSave}
            disabled={saving || !canSave}
          >
            {saving ? "Saving…" : isEdit ? "Update" : "Log"}
          </button>
        </div>
      </div>
    </div>
  );
}
