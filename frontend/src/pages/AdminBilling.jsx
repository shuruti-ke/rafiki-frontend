import { useState, useEffect, useCallback } from "react";
import { API, authFetch } from "../api.js";
import "./AdminBilling.css";

const PAYMENT_METHODS = [
  { value: "MPESA", label: "M-Pesa (Paybill)", refPlaceholder: "Transaction code (e.g. ABC123XY)" },
  { value: "CASH", label: "Cash", refPlaceholder: "Optional reference" },
  { value: "CHEQUE", label: "Bankers Cheque", refPlaceholder: "Cheque number" },
  { value: "EFT_RTGS", label: "EFT / RTGS Bank Transfer", refPlaceholder: "Bank reference" },
];

export default function AdminBilling() {
  const [invoices, setInvoices] = useState([]);
  const [services, setServices] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState([]);
  const [userSearching, setUserSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailInv, setDetailInv] = useState(null);
  const [detailPayments, setDetailPayments] = useState([]);
  const [recordPaymentInv, setRecordPaymentInv] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ method: "MPESA", amount: "", reference: "", attachment: null });
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [form, setForm] = useState({
    user_id: "",
    user_display: "",
    purpose: "",
    due_date: "",
    currency: "KES",
    line_items: [{ service_id: "", description: "", quantity: 1, unit_price: "" }],
  });

  const loadInvoices = useCallback(() => {
    authFetch(`${API}/api/v1/billing/invoices`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setInvoices(Array.isArray(d) ? d : []))
      .catch(() => setInvoices([]));
  }, []);

  const loadServices = useCallback(() => {
    authFetch(`${API}/api/v1/billing/services`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setServices(Array.isArray(d) ? d : []))
      .catch(() => setServices([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      authFetch(`${API}/api/v1/billing/invoices`).then((r) => (r.ok ? r.json() : [])),
      authFetch(`${API}/api/v1/billing/services`).then((r) => (r.ok ? r.json() : [])),
    ]).then(([inv, svc]) => {
      setInvoices(Array.isArray(inv) ? inv : []);
      setServices(Array.isArray(svc) ? svc : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!userSearch.trim()) {
      setUserResults([]);
      return;
    }
    const t = setTimeout(() => {
      setUserSearching(true);
      authFetch(`${API}/api/v1/billing/users?q=${encodeURIComponent(userSearch)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setUserResults(Array.isArray(d) ? d : []))
        .catch(() => setUserResults([]))
        .finally(() => setUserSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [userSearch]);

  const selectUser = (u) => {
    setForm((f) => ({ ...f, user_id: u.user_id, user_display: `${u.name || u.email} (${u.role})` }));
    setUserSearch("");
    setUserResults([]);
  };

  const addLineItem = () => {
    setForm((f) => ({ ...f, line_items: [...f.line_items, { service_id: "", description: "", quantity: 1, unit_price: "" }] }));
  };

  const updateLineItem = (i, field, val) => {
    setForm((f) => {
      const items = [...f.line_items];
      items[i] = { ...items[i], [field]: val };
      if (field === "service_id" && val) {
        const svc = services.find((s) => s.id === val);
        if (svc) {
          items[i].description = svc.name;
          items[i].unit_price = String(svc.price ?? svc.price_minor / 100);
        }
      }
      return { ...f, line_items: items };
    });
  };

  const removeLineItem = (i) => {
    if (form.line_items.length <= 1) return;
    setForm((f) => ({ ...f, line_items: f.line_items.filter((_, idx) => idx !== i) }));
  };

  const computeTotal = () => {
    return form.line_items.reduce((s, li) => {
      const q = parseFloat(li.quantity) || 0;
      const up = parseFloat(li.unit_price) || 0;
      return s + q * up;
    }, 0);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.user_id) {
      alert("Select a user to invoice");
      return;
    }
    const lineItems = form.line_items.filter((li) => (li.description || "").trim() && (parseFloat(li.unit_price) || 0) > 0);
    if (lineItems.length === 0) {
      alert("Add at least one line item with description and price");
      return;
    }
    const total = lineItems.reduce((s, li) => s + (parseFloat(li.quantity) || 1) * (parseFloat(li.unit_price) || 0), 0);
    try {
      const r = await authFetch(`${API}/api/v1/billing/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: form.user_id,
          purpose: form.purpose || null,
          due_date: form.due_date || null,
          currency: form.currency,
          line_items: lineItems.map((li) => ({
            description: li.description.trim(),
            quantity: parseFloat(li.quantity) || 1,
            unit_price_minor: Math.round((parseFloat(li.unit_price) || 0) * 100),
            service_id: li.service_id || null,
          })),
        }),
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.detail || "Failed");
      }
      const created = await r.json();
      setCreateOpen(false);
      setForm({ user_id: "", user_display: "", purpose: "", due_date: "", currency: "KES", line_items: [{ service_id: "", description: "", quantity: 1, unit_price: "" }] });
      // Optimistically add new invoice and refetch to ensure consistency
      setInvoices((prev) => [{ ...created, created_at: new Date().toISOString(), user_name: form.user_display?.split(" (")[0] || null }, ...prev]);
      loadInvoices();
    } catch (err) {
      alert(err.message || "Failed to create invoice");
    }
  };

  const statusBadge = (s) => {
    const c = { PENDING: "pending", PAID: "paid", CANCELLED: "cancelled" }[s] || "pending";
    return <span className={`admin-billing-badge admin-billing-badge-${c}`}>{s}</span>;
  };

  const openDetail = (inv) => {
    setDetailInv(inv);
    authFetch(`${API}/api/v1/billing/invoices/${inv.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setDetailInv((prev) => ({ ...prev, ...d }));
      })
      .catch(() => {});
    authFetch(`${API}/api/v1/billing/invoices/${inv.id}/payments`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setDetailPayments(Array.isArray(d) ? d : []))
      .catch(() => setDetailPayments([]));
  };

  const openRecordPayment = (inv) => {
    setRecordPaymentInv(inv);
    setPaymentForm({
      method: "MPESA",
      amount: String((inv.amount ?? inv.amount_minor / 100) - (inv.total_paid ?? 0)).replace(/\.\d+$/, "") || "",
      reference: "",
      attachment: null,
    });
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!recordPaymentInv) return;
    const amt = parseFloat(paymentForm.amount);
    if (!amt || amt <= 0) {
      alert("Enter a valid amount");
      return;
    }
    setPaymentSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("method", paymentForm.method);
      fd.append("amount_minor", Math.round(amt * 100));
      fd.append("currency", recordPaymentInv.currency || "KES");
      if (paymentForm.reference?.trim()) fd.append("reference", paymentForm.reference.trim());
      if (paymentForm.attachment) fd.append("attachment", paymentForm.attachment);

      const r = await authFetch(`${API}/api/v1/billing/invoices/${recordPaymentInv.id}/payments`, {
        method: "POST",
        body: fd,
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.detail || "Failed to record payment");
      }
      const result = await r.json();
      setRecordPaymentInv(null);
      setPaymentForm({ method: "MPESA", amount: "", reference: "", attachment: null });
      loadInvoices();
      if (detailInv?.id === recordPaymentInv.id) {
        setDetailInv((prev) => ({ ...prev, status: result.invoice_status, total_paid: (prev?.total_paid ?? 0) + amt }));
        setDetailPayments((prev) => [{ ...result, amount: amt }, ...prev]);
      }
    } catch (err) {
      alert(err.message || "Failed to record payment");
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const downloadAttachment = async (paymentId) => {
    try {
      const r = await authFetch(`${API}/api/v1/billing/payments/${paymentId}/attachment`);
      if (r.ok) {
        const { url } = await r.json();
        window.open(url, "_blank");
      }
    } catch {
      alert("Could not open attachment");
    }
  };

  return (
    <div className="admin-billing-page">
      <div className="admin-billing-header">
        <h1>Billing & Invoices</h1>
        <p>Create and manage invoices for employees, managers, and trainees.</p>
        <div className="admin-billing-header-actions">
          <button className="btn btnGhost" onClick={() => { setLoading(true); authFetch(`${API}/api/v1/billing/invoices`).then((r) => (r.ok ? r.json() : [])).then((d) => setInvoices(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false)); }} title="Refresh list">↻ Refresh</button>
          <button className="btn btnPrimary" onClick={() => { setCreateOpen(true); setForm({ user_id: "", user_display: "", purpose: "", due_date: "", currency: "KES", line_items: [{ service_id: "", description: "", quantity: 1, unit_price: "" }] }); }}>
            + Create Invoice
          </button>
        </div>
      </div>

      {loading ? (
        <p className="admin-billing-loading">Loading...</p>
      ) : invoices.length === 0 ? (
        <div className="admin-billing-empty">
          <p>No invoices yet. Create your first invoice.</p>
        </div>
      ) : (
        <div className="admin-billing-table-wrap">
          <table className="admin-billing-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Bill To</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Due Date</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>
                    <button type="button" className="admin-billing-inv-link" onClick={() => openDetail(inv)}>
                      {inv.invoice_number}
                    </button>
                  </td>
                  <td>{inv.user_name || inv.user_email || inv.user_id || "—"}</td>
                  <td>{inv.currency} {(inv.amount ?? inv.amount_minor / 100).toFixed(2)}</td>
                  <td>{statusBadge(inv.status)}</td>
                  <td>{inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—"}</td>
                  <td>{inv.created_at ? new Date(inv.created_at).toLocaleDateString() : "—"}</td>
                  <td>
                    <div className="admin-billing-actions">
                      <button type="button" className="btn btnTiny btnGhost" onClick={() => openDetail(inv)}>View</button>
                      {inv.status === "PENDING" && (
                        <button type="button" className="btn btnTiny btnPrimary" onClick={() => openRecordPayment(inv)}>Record Payment</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <div className="admin-billing-modal-overlay" onClick={() => setCreateOpen(false)}>
          <div className="admin-billing-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Create Invoice</h3>
            <form onSubmit={handleCreate}>
              <label>Bill to (search user) *</label>
              <div className="admin-billing-user-search">
                <input
                  type="text"
                  placeholder="Search by name, email, role..."
                  value={form.user_display ? form.user_display : userSearch}
                  onChange={(e) => {
                    if (form.user_id) {
                      setForm((f) => ({ ...f, user_id: "", user_display: "" }));
                    }
                    setUserSearch(e.target.value);
                  }}
                  onFocus={() => form.user_id && setForm((f) => ({ ...f, user_id: "", user_display: "" }))}
                />
                {form.user_id && (
                  <button type="button" className="btn btnTiny btnGhost" onClick={() => setForm((f) => ({ ...f, user_id: "", user_display: "" }))}>Clear</button>
                )}
                {userSearch && !form.user_id && (
                  <div className="admin-billing-user-dropdown">
                    {userSearching ? <div className="admin-billing-user-loading">Searching...</div> : userResults.length === 0 ? (
                      <div className="admin-billing-user-empty">No users found</div>
                    ) : (
                      userResults.map((u) => (
                        <div key={u.user_id} className="admin-billing-user-option" onClick={() => selectUser(u)}>
                          <strong>{u.name || u.email}</strong>
                          {u.email && u.name && <span className="admin-billing-user-email">{u.email}</span>}
                          <span className="admin-billing-user-role">{u.role}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <label>Purpose</label>
              <input type="text" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="e.g. Training, Consultation" />

              <label>Due date</label>
              <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />

              <label>Currency</label>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                <option value="KES">KES</option>
                <option value="USD">USD</option>
              </select>

              <label>Line items</label>
              <div className="admin-billing-line-items">
                {form.line_items.map((li, i) => (
                  <div key={i} className="admin-billing-line-row">
                    <select
                      value={li.service_id}
                      onChange={(e) => updateLineItem(i, "service_id", e.target.value)}
                      className="admin-billing-service-select"
                    >
                      <option value="">— Custom —</option>
                      {services.filter((s) => s.is_active !== false).map((s) => (
                        <option key={s.id} value={s.id}>{s.name} — {s.currency} {(s.price ?? s.price_minor / 100).toFixed(2)}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Description"
                      value={li.description}
                      onChange={(e) => updateLineItem(i, "description", e.target.value)}
                      className="admin-billing-desc"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Qty"
                      value={li.quantity}
                      onChange={(e) => updateLineItem(i, "quantity", e.target.value)}
                      className="admin-billing-qty"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Unit price"
                      value={li.unit_price}
                      onChange={(e) => updateLineItem(i, "unit_price", e.target.value)}
                      className="admin-billing-price"
                    />
                    <button type="button" className="btn btnTiny" onClick={() => removeLineItem(i)} disabled={form.line_items.length <= 1}>×</button>
                  </div>
                ))}
                <button type="button" className="btn btnTiny btnGhost" onClick={addLineItem}>+ Add line</button>
              </div>

              <div className="admin-billing-total">
                Total: <strong>{form.currency} {computeTotal().toFixed(2)}</strong>
              </div>

              <div className="admin-billing-modal-actions">
                <button type="button" className="btn btnGhost" onClick={() => setCreateOpen(false)}>Cancel</button>
                <button type="submit" className="btn btnPrimary">Create Invoice</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice Detail Modal */}
      {detailInv && (
        <div className="admin-billing-modal-overlay" onClick={() => setDetailInv(null)}>
          <div className="admin-billing-modal admin-billing-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="admin-billing-detail-header">
              <h3>Invoice {detailInv.invoice_number}</h3>
              <button type="button" className="btn btnGhost" onClick={() => setDetailInv(null)}>× Close</button>
            </div>
            <div className="admin-billing-detail-body">
              <p><strong>Bill to:</strong> {detailInv.bill_to?.name || detailInv.user_name || "—"} {detailInv.bill_to?.email && `(${detailInv.bill_to.email})`}</p>
              <p><strong>Amount:</strong> {detailInv.currency} {(detailInv.amount ?? detailInv.amount_minor / 100).toFixed(2)}</p>
              <p><strong>Status:</strong> {statusBadge(detailInv.status)}</p>
              {detailInv.total_paid != null && detailInv.total_paid > 0 && (
                <p><strong>Paid:</strong> {detailInv.currency} {detailInv.total_paid.toFixed(2)}</p>
              )}
              {detailInv.purpose && <p><strong>Purpose:</strong> {detailInv.purpose}</p>}
              {detailInv.status === "PENDING" && (
                <button type="button" className="btn btnPrimary" onClick={() => { setDetailInv(null); openRecordPayment(detailInv); }} style={{ marginTop: "0.5rem" }}>
                  Record Payment
                </button>
              )}
            </div>
            {detailPayments.length > 0 && (
              <div className="admin-billing-payments-section">
                <h4>Payments Received</h4>
                <table className="admin-billing-payments-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Method</th>
                      <th>Amount</th>
                      <th>Reference</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailPayments.map((p) => (
                      <tr key={p.id}>
                        <td>{p.received_at ? new Date(p.received_at).toLocaleString() : "—"}</td>
                        <td>{p.method}</td>
                        <td>{p.currency} {(p.amount ?? p.amount_minor / 100).toFixed(2)}</td>
                        <td>{p.reference || "—"}</td>
                        <td>
                          {p.has_attachment && (
                            <button type="button" className="btn btnTiny btnGhost" onClick={() => downloadAttachment(p.id)}>View attachment</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {recordPaymentInv && (
        <div className="admin-billing-modal-overlay" onClick={() => setRecordPaymentInv(null)}>
          <div className="admin-billing-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Record Payment — {recordPaymentInv.invoice_number}</h3>
            <p className="admin-billing-payment-hint">
              Customer pays via paybill (then provides M-Pesa transaction code), cheque, cash, or bank transfer. Enter the amount received and reference. Optionally attach proof (cheque image or transaction screenshot).
            </p>
            <p className="admin-billing-payment-note">
              <small>Automatic M-Pesa detection from SMS would require Safaricom Daraja API integration. For now, customers provide the transaction code after paying via paybill.</small>
            </p>
            <form onSubmit={handleRecordPayment}>
              <label>Payment method *</label>
              <select
                value={paymentForm.method}
                onChange={(e) => setPaymentForm((f) => ({ ...f, method: e.target.value }))}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>

              <label>Amount received ({recordPaymentInv.currency}) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
              />

              <label>
                {paymentForm.method === "MPESA" ? "M-Pesa transaction code" : paymentForm.method === "CHEQUE" ? "Cheque number" : "Reference"}
              </label>
              <input
                type="text"
                placeholder={PAYMENT_METHODS.find((m) => m.value === paymentForm.method)?.refPlaceholder || "Reference"}
                value={paymentForm.reference}
                onChange={(e) => setPaymentForm((f) => ({ ...f, reference: e.target.value }))}
              />

              <label>Proof (optional) — cheque image or transaction screenshot</label>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setPaymentForm((f) => ({ ...f, attachment: e.target.files?.[0] || null }))}
              />
              {paymentForm.attachment && (
                <span className="admin-billing-file-name">{paymentForm.attachment.name}</span>
              )}

              <div className="admin-billing-modal-actions">
                <button type="button" className="btn btnGhost" onClick={() => setRecordPaymentInv(null)}>Cancel</button>
                <button type="submit" className="btn btnPrimary" disabled={paymentSubmitting}>
                  {paymentSubmitting ? "Recording…" : "Record Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
