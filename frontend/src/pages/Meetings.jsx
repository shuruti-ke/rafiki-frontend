// frontend/src/pages/Meetings.jsx
import { useState, useEffect, useCallback } from 'react';
import styles from './Meetings.module.css';

const API = 'https://rafiki-backend.onrender.com/api/v1/meetings';
const LOGO = '/Rafiki_logo_2.png';

function getToken() { return localStorage.getItem('rafiki_token'); }
function authHeaders() {
  return { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
}
function formatDate(iso) {
  if (!iso) return 'Instant / Ad-hoc';
  return new Date(iso).toLocaleString('en-KE', {
    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ── Wellbeing Modal ──
function WellbeingModal({ meeting, onClose }) {
  const [rating, setRating] = useState(null);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const EMOJIS = ['😔', '😕', '😐', '🙂', '😊'];
  const LABELS = ['Really tough', 'Difficult', 'Okay', 'Good', 'Great!'];

  const submit = async () => {
    if (!rating) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/${meeting.id}/wellbeing`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ rating, note }),
      });
      const data = await res.json();
      setMessage(data.message);
      setDone(true);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.wellbeingHeader}>
          <img src={LOGO} alt="Rafiki" className={styles.wellbeingLogo} />
          <h2 className={styles.modalTitle}>How did that meeting go?</h2>
          <p className={styles.wellbeingSubtitle}>Your response is anonymous and helps us support you better.</p>
        </div>

        {!done ? (
          <>
            <div className={styles.emojiRow}>
              {EMOJIS.map((e, i) => (
                <button
                  key={i}
                  className={`${styles.emojiBtn} ${rating === i + 1 ? styles.emojiBtnActive : ''}`}
                  onClick={() => setRating(i + 1)}
                >
                  <span className={styles.emoji}>{e}</span>
                  <span className={styles.emojiLabel}>{LABELS[i]}</span>
                </button>
              ))}
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Anything you'd like to share? (optional)</label>
              <textarea
                className={styles.textarea}
                rows={2}
                placeholder="How are you feeling about the outcome..."
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={onClose}>Skip</button>
              <button className={styles.submitBtn} onClick={submit} disabled={!rating || loading}>
                {loading ? 'Sending...' : 'Submit'}
              </button>
            </div>
          </>
        ) : (
          <div className={styles.wellbeingDone}>
            <p className={styles.wellbeingMessage}>{message}</p>
            <button className={styles.submitBtn} onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Post-Meeting Modal (summary + action items) ──
function PostMeetingModal({ meeting, onClose, onObjectivesPushed }) {
  const [tab, setTab] = useState('summary');
  const [notes, setNotes] = useState('');
  const [summary, setSummary] = useState(meeting.summary || '');
  const [actionItems, setActionItems] = useState(meeting.action_items || []);
  const [selectedItems, setSelectedItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushed, setPushed] = useState(false);
  const [coachingLoading, setCoachingLoading] = useState(false);
  const [coachingNotes, setCoachingNotes] = useState('');

  const generateSummary = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/${meeting.id}/summary`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ notes }),
      });
      const data = await res.json();
      setSummary(data.summary);
      setActionItems(data.action_items || []);
      setTab('actions');
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const pushToObjectives = async () => {
    if (selectedItems.length === 0) return;
    setPushLoading(true);
    try {
      const res = await fetch(`${API}/${meeting.id}/push-objectives`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ action_items: selectedItems }),
      });
      const data = await res.json();
      if (res.ok) { setPushed(true); onObjectivesPushed && onObjectivesPushed(data); }
    } catch (e) { console.error(e); }
    finally { setPushLoading(false); }
  };

  const generateCoachingNotes = async () => {
    setCoachingLoading(true);
    try {
      const res = await fetch(`${API}/${meeting.id}/coaching-notes`, {
        method: 'POST', headers: authHeaders(),
      });
      const data = await res.json();
      setCoachingNotes(data.notes || '');
      setTab('coaching');
    } catch (e) { console.error(e); }
    finally { setCoachingLoading(false); }
  };

  const toggleItem = (item) => {
    setSelectedItems(prev =>
      prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]
    );
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalWide}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleRow}>
            <img src={LOGO} alt="Rafiki" style={{ width: 28, height: 28, objectFit: 'contain' }} />
            <h2 className={styles.modalTitle}>Meeting Intelligence</h2>
          </div>
          <button className={styles.modalClose} onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <p className={styles.postMeetingSubtitle}>{meeting.title}</p>

        {/* Tabs */}
        <div className={styles.tabRow}>
          {['summary', 'actions', ...(meeting.meeting_type === 'one_on_one' ? ['coaching'] : [])].map(t => (
            <button
              key={t}
              className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'summary' ? '📝 Summary' : t === 'actions' ? '✅ Action Items' : '🎯 Coaching Notes'}
            </button>
          ))}
        </div>

        {/* Summary tab */}
        {tab === 'summary' && (
          <div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Paste meeting notes or transcript (optional)</label>
              <textarea
                className={styles.textarea}
                rows={5}
                placeholder="Paste any notes, key discussion points, or transcript here for a more accurate summary..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
            {summary && (
              <div className={styles.aiResult}>
                <div className={styles.aiResultLabel}>✨ AI Summary</div>
                <p className={styles.aiResultText}>{summary}</p>
              </div>
            )}
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={onClose}>Close</button>
              <button className={styles.submitBtn} onClick={generateSummary} disabled={loading}>
                {loading ? 'Generating...' : summary ? 'Regenerate Summary' : 'Generate Summary'}
              </button>
            </div>
          </div>
        )}

        {/* Action items tab */}
        {tab === 'actions' && (
          <div>
            {actionItems.length === 0 ? (
              <div className={styles.aiEmpty}>
                <p>No action items yet. Generate a summary first.</p>
                <button className={styles.submitBtn} onClick={() => setTab('summary')}>
                  Go to Summary
                </button>
              </div>
            ) : (
              <>
                <p className={styles.actionHint}>Select action items to push to your Objectives:</p>
                <div className={styles.actionList}>
                  {actionItems.map((item, i) => (
                    <label key={i} className={`${styles.actionItem} ${selectedItems.includes(item) ? styles.actionItemSelected : ''}`}>
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(item)}
                        onChange={() => toggleItem(item)}
                        className={styles.actionCheckbox}
                      />
                      <span>{item}</span>
                    </label>
                  ))}
                </div>
                {pushed ? (
                  <div className={styles.pushedSuccess}>
                    ✅ {selectedItems.length} objective{selectedItems.length > 1 ? 's' : ''} created in your Objectives page!
                  </div>
                ) : (
                  <div className={styles.modalFooter}>
                    <button className={styles.cancelBtn} onClick={onClose}>Close</button>
                    <button
                      className={styles.submitBtn}
                      onClick={pushToObjectives}
                      disabled={selectedItems.length === 0 || pushLoading}
                    >
                      {pushLoading ? 'Creating...' : `Push ${selectedItems.length || ''} to Objectives`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Coaching notes tab (1-on-1 only) */}
        {tab === 'coaching' && (
          <div>
            {coachingNotes ? (
              <div className={styles.aiResult}>
                <div className={styles.aiResultLabel}>🎯 Coaching Notes</div>
                <pre className={styles.coachingNotes}>{coachingNotes}</pre>
              </div>
            ) : (
              <div className={styles.aiEmpty}>
                <p>Generate AI coaching notes based on this 1-on-1 session.</p>
              </div>
            )}
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={onClose}>Close</button>
              <button className={styles.submitBtn} onClick={generateCoachingNotes} disabled={coachingLoading}>
                {coachingLoading ? 'Generating...' : coachingNotes ? 'Regenerate Notes' : 'Generate Coaching Notes'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Agenda Panel ──
function AgendaPanel({ meeting, onClose }) {
  const [agenda, setAgenda] = useState(meeting.agenda || '');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!meeting.agenda) generateAgenda();
  }, []);

  const generateAgenda = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/${meeting.id}/agenda`, {
        method: 'POST', headers: authHeaders(),
      });
      const data = await res.json();
      setAgenda(data.agenda || '');
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleRow}>
            <img src={LOGO} alt="Rafiki" style={{ width: 28, height: 28, objectFit: 'contain' }} />
            <h2 className={styles.modalTitle}>AI Agenda</h2>
          </div>
          <button className={styles.modalClose} onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <p className={styles.postMeetingSubtitle}>{meeting.title} · {meeting.duration_minutes} min</p>
        {loading ? (
          <div className={styles.aiLoading}>
            <div className={styles.spinner} />
            <p>Rafiki is generating your agenda...</p>
          </div>
        ) : (
          <div className={styles.aiResult}>
            <div className={styles.aiResultLabel}>✨ Generated Agenda</div>
            <pre className={styles.agendaText}>{agenda}</pre>
          </div>
        )}
        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose}>Close</button>
          <button className={styles.submitBtn} onClick={generateAgenda} disabled={loading}>
            Regenerate
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Jitsi Room ──
function JitsiRoom({ meeting, onClose, onMeetingEnded }) {
  const [tokenData, setTokenData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showWellbeing, setShowWellbeing] = useState(false);
  const [showPostMeeting, setShowPostMeeting] = useState(false);

  useEffect(() => {
    async function fetchToken() {
      try {
        const res = await fetch(`${API}/${meeting.id}/token`, {
          method: 'POST', headers: authHeaders(),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to get token');
        setTokenData(data);
      } catch (e) { setError(e.message); }
      finally { setLoading(false); }
    }
    fetchToken();
  }, [meeting.id]);

  const buildIframeSrc = () => {
    if (!tokenData) return null;
    if (tokenData.jaas_configured && tokenData.token) {
      return `https://8x8.vc/${tokenData.app_id}/${tokenData.room_name}?jwt=${tokenData.token}#config.prejoinPageEnabled=false&interfaceConfig.SHOW_JITSI_WATERMARK=false`;
    }
    return `${meeting.jitsi_url}#config.prejoinPageEnabled=false&interfaceConfig.SHOW_JITSI_WATERMARK=false`;
  };

  const handleLeave = () => {
    setShowWellbeing(true);
  };

  if (showPostMeeting) {
    return <PostMeetingModal
      meeting={meeting}
      onClose={() => { setShowPostMeeting(false); onClose(); }}
      onObjectivesPushed={() => {}}
    />;
  }

  if (showWellbeing) {
    return <WellbeingModal
      meeting={meeting}
      onClose={() => { setShowWellbeing(false); setShowPostMeeting(true); }}
    />;
  }

  return (
    <div className={styles.jitsiOverlay}>
      <div className={styles.jitsiHeader}>
        <div className={styles.jitsiTitle}>
          <img src={LOGO} alt="Rafiki" className={styles.jitsiLogo} />
          <span className={styles.jitsiTitleText}>{meeting.title}</span>
          {tokenData?.is_moderator && <span className={styles.moderatorBadge}>Moderator</span>}
        </div>
        <button className={styles.jitsiClose} onClick={handleLeave}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          Leave Meeting
        </button>
      </div>

      {loading && (
        <div className={styles.jitsiLoading}>
          <img src={LOGO} alt="Rafiki" className={styles.jitsiLoadingLogo} />
          <div className={styles.jitsiLoadingText}>Preparing your secure meeting room...</div>
          <div className={styles.jitsiSpinner} />
        </div>
      )}
      {error && (
        <div className={styles.jitsiError}>
          <img src={LOGO} alt="Rafiki" className={styles.jitsiLoadingLogo} />
          <p>Failed to join: {error}</p>
          <button className={styles.scheduleBtn} onClick={onClose}>Go Back</button>
        </div>
      )}
      {!loading && !error && (
        <iframe
          className={styles.jitsiFrame}
          src={buildIframeSrc()}
          allow="camera; microphone; display-capture; autoplay; clipboard-write"
          allowFullScreen
        />
      )}
    </div>
  );
}

// ── Meeting Card ──
function MeetingCard({ meeting, onJoin, onDelete, onAgenda, currentUserId }) {
  const isHost = meeting.host_id === currentUserId;
  const isPast = meeting.ended_at || (meeting.scheduled_at && new Date(meeting.scheduled_at) < new Date() && !meeting.started_at);

  return (
    <div className={`${styles.card} ${isPast ? styles.cardPast : ''}`}>
      <div className={styles.cardHeader}>
        <span className={`${styles.badge} ${styles[`badge_${meeting.meeting_type}`]}`}>
          {meeting.meeting_type === 'one_on_one' ? '1-on-1' : 'Group'}
        </span>
        {isHost && <span className={styles.hostBadge}>Host</span>}
        {meeting.agenda && <span className={styles.aiBadge}>📋 Agenda ready</span>}
      </div>
      <h3 className={styles.cardTitle}>{meeting.title}</h3>
      {meeting.description && <p className={styles.cardDesc}>{meeting.description}</p>}
      <div className={styles.cardMeta}>
        <span className={styles.metaItem}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          {formatDate(meeting.scheduled_at)}
        </span>
        <span className={styles.metaItem}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
          </svg>
          {meeting.duration_minutes} min
        </span>
      </div>
      <div className={styles.cardActions}>
        <button className={styles.agendaBtn} onClick={() => onAgenda(meeting)} title="Generate AI agenda">
          📋
        </button>
        <button className={styles.joinBtn} onClick={() => onJoin(meeting)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="23 7 16 12 23 17 23 7"/>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
          </svg>
          Join
        </button>
        {isHost && (
          <button className={styles.deleteBtn} onClick={() => onDelete(meeting.id)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Schedule Modal ──
function ScheduleModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    title: '', description: '', scheduled_at: '',
    duration_minutes: 60, meeting_type: 'group',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!form.title.trim()) { setError('Title is required'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(API, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          ...form,
          scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
          duration_minutes: parseInt(form.duration_minutes),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to create meeting');
      onCreated(data);
      window.dispatchEvent(new CustomEvent('rafiki:calendar-refresh'));
      onClose();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Schedule a Meeting</h2>
          <button className={styles.modalClose} onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Meeting Title *</label>
          <input className={styles.input} placeholder="e.g. Weekly Team Sync"
            value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Description</label>
          <textarea className={styles.textarea} rows={3} placeholder="What's this meeting about?"
            value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        </div>
        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Date & Time</label>
            <input className={styles.input} type="datetime-local"
              value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Duration (minutes)</label>
            <input className={styles.input} type="number" min={15} max={480} step={15}
              value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))} />
          </div>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Meeting Type</label>
          <div className={styles.typeToggle}>
            {['group', 'one_on_one'].map(t => (
              <button key={t}
                className={`${styles.typeBtn} ${form.meeting_type === t ? styles.typeBtnActive : ''}`}
                onClick={() => setForm(f => ({ ...f, meeting_type: t }))}>
                {t === 'group' ? '👥 Group' : '👤 1-on-1'}
              </button>
            ))}
          </div>
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.submitBtn} onClick={handleSubmit} disabled={loading}>
            {loading ? 'Scheduling...' : 'Schedule Meeting'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──
export default function Meetings() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [activeRoom, setActiveRoom] = useState(null);
  const [agendaMeeting, setAgendaMeeting] = useState(null);
  const [filter, setFilter] = useState('upcoming');

  const userRaw = localStorage.getItem('rafiki_user');
  const currentUser = userRaw ? JSON.parse(userRaw) : {};
  const currentUserId = currentUser.user_id;

  const fetchMeetings = useCallback(async () => {
    try {
      const res = await fetch(API, { headers: authHeaders() });
      const data = await res.json();
      setMeetings(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchMeetings(); }, [fetchMeetings]);

  const handleDelete = async (id) => {
    if (!window.confirm('Cancel this meeting?')) return;
    await fetch(`${API}/${id}`, { method: 'DELETE', headers: authHeaders() });
    setMeetings(m => m.filter(x => x.id !== id));
    window.dispatchEvent(new CustomEvent('rafiki:calendar-refresh'));
  };

  const handleInstantMeeting = async () => {
    const res = await fetch(API, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ title: 'Instant Meeting', meeting_type: 'group', duration_minutes: 60 }),
    });
    const data = await res.json();
    if (res.ok) {
      setMeetings(m => [data, ...m]);
      setActiveRoom(data);
      window.dispatchEvent(new CustomEvent('rafiki:calendar-refresh'));
    }
  };

  const now = new Date();
  const filtered = meetings.filter(m => {
    if (filter === 'upcoming') return !m.ended_at && (!m.scheduled_at || new Date(m.scheduled_at) >= now);
    if (filter === 'past') return !!m.ended_at || (m.scheduled_at && new Date(m.scheduled_at) < now);
    return true;
  });

  if (activeRoom) {
    return <JitsiRoom
      meeting={activeRoom}
      onClose={() => { setActiveRoom(null); fetchMeetings(); }}
      onMeetingEnded={fetchMeetings}
    />;
  }

  return (
    <div className={styles.page}>
      {showModal && <ScheduleModal onClose={() => setShowModal(false)} onCreated={m => setMeetings(p => [m, ...p])} />}
      {agendaMeeting && <AgendaPanel meeting={agendaMeeting} onClose={() => setAgendaMeeting(null)} />}

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <img src={LOGO} alt="Rafiki" className={styles.headerLogo} />
          <div>
            <h1 className={styles.pageTitle}>Meetings</h1>
            <p className={styles.pageSubtitle}>Schedule and join secure AI-powered video meetings</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.instantBtn} onClick={handleInstantMeeting}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
            </svg>
            Start Instant Meeting
          </button>
          <button className={styles.scheduleBtn} onClick={() => setShowModal(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Schedule Meeting
          </button>
        </div>
      </div>

      <div className={styles.filters}>
        {['upcoming', 'past', 'all'].map(f => (
          <button key={f}
            className={`${styles.filterBtn} ${filter === f ? styles.filterBtnActive : ''}`}
            onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.empty}>
          <img src={LOGO} alt="Rafiki" className={styles.emptyLogo} />
          <div className={styles.spinner} />
          <p>Loading meetings...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <img src={LOGO} alt="Rafiki" className={styles.emptyLogo} />
          <h3>No {filter} meetings</h3>
          <p>Schedule a meeting or start an instant call with your team.</p>
          <button className={styles.scheduleBtn} onClick={() => setShowModal(true)}>
            Schedule Your First Meeting
          </button>
        </div>
      ) : (
        <div className={styles.grid}>
          {filtered.map(m => (
            <MeetingCard
              key={m.id}
              meeting={m}
              onJoin={m => setActiveRoom(m)}
              onDelete={handleDelete}
              onAgenda={m => setAgendaMeeting(m)}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
