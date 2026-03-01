import { useState, useEffect } from "react";
import { API, authFetch } from "../api.js";
import "./CalendarPage.css";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const EVENT_TYPES = ["meeting","task","reminder","out-of-office","social","training"];
const EVENT_COLORS = { meeting:"#8b5cf6", task:"#3b82f6", reminder:"#f59e0b", "out-of-office":"#ef4444", social:"#10b981", training:"#6366f1" };

function pad(n) { return String(n).padStart(2,"0"); }
function fmtDate(y,m,d) { return `${y}-${pad(m+1)}-${pad(d)}`; }
function fmtTime(iso) { if(!iso) return ""; return new Date(iso).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}); }

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editEvent, setEditEvent] = useState(null);
  const [colleagues, setColleagues] = useState([]);

  const currentUser = JSON.parse(localStorage.getItem("rafiki_user") || "{}");

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

  useEffect(() => { loadEvents(); }, [year, month]);
  useEffect(() => { loadColleagues(); }, []);

  const prevMonth = () => { if(month===0){setMonth(11);setYear(year-1);}else setMonth(month-1); setSelectedDay(null); };
  const nextMonth = () => { if(month===11){setMonth(0);setYear(year+1);}else setMonth(month+1); setSelectedDay(null); };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelectedDay(today.getDate()); };

  // Build calendar grid
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
    return events.filter(e => e.start_time && e.start_time.slice(0,10) === ds);
  };

  const isToday = (d) => d===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();

  const dayEvents = selectedDay ? eventsForDay(selectedDay) : [];

  const handleDeleteEvent = async (id) => {
    if (!confirm("Delete this event?")) return;
    const res = await authFetch(`${API}/api/v1/calendar/${id}`, {method:"DELETE"});
    if (res.ok) loadEvents();
  };

  const handleRSVP = async (eventId, status) => {
    await authFetch(`${API}/api/v1/calendar/${eventId}/rsvp`, {
      method:"POST", body: JSON.stringify({status}),
    });
    loadEvents();
  };

  const openCreate = () => { setEditEvent(null); setShowModal(true); };
  const openEdit = (ev) => { setEditEvent(ev); setShowModal(true); };

  return (
    <div className="calp-page">
      <div className="calp-header">
        <h1>Calendar</h1>
        <div style={{display:"flex",gap:"0.5rem"}}>
          <button className="calp-btn calp-btn-ghost" onClick={goToday}>Today</button>
          <button className="calp-btn calp-btn-primary" onClick={openCreate}>+ New Event</button>
        </div>
      </div>

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
              onClick={() => !c.outside && setSelectedDay(sel?null:c.day)}
            >
              <div className="calp-day-num">{c.day}</div>
              {de.slice(0,3).map(e => (
                <div key={e.id} className="calp-day-event"
                  style={{background: EVENT_COLORS[e.event_type] || e.color || "#8b5cf6"}}
                  onClick={ev => { ev.stopPropagation(); setSelectedDay(c.day); }}
                >
                  {e.title}
                </div>
              ))}
              {de.length > 3 && <div className="calp-day-more">+{de.length-3} more</div>}
            </div>
          );
        })}
      </div>

      {selectedDay && (
        <div className="calp-detail">
          <h3>{MONTH_NAMES[month]} {selectedDay}, {year}</h3>
          {dayEvents.length === 0 && <div className="calp-detail-empty">No events this day</div>}
          {dayEvents.map(e => {
            const myRsvp = (e.attendees||[]).find(a => a.id === currentUser.id);
            return (
              <div key={e.id} className="calp-event-card">
                <div className="calp-event-color" style={{background: EVENT_COLORS[e.event_type] || e.color || "#8b5cf6"}} />
                <div className="calp-event-info">
                  <div className="calp-event-title">
                    {e.title}
                    <span className="calp-event-badge">{e.event_type || "meeting"}</span>
                    {e.is_shared && <span className="calp-event-badge" style={{background:"#10b981"}}>shared</span>}
                  </div>
                  <div className="calp-event-meta">
                    {e.is_all_day ? "All day" : `${fmtTime(e.start_time)}${e.end_time ? " – "+fmtTime(e.end_time) : ""}`}
                    {e.location && ` · ${e.location}`}
                    {e.is_virtual && e.meeting_link && (
                      <> · <a href={e.meeting_link} target="_blank" rel="noopener noreferrer" style={{color:"var(--accent)"}}>Join</a></>
                    )}
                  </div>
                  {e.description && <div className="calp-event-meta" style={{marginTop:"4px"}}>{e.description}</div>}
                  {(e.attendees||[]).length > 0 && (
                    <div className="calp-event-meta" style={{marginTop:"4px"}}>
                      {(e.attendees||[]).length} attendee{(e.attendees||[]).length!==1?"s":""}
                      {myRsvp && ` · You: ${myRsvp.status}`}
                    </div>
                  )}
                </div>
                <div className="calp-event-actions">
                  {String(e.user_id) === String(currentUser.id) && (
                    <>
                      <button onClick={() => openEdit(e)}>Edit</button>
                      <button onClick={() => handleDeleteEvent(e.id)}>Del</button>
                    </>
                  )}
                  {String(e.user_id) !== String(currentUser.id) && (
                    <>
                      <button onClick={() => handleRSVP(e.id,"accepted")}>Accept</button>
                      <button onClick={() => handleRSVP(e.id,"declined")}>Decline</button>
                    </>
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
          selectedDate={selectedDay ? fmtDate(year,month,selectedDay) : null}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); loadEvents(); }}
        />
      )}
    </div>
  );
}

function EventModal({ event, colleagues, selectedDate, onClose, onSaved }) {
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
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const body = {
      title, description, event_type: eventType,
      start_time: new Date(startTime).toISOString(),
      end_time: endTime ? new Date(endTime).toISOString() : null,
      is_all_day: isAllDay, is_shared: isShared,
      location: location || null, is_virtual: isVirtual,
      meeting_link: meetingLink || null, color,
    };

    const url = isEdit ? `${API}/api/v1/calendar/${event.id}` : `${API}/api/v1/calendar/`;
    const method = isEdit ? "PUT" : "POST";
    const res = await authFetch(url, { method, body: JSON.stringify(body) });
    setSaving(false);
    if (res.ok) onSaved();
  };

  return (
    <div className="calp-modal-overlay" onClick={onClose}>
      <div className="calp-modal" onClick={e => e.stopPropagation()}>
        <h2>{isEdit ? "Edit Event" : "New Event"}</h2>

        <div className="calp-form-row">
          <label>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Event title" />
        </div>

        <div className="calp-form-row-inline">
          <div className="calp-form-row">
            <label>Type</label>
            <select value={eventType} onChange={e => setEventType(e.target.value)}>
              {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="calp-form-row">
            <label>Color</label>
            <input type="color" value={color} onChange={e => setColor(e.target.value)} />
          </div>
        </div>

        <div className="calp-form-check">
          <input type="checkbox" id="calp-allday" checked={isAllDay} onChange={e => setIsAllDay(e.target.checked)} />
          <label htmlFor="calp-allday">All day</label>
        </div>

        {!isAllDay && (
          <div className="calp-form-row-inline">
            <div className="calp-form-row">
              <label>Start</label>
              <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="calp-form-row">
              <label>End</label>
              <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>
        )}
        {isAllDay && (
          <div className="calp-form-row">
            <label>Date</label>
            <input type="date" value={startTime.slice(0,10)} onChange={e => setStartTime(e.target.value+"T00:00")} />
          </div>
        )}

        <div className="calp-form-row">
          <label>Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" />
        </div>

        <div className="calp-form-row">
          <label>Location</label>
          <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Room, address, etc." />
        </div>

        <div className="calp-form-check">
          <input type="checkbox" id="calp-virtual" checked={isVirtual} onChange={e => setIsVirtual(e.target.checked)} />
          <label htmlFor="calp-virtual">Virtual meeting</label>
        </div>

        {isVirtual && (
          <div className="calp-form-row">
            <label>Meeting link</label>
            <input value={meetingLink} onChange={e => setMeetingLink(e.target.value)} placeholder="https://..." />
          </div>
        )}

        <div className="calp-form-check">
          <input type="checkbox" id="calp-shared" checked={isShared} onChange={e => setIsShared(e.target.checked)} />
          <label htmlFor="calp-shared">Share with org</label>
        </div>

        <div className="calp-modal-actions">
          <button className="calp-btn calp-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="calp-btn calp-btn-primary" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? "Saving..." : isEdit ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
