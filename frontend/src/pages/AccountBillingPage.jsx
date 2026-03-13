import { useState, useEffect } from "react";
import { API, authFetch } from "../api.js";
import "./AccountBillingPage.css";

export default function AccountBillingPage() {
  const [invoices, setInvoices] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [invoiceDetail, setInvoiceDetail] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      authFetch(`${API}/api/v1/billing/invoices`).then((r) => (r.ok ? r.json() : [])),
      authFetch(`${API}/api/v1/billing/account-summary`).then((r) => (r.ok ? r.json() : null)),
    ]).then(([inv, acc]) => {
      setInvoices(Array.isArray(inv) ? inv : []);
      setSummary(acc);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedInvoice) {
      setInvoiceDetail(null);
      return;
    }
    authFetch(`${API}/api/v1/billing/invoices/${selectedInvoice}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setInvoiceDetail)
      .catch(() => setInvoiceDetail(null));
  }, [selectedInvoice]);

  const statusBadge = (s) => {
    const c = { PENDING: "pending", PAID: "paid", CANCELLED: "cancelled" }[s] || "pending";
    return <span className={`account-billing-badge account-billing-badge-${c}`}>{s}</span>;
  };

  return (
    <div className="account-billing-page">
      <div className="account-billing-header">
        <h1>Account & Billing</h1>
        <p>View your invoices and balance.</p>
      </div>

      {summary && (summary.balance_due > 0 || summary.invoices_pending > 0) && (
        <div className="account-billing-alert">
          <strong>You have {summary.invoices_pending} pending invoice(s)</strong> — KES {summary.balance_due?.toFixed(2) ?? "0.00"} due.
        </div>
      )}

      {loading ? (
        <p className="account-billing-loading">Loading...</p>
      ) : invoices.length === 0 ? (
        <div className="account-billing-empty">
          <p>No invoices yet. You're all set!</p>
        </div>
      ) : (
        <div className="account-billing-content">
          <div className="account-billing-list">
            <h3>My Invoices</h3>
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className={`account-billing-item ${selectedInvoice === inv.id ? "active" : ""}`}
                onClick={() => setSelectedInvoice(inv.id)}
              >
                <div className="account-billing-item-num">{inv.invoice_number}</div>
                <div className="account-billing-item-amount">{inv.currency} {(inv.amount ?? inv.amount_minor / 100).toFixed(2)}</div>
                {statusBadge(inv.status)}
              </div>
            ))}
          </div>
          <div className="account-billing-detail">
            {invoiceDetail ? (
              <>
                <h3>Invoice {invoiceDetail.invoice_number}</h3>
                <div className="account-billing-detail-meta">
                  <p><strong>Status:</strong> {statusBadge(invoiceDetail.status)}</p>
                  <p><strong>Due:</strong> {invoiceDetail.due_date ? new Date(invoiceDetail.due_date).toLocaleDateString() : "—"}</p>
                  <p><strong>Total:</strong> {invoiceDetail.currency} {(invoiceDetail.amount ?? invoiceDetail.amount_minor / 100).toFixed(2)}</p>
                  {invoiceDetail.total_paid != null && invoiceDetail.total_paid > 0 && (
                    <p><strong>Amount paid:</strong> {invoiceDetail.currency} {invoiceDetail.total_paid.toFixed(2)}</p>
                  )}
                </div>
                {invoiceDetail.line_items?.length > 0 && (
                  <table className="account-billing-line-table">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th>Qty</th>
                        <th>Unit Price</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceDetail.line_items.map((li, i) => (
                        <tr key={i}>
                          <td>{li.description}</td>
                          <td>{li.quantity}</td>
                          <td>{(li.unit_price_minor / 100).toFixed(2)}</td>
                          <td>{(li.amount_minor / 100).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            ) : (
              <p className="account-billing-select">Select an invoice to view details.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
