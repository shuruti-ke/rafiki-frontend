// WellbeingBreakdownModal.jsx
// Sprint 3 — Rafiki HR | Wellbeing score transparency modal
// Opens when manager clicks an at-risk employee. Uses recharts RadarChart.
// Imports authFetch and API from ../api.js

import { useState, useEffect } from "react";
import { authFetch, API } from "../api.js";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
} from "recharts";

// ── Dimension display config ──────────────────────────────────────────────────
const DIMENSIONS = [
  { key: "stress",        label: "Stress",        color: "#f87171", icon: "🧠", invert: true  },
  { key: "workload",      label: "Workload",       color: "#fbbf24", icon: "📋", invert: true  },
  { key: "relationships", label: "Relationships",  color: "#34d399", icon: "🤝", invert: false },
  { key: "meaning",       label: "Meaning",        color: "#8b5cf6", icon: "✨", invert: false },
  { key: "energy",        label: "Energy",         color: "#1fbfb8", icon: "⚡", invert: false },
];

function scoreColor(score) {
  if (score >= 70) return "#34d399";
  if (score >= 45) return "#fbbf24";
  return "#f87171";
}

function scoreLabel(score) {
  if (score >= 70) return "Good";
  if (score >= 45) return "Watch";
  return "At Risk";
}

// Normalise raw dimension value to a 0–100 display score.
// For inverted dimensions (stress, workload), high raw = low wellbeing → flip it.
function displayScore(dim, rawValue) {
  return dim.invert ? 100 - rawValue : rawValue;
}

// ── Custom radar tooltip ──────────────────────────────────────────────────────
function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div style={{
      background: "#1a1a2e", color: "#fff",
      padding: "8px 14px", borderRadius: "8px",
      fontSize: "13px", fontFamily: "Source Sans 3, sans-serif",
      boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
    }}>
      <strong>{d.payload.dimension}</strong>: {d.value}
    </div>
  );
}

