import { useState, useEffect } from "react";
import { API, authFetch } from "../api.js";
import "./AdminServices.css";

export default function AdminServices() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: "", description: "", price: "", currency: "KES" });

  const load = () => {
    setLoading(true);
    authFetch(`${API}/api/v1/billing/services`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setServices(Array.isArray(d) ? d : []))
      .catch(() => setServices([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    const price = parseFloat(form.price);
    if (!form.name.trim() || isNaN(price) || price < 0) {
      alert("Enter valid name and price");
      return;
    }
    try {
      const r = await authFetch(`${API}/api/v1/billing/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          price_minor: Math.round(price * 100),
          currency: form.currency,
        }),
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.detail || "Failed");
      }
      setCreateOpen(false);
      setForm({ name: "", description: "", price: "", currency: "KES" });
      load();
    } catch (err) {
      alert(err.message || "Failed to create service");
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editId) return;
    const price = parseFloat(form.price);
    if (!form.name.trim() || isNaN(price) || price < 0) {
      alert("Enter valid name and price");
      return;
    }
    try {
      const r = await authFetch(`${API}/api/v1/billing/services/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          price_minor: Math.round(price * 100),
          currency: form.currency,
        }),
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.detail || "Failed");
      }
      setEditId(null);
      setForm({ name: "", description: "", price: "", currency: "KES" });
      load();
    } catch (err) {
      alert(err.message || "Failed to update service");
    }
  };

  const openEdit = (s) => {
    setEditId(s.id);
    setForm({
      name: s.name,
      description: s.description || "",
      price: String(s.price ?? s.price_minor / 100),
      currency: s.currency || "KES",
    });
  };

  const handleDeactivate = async (id) => {
    if (!confirm("Deactivate this service? It will no longer appear when creating invoices.")) return;
    try {
      const r = await authFetch(`${API}/api/v1/billing/services/${id}`, { method: "DELETE" });
      if (r.ok) load();
      else alert("Failed to deactivate");
    } catch {
      alert("Failed to deactivate");
    }
  };

  return (
    <div className="admin-services-page">
      <div className="admin-services-header">
        <h1>Services</h1>
        <p>Define the services your platform offers and their prices. Use these when creating invoices.</p>
        <button className="btn btnPrimary" onClick={() => { setCreateOpen(true); setForm({ name: "", description: "", price: "", currency: "KES" }); }}>
          + Add Service
        </button>
      </div>

      {loading ? (
        <p className="admin-services-loading">Loading...</p>
      ) : services.length === 0 ? (
        <div className="admin-services-empty">
          <p>No services yet. Add your first service to use when creating invoices.</p>
        </div>
      ) : (
        <div className="admin-services-table-wrap">
          <table className="admin-services-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Description</th>
                <th>Price</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td className="admin-services-desc">{s.description || "—"}</td>
                  <td>{s.currency} {(s.price ?? s.price_minor / 100).toFixed(2)}</td>
                  <td>
                    <button className="btn btnTiny btnGhost" onClick={() => openEdit(s)}>Edit</button>
                    {s.is_active !== false && (
                      <button className="btn btnTiny btnGhost" onClick={() => handleDeactivate(s.id)}>Deactivate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <div className="admin-services-modal-overlay" onClick={() => setCreateOpen(false)}>
          <div className="admin-services-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add Service</h3>
            <form onSubmit={handleCreate}>
              <label>Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Training Session" />
              <label>Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" rows={2} />
              <label>Price *</label>
              <div className="admin-services-price-row">
                <input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required placeholder="0.00" />
                <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                  <option value="KES">KES</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div className="admin-services-modal-actions">
                <button type="button" className="btn btnGhost" onClick={() => setCreateOpen(false)}>Cancel</button>
                <button type="submit" className="btn btnPrimary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editId && (
        <div className="admin-services-modal-overlay" onClick={() => setEditId(null)}>
          <div className="admin-services-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Service</h3>
            <form onSubmit={handleUpdate}>
              <label>Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <label>Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
              <label>Price *</label>
              <div className="admin-services-price-row">
                <input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
                <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                  <option value="KES">KES</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div className="admin-services-modal-actions">
                <button type="button" className="btn btnGhost" onClick={() => setEditId(null)}>Cancel</button>
                <button type="submit" className="btn btnPrimary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
