import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { API, authFetch } from "../api.js";
import "./CalendarPage.css";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const EVENT_TYPES = ["meeting","1on1","task","reminder","deadline","company","general","out-of-office","social","training"];
const EVENT_COLORS = {
  meeting: "#8b5cf6", "1on1": "#1fbfb8", task: "#3b82f6",
  reminder: "#f59e0b", deadline: "#ef4444", company: "#10b981",
  general: "#6366f1", "out-of-office": "#f87171", social: "#34d399", training: "#8b5cf6",
};
const GOOGLE_BLUE = "#4285f4";

function pad(n) { return String(n).padStart(2,"0"); }
function fmtDate(y,m,d) { return `${y}-${pad(m+1)}-${pad(d)}`; }
function fmtTime(iso) { if(!iso) return ""; return new Date(iso).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}); }
function fmtRelative(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function CalendarPage() {
  const today = new Date();
  const [searchParams, setSearchParams] = useSearchParams();

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editEvent, setEditEvent] = useState(null);
  const [colleagues, setColleagues] = useState([]);
  const [showGooglePanel, setShowGooglePanel] = useState(false);
  const [googleStatus, setGoogleStatus] = useState({ connected: false, synced_at: null });
  const [googleSyncing, setGoogleSyncing] = useState(false);

  const currentUser = JSON.parse(localStorage.getItem("rafiki_user") || "{}");
  const currentUserId = currentUser.user_id || currentUser.id;

  const loadEvents = async () => {
    const start = new Date(year, month, 1).toISOString();
    const end = new Date(year, month+1, 0, 23,59,59).toISOString();
    const res = await authFetch(`${API}/api/v1/calendar/?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
    if (res.ok) setEvents(await res.json());
  };

  const loadColleagues = async () => {
    const res = await authFetch(`${API}/api/v1/calendar/colleagues`);
    if (res.ok) setColleagues(await res.json());
  };

  const loadGoogleStatus = async () => {
    const res = await authFetch(`${API}/api/v1/calendar/google/status`);
    if (res.ok) setGoogleStatus(await res.json());
  };

  useEffect(() => { loadEvents(); }, [year, month]);
  useEffect(() => { loadColleagues(); loadGoogleStatus(); }, []);

  // Handle ?google_connected=1 redirect from OAuth callback
  useEffect(() => {
    if (searchParams.get("google_connected") === "1") {
      setSearchParams({});
      loadGoogleStatus();
      handleGoogleSync();
      setShowGooglePanel(true);
    }
  }, []);

  const prevMonth = () => { if(month===0){setMonth(11);setYear(year-1);}else setMonth(month-1); setSelectedDay(null); };
  const nextMonth = () => { if(month===11){setMonth(0);setYear(year+1);}else setMonth(month+1); setSelectedDay(null); };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelectedDay(today.getDate()); };

  const firstDow = new Date(year,month,1).getDay();
  const daysInMonth = new Date(year,month+1,0).getDate();
  const daysInPrev = new Date(year,month,0).getDate();
  const cells = [];
  for(let i=0;i<firstDow;i++) cells.push({day:daysInPrev-firstDow+1+i,outside:true});
  for(let i=1;i<=daysInMonth;i++) cells.push({day:i,outside:false});
  const rem = 7 - (cells.length % 7);
  if(rem<7) for(let i=1;i<=rem;i++) cells.push({day:i,outside:true});

  const eventsForDay = (d) => {
    const ds = fmtDate(year,month,d);
    return events.filter(e => {
      if (e.start_time) return e.start_time.slice(0,10) === ds;
      if (e.date) return e.date === ds;
      return false;
    });
  };

  const isToday = (d) => d===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();
  const dayEvents = selectedDay ? eventsForDay(selectedDay) : [];

  const handleDeleteEvent = async (id) => {
    if (!confirm("Delete this event?")) return;
    const res = await authFetch(`${API}/api/v1/calendar/${id}`, {method:"DELETE"});
    if (res.ok) loadEvents();
  };

  const handleCompleteEvent = async (id) => {
    const res = await authFetch(`${API}/api/v1/calendar/${id}/complete`, {method:"POST"});
    if (res.ok) loadEvents();
  };

  const handleRSVP = async (eventId, status) => {
    await authFetch(`${API}/api/v1/calendar/${eventId}/rsvp`, {
      method:"POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({status}),
    });
    loadEvents();
  };

  const openCreate = () => { setEditEvent(null); setShowModal(true); };
  const openEdit = (ev) => { setEditEvent(ev); setShowModal(true); };
  const handleDayClick = (day) => { if (selectedDay === day) return; setSelectedDay(day); };

  // ── Google sync handlers ──

  const handleGoogleConnect = async () => {
    const res = await authFetch(`${API}/api/v1/calendar/google/auth`);
    if (res.ok) {
      const { auth_url } = await res.json();
      window.location.href = auth_url;
    }
  };

  const handleGoogleSync = async () => {
    setGoogleSyncing(true);
    const res = await authFetch(`${API}/api/v1/calendar/google/sync`, {method:"POST"});
    if (res.ok) {
      const data = await res.json();
      setGoogleStatus(prev => ({ ...prev, synced_at: data.synced_at }));
      loadEvents();
    }
    setGoogleSyncing(false);
  };

  const handleGoogleDisconnect = async () => {
    if (!confirm("Disconnect Google Calendar? All synced events will be removed.")) return;
    const res = await authFetch(`${API}/api/v1/calendar/google/disconnect`, {method:"DELETE"});
    if (res.ok) {
      setGoogleStatus({ connected: false, synced_at: null });
      loadEvents();
    }
  };

  const getEventColor = (e) => {
    if (e.source === "google") return GOOGLE_BLUE;
    return EVENT_COLORS[e.event_type] || e.color || "#8b5cf6";
  };

  return (
    <div className="calp-page">
      <div className="calp-header">
        <h1>Calendar</h1>
        <div style={{display:"flex",gap:"0.5rem",alignItems:"center"}}>
          <button className="calp-btn calp-btn-ghost" onClick={goToday}>Today</button>
          <button
            className="calp-btn calp-btn-ghost"
            onClick={() => setShowGooglePanel(v => !v)}
            style={{fontSize:"0.75rem"}}
          >
            {googleStatus.connected
              ? <><span style={{color:GOOGLE_BLUE}}>G</span> Synced</>
              : "Connect Google"}
          </button>
          <button className="calp-btn calp-btn-primary" onClick={openCreate}>+ New Event</button>
        </div>
      </div>

      {/* Google Calendar panel */}
      {showGooglePanel && (
        <div className="calp-google-panel">
          <div className="calp-google-panel-header">
            <span style={{fontWeight:600}}>Google Calendar</span>
            <button className="calp-btn calp-btn-ghost" style={{fontSize:"0.75rem",padding:"0.2rem 0.5rem"}} onClick={() => setShowGooglePanel(false)}>×</button>
          </div>
          {googleStatus.connected ? (
            <div style={{display:"flex",alignItems:"center",gap:"0.75rem",flexWrap:"wrap"}}>
              <span style={{fontSize:"0.82rem",color:"var(--muted)"}}>
                {googleStatus.synced_at
                  ? <>Last synced: {fmtRelative(googleStatus.synced_at)}</>
                  : "Not yet synced"}
              </span>
              <button className="calp-btn calp-btn-primary" style={{fontSize:"0.75rem",padding:"0.25rem 0.75rem"}} onClick={handleGoogleSync} disabled={googleSyncing}>
                {googleSyncing ? "Syncing..." : "Sync Now"}
              </button>
              <button className="calp-btn calp-btn-ghost" style={{fontSize:"0.75rem",padding:"0.25rem 0.75rem",color:"var(--danger,#f87171)"}} onClick={handleGoogleDisconnect}>
                Disconnect
              </button>
            </div>
          ) : (
            <div style={{display:"flex",alignItems:"center",gap:"0.75rem"}}>
              <span style={{fontSize:"0.82rem",color:"var(--muted)"}}>Import your Google Calendar events into Rafiki.</span>
              <button className="calp-btn calp-btn-primary" style={{fontSize:"0.75rem",padding:"0.25rem 0.75rem"}} onClick={handleGoogleConnect}>
                Connect Google Calendar
              </button>
            </div>
          )}
          <p style={{margin:"0.5rem 0 0",fontSize:"0.75rem",color:"var(--muted)"}}>
            Google events are read-only. Edit them in Google Calendar.
          </p>
        </div>
      )}

      <div className="calp-month-nav">
        <button onClick={prevMonth}>&lsaquo;</button>
        <div className="calp-month-label">{MONTH_NAMES[month]} {year}</div>
        <button onClick={nextMonth}>&rsaquo;</button>
      </div>

      <div className="calp-grid" style={{marginTop:"1rem"}}>
        {DAY_NAMES.map(d => <div key={d} className="calp-day-header">{d}</div>)}
        {cells.map((c,i) => {
          const de = !c.outside ? eventsForDay(c.day) : [];
          const sel = selectedDay===c.day && !c.outside;
          return (
            <div key={i}
              className={`calp-day${c.outside?" calp-outside":""}${!c.outside&&isToday(c.day)?" calp-today":""}${sel?" calp-selected":""}`}
              onClick={() => !c.outside && handleDayClick(c.day)}
            >
              <div className="calp-day-num">{c.day}</div>
              {de.slice(0,3).map(e => (
                <div key={e.id} className="calp-day-event"
                  style={{background: getEventColor(e)}}
                  onClick={ev => { ev.stopPropagation(); setSelectedDay(c.day); }}
                >
                  {e.source === "google" && <span style={{opacity:0.8,marginRight:2,fontSize:"0.65rem"}}>G</span>}
                  {e.title}
                  {e.is_completed && <span style={{marginLeft:3,opacity:0.7}}>✓</span>}
                </div>
              ))}
              {de.length > 3 && <div className="calp-day-more">+{de.length-3} more</div>}
            </div>
          );
        })}
      </div>

      {selectedDay && (
        <div className="calp-detail">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <h3 style={{margin:0}}>{MONTH_NAMES[month]} {selectedDay}, {year}</h3>
            <div style={{display:"flex",gap:"0.5rem"}}>
              <button className="calp-btn calp-btn-primary" style={{fontSize:"0.75rem",padding:"0.3rem 0.7rem"}} onClick={openCreate}>+ Add</button>
              <button className="calp-btn calp-btn-ghost" style={{fontSize:"0.75rem",padding:"0.3rem 0.7rem"}} onClick={() => setSelectedDay(null)}>Close</button>
            </div>
          </div>
          {dayEvents.length === 0 && <div className="calp-detail-empty" style={{marginTop:"0.75rem"}}>No events this day</div>}
          {dayEvents.map(e => {
            const myRsvp = (e.attendees||[]).find(a => String(a.id) === String(currentUserId));
            const isOwner = String(e.user_id) === String(currentUserId);
            const isGoogle = e.source === "google";
            return (
              <div key={e.id} className={`calp-event-card${e.is_completed?" calp-event-completed":""}`}
                style={{cursor:"pointer"}}
                onClick={() => !isGoogle && openEdit(e)}
              >
                <div className="calp-event-color" style={{background: getEventColor(e)}} />
                <div className="calp-event-info">
                  <div className="calp-event-title">
                    {e.title}
                    <span className="calp-event-badge">{e.event_type || "meeting"}</span>
                    {e.is_shared && <span className="calp-event-badge" style={{background:"#10b981"}}>shared</span>}
                    {isGoogle && <span className="calp-event-badge" style={{background:GOOGLE_BLUE}}>G</span>}
                    {e.is_completed && <span className="calp-event-badge" style={{background:"var(--muted)"}}>done</span>}
                  </div>
                  <div className="calp-event-meta">
                    {e.is_all_day ? "All day" : `${fmtTime(e.start_time)}${e.end_time ? " – "+fmtTime(e.end_time) : ""}`}
                    {e.location && ` · ${e.location}`}
                    {e.is_virtual && e.meeting_link && (
                      <> · <a href={e.meeting_link} target="_blank" rel="noopener noreferrer" style={{color:"var(--accent)"}} onClick={ev => ev.stopPropagation()}>Join</a></>
                    )}
                  </div>
                  {e.description && <div className="calp-event-meta" style={{marginTop:"4px"}}>{e.description}</div>}
                  {(e.attendees||[]).length > 0 && (
                    <div className="calp-event-meta" style={{marginTop:"4px"}}>
                      {(e.attendees||[]).map(a => {
                        const c = colleagues.find(col => String(col.id) === String(a.id));
                        return c?.name || a.name || a.id;
                      }).join(", ")}
                      {myRsvp && ` · You: ${myRsvp.status}`}
                    </div>
                  )}
                </div>
                <div className="calp-event-actions" onClick={ev => ev.stopPropagation()}>
                  {isOwner && !isGoogle && !e.is_completed && (
                    <button
                      onClick={() => handleCompleteEvent(e.id)}
                      title="Mark complete"
                      style={{fontSize:"0.75rem"}}
                    >✓ Done</button>
                  )}
                  {isOwner && !isGoogle && (
                    <button onClick={() => handleDeleteEvent(e.id)}>Del</button>
                  )}
                  {!isOwner && !isGoogle && (
                    <>
                      <button onClick={() => handleRSVP(e.id,"accepted")} style={myRsvp?.status==="accepted"?{background:"rgba(16,185,129,0.2)",borderColor:"#10b981"}:{}}>Accept</button>
                      <button onClick={() => handleRSVP(e.id,"declined")} style={myRsvp?.status==="declined"?{background:"rgba(239,68,68,0.2)",borderColor:"#ef4444"}:{}}>Decline</button>
                    </>
                  )}
                  {isGoogle && (
                    <span style={{fontSize:"0.7rem",color:"var(--muted)"}}>Read-only</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <EventModal
          event={editEvent}
          colleagues={colleagues}
          currentUserId={currentUserId}
          selectedDate={selectedDay ? fmtDate(year,month,selectedDay) : null}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); loadEvents(); }}
        />
      )}
    </div>
  );
}

/* ─── Attendee Picker ─── */
function AttendeePicker({ colleagues, selected, onChange, currentUserId }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const selectedIds = new Set(selected.map(a => String(a.id)));
  const filtered = colleagues.filter(c =>
    String(c.id) !== String(currentUserId) &&
    !selectedIds.has(String(c.id)) &&
    ((c.name||"").toLowerCase().includes(search.toLowerCase()) ||
     (c.email||"").toLowerCase().includes(search.toLowerCase()))
  );

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const add = (c) => {
    onChange([...selected, { id: c.id, name: c.name || c.email, status: "pending" }]);
    setSearch("");
  };

  const remove = (id) => {
    onChange(selected.filter(a => String(a.id) !== String(id)));
  };

  return (
    <div ref={ref} style={{position:"relative"}}>
      {selected.length > 0 && (
        <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:6}}>
          {selected.map(a => (
            <span key={a.id} style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:12,background:"rgba(139,92,246,0.15)",color:"var(--text)",fontSize:"0.75rem"}}>
              {a.name || a.id}
              <button onClick={() => remove(a.id)} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:"0.85rem",padding:0,lineHeight:1}}>&times;</button>
            </span>
          ))}
        </div>
      )}
      <input
        value={search}
        onChange={e => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search colleagues to invite..."
        style={{width:"100%",padding:"0.45rem 0.6rem",borderRadius:6,border:"1px solid var(--border)",background:"rgba(255,255,255,0.05)",color:"var(--text)",fontSize:"0.85rem",boxSizing:"border-box"}}
      />
      {open && search.length > 0 && (
        <div style={{position:"absolute",top:"100%",left:0,right:0,maxHeight:150,overflowY:"auto",background:"var(--panel)",border:"1px solid var(--border)",borderRadius:8,zIndex:10,marginTop:2}}>
          {filtered.length === 0 && <div style={{padding:"8px 10px",color:"var(--muted)",fontSize:"0.8rem"}}>No matches</div>}
          {filtered.map(c => (
            <div key={c.id} onClick={() => add(c)} style={{padding:"6px 10px",cursor:"pointer",fontSize:"0.8rem",color:"var(--text)"}}
              onMouseEnter={e => e.target.style.background="rgba(139,92,246,0.1)"}
              onMouseLeave={e => e.target.style.background="transparent"}>
              {c.name || c.email}
              {c.email && c.name && <span style={{color:"var(--muted)",marginLeft:6,fontSize:"0.7rem"}}>{c.email}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Event Modal ─── */
function EventModal({ event, colleagues, currentUserId, selectedDate, onClose, onSaved }) {
  const isEdit = !!event;
  const [title, setTitle] = useState(event?.title || "");
  const [description, setDescription] = useState(event?.description || "");
  const [eventType, setEventType] = useState(event?.event_type || "meeting");
  const [startTime, setStartTime] = useState(event?.start_time ? event.start_time.slice(0,16) : (selectedDate ? selectedDate+"T09:00" : ""));
  const [endTime, setEndTime] = useState(event?.end_time ? event.end_time.slice(0,16) : (selectedDate ? selectedDate+"T10:00" : ""));
  const [isAllDay, setIsAllDay] = useState(event?.is_all_day || false);
  const [isShared, setIsShared] = useState(event?.is_shared || false);
  const [location, setLocation] = useState(event?.location || "");
  const [isVirtual, setIsVirtual] = useState(event?.is_virtual || false);
  const [meetingLink, setMeetingLink] = useState(event?.meeting_link || "");
  const [color, setColor] = useState(event?.color || "#8b5cf6");
  const [attendees, setAttendees] = useState(event?.attendees || []);
  const [saving, setSaving] = useState(false);

  const isOwner = !event || String(event.user_id) === String(currentUserId);
  const isGoogle = event?.source === "google";

  const handleSave = async () => {
    if (!title.trim() || !isOwner || isGoogle) return;
    setSaving(true);
    const body = {
      title, description, event_type: eventType,
      start_time: new Date(startTime).toISOString(),
      end_time: endTime ? new Date(endTime).toISOString() : null,
      is_all_day: isAllDay, is_shared: isShared,
      location: location || null, is_virtual: isVirtual,
      meeting_link: meetingLink || null, color,
      attendees,
    };

    const url = isEdit ? `${API}/api/v1/calendar/${event.id}` : `${API}/api/v1/calendar/`;
    const method = isEdit ? "PUT" : "POST";
    const res = await authFetch(url, {
      method,
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) onSaved();
  };

  return (
    <div className="calp-modal-overlay" onClick={onClose}>
      <div className="calp-modal" onClick={e => e.stopPropagation()}>
        <h2>
          {isGoogle ? "Google Event" : isEdit ? (isOwner ? "Edit Event" : "Event Details") : "New Event"}
          {isGoogle && <span style={{marginLeft:8,padding:"2px 8px",borderRadius:8,background:GOOGLE_BLUE,color:"#fff",fontSize:"0.7rem"}}>Google</span>}
        </h2>

        {isGoogle && (
          <p style={{fontSize:"0.8rem",color:"var(--muted)",marginTop:0}}>
            This event is synced from Google Calendar and cannot be edited here.
          </p>
        )}

        <div className="calp-form-row">
          <label>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Event title" disabled={!isOwner || isGoogle} />
        </div>

        <div className="calp-form-row-inline">
          <div className="calp-form-row">
            <label>Type</label>
            <select value={eventType} onChange={e => setEventType(e.target.value)} disabled={!isOwner || isGoogle}>
              {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="calp-form-row">
            <label>Color</label>
            <input type="color" value={isGoogle ? GOOGLE_BLUE : color} onChange={e => setColor(e.target.value)} disabled={!isOwner || isGoogle} />
          </div>
        </div>

        <div className="calp-form-check">
          <input type="checkbox" id="calp-allday" checked={isAllDay} onChange={e => setIsAllDay(e.target.checked)} disabled={!isOwner || isGoogle} />
          <label htmlFor="calp-allday">All day</label>
        </div>

        {!isAllDay && (
          <div className="calp-form-row-inline">
            <div className="calp-form-row">
              <label>Start</label>
              <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} disabled={!isOwner || isGoogle} />
            </div>
            <div className="calp-form-row">
              <label>End</label>
              <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} disabled={!isOwner || isGoogle} />
            </div>
          </div>
        )}
        {isAllDay && (
          <div className="calp-form-row">
            <label>Date</label>
            <input type="date" value={startTime.slice(0,10)} onChange={e => setStartTime(e.target.value+"T00:00")} disabled={!isOwner || isGoogle} />
          </div>
        )}

        <div className="calp-form-row">
          <label>Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" disabled={!isOwner || isGoogle} />
        </div>

        <div className="calp-form-row">
          <label>Location</label>
          <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Room, address, etc." disabled={!isOwner || isGoogle} />
        </div>

        <div className="calp-form-check">
          <input type="checkbox" id="calp-virtual" checked={isVirtual} onChange={e => setIsVirtual(e.target.checked)} disabled={!isOwner || isGoogle} />
          <label htmlFor="calp-virtual">Virtual meeting</label>
        </div>

        {isVirtual && (
          <div className="calp-form-row">
            <label>Meeting link</label>
            <input value={meetingLink} onChange={e => setMeetingLink(e.target.value)} placeholder="https://..." disabled={!isOwner || isGoogle} />
          </div>
        )}

        {!isGoogle && (
          <div className="calp-form-check">
            <input type="checkbox" id="calp-shared" checked={isShared} onChange={e => setIsShared(e.target.checked)} disabled={!isOwner} />
            <label htmlFor="calp-shared">Share with org</label>
          </div>
        )}

        {!isGoogle && (
          <div className="calp-form-row">
            <label>Invite Colleagues</label>
            {isOwner ? (
              <AttendeePicker colleagues={colleagues} selected={attendees} onChange={setAttendees} currentUserId={currentUserId} />
            ) : (
              <div style={{fontSize:"0.8rem",color:"var(--muted)"}}>
                {attendees.length === 0 ? "No attendees" : attendees.map(a => {
                  const c = colleagues.find(col => String(col.id) === String(a.id));
                  return c?.name || a.name || a.id;
                }).join(", ")}
              </div>
            )}
          </div>
        )}

        <div className="calp-modal-actions">
          <button className="calp-btn calp-btn-ghost" onClick={onClose}>Close</button>
          {isOwner && !isGoogle && (
            <button className="calp-btn calp-btn-primary" onClick={handleSave} disabled={saving || !title.trim()}>
              {saving ? "Saving..." : isEdit ? "Update" : "Create"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