// ── Dimension score pill ──────────────────────────────────────────────────────
function DimensionRow({ dim, score, questionCount }) {
  const color = scoreColor(score);
  return (
    <div style={{
      display: "flex", alignItems: "center",
      gap: "12px", padding: "10px 0",
      borderBottom: "1px solid #f0ecfa",
    }}>
      <span style={{ fontSize: "18px", width: "24px", textAlign: "center" }}>{dim.icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
          <span style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a2e" }}>{dim.label}</span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{
              fontSize: "11px", color: "#a89fc0",
              fontFamily: "Source Sans 3, sans-serif",
            }}>
              {questionCount} question{questionCount !== 1 ? "s" : ""}
            </span>
            <span style={{
              fontSize: "12px", fontWeight: 700,
              color, background: color + "18",
              padding: "2px 10px", borderRadius: "12px",
              border: `1px solid ${color}40`,
            }}>
              {score} — {scoreLabel(score)}
            </span>
          </div>
        </div>
        <div style={{ height: "6px", borderRadius: "3px", background: "#f0ecfa", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${score}%`,
            background: `linear-gradient(90deg, ${color}99, ${color})`,
            borderRadius: "3px",
            transition: "width 0.6s ease",
          }} />
        </div>
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function WellbeingBreakdownModal({ employee, onClose }) {
  const [breakdown, setBreakdown] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!employee?.user_id) return;
    fetchBreakdown(employee.user_id);
  }, [employee?.user_id]);

  async function fetchBreakdown(employeeId) {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API}/wellbeing/${employeeId}/breakdown`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to load breakdown");
      }
      setBreakdown(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Build radar data from breakdown
  const radarData = breakdown
    ? DIMENSIONS.map(dim => ({
        dimension: dim.label,
        score: displayScore(dim, breakdown.dimensions[dim.key]?.raw_score ?? 50),
        fullMark: 100,
      }))
    : [];

  const overallScore = breakdown
    ? Math.round(radarData.reduce((s, d) => s + d.score, 0) / radarData.length)
    : null;

  const surveyDate = breakdown?.survey_date
    ? new Date(breakdown.survey_date).toLocaleDateString("en-GB", {
        day: "2-digit", month: "long", year: "numeric"
      })
    : "—";

  // ── Backdrop click to close ──
  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(26,26,46,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: "20px",
      }}
    >
      <div style={{
        background: "#fff",
        borderRadius: "16px",
        width: "100%", maxWidth: "680px",
        maxHeight: "92vh",
        overflow: "auto",
        boxShadow: "0 24px 64px rgba(139,92,246,0.2)",
        animation: "modalIn 0.22s ease",
      }}>
        <style>{`
          @keyframes modalIn {
            from { opacity: 0; transform: translateY(16px) scale(0.98); }
            to   { opacity: 1; transform: translateY(0)   scale(1);    }
          }
        `}</style>

        {/* Modal header */}
        <div style={{
          padding: "24px 28px 20px",
          borderBottom: "1px solid #f0ecfa",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        }}>
          <div>
            <h2 style={{
              fontFamily: "Playfair Display, serif",
              fontSize: "20px", fontWeight: 700,
              margin: 0,
              background: "linear-gradient(135deg,#8b5cf6 0%,#1fbfb8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              Wellbeing Breakdown
            </h2>
            <div style={{ fontSize: "14px", color: "#6b5c8a", marginTop: "4px", fontFamily: "Source Sans 3, sans-serif" }}>
              {employee?.name}
              {breakdown && (
                <span style={{ color: "#a89fc0", marginLeft: "8px" }}>
                  · Survey: {surveyDate} · {breakdown.total_questions} questions
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: "34px", height: "34px",
            borderRadius: "8px", border: "1.5px solid #e2d9f3",
            background: "transparent", cursor: "pointer",
            fontSize: "16px", color: "#6b5c8a",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: "24px 28px" }}>

          {loading && (
            <div style={{ textAlign: "center", padding: "48px 0", color: "#8b7fa8" }}>
              <div style={{
                width: "36px", height: "36px", margin: "0 auto 14px",
                border: "3px solid #e8e3f0", borderTopColor: "#8b5cf6",
                borderRadius: "50%", animation: "spin 0.8s linear infinite",
              }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              Loading wellbeing data…
            </div>
          )}

          {error && (
            <div style={{
              padding: "16px", borderRadius: "10px",
              background: "#fef2f2", border: "1px solid #fca5a5",
              color: "#dc2626", fontSize: "14px", textAlign: "center",
            }}>
              ⚠️ {error}
            </div>
          )}

          {breakdown && !loading && (
            <>
              {/* Overall score band */}
              <div style={{
                display: "flex", alignItems: "center", gap: "20px",
                padding: "16px 20px",
                borderRadius: "12px",
                background: `linear-gradient(135deg, ${scoreColor(overallScore)}12, ${scoreColor(overallScore)}06)`,
                border: `1.5px solid ${scoreColor(overallScore)}30`,
                marginBottom: "24px",
              }}>
                <div style={{
                  width: "56px", height: "56px", borderRadius: "50%",
                  background: `conic-gradient(${scoreColor(overallScore)} ${overallScore * 3.6}deg, #f0ecfa 0deg)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <div style={{
                    width: "42px", height: "42px", borderRadius: "50%",
                    background: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "15px", fontWeight: 800, color: scoreColor(overallScore),
                    fontFamily: "Playfair Display, serif",
                  }}>
                    {overallScore}
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily: "Playfair Display, serif", fontSize: "17px", fontWeight: 700, color: "#1a1a2e" }}>
                    Overall: {scoreLabel(overallScore)}
                  </div>
                  <div style={{ fontSize: "13px", color: "#6b5c8a", marginTop: "2px", fontFamily: "Source Sans 3, sans-serif" }}>
                    Composite across {DIMENSIONS.length} wellbeing dimensions
                  </div>
                </div>
              </div>

              {/* Radar chart */}
              <div style={{ height: "280px", marginBottom: "24px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                    <PolarGrid stroke="#e8e3f0" />
                    <PolarAngleAxis
                      dataKey="dimension"
                      tick={{ fill: "#6b5c8a", fontSize: 12, fontFamily: "Source Sans 3, sans-serif" }}
                    />
                    <PolarRadiusAxis
                      angle={90} domain={[0, 100]}
                      tick={{ fill: "#a89fc0", fontSize: 10 }}
                      tickCount={5}
                    />
                    <Radar
                      name="Score"
                      dataKey="score"
                      stroke="#8b5cf6"
                      fill="url(#radarGradient)"
                      fillOpacity={0.45}
                      strokeWidth={2}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <defs>
                      <linearGradient id="radarGradient" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" />
                        <stop offset="100%" stopColor="#1fbfb8" />
                      </linearGradient>
                    </defs>
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Dimension rows */}
              <div style={{ marginBottom: "24px" }}>
                {DIMENSIONS.map(dim => {
                  const raw = breakdown.dimensions[dim.key];
                  return (
                    <DimensionRow
                      key={dim.key}
                      dim={dim}
                      score={displayScore(dim, raw?.raw_score ?? 50)}
                      questionCount={raw?.question_count ?? 0}
                    />
                  );
                })}
              </div>

              {/* Legal disclaimer */}
              <div style={{
                padding: "14px 16px",
                borderRadius: "8px",
                background: "#faf9ff",
                border: "1px solid #e2d9f3",
                fontSize: "12px",
                color: "#8b7fa8",
                lineHeight: 1.6,
                fontFamily: "Source Sans 3, sans-serif",
                display: "flex", gap: "10px", alignItems: "flex-start",
              }}>
                <span style={{ fontSize: "16px", flexShrink: 0 }}>ℹ️</span>
                <span>
                  <strong style={{ color: "#6b5c8a" }}>Disclaimer:</strong>{" "}
                  This score is indicative only and does not constitute a clinical assessment.
                  Scores are derived from self-reported survey responses and should be interpreted
                  alongside direct conversations with the employee. If you have concerns about an
                  employee's mental health, please refer to your organisation's EAP or HR policy.
                </span>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 28px",
          borderTop: "1px solid #f0ecfa",
          display: "flex", justifyContent: "flex-end",
          background: "#faf9ff",
          borderRadius: "0 0 16px 16px",
        }}>
          <button onClick={onClose} style={{
            padding: "9px 22px", borderRadius: "8px",
            border: "none",
            background: "linear-gradient(135deg,#8b5cf6 0%,#1fbfb8 100%)",
            color: "#fff", fontSize: "14px",
            fontFamily: "Source Sans 3, sans-serif",
            fontWeight: 700, cursor: "pointer",
          }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
