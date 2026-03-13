import { useEffect, useState } from "react";
import { API, authFetch } from "../api.js";

export default function MyShiftsPage() {
  const [assignments, setAssignments] = useState([]);

  useEffect(() => {
    authFetch(`${API}/api/v1/shifts/my?days=21`)
      .then((res) => res.ok ? res.json() : { assignments: [] })
      .then((data) => setAssignments(data.assignments || []))
      .catch(() => setAssignments([]));
  }, []);

  return (
    <div style={{ maxWidth: 1000 }}>
      <h1>My Shifts</h1>
      <p style={{ color: "var(--muted)" }}>
        See your upcoming schedule in one place, including shift type and working hours.
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        {assignments.length === 0 ? (
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel)", color: "var(--muted)" }}>
            No shifts are scheduled for you yet.
          </div>
        ) : assignments.map((assignment) => (
          <div key={assignment.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700 }}>{assignment.shift_name}</div>
                <div style={{ color: "var(--muted)", fontSize: 13 }}>{assignment.shift_type} · {assignment.shift_date}</div>
              </div>
              <div className="btn">{assignment.start_time} - {assignment.end_time}</div>
            </div>
            {assignment.notes ? <div style={{ marginTop: 8 }}>{assignment.notes}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
