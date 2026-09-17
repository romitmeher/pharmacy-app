"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  Building,
  CheckCircle,
  AlertTriangle,
  AlertOctagon,
  File,
  User,
  AddCircle,
} from "@duo-icons/react";
import {
  Search,
  X,
  Edit2,
  Trash2,
  Phone,
  Mail,
  ShieldCheck,
  FileText,
} from "lucide-react";

import ThemeToggle from "@/components/ThemeToggle";
import {
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  SupplierRecord,
} from "@/lib/api";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<string>("active");

  // Modals
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierRecord | null>(null);

  // Form State
  const [formName, setFormName] = useState<string>("");
  const [formContactPerson, setFormContactPerson] = useState<string>("");
  const [formPhone, setFormPhone] = useState<string>("");
  const [formEmail, setFormEmail] = useState<string>("");
  const [formAddress, setFormAddress] = useState<string>("");
  const [formGstin, setFormGstin] = useState<string>("");
  const [formDrugLicense, setFormDrugLicense] = useState<string>("");

  const [isSubmitting, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadSuppliersList = async () => {
    setLoading(true);
    setError(null);
    try {
      const isActive = activeFilter === "all" ? undefined : true;
      const res = await getSuppliers({
        is_active: isActive,
        search: searchQuery.trim() || undefined,
      });
      setSuppliers(res.suppliers || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load suppliers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliersList();
  }, [activeFilter, searchQuery]);

  const handleOpenCreate = () => {
    setActionError(null);
    setActionSuccess(null);
    setFormName("");
    setFormContactPerson("");
    setFormPhone("");
    setFormEmail("");
    setFormAddress("");
    setFormGstin("");
    setFormDrugLicense("");
    setShowCreateModal(true);
  };

  const handleOpenEdit = (sup: SupplierRecord) => {
    setActionError(null);
    setActionSuccess(null);
    setEditingSupplier(sup);
    setFormName(sup.name);
    setFormContactPerson(sup.contact_person || "");
    setFormPhone(sup.phone || "");
    setFormEmail(sup.email || "");
    setFormAddress(sup.address || "");
    setFormGstin(sup.gstin || "");
    setFormDrugLicense(sup.drug_license_number || "");
  };

  const handleSubmitSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setActionError("Supplier Name is required.");
      return;
    }

    setActionError(null);
    startTransition(async () => {
      try {
        const payload = {
          name: formName.trim(),
          contact_person: formContactPerson.trim() || undefined,
          phone: formPhone.trim() || undefined,
          email: formEmail.trim() || undefined,
          address: formAddress.trim() || undefined,
          gstin: formGstin.trim() || undefined,
          drug_license_number: formDrugLicense.trim() || undefined,
        };

        if (editingSupplier) {
          await updateSupplier(editingSupplier.id, payload);
          setActionSuccess(`Supplier "${formName}" updated successfully!`);
          setTimeout(() => {
            setEditingSupplier(null);
            loadSuppliersList();
          }, 700);
        } else {
          await createSupplier(payload);
          setActionSuccess(`Supplier "${formName}" registered successfully!`);
          setTimeout(() => {
            setShowCreateModal(false);
            loadSuppliersList();
          }, 700);
        }
      } catch (err: any) {
        setActionError(err?.message || "Failed to save supplier profile.");
      }
    });
  };

  const handleDeleteSupplier = (supId: number) => {
    if (!confirm("Are you sure you want to deactivate this distributor?")) return;
    startTransition(async () => {
      try {
        await deleteSupplier(supId);
        loadSuppliersList();
      } catch (err: any) {
        alert(err?.message || "Failed to deactivate supplier.");
      }
    });
  };

  // Metrics
  const activeCount = suppliers.filter((s) => s.is_active !== false).length;
  const dlCount = suppliers.filter((s) => !!s.drug_license_number).length;
  const gstinCount = suppliers.filter((s) => !!s.gstin).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      {/* Header — Aligned 64px height */}
      <header className="page-header">
        <div>
          <h1 className="page-title">Suppliers & Distributors</h1>
          <p className="page-subtitle">
            Wholesale Vendor Directory • Drug License & GSTIN Compliance • Store #1
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <ThemeToggle />
          <button onClick={handleOpenCreate} className="btn btn-primary">
            <AddCircle size={16} />
            <span>Register Distributor</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="page-body" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Compliance Notice */}
        <div
          style={{
            padding: "0.75rem 1.25rem",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-default)",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            fontSize: "0.75rem",
            lineHeight: 1.4,
          }}
        >
          <span style={{ color: "var(--brand-primary)", display: "inline-flex" }}>
            <Building size={18} />
          </span>
          <div>
            <strong style={{ color: "var(--text-primary)" }}>
              Regulatory Vendor Governance:
            </strong>{" "}
            <span style={{ color: "var(--text-secondary)" }}>
              All pharmaceutical suppliers must have validated Drug License credentials (Form 20B/21B) and active GSTIN
              registration to remain compliant under Indian State Pharmacy regulations.
            </span>
          </div>
        </div>

        {/* Metrics Overview Row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1rem",
          }}
        >
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Total Distributors
              </span>
              <span className="status-badge info">
                <span className="badge-icon"><Building size={12} /></span>
                <span>Registry</span>
              </span>
            </div>
            <div style={{ fontSize: "1.625rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {suppliers.length}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              Registered wholesale partners
            </div>
          </div>

          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Active Vendors
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><CheckCircle size={12} /></span>
                <span>Procuring</span>
              </span>
            </div>
            <div style={{ fontSize: "1.625rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {activeCount}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              Eligible for purchase orders
            </div>
          </div>

          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Drug License Verified
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><CheckCircle size={12} /></span>
                <span>Compliant</span>
              </span>
            </div>
            <div style={{ fontSize: "1.625rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {dlCount}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              Hold active Form 20B/21B licenses
            </div>
          </div>

          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                GSTIN Verified
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><CheckCircle size={12} /></span>
                <span>Tax Registered</span>
              </span>
            </div>
            <div style={{ fontSize: "1.625rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {gstinCount}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              Valid wholesale GST credentials
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", flex: 1, minWidth: "280px" }}>
            <div style={{ position: "relative", width: "100%", maxWidth: "340px" }}>
              <Search
                size={16}
                style={{
                  position: "absolute",
                  left: "0.75rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-muted)",
                }}
              />
              <input
                type="text"
                placeholder="Search by distributor name, contact, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="form-input"
                style={{ paddingLeft: "2.25rem" }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  style={{
                    position: "absolute",
                    right: "0.75rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="form-select"
              style={{ width: "160px" }}
            >
              <option value="active">Active Vendors</option>
              <option value="all">All Vendors</option>
            </select>
          </div>

          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Showing <strong>{suppliers.length}</strong> suppliers
          </div>
        </div>

        {/* Suppliers Table */}
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Distributor Name</th>
                <th>Contact Representative</th>
                <th>Phone & Email</th>
                <th>GSTIN & Drug License</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "3rem 1rem" }}>
                    <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                      Loading suppliers directory...
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "3rem 1rem" }}>
                    <div style={{ color: "var(--status-low-text)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                      {error}
                    </div>
                    <button onClick={loadSuppliersList} className="btn btn-secondary">
                      Retry
                    </button>
                  </td>
                </tr>
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "3.5rem 1rem" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
                      <span style={{ color: "var(--text-muted)" }}>
                        <Building size={32} />
                      </span>
                      <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)" }}>
                        No suppliers found
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", maxWidth: "340px" }}>
                        Register pharmaceutical distributors to manage purchase orders and inward shipments.
                      </div>
                      <button onClick={handleOpenCreate} className="btn btn-primary" style={{ marginTop: "0.5rem" }}>
                        <AddCircle size={16} />
                        <span>Register First Distributor</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                suppliers.map((sup) => (
                  <tr key={sup.id}>
                    {/* Name */}
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                        <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.875rem" }}>
                          {sup.name}
                        </span>
                        {sup.address && (
                          <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                            {sup.address}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Contact Representative */}
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                        <span style={{ color: "var(--text-muted)" }}>
                          <User size={13} />
                        </span>
                        <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                          {sup.contact_person || "—"}
                        </span>
                      </div>
                    </td>

                    {/* Phone & Email */}
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", fontSize: "0.75rem" }}>
                        <span style={{ color: "var(--text-primary)" }}>
                          {sup.phone || "—"}
                        </span>
                        <span style={{ color: "var(--text-muted)" }}>
                          {sup.email || ""}
                        </span>
                      </div>
                    </td>

                    {/* GSTIN & Drug License */}
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", fontSize: "0.75rem" }}>
                        <span style={{ fontFamily: "monospace", color: "var(--text-primary)" }}>
                          GST: {sup.gstin || "N/A"}
                        </span>
                        <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                          DL: {sup.drug_license_number || "N/A"}
                        </span>
                      </div>
                    </td>

                    {/* Status */}
                    <td>
                      {sup.is_active !== false ? (
                        <span className="status-badge high">
                          <span className="badge-icon"><CheckCircle size={10} /></span>
                          <span>Active Partner</span>
                        </span>
                      ) : (
                        <span className="status-badge low">
                          <span className="badge-icon"><AlertOctagon size={10} /></span>
                          <span>Inactive</span>
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center" }}>
                        <button
                          onClick={() => handleOpenEdit(sup)}
                          className="btn-icon"
                          title="Edit Supplier Profile"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteSupplier(sup.id)}
                          className="btn-icon"
                          title="Deactivate Supplier"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =====================================================================
          Modal: Register or Edit Supplier
          ===================================================================== */}
      {(showCreateModal || editingSupplier) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!isSubmitting) {
              setShowCreateModal(false);
              setEditingSupplier(null);
            }
          }}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <span style={{ color: "var(--brand-primary)" }}>
                  <Building size={18} />
                </span>
                <div>
                  <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    {editingSupplier ? "Edit Distributor Profile" : "Register Pharmaceutical Distributor"}
                  </h2>
                  <p style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                    Compliance records for wholesale drug procurement
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingSupplier(null);
                }}
                className="btn-icon"
                disabled={isSubmitting}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitSave} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
              <div className="modal-body">
                {actionError && (
                  <div
                    style={{
                      padding: "0.75rem",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "rgba(255, 128, 128, 0.12)",
                      border: "1px solid var(--status-low-border)",
                      color: "var(--status-low-text)",
                      fontSize: "0.75rem",
                    }}
                  >
                    {actionError}
                  </div>
                )}
                {actionSuccess && (
                  <div
                    style={{
                      padding: "0.75rem",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "rgba(125, 255, 149, 0.12)",
                      border: "1px solid var(--status-high-border)",
                      color: "var(--status-high-text)",
                      fontSize: "0.75rem",
                    }}
                  >
                    {actionSuccess}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Distributor / Agency Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. MedPlus Supply Network"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div className="form-group">
                    <label className="form-label">Contact Person</label>
                    <input
                      type="text"
                      placeholder="e.g. Vikram Mehta"
                      value={formContactPerson}
                      onChange={(e) => setFormContactPerson(e.target.value)}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Phone Number</label>
                    <input
                      type="tel"
                      placeholder="e.g. 9876543210"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      className="form-input"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    placeholder="e.g. orders@medplus.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Warehouse Physical Address</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Plot 42, Pharma Industrial Estate, Mumbai"
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    className="form-textarea"
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div className="form-group">
                    <label className="form-label">GSTIN (15 Digits)</label>
                    <input
                      type="text"
                      placeholder="e.g. 27AABCM8492Q1Z3"
                      value={formGstin}
                      onChange={(e) => setFormGstin(e.target.value.toUpperCase())}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Drug License Number (Form 20B/21B)</label>
                    <input
                      type="text"
                      placeholder="e.g. MH-MZ2-19284"
                      value={formDrugLicense}
                      onChange={(e) => setFormDrugLicense(e.target.value)}
                      className="form-input"
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingSupplier(null);
                  }}
                  className="btn btn-secondary"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting
                    ? "Saving..."
                    : editingSupplier
                    ? "Update Profile"
                    : "Register Distributor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
