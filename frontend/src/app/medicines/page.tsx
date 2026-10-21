"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  Bookmark,
  PlusCircle,
  CheckCircle2,
  AlertTriangle,
  Package,
  FileText,
  Percent,
} from "lucide-react";

import ThemeToggle from "@/components/ThemeToggle";
import {
  getMedicines,
  createMedicine,
  Medicine,
  CreateMedicinePayload,
} from "@/lib/api";

const DOSAGE_FORMS = [
  "tablet",
  "capsule",
  "syrup",
  "suspension",
  "injection",
  "cream",
  "ointment",
  "gel",
  "drops",
  "inhaler",
  "powder",
  "suppository",
  "patch",
  "spray",
  "lotion",
  "solution",
  "other",
];

const COMMON_CATEGORIES = [
  "antibiotic",
  "analgesic",
  "antipyretic",
  "antihistamine",
  "antacid",
  "antihypertensive",
  "antidiabetic",
  "vitamin_supplement",
  "cardiovascular",
  "respiratory",
  "dermatological",
  "other",
];

export default function MedicinesCatalogPage() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [formFilter, setFormFilter] = useState<string>("");
  const [rxFilter, setRxFilter] = useState<string>("all");

  // Modals
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);
  const [isSubmitting, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // New Medicine Form State
  const [formData, setFormData] = useState<CreateMedicinePayload>({
    brand_name: "",
    generic_name: "",
    manufacturer: "",
    strength: "",
    dosage_form: "tablet",
    route: "oral",
    category: "antibiotic",
    is_prescription_only: true,
    mrp: undefined,
    selling_price: undefined,
    hsn_code: "3004",
    gst_percentage: 12.0,
    storage_requirements: "Store below 25°C in a dry place",
    ingredients: [{ name: "", strength: "", unit: "mg" }],
    aliases: [{ alias_name: "", alias_type: "brand_variant" }],
  });

  const fetchCatalog = async () => {
    setLoading(true);
    setError(null);
    try {
      const rxParam =
        rxFilter === "rx_only" ? true : rxFilter === "otc_only" ? false : undefined;

      const res = await getMedicines({
        page,
        per_page: 20,
        search: searchQuery.trim() || undefined,
        category: categoryFilter || undefined,
        is_prescription_only: rxParam,
      });

      setMedicines(res.items || []);
      setTotalCount(res.total || 0);
      setTotalPages(res.pages || 1);
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : "") || "Failed to load medicines from catalog.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => fetchCatalog());
  }, [page, searchQuery, categoryFilter, rxFilter]);

  const handleOpenCreate = () => {
    setSubmitError(null);
    setSubmitSuccess(null);
    setFormData({
      brand_name: "",
      generic_name: "",
      manufacturer: "",
      strength: "",
      dosage_form: "tablet",
      route: "oral",
      category: "antibiotic",
      is_prescription_only: true,
      mrp: undefined,
      selling_price: undefined,
      hsn_code: "3004",
      gst_percentage: 12.0,
      storage_requirements: "Store below 25°C in a dry place",
      ingredients: [{ name: "", strength: "", unit: "mg" }],
      aliases: [{ alias_name: "", alias_type: "brand_variant" }],
    });
    setShowCreateModal(true);
  };

  const handleAddIngredient = () => {
    setFormData({
      ...formData,
      ingredients: [...(formData.ingredients || []), { name: "", strength: "", unit: "mg" }],
    });
  };

  const handleRemoveIngredient = (index: number) => {
    const updated = [...(formData.ingredients || [])];
    updated.splice(index, 1);
    setFormData({ ...formData, ingredients: updated });
  };

  const handleIngredientChange = (
    index: number,
    field: "name" | "strength" | "unit",
    val: string
  ) => {
    const updated = [...(formData.ingredients || [])];
    updated[index] = { ...updated[index], [field]: val };
    setFormData({ ...formData, ingredients: updated });
  };

  const handleAddAlias = () => {
    setFormData({
      ...formData,
      aliases: [...(formData.aliases || []), { alias_name: "", alias_type: "common_name" }],
    });
  };

  const handleRemoveAlias = (index: number) => {
    const updated = [...(formData.aliases || [])];
    updated.splice(index, 1);
    setFormData({ ...formData, aliases: updated });
  };

  const handleAliasChange = (
    index: number,
    field: "alias_name" | "alias_type",
    val: string
  ) => {
    const updated = [...(formData.aliases || [])];
    updated[index] = { ...updated[index], [field]: val };
    setFormData({ ...formData, aliases: updated });
  };

  const handleSubmitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.brand_name.trim()) {
      setSubmitError("Brand Name is required.");
      return;
    }

    setSubmitError(null);
    startTransition(async () => {
      try {
        const cleanedPayload: CreateMedicinePayload = {
          ...formData,
          brand_name: formData.brand_name.trim(),
          generic_name: formData.generic_name?.trim() || undefined,
          manufacturer: formData.manufacturer?.trim() || undefined,
          strength: formData.strength?.trim() || undefined,
          mrp: formData.mrp ? Number(formData.mrp) : undefined,
          selling_price: formData.selling_price ? Number(formData.selling_price) : undefined,
          gst_percentage: formData.gst_percentage ? Number(formData.gst_percentage) : undefined,
          ingredients: (formData.ingredients || []).filter((i) => i.name.trim().length > 0),
          aliases: (formData.aliases || []).filter((a) => a.alias_name.trim().length > 0),
        };

        await createMedicine(cleanedPayload);
        setSubmitSuccess(`Medicine "${formData.brand_name}" successfully registered!`);
        setTimeout(() => {
          setShowCreateModal(false);
          fetchCatalog();
        }, 800);
      } catch (err: unknown) {
        setSubmitError((err instanceof Error ? err.message : "") || "Failed to register medicine.");
      }
    });
  };

  // Metrics calculation
  const rxCount = medicines.filter((m) => m.is_prescription_only).length;
  const otcCount = medicines.filter((m) => !m.is_prescription_only).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      {/* Header — Aligned 64px height */}
      <header className="page-header">
        <div>
          <h1 className="page-title">Medicines Catalog</h1>
          <p className="page-subtitle">
            Master Pharmaceutical Directory & Formulation Identity • Store #1
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <ThemeToggle />
          <button onClick={handleOpenCreate} className="btn btn-primary">
            <PlusCircle size={16} />
            <span>Register Medicine</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="page-body" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Cardinal Data Principle Callout */}
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
            <Bookmark size={18} />
          </span>
          <div>
            <strong style={{ color: "var(--text-primary)" }}>
              Cardinal Principle (MEDICINE != BATCH != INVENTORY):
            </strong>{" "}
            <span style={{ color: "var(--text-secondary)" }}>
              The Medicines Catalog stores immutable formulation identity, active molecules, and regulatory flags.
              Batch numbers, expiry dates, and unit stock counts belong downstream in{" "}
              <Link href="/inventory" style={{ color: "var(--brand-primary)", textDecoration: "underline" }}>
                Batches & Inventory
              </Link>
              .
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
                Total Formulations
              </span>
              <span className="status-badge info">
                <span className="badge-icon"><Bookmark size={12} /></span>
                <span>Registry</span>
              </span>
            </div>
            <div style={{ fontSize: "1.625rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {totalCount}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              Permanent drug catalog profiles
            </div>
          </div>

          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Prescription (Rx) Only
              </span>
              <span className="status-badge med">
                <span className="badge-icon"><AlertTriangle size={12} /></span>
                <span>Schedule H</span>
              </span>
            </div>
            <div style={{ fontSize: "1.625rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {rxCount}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              Requires pharmacist verification
            </div>
          </div>

          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Over-The-Counter (OTC)
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><CheckCircle2 size={12} /></span>
                <span>General Sale</span>
              </span>
            </div>
            <div style={{ fontSize: "1.625rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {otcCount}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              Direct counter dispensing allowed
            </div>
          </div>

          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Active Formulations
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><CheckCircle2 size={12} /></span>
                <span>Active</span>
              </span>
            </div>
            <div style={{ fontSize: "1.625rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {medicines.filter((m) => m.is_active).length}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              Enabled for POS & Camera OCR lookup
            </div>
          </div>
        </div>

        {/* Search, Filters, and Actions Bar */}
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
            {/* Search input with icon */}
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
                placeholder="Search brand, generic, or manufacturer..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
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

            {/* Category Dropdown */}
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              className="form-select"
              style={{ width: "180px" }}
            >
              <option value="">All Categories</option>
              {COMMON_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.replace("_", " ").toUpperCase()}
                </option>
              ))}
            </select>

            {/* Rx Filter */}
            <select
              value={rxFilter}
              onChange={(e) => {
                setRxFilter(e.target.value);
                setPage(1);
              }}
              className="form-select"
              style={{ width: "150px" }}
            >
              <option value="all">All Schedules</option>
              <option value="rx_only">Rx Only (Schedule H)</option>
              <option value="otc_only">OTC (General)</option>
            </select>
          </div>

          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Showing <strong>{medicines.length}</strong> of <strong>{totalCount}</strong> items
          </div>
        </div>

        {/* Data Table */}
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Brand & Formulation</th>
                <th>Generic Composition</th>
                <th>Strength / Route</th>
                <th>Manufacturer</th>
                <th>MRP / Pricing</th>
                <th>Schedule Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "3rem 1rem" }}>
                    <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                      Loading medicines catalog...
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "3rem 1rem" }}>
                    <div style={{ color: "var(--status-low-text)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                      {error}
                    </div>
                    <button onClick={fetchCatalog} className="btn btn-secondary">
                      Retry
                    </button>
                  </td>
                </tr>
              ) : medicines.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "3.5rem 1rem" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
                      <span style={{ color: "var(--text-muted)" }}>
                        <Bookmark size={32} />
                      </span>
                      <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)" }}>
                        No medicines found in catalog
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", maxWidth: "340px" }}>
                        {searchQuery
                          ? `No results matching "${searchQuery}". Try adjusting your filters.`
                          : "Start building your pharmacy catalog by registering master medicine formulations."}
                      </div>
                      <button onClick={handleOpenCreate} className="btn btn-primary" style={{ marginTop: "0.5rem" }}>
                        <PlusCircle size={16} />
                        <span>Register First Medicine</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                medicines.map((item) => (
                  <tr key={item.id}>
                    {/* Brand Name & Dosage Form */}
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                        <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.875rem" }}>
                          {item.brand_name}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                          <span
                            style={{
                              fontSize: "0.6875rem",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              padding: "0.1rem 0.35rem",
                              borderRadius: "var(--radius-sm)",
                              backgroundColor: "var(--bg-surface-elevated)",
                              border: "1px solid var(--border-subtle)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {item.dosage_form || "Formulation"}
                          </span>
                          {item.category && (
                            <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                              • {item.category}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Generic Name */}
                    <td>
                      <span style={{ color: "var(--text-secondary)" }}>
                        {item.generic_name || "—"}
                      </span>
                    </td>

                    {/* Strength & Route */}
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                        <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                          {item.strength || "—"}
                        </span>
                        <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                          {item.route ? `Route: ${item.route}` : ""}
                        </span>
                      </div>
                    </td>

                    {/* Manufacturer */}
                    <td>
                      <span style={{ color: "var(--text-secondary)" }}>
                        {item.manufacturer || "—"}
                      </span>
                    </td>

                    {/* MRP / Pricing */}
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                        <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                          ₹{item.mrp !== null && item.mrp !== undefined ? Number(item.mrp).toFixed(2) : "0.00"}
                        </span>
                        {item.selling_price && (
                          <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                            SP: ₹{Number(item.selling_price).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Schedule / Rx Status */}
                    <td>
                      {item.is_prescription_only ? (
                        <span className="status-badge med">
                          <span className="badge-icon"><AlertTriangle size={12} /></span>
                          <span>Rx Required</span>
                        </span>
                      ) : (
                        <span className="status-badge high">
                          <span className="badge-icon"><CheckCircle2 size={12} /></span>
                          <span>OTC Safe</span>
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: "right" }}>
                      <button
                        onClick={() => setSelectedMedicine(item)}
                        className="btn-icon"
                        title="View Medicine Formulation Details"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.5rem 0",
            }}
          >
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              Page <strong>{page}</strong> of <strong>{totalPages}</strong>
            </span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn btn-secondary"
                style={{ height: "32px", padding: "0 0.75rem" }}
              >
                <ChevronLeft size={16} />
                <span>Previous</span>
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn btn-secondary"
                style={{ height: "32px", padding: "0 0.75rem" }}
              >
                <span>Next</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          Modal: Register Medicine (Human-in-the-Loop Pharmacist Input)
          ===================================================================== */}
      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => !isSubmitting && setShowCreateModal(false)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "680px" }}
          >
            {/* Header */}
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "#252525",
                    border: "1px solid #393939",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--brand-primary)",
                  }}
                >
                  <Bookmark size={15} />
                </div>
                <div>
                  <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Register Master Medicine
                  </h2>
                  <p style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                    Creates a permanent drug profile in Store #1 catalog
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="btn-icon"
                disabled={isSubmitting}
              >
                <X size={16} />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSubmitCreate} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
              <div className="modal-body">
                {submitError && (
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
                    {submitError}
                  </div>
                )}
                {submitSuccess && (
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
                    {submitSuccess}
                  </div>
                )}

                {/* Primary Information Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div className="form-group">
                    <label className="form-label">Brand Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Augmentin 625 Duo"
                      value={formData.brand_name}
                      onChange={(e) => setFormData({ ...formData, brand_name: e.target.value })}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Generic Composition *</label>
                    <input
                      type="text"
                      placeholder="e.g. Amoxicillin and Clavulanate"
                      value={formData.generic_name || ""}
                      onChange={(e) => setFormData({ ...formData, generic_name: e.target.value })}
                      className="form-input"
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
                  <div className="form-group">
                    <label className="form-label">Manufacturer</label>
                    <input
                      type="text"
                      placeholder="e.g. GlaxoSmithKline"
                      value={formData.manufacturer || ""}
                      onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Strength</label>
                    <input
                      type="text"
                      placeholder="e.g. 625mg"
                      value={formData.strength || ""}
                      onChange={(e) => setFormData({ ...formData, strength: e.target.value })}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Dosage Form</label>
                    <select
                      value={formData.dosage_form}
                      onChange={(e) => setFormData({ ...formData, dosage_form: e.target.value })}
                      className="form-select"
                    >
                      {DOSAGE_FORMS.map((form) => (
                        <option key={form} value={form}>
                          {form.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
                  <div className="form-group">
                    <label className="form-label">Administration Route</label>
                    <input
                      type="text"
                      placeholder="e.g. oral, topical"
                      value={formData.route || ""}
                      onChange={(e) => setFormData({ ...formData, route: e.target.value })}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Therapeutic Category</label>
                    <select
                      value={formData.category || ""}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="form-select"
                    >
                      {COMMON_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat.replace("_", " ").toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">HSN Code</label>
                    <input
                      type="text"
                      placeholder="e.g. 3004"
                      value={formData.hsn_code || ""}
                      onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value })}
                      className="form-input"
                    />
                  </div>
                </div>

                {/* Pricing & Prescription Requirement */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
                  <div className="form-group">
                    <label className="form-label">MRP (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 204.50"
                      value={formData.mrp || ""}
                      onChange={(e) => setFormData({ ...formData, mrp: e.target.value ? parseFloat(e.target.value) : undefined })}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Selling Price (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 190.00"
                      value={formData.selling_price || ""}
                      onChange={(e) => setFormData({ ...formData, selling_price: e.target.value ? parseFloat(e.target.value) : undefined })}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">GST %</label>
                    <input
                      type="number"
                      step="0.5"
                      placeholder="12.0"
                      value={formData.gst_percentage || ""}
                      onChange={(e) => setFormData({ ...formData, gst_percentage: e.target.value ? parseFloat(e.target.value) : undefined })}
                      className="form-input"
                    />
                  </div>
                </div>

                {/* Prescription Schedule Flag */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.75rem",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "var(--bg-surface-elevated)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <input
                    type="checkbox"
                    id="is_rx"
                    checked={formData.is_prescription_only}
                    onChange={(e) => setFormData({ ...formData, is_prescription_only: e.target.checked })}
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                  <label htmlFor="is_rx" style={{ fontSize: "0.8125rem", color: "var(--text-primary)", cursor: "pointer" }}>
                    <strong>Prescription Required (Schedule H / H1 / X)</strong>
                    <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                      Requires doctor prescription verification at POS counter before dispensing
                    </div>
                  </label>
                </div>

                {/* Active Ingredients Repeater */}
                <div className="form-group">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label className="form-label">Active Ingredients / Molecules</label>
                    <button
                      type="button"
                      onClick={handleAddIngredient}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--brand-primary)",
                        fontSize: "0.6875rem",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      + Add Ingredient
                    </button>
                  </div>
                  {(formData.ingredients || []).map((ing, idx) => (
                    <div key={idx} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <input
                        type="text"
                        placeholder="Ingredient name (e.g. Amoxicillin)"
                        value={ing.name}
                        onChange={(e) => handleIngredientChange(idx, "name", e.target.value)}
                        className="form-input"
                        style={{ flex: 2 }}
                      />
                      <input
                        type="text"
                        placeholder="Strength (e.g. 500)"
                        value={ing.strength || ""}
                        onChange={(e) => handleIngredientChange(idx, "strength", e.target.value)}
                        className="form-input"
                        style={{ flex: 1 }}
                      />
                      <input
                        type="text"
                        placeholder="Unit (mg)"
                        value={ing.unit || ""}
                        onChange={(e) => handleIngredientChange(idx, "unit", e.target.value)}
                        className="form-input"
                        style={{ width: "70px" }}
                      />
                      {(formData.ingredients || []).length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveIngredient(idx)}
                          className="btn-icon"
                          style={{ width: "28px", height: "28px" }}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-secondary"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Registering..." : "Confirm & Register Medicine"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          Modal: Medicine Details Quick View
          ===================================================================== */}
      {selectedMedicine && (
        <div className="modal-backdrop" onClick={() => setSelectedMedicine(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "560px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "#252525",
                    border: "1px solid #393939",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--brand-primary)",
                  }}
                >
                  <Bookmark size={15} />
                </div>
                <div>
                  <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    {selectedMedicine.brand_name}
                  </h2>
                  <p style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                    Formulation ID #{selectedMedicine.id} • Store #{selectedMedicine.store_id}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedMedicine(null)} className="btn-icon">
                <X size={16} />
              </button>
            </div>

            <div className="modal-body" style={{ gap: "1.25rem" }}>
              {/* Core Details Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.75rem",
                  padding: "1rem",
                  backgroundColor: "var(--bg-surface-elevated)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                    Generic Molecule
                  </div>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "2px" }}>
                    {selectedMedicine.generic_name || "N/A"}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                    Manufacturer
                  </div>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "2px" }}>
                    {selectedMedicine.manufacturer || "N/A"}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                    Dosage & Route
                  </div>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "2px" }}>
                    {selectedMedicine.dosage_form?.toUpperCase()} • {selectedMedicine.strength || "Standard"} ({selectedMedicine.route || "oral"})
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                    MRP / Rate
                  </div>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "2px" }}>
                    ₹{selectedMedicine.mrp !== null ? Number(selectedMedicine.mrp).toFixed(2) : "0.00"}{" "}
                    {selectedMedicine.selling_price && `(SP: ₹${Number(selectedMedicine.selling_price).toFixed(2)})`}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                    HSN & GST
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-primary)", marginTop: "2px" }}>
                    HSN {selectedMedicine.hsn_code || "3004"} • {selectedMedicine.gst_percentage || 12}% GST
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                    Regulatory Schedule
                  </div>
                  <div style={{ marginTop: "4px" }}>
                    {selectedMedicine.is_prescription_only ? (
                      <span className="status-badge med">
                        <span className="badge-icon"><AlertTriangle size={12} /></span>
                        <span>Schedule H (Rx)</span>
                      </span>
                    ) : (
                      <span className="status-badge high">
                        <span className="badge-icon"><CheckCircle2 size={12} /></span>
                        <span>OTC Permitted</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Active Ingredients Breakdown */}
              {selectedMedicine.ingredients && selectedMedicine.ingredients.length > 0 && (
                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
                    Active Pharmaceutical Ingredients (API)
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                    {selectedMedicine.ingredients.map((ing, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "0.45rem 0.75rem",
                          backgroundColor: "var(--bg-surface-elevated)",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "0.75rem",
                        }}
                      >
                        <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{ing.name}</span>
                        <span style={{ color: "var(--text-muted)" }}>
                          {ing.strength} {ing.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Storage Requirements */}
              {selectedMedicine.storage_requirements && (
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  <strong style={{ color: "var(--text-primary)" }}>Storage Conditions:</strong>{" "}
                  {selectedMedicine.storage_requirements}
                </div>
              )}

              {/* Cardinal Navigation to Downstream Inventory */}
              <div
                style={{
                  padding: "0.875rem",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--bg-surface-elevated)",
                  border: "1px solid var(--border-subtle)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Physical Batches & Stock
                  </div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                    View physical lots, supplier deliveries, and shelf locations
                  </div>
                </div>
                <Link href="/inventory" className="btn btn-secondary" style={{ height: "30px", fontSize: "0.75rem" }}>
                  <Package size={14} />
                  <span>View Batches</span>
                </Link>
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setSelectedMedicine(null)} className="btn btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
