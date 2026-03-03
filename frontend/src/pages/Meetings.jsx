// frontend/src/pages/Meetings.jsx
import { useState, useEffect, useCallback } from 'react';
import styles from './Meetings.module.css';

const API = 'https://rafiki-backend.onrender.com/api/v1/meetings';

function getToken() {
  return localStorage.getItem('rafiki_token');
}

function authHeaders() {
  return {
    'Authorization': `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  };
}

function formatDate(iso) {
  if (!iso) return 'Instant / Ad-hoc';
  const d = new Date(iso);
  return d.toLocaleString('en-KE', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function MeetingCard({ meeting, onJoin, onDelete, currentUserId }) {
  const isHost = meeting.host_id === currentUserId;
  const isPast = meeting.ended_at || (meeting.scheduled_at && new Date(meeting.scheduled_at) < new Date() && !meeting.started_at);

  return (
    <div className={`${styles.card} ${isPast ? styles.cardPast : ''}`}>
      <div className={styles.cardHeader}>
        <span className={`${styles.badge} ${styles[`badge_${meeting.meeting_type}`]}`}>
          {meeting.meeting_type === 'one_on_one' ? '1-on-1' : 'Group'}
        </span>
        {isHost && <span className={styles.hostBadge}>Host</span>}
      </div>
      <h3 className={styles.cardTitle}>{meeting.title}</h3>
      {meeting.description && <p className={styles.cardDesc}>{meeting.description}</p>}
      <div className={styles.cardMeta}>
        <span className={styles.metaItem}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          {formatDate(meeting.scheduled_at)}
        </span>
        <span className={styles.metaItem}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
          {meeting.duration_minutes} min
        </span>
      </div>
      <div className={styles.cardActions}>
        <button
          className={styles.joinBtn}
          onClick={() => onJoin(meeting)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          Join Meeting
        </button>
        {isHost && (
          <button className={styles.deleteBtn} onClick={() => onDelete(meeting.id)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function ScheduleModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    scheduled_at: '',
    duration_minutes: 60,
    meeting_type: 'group',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!form.title.trim()) { setError('Title is required'); return; }
    setLoading(true);
    setError('');
    try {
      const body = {
        ...form,
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
        duration_minutes: parseInt(form.duration_minutes),
      };
      const res = await fetch(API, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to create meeting');
      onCreated(data);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Schedule a Meeting</h2>
          <button className={styles.modalClose} onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Meeting Title *</label>
          <input
            className={styles.input}
            placeholder="e.g. Weekly Team Sync"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Description</label>
          <textarea
            className={styles.textarea}
            placeholder="What's this meeting about?"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={3}
          />
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Date & Time</label>
            <input
              className={styles.input}
              type="datetime-local"
              value={form.scheduled_at}
              onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Duration (minutes)</label>
            <input
              className={styles.input}
              type="number"
              min={15}
              max={480}
              step={15}
              value={form.duration_minutes}
              onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))}
            />
          </div>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Meeting Type</label>
          <div className={styles.typeToggle}>
            {['group', 'one_on_one'].map(t => (
              <button
                key={t}
                className={`${styles.typeBtn} ${form.meeting_type === t ? styles.typeBtnActive : ''}`}
                onClick={() => setForm(f => ({ ...f, meeting_type: t }))}
              >
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

function JitsiRoom({ meeting, onClose }) {
  return (
    <div className={styles.jitsiOverlay}>
      <div className={styles.jitsiHeader}>
        <div className={styles.jitsiTitle}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          {meeting.title}
        </div>
        <button className={styles.jitsiClose} onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Leave Meeting
        </button>
      </div>
      <iframe
        className={styles.jitsiFrame}
        src={`${meeting.jitsi_url}#config.prejoinPageEnabled=false&config.startWithAudioMuted=false&config.startWithVideoMuted=false&userInfo.displayName=${encodeURIComponent('Rafiki User')}&interfaceConfig.SHOW_JITSI_WATERMARK=false&interfaceConfig.TOOLBAR_BUTTONS=["microphone","camera","desktop","chat","recording","participants-pane","hangup"]`}
        allow="camera; microphone; display-capture; autoplay; clipboard-write"
        allowFullScreen
      />
    </div>
  );
}

export default function Meetings() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [activeRoom, setActiveRoom] = useState(null);
  const [filter, setFilter] = useState('upcoming');

  const userRaw = localStorage.getItem('rafiki_user');
  const currentUser = userRaw ? JSON.parse(userRaw) : {};
  const currentUserId = currentUser.user_id;

  const fetchMeetings = useCallback(async () => {
    try {
      const res = await fetch(API, { headers: authHeaders() });
      const data = await res.json();
      setMeetings(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch meetings:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMeetings(); }, [fetchMeetings]);

  const handleDelete = async (id) => {
    if (!window.confirm('Cancel this meeting?')) return;
    await fetch(`${API}/${id}`, { method: 'DELETE', headers: authHeaders() });
    setMeetings(m => m.filter(x => x.id !== id));
  };

  const handleJoin = (meeting) => setActiveRoom(meeting);

  const handleInstantMeeting = async () => {
    const res = await fetch(API, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        title: 'Instant Meeting',
        meeting_type: 'group',
        duration_minutes: 60,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setMeetings(m => [data, ...m]);
      setActiveRoom(data);
    }
  };

  const now = new Date();
  const filtered = meetings.filter(m => {
    if (filter === 'upcoming') return !m.ended_at && (!m.scheduled_at || new Date(m.scheduled_at) >= now);
    if (filter === 'past') return !!m.ended_at || (m.scheduled_at && new Date(m.scheduled_at) < now);
    return true;
  });

  if (activeRoom) {
    return <JitsiRoom meeting={activeRoom} onClose={() => { setActiveRoom(null); fetchMeetings(); }} />;
  }

  return (
    <div className={styles.page}>
      {showModal && (
        <ScheduleModal
          onClose={() => setShowModal(false)}
          onCreated={m => setMeetings(prev => [m, ...prev])}
        />
      )}

      <div className={styles.header}>
        <div>
          <h1 className={styles.pageTitle}>Meetings</h1>
          <p className={styles.pageSubtitle}>Schedule and join video meetings with your team</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.instantBtn} onClick={handleInstantMeeting}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
            Start Instant Meeting
          </button>
          <button className={styles.scheduleBtn} onClick={() => setShowModal(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Schedule Meeting
          </button>
        </div>
      </div>

      <div className={styles.filters}>
        {['upcoming', 'past', 'all'].map(f => (
          <button
            key={f}
            className={`${styles.filterBtn} ${filter === f ? styles.filterBtnActive : ''}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.empty}>
          <div className={styles.spinner} />
          <p>Loading meetings...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          </div>
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
              onJoin={handleJoin}
              onDelete={handleDelete}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
