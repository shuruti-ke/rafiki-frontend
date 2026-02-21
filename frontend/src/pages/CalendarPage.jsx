import { useState, useEffect } from "react";
import { API, authFetch } from "../api.js";
import "./CalendarPage.css";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const COLORS = ["#8b5cf6", "#1fbfb8", "#3b82f6", "#ef4444", "#10b981", "#f59e0b"];

function pad(n) { return String(n).padStart(2, "0"); }
function fmtTime(iso) { if (!iso) return ""; const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtDate(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", date: "", startTime: "", endTime: "", isAllDay: false, isShared: false, color: "#8b5cf6" });

  const loadEvents = async () => {
    const start = new Date(year, month, 1).toISOString();
    const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
    const res = await authFetch(`${API}/api/v1/calendar/?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
    if (res.ok) setEvents(await res.json());
  };

  useEffect(() => { loadEvents(); }, [year, month]);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); setSelectedDay(null); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); setSelectedDay(null); };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelectedDay(today.getDate()); };

  // Calendar grid
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push({ day: daysInPrev - firstDow + 1 + i, outside: true });
  for (let i = 1; i <= daysInMonth; i++) cells.push({ day: i, outside: false });
  const remaining = 7 - (cells.length % 7);
  if (remaining < 7) for (let i = 1; i <= remaining; i++) cells.push({ day: i, outside: true });

  const eventsForDay = (d) => {
    const ds = fmtDate(year, month, d);
    return events.filter(e => e.start_time && e.start_time.slice(0, 10) === ds);
  };

  const dayEvents = selectedDay ? eventsForDay(selectedDay) : [];

  const handleCreate = async () => {
    let start_time, end_time;
    if (form.isAllDay) {
      start_time = `${form.date}T00:00:00`;
      end_time = `${form.date}T23:59:59`;
    } else {
      start_time = `${form.date}T${form.startTime || "09:00"}:00`;
      end_time = form.endTime ? `${form.date}T${form.endTime}:00` : null;
    }
    const body = {
      title: form.title,
      description: form.description || null,
      start_time, end_time,
      is_all_day: form.isAllDay,
      is_shared: form.isShared,
      color: form.color,
    };
    const res = await authFetch(`${API}/api/v1/calendar/`, { method: "POST", body: JSON.stringify(body) });
    if (res.ok) { setShowForm(false); resetForm(); loadEvents(); }
  };

  const handleDeleteEvent = async (id) => {
    await authFetch(`${API}/api/v1/calendar/${id}`, { method: "DELETE" });
    loadEvents();
  };

  const resetForm = () => setForm({ title: "", description: "", date: "", startTime: "", endTime: "", isAllDay: false, isShared: false, color: "#8b5cf6" });

  const openForm = () => {
    setForm({ ...form, date: selectedDay ? fmtDate(year, month, selectedDay) : fmtDate(year, month, today.getDate()) });
    setShowForm(true);
  };

  const isToday = (d) => d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  return (
    <div className="cal-page">
      <div className="cal-header">
        <h2>Calendar</h2>
        <div className="cal-nav">
          <button className="cal-nav-btn" onClick={prevMonth}>&larr;</button>
          <span className="cal-month-label">{MONTH_NAMES[month]} {year}</span>
          <button className="cal-nav-btn" onClick={nextMonth}>&rarr;</button>
          <button className="cal-nav-btn" onClick={goToday}>Today</button>
        </div>
      </div>

      <div className="cal-grid">
        {DAY_NAMES.map(d => <div key={d} className="cal-day-header">{d}</div>)}
        {cells.map((c, i) => {
          const de = !c.outside ? eventsForDay(c.day) : [];
          return (
            <div
              key={i}
              className={`cal-day${c.outside ? " outside" : ""}${!c.outside && isToday(c.day) ? " today" : ""}${selectedDay === c.day && !c.outside ? " selected" : ""}`}
              onClick={() => !c.outside && setSelectedDay(c.day)}
            >
              <div className="cal-day-num">{c.day}</div>
              {de.length > 0 && (
                <div className="cal-day-dots">
                  {de.slice(0, 4).map((e, j) => (
                    <div key={j} className={`cal-dot ${e.is_shared ? "cal-dot-shared" : "cal-dot-personal"}`} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedDay && (
        <div className="cal-day-detail">
          <div className="cal-day-detail-header">
            <h3>{MONTH_NAMES[month]} {selectedDay}, {year}</h3>
            <button className="btn btnTiny btnPrimary" onClick={openForm}>Add Event</button>
          </div>
          {dayEvents.length === 0 && <div className="cal-empty">No events this day</div>}
          <div className="cal-event-list">
            {dayEvents.map(e => (
              <div key={e.id} className="cal-event-item">
                <div className="cal-event-color" style={{ background: e.color || "#8b5cf6" }} />
                <div className="cal-event-info">
                  <div className="cal-event-title">{e.title}</div>
                  <div className="cal-event-time">
                    {e.is_all_day ? "All day" : `${fmtTime(e.start_time)}${e.end_time ? ` – ${fmtTime(e.end_time)}` : ""}`}
                  </div>
                </div>
                {e.is_shared && <span className="cal-event-shared-badge">Shared</span>}
                <button className="cal-event-delete" onClick={() => handleDeleteEvent(e.id)}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <div className="cal-form">
          <h3>New Event</h3>
          <div className="cal-form-row">
            <label>Title</label>
            <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Event title" />
          </div>
          <div className="cal-form-row">
            <label>Date</label>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </div>
          {!form.isAllDay && (
            <div className="cal-form-inline">
              <div className="cal-form-row">
                <label>Start Time</label>
                <input type="time" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} />
              </div>
              <div className="cal-form-row">
                <label>End Time</label>
                <input type="time" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} />
              </div>
            </div>
          )}
          <div className="cal-form-row">
            <label className="cal-form-check">
              <input type="checkbox" checked={form.isAllDay} onChange={e => setForm({ ...form, isAllDay: e.target.checked })} />
              All day event
            </label>
          </div>
          <div className="cal-form-row">
            <label className="cal-form-check">
              <input type="checkbox" checked={form.isShared} onChange={e => setForm({ ...form, isShared: e.target.checked })} />
              Shared <small>(Visible to all org members)</small>
            </label>
          </div>
          <div className="cal-form-row">
            <label>Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Optional details..." />
          </div>
          <div className="cal-form-row">
            <label>Color</label>
            <div className="cal-color-swatches">
              {COLORS.map(c => (
                <div key={c} className={`cal-swatch${form.color === c ? " active" : ""}`} style={{ background: c }} onClick={() => setForm({ ...form, color: c })} />
              ))}
            </div>
          </div>
          <div className="cal-form-actions">
            <button className="btn btnPrimary" onClick={handleCreate} disabled={!form.title.trim() || !form.date}>Create Event</button>
            <button className="btn btnGhost" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
