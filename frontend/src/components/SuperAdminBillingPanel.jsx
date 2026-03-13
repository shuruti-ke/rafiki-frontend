import { useEffect, useMemo, useState } from "react";
import { API, authFetch } from "../api.js";

const PAYMENT_METHODS = ["MPESA", "CASH", "CHEQUE", "EFT_RTGS"];

function money(value, currency = "KES") {
  return `${currency} ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function emptyLine() {
  return { description: "", quantity: 1, unit_price: "" };
}

export default function SuperAdminBillingPanel({ orgs = [] }) {
  const [overview, setOverview] = useState(null);
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [summary, setSummary] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [statement, setStatement] = useState(null);
  const [reconciliation, setReconciliation] = useState(null);
  const [detail, setDetail] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [invoiceForm, setInvoiceForm] = useState({
    purpose: "",
    due_date: "",
    currency: "KES",
    line_items: [emptyLine()],
  });
  const [paymentForm, setPaymentForm] = useState({
    method: "MPESA",
    amount: "",
    reference: "",
    attachment: null,
  });

  const selectedOrg = useMemo(
    () => orgs.find((org) => org.org_id === selectedOrgId) || null,
    [orgs, selectedOrgId]
  );

  async function loadOverview() {
    const res = await authFetch(`${API}/super-admin/billing/overview`);
    const data = await res.json();
    if (res.ok) setOverview(data);
  }

  async function loadOrgBilling(orgId) {
    if (!orgId) return;
    setLoading(true);
    setDetail(null);
    try {
      const [summaryRes, invoiceRes, statementRes, reconciliationRes] = await Promise.all([
        authFetch(`${API}/super-admin/orgs/${orgId}/billing/summary`),
        authFetch(`${API}/super-admin/orgs/${orgId}/billing/invoices`),
        authFetch(`${API}/super-admin/orgs/${orgId}/billing/statement`),
        authFetch(`${API}/super-admin/orgs/${orgId}/billing/reconciliation`),
      ]);
      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (invoiceRes.ok) setInvoices((await invoiceRes.json()).invoices || []);
      if (statementRes.ok) setStatement(await statementRes.json());
      if (reconciliationRes.ok) setReconciliation(await reconciliationRes.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOverview()
      .catch(() => setOverview(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedOrgId && orgs.length > 0) {
      setSelectedOrgId(orgs[0].org_id);
    }
  }, [orgs, selectedOrgId]);

  useEffect(() => {
    if (selectedOrgId) {
      loadOrgBilling(selectedOrgId).catch(() => setMsg("Failed to load organization billing data."));
    }
  }, [selectedOrgId]);

  function updateLine(index, field, value) {
    setInvoiceForm((prev) => ({
      ...prev,
      line_items: prev.line_items.map((line, idx) => idx === index ? { ...line, [field]: value } : line),
    }));
  }

  function invoiceTotal() {
    return invoiceForm.line_items.reduce((sum, line) => {
      const qty = Number(line.quantity || 0);
      const unit = Number(line.unit_price || 0);
      return sum + qty * unit;
    }, 0);
  }

  async function createInvoice(e) {
    e.preventDefault();
    if (!selectedOrgId) return;
    const payload = {
      purpose: invoiceForm.purpose || undefined,
      due_date: invoiceForm.due_date || undefined,
      currency: invoiceForm.currency,
      line_items: invoiceForm.line_items
        .filter((line) => line.description.trim() && Number(line.unit_price) >= 0 && Number(line.quantity) > 0)
        .map((line) => ({
          description: line.description.trim(),
          quantity: Number(line.quantity),
          unit_price_minor: Math.round(Number(line.unit_price) * 100),
        })),
    };
    const res = await authFetch(`${API}/super-admin/orgs/${selectedOrgId}/billing/invoices`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setMsg(res.ok ? `Created invoice ${data.invoice_number}.` : (data.detail || "Failed to create invoice."));
    if (res.ok) {
      setCreateOpen(false);
      setInvoiceForm({ purpose: "", due_date: "", currency: "KES", line_items: [emptyLine()] });
      await loadOverview();
      await loadOrgBilling(selectedOrgId);
    }
  }

  async function openInvoiceDetail(invoiceId) {
    const res = await authFetch(`${API}/super-admin/billing/invoices/${invoiceId}`);
    const data = await res.json();
    if (res.ok) setDetail(data);
  }

  function startPayment(invoice) {
    setPaymentInvoice(invoice);
    setPaymentForm({
      method: "MPESA",
      amount: String(invoice.balance ?? invoice.amount ?? 0),
      reference: "",
      attachment: null,
    });
    setPaymentOpen(true);
  }

  async function recordPayment(e) {
    e.preventDefault();
    if (!paymentInvoice) return;
    const fd = new FormData();
    fd.append("method", paymentForm.method);
    fd.append("amount_minor", String(Math.round(Number(paymentForm.amount || 0) * 100)));
    fd.append("currency", paymentInvoice.currency || "KES");
    if (paymentForm.reference.trim()) fd.append("reference", paymentForm.reference.trim());
    if (paymentForm.attachment) fd.append("attachment", paymentForm.attachment);
    const res = await authFetch(`${API}/super-admin/billing/invoices/${paymentInvoice.id}/payments`, {
      method: "POST",
      body: fd,
    });
    const data = await res.json();
    setMsg(res.ok ? `Recorded receipt ${data.receipt_number}.` : (data.detail || "Failed to record payment."));
    if (res.ok) {
      setPaymentOpen(false);
      await loadOverview();
      await loadOrgBilling(selectedOrgId);
      await openInvoiceDetail(paymentInvoice.id);
    }
  }

  return (
    <div className="sa-section">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h2>Organization Billing</h2>
          <p style={{ color: "var(--muted)", marginTop: 4 }}>
            Super admin bills organizations only. Employees, managers, and trainees are not billable entities.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <select value={selectedOrgId} onChange={(e) => setSelectedOrgId(e.target.value)} style={{ minWidth: 240 }}>
            {orgs.map((org) => (
              <option key={org.org_id} value={org.org_id}>
                {org.name} ({org.org_code})
              </option>
            ))}
          </select>
          <button className="btn btnPrimary" onClick={() => setCreateOpen(true)} disabled={!selectedOrgId}>
            Create Invoice
          </button>
        </div>
      </div>

      {msg && <div className="sa-msg sa-msg-success" style={{ marginTop: 12 }}>{msg}</div>}

      {overview?.summary && (
        <div className="sa-stats" style={{ marginTop: 18 }}>
          <div className="sa-stat-card">
            <div className="label">Platform Invoiced</div>
            <div className="value">{money(overview.summary.total_invoiced)}</div>
          </div>
          <div className="sa-stat-card">
            <div className="label">Receipts</div>
            <div className="value">{money(overview.summary.total_received)}</div>
          </div>
          <div className="sa-stat-card">
            <div className="label">Outstanding</div>
            <div className="value">{money(overview.summary.total_outstanding)}</div>
          </div>
        </div>
      )}

      {selectedOrg && summary && (
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 18, marginTop: 18 }}>
          <div style={{ display: "grid", gap: 18 }}>
            <div className="sa-org-section">
              <div className="sa-org-section-header">
                <h2>{selectedOrg.name} Billing Summary</h2>
                <span style={{ color: "var(--muted)" }}>{selectedOrg.org_code}</span>
              </div>
              <div className="sa-stats" style={{ marginTop: 10 }}>
                <div className="sa-stat-card">
                  <div className="label">Invoices</div>
                  <div className="value">{summary.invoice_count}</div>
                </div>
                <div className="sa-stat-card">
                  <div className="label">Outstanding</div>
                  <div className="value">{money(summary.outstanding)}</div>
                </div>
                <div className="sa-stat-card">
                  <div className="label">Overdue</div>
                  <div className="value">{summary.overdue_invoice_count}</div>
                </div>
              </div>
            </div>

            <div className="sa-org-section">
              <div className="sa-org-section-header">
                <h2>Invoices</h2>
                <span style={{ color: "var(--muted)" }}>{invoices.length} total</span>
              </div>
              {loading ? (
                <p style={{ color: "var(--muted)" }}>Loading invoices...</p>
              ) : invoices.length === 0 ? (
                <p style={{ color: "var(--muted)" }}>No organization invoices yet.</p>
              ) : (
                <table className="sa-table">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Purpose</th>
                      <th>Amount</th>
                      <th>Balance</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td>{invoice.invoice_number}</td>
                        <td>{invoice.purpose || "Organization billing"}</td>
                        <td>{money(invoice.amount, invoice.currency)}</td>
                        <td>{money(invoice.balance, invoice.currency)}</td>
                        <td>{invoice.status}</td>
                        <td style={{ display: "flex", gap: 8 }}>
                          <button className="btn btnTiny" onClick={() => openInvoiceDetail(invoice.id)}>View</button>
                          {invoice.status !== "PAID" && (
                            <button className="btn btnTiny btnPrimary" onClick={() => startPayment(invoice)}>Record Receipt</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="sa-org-section">
              <div className="sa-org-section-header">
                <h2>Statement</h2>
                <span style={{ color: "var(--muted)" }}>
                  {statement?.entries?.length || 0} entries
                </span>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {(statement?.entries || []).slice(-8).reverse().map((entry) => (
                  <div key={`${entry.type}-${entry.reference}`} className="btn" style={{ textAlign: "left", justifyContent: "space-between" }}>
                    <div>
                      <strong>{entry.reference}</strong>
                      <div style={{ color: "var(--muted)", fontSize: 12 }}>{entry.description}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div>{entry.debit ? `+ ${money(entry.debit)}` : `- ${money(entry.credit)}`}</div>
                      <div style={{ color: "var(--muted)", fontSize: 12 }}>Balance {money(entry.running_balance)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 18 }}>
            <div className="sa-org-section">
              <div className="sa-org-section-header">
                <h2>Reconciliation</h2>
                <span style={{ color: "var(--muted)" }}>
                  {reconciliation?.summary?.reconciled_count || 0}/{reconciliation?.summary?.invoice_count || 0} reconciled
                </span>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {(reconciliation?.rows || []).slice(0, 8).map((row) => (
                  <div key={row.invoice_id} className="btn" style={{ textAlign: "left" }}>
                    <strong>{row.invoice_number}</strong>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>
                      Expected {money(row.expected)} · Received {money(row.received)} · Outstanding {money(row.outstanding)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="sa-org-section">
              <div className="sa-org-section-header">
                <h2>Organization Receipts</h2>
                <span style={{ color: "var(--muted)" }}>From invoice payments</span>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {detail?.payments?.length ? detail.payments.map((payment) => (
                  <div key={payment.id} className="btn" style={{ textAlign: "left", justifyContent: "space-between" }}>
                    <div>
                      <strong>{payment.receipt_number}</strong>
                      <div style={{ color: "var(--muted)", fontSize: 12 }}>{payment.method} · {payment.reference || "No reference"}</div>
                    </div>
                    <div>{money(payment.amount, payment.currency)}</div>
                  </div>
                )) : <p style={{ color: "var(--muted)" }}>Open an invoice to inspect receipts and line items.</p>}
              </div>
            </div>

            {detail && (
              <div className="sa-org-section">
                <div className="sa-org-section-header">
                  <h2>{detail.invoice_number}</h2>
                  <span>{detail.status}</span>
                </div>
                <p style={{ color: "var(--muted)", marginTop: 0 }}>{detail.purpose || "Organization invoice"}</p>
                <div style={{ display: "grid", gap: 8 }}>
                  {detail.line_items.map((item, index) => (
                    <div key={index} className="btn" style={{ textAlign: "left", justifyContent: "space-between" }}>
                      <span>{item.description} x {item.quantity}</span>
                      <span>{money(item.amount, detail.currency)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, color: "var(--muted)" }}>
                  Total paid: {money(detail.total_paid, detail.currency)} · Balance: {money(detail.balance, detail.currency)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {createOpen && (
        <div className="sa-modal-overlay" onClick={() => setCreateOpen(false)}>
          <div className="sa-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
            <h3>Create Organization Invoice</h3>
            <form className="sa-modal-form" onSubmit={createInvoice}>
              <div className="sa-modal-field">
                <label>Organization</label>
                <input value={selectedOrg?.name || ""} disabled />
              </div>
              <div className="sa-modal-field">
                <label>Purpose</label>
                <input value={invoiceForm.purpose} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, purpose: e.target.value }))} placeholder="Subscription, setup, training, support..." />
              </div>
              <div className="sa-org-form-grid">
                <div className="sa-modal-field">
                  <label>Due Date</label>
                  <input type="date" value={invoiceForm.due_date} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, due_date: e.target.value }))} />
                </div>
                <div className="sa-modal-field">
                  <label>Currency</label>
                  <select value={invoiceForm.currency} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, currency: e.target.value }))}>
                    <option value="KES">KES</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>
              <div className="sa-modal-field">
                <label>Line Items</label>
                <div style={{ display: "grid", gap: 8 }}>
                  {invoiceForm.line_items.map((line, index) => (
                    <div key={index} style={{ display: "grid", gridTemplateColumns: "1.8fr 0.7fr 0.9fr auto", gap: 8 }}>
                      <input value={line.description} onChange={(e) => updateLine(index, "description", e.target.value)} placeholder="Description" />
                      <input type="number" min="0.01" step="0.01" value={line.quantity} onChange={(e) => updateLine(index, "quantity", e.target.value)} placeholder="Qty" />
                      <input type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => updateLine(index, "unit_price", e.target.value)} placeholder="Unit price" />
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          setInvoiceForm((prev) => {
                            const nextLines = prev.line_items.filter((_, idx) => idx !== index);
                            return { ...prev, line_items: nextLines.length ? nextLines : [emptyLine()] };
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button type="button" className="btn" onClick={() => setInvoiceForm((prev) => ({ ...prev, line_items: [...prev.line_items, emptyLine()] }))}>
                    Add Line Item
                  </button>
                </div>
              </div>
              <div style={{ fontWeight: 700 }}>Invoice Total: {money(invoiceTotal(), invoiceForm.currency)}</div>
              <div className="sa-modal-btns">
                <button type="button" className="btn" onClick={() => setCreateOpen(false)}>Cancel</button>
                <button type="submit" className="btn btnPrimary">Create Invoice</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {paymentOpen && paymentInvoice && (
        <div className="sa-modal-overlay" onClick={() => setPaymentOpen(false)}>
          <div className="sa-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }}>
            <h3>Record Receipt for {paymentInvoice.invoice_number}</h3>
            <form className="sa-modal-form" onSubmit={recordPayment}>
              <div className="sa-org-form-grid">
                <div className="sa-modal-field">
                  <label>Method</label>
                  <select value={paymentForm.method} onChange={(e) => setPaymentForm((prev) => ({ ...prev, method: e.target.value }))}>
                    {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                  </select>
                </div>
                <div className="sa-modal-field">
                  <label>Amount</label>
                  <input type="number" min="0.01" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))} />
                </div>
              </div>
              <div className="sa-modal-field">
                <label>Reference</label>
                <input value={paymentForm.reference} onChange={(e) => setPaymentForm((prev) => ({ ...prev, reference: e.target.value }))} placeholder="Transaction code, cheque number, or bank reference" />
              </div>
              <div className="sa-modal-field">
                <label>Proof Attachment (optional)</label>
                <input type="file" accept="image/*,.pdf" onChange={(e) => setPaymentForm((prev) => ({ ...prev, attachment: e.target.files?.[0] || null }))} />
              </div>
              <div className="sa-modal-btns">
                <button type="button" className="btn" onClick={() => setPaymentOpen(false)}>Cancel</button>
                <button type="submit" className="btn btnPrimary">Create Receipt</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
