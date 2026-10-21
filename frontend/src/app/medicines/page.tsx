"use client";
import "./presentation.css";
import { VirtualTableBody } from "@/components/ui/VirtualTableBody";

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
  saveMedicineBarcode,
  updateMedicine,
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
  const [barcodeValue, setBarcodeValue] = useState("");
  const [barcodeMessage, setBarcodeMessage] = useState("");
  const [savingBarcode, setSavingBarcode] = useState(false);
  const [editDraft, setEditDraft] = useState<CreateMedicinePayload | null>(null);
  const [savingMedicine, setSavingMedicine] = useState(false);
  const [editError, setEditError] = useState("");

  const changeBarcode = async (medicine: Medicine, code: string, remove = false) => {
    setSavingBarcode(true);
    setBarcodeMessage("");
    try {
      const updated = await saveMedicineBarcode(medicine.id, code, remove);
      setMedicines(items => items.map(item => item.id === updated.id ? updated : item));
      setSelectedMedicine(current => current?.id === updated.id ? updated : current);
      setBarcodeValue("");
      setBarcodeMessage("Saved. Sync the POS catalog before scanning this barcode.");
    } catch (error) {
      setBarcodeMessage(error instanceof Error ? error.message : "Could not save barcode.");
    } finally { setSavingBarcode(false); }
  };
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
    <div className="medicines-1">
      {/* Header — Aligned 64px height */}
      <header className="page-header">
        <div>
          <h1 className="page-title">Medicines Catalog</h1>
          <p className="page-subtitle">
            Master Pharmaceutical Directory & Formulation Identity • Store #1
          </p>
        </div>

        <div className="medicines-2">
          <ThemeToggle />
          <button onClick={handleOpenCreate} className="btn btn-primary">
            <PlusCircle size={16} />
            <span>Register Medicine</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div  className="page-body medicines-3">
        {/* Cardinal Data Principle Callout */}
        <div
          className="medicines-4"
        >
          <span className="medicines-5">
            <Bookmark size={18} />
          </span>
          <div>
            <strong className="medicines-6">
              Cardinal Principle (MEDICINE != BATCH != INVENTORY):
            </strong>{" "}
            <span className="medicines-7">
              The Medicines Catalog stores immutable formulation identity, active molecules, and regulatory flags.
              Batch numbers, expiry dates, and unit stock counts belong downstream in{" "}
              <Link href="/inventory" className="medicines-8">
                Batches & Inventory
              </Link>
              .
            </span>
          </div>
        </div>

        {/* Metrics Overview Row */}
        <div
          className="medicines-9"
        >
          <div  className="card medicines-10">
            <div className="medicines-11">
              <span className="medicines-12">
                Total Formulations
              </span>
              <span className="status-badge info">
                <span className="badge-icon"><Bookmark size={12} /></span>
                <span>Registry</span>
              </span>
            </div>
            <div className="medicines-13">
              {totalCount}
            </div>
            <div className="medicines-14">
              Permanent drug catalog profiles
            </div>
          </div>

          <div  className="card medicines-15">
            <div className="medicines-16">
              <span className="medicines-17">
                Prescription (Rx) Only
              </span>
              <span className="status-badge med">
                <span className="badge-icon"><AlertTriangle size={12} /></span>
                <span>Schedule H</span>
              </span>
            </div>
            <div className="medicines-18">
              {rxCount}
            </div>
            <div className="medicines-19">
              Requires pharmacist verification
            </div>
          </div>

          <div  className="card medicines-20">
            <div className="medicines-21">
              <span className="medicines-22">
                Over-The-Counter (OTC)
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><CheckCircle2 size={12} /></span>
                <span>General Sale</span>
              </span>
            </div>
            <div className="medicines-23">
              {otcCount}
            </div>
            <div className="medicines-24">
              Direct counter dispensing allowed
            </div>
          </div>

          <div  className="card medicines-25">
            <div className="medicines-26">
              <span className="medicines-27">
                Active Formulations
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><CheckCircle2 size={12} /></span>
                <span>Active</span>
              </span>
            </div>
            <div className="medicines-28">
              {medicines.filter((m) => m.is_active).length}
            </div>
            <div className="medicines-29">
              Enabled for POS & Camera OCR lookup
            </div>
          </div>
        </div>

        {/* Search, Filters, and Actions Bar */}
        <div
          className="medicines-30"
        >
          <div className="medicines-31">
            {/* Search input with icon */}
            <div className="medicines-32">
              <Search
                size={16}
                className="medicines-33"
              />
              <input
                type="text"
                placeholder="Search brand, generic, or manufacturer..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                
                className="form-input medicines-34"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="medicines-35" aria-label="Close dialog"
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
              
              className="form-select medicines-36"
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
              
              className="form-select medicines-37"
            >
              <option value="all">All Schedules</option>
              <option value="rx_only">Rx Only (Schedule H)</option>
              <option value="otc_only">OTC (General)</option>
            </select>
          </div>

          <div className="medicines-38">
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
                <th className="medicines-39">Actions</th>
              </tr>
            </thead>
            <VirtualTableBody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="medicines-40">
                    <div className="medicines-41">
                      Loading medicines catalog...
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="medicines-42">
                    <div className="medicines-43">
                      {error}
                    </div>
                    <button onClick={fetchCatalog} className="btn btn-secondary">
                      Retry
                    </button>
                  </td>
                </tr>
              ) : medicines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="medicines-44">
                    <div className="medicines-45">
                      <span className="medicines-46">
                        <Bookmark size={32} />
                      </span>
                      <div className="medicines-47">
                        No medicines found in catalog
                      </div>
                      <div className="medicines-48">
                        {searchQuery
                          ? `No results matching "${searchQuery}". Try adjusting your filters.`
                          : "Start building your pharmacy catalog by registering master medicine formulations."}
                      </div>
                      <button onClick={handleOpenCreate}  className="btn btn-primary medicines-49">
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
                      <div className="medicines-50">
                        <span className="medicines-51">
                          {item.brand_name}
                        </span>
                        <div className="medicines-52">
                          <span
                            className="medicines-53"
                          >
                            {item.dosage_form || "Formulation"}
                          </span>
                          {item.category && (
                            <span className="medicines-54">
                              • {item.category}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Generic Name */}
                    <td>
                      <span className="medicines-55">
                        {item.generic_name || "—"}
                      </span>
                    </td>

                    {/* Strength & Route */}
                    <td>
                      <div className="medicines-56">
                        <span className="medicines-57">
                          {item.strength || "—"}
                        </span>
                        <span className="medicines-58">
                          {item.route ? `Route: ${item.route}` : ""}
                        </span>
                      </div>
                    </td>

                    {/* Manufacturer */}
                    <td>
                      <span className="medicines-59">
                        {item.manufacturer || "—"}
                      </span>
                    </td>

                    {/* MRP / Pricing */}
                    <td>
                      <div className="medicines-60">
                        <span className="medicines-61">
                          ₹{item.mrp !== null && item.mrp !== undefined ? Number(item.mrp).toFixed(2) : "0.00"}
                        </span>
                        {item.selling_price && (
                          <span className="medicines-62">
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
                    <td className="medicines-63">
                      <button
                        onClick={() => { setBarcodeValue(""); setBarcodeMessage(""); setEditDraft(null); setEditError(""); setSelectedMedicine(item); }}
                        className="btn-icon"
                        title="View Medicine Formulation Details"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </VirtualTableBody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div
            className="medicines-64"
          >
            <span className="medicines-65">
              Page <strong>{page}</strong> of <strong>{totalPages}</strong>
            </span>
            <div className="medicines-66">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                
                className="btn btn-secondary medicines-67"
              >
                <ChevronLeft size={16} />
                <span>Previous</span>
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                
                className="btn btn-secondary medicines-68"
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
            
            onClick={(e) => e.stopPropagation()}
            className="modal-content medicines-69"
          >
            {/* Header */}
            <div className="modal-header">
              <div className="medicines-70">
                <div
                  className="medicines-71"
                >
                  <Bookmark size={15} />
                </div>
                <div>
                  <h2 className="medicines-72">
                    Register Master Medicine
                  </h2>
                  <p className="medicines-73">
                    Creates a permanent drug profile in Store #1 catalog
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="btn-icon"
                disabled={isSubmitting} aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSubmitCreate} className="medicines-74">
              <div className="modal-body">
                {submitError && (
                  <div
                    className="medicines-75"
                  >
                    {submitError}
                  </div>
                )}
                {submitSuccess && (
                  <div
                    className="medicines-76"
                  >
                    {submitSuccess}
                  </div>
                )}

                {/* Primary Information Grid */}
                <div className="medicines-77">
                  <div className="form-group">
                    <label className="form-label" htmlFor="medicines-field-1">Brand Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Augmentin 625 Duo"
                      value={formData.brand_name}
                      onChange={(e) => setFormData({ ...formData, brand_name: e.target.value })}
                      className="form-input" id="medicines-field-1"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="medicines-field-2">Generic Composition *</label>
                    <input
                      type="text"
                      placeholder="e.g. Amoxicillin and Clavulanate"
                      value={formData.generic_name || ""}
                      onChange={(e) => setFormData({ ...formData, generic_name: e.target.value })}
                      className="form-input" id="medicines-field-2"
                    />
                  </div>
                </div>

                <div className="medicines-78">
                  <div className="form-group">
                    <label className="form-label" htmlFor="medicines-field-3">Manufacturer</label>
                    <input
                      type="text"
                      placeholder="e.g. GlaxoSmithKline"
                      value={formData.manufacturer || ""}
                      onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                      className="form-input" id="medicines-field-3"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="medicines-field-4">Strength</label>
                    <input
                      type="text"
                      placeholder="e.g. 625mg"
                      value={formData.strength || ""}
                      onChange={(e) => setFormData({ ...formData, strength: e.target.value })}
                      className="form-input" id="medicines-field-4"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="medicines-field-5">Dosage Form</label>
                    <select
                      value={formData.dosage_form}
                      onChange={(e) => setFormData({ ...formData, dosage_form: e.target.value })}
                      className="form-select" id="medicines-field-5"
                    >
                      {DOSAGE_FORMS.map((form) => (
                        <option key={form} value={form}>
                          {form.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="medicines-79">
                  <div className="form-group">
                    <label className="form-label" htmlFor="medicines-field-6">Administration Route</label>
                    <input
                      type="text"
                      placeholder="e.g. oral, topical"
                      value={formData.route || ""}
                      onChange={(e) => setFormData({ ...formData, route: e.target.value })}
                      className="form-input" id="medicines-field-6"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="medicines-field-7">Therapeutic Category</label>
                    <select
                      value={formData.category || ""}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="form-select" id="medicines-field-7"
                    >
                      {COMMON_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat.replace("_", " ").toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="medicines-field-8">HSN Code</label>
                    <input
                      type="text"
                      placeholder="e.g. 3004"
                      value={formData.hsn_code || ""}
                      onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value })}
                      className="form-input" id="medicines-field-8"
                    />
                  </div>
                </div>

                {/* Pricing & Prescription Requirement */}
                <div className="medicines-80">
                  <div className="form-group">
                    <label className="form-label" htmlFor="medicines-field-9">MRP (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 204.50"
                      value={formData.mrp || ""}
                      onChange={(e) => setFormData({ ...formData, mrp: e.target.value ? parseFloat(e.target.value) : undefined })}
                      className="form-input" id="medicines-field-9"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="medicines-field-10">Selling Price (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 190.00"
                      value={formData.selling_price || ""}
                      onChange={(e) => setFormData({ ...formData, selling_price: e.target.value ? parseFloat(e.target.value) : undefined })}
                      className="form-input" id="medicines-field-10"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="medicines-field-11">GST %</label>
                    <input
                      type="number"
                      step="0.5"
                      placeholder="12.0"
                      value={formData.gst_percentage || ""}
                      onChange={(e) => setFormData({ ...formData, gst_percentage: e.target.value ? parseFloat(e.target.value) : undefined })}
                      className="form-input" id="medicines-field-11"
                    />
                  </div>
                </div>

                {/* Prescription Schedule Flag */}
                <div
                  className="medicines-81"
                >
                  <input
                    type="checkbox"
                    id="is_rx"
                    checked={formData.is_prescription_only}
                    onChange={(e) => setFormData({ ...formData, is_prescription_only: e.target.checked })}
                    className="medicines-82"
                  />
                  <label htmlFor="is_rx" className="medicines-83">
                    <strong>Prescription Required (Schedule H / H1 / X)</strong>
                    <div className="medicines-84">
                      Requires doctor prescription verification at POS counter before dispensing
                    </div>
                  </label>
                </div>

                {/* Active Ingredients Repeater */}
                <div className="form-group">
                  <div className="medicines-85">
                    <label className="form-label">Active Ingredients / Molecules</label>
                    <button
                      type="button"
                      onClick={handleAddIngredient}
                      className="medicines-86"
                    >
                      + Add Ingredient
                    </button>
                  </div>
                  {(formData.ingredients || []).map((ing, idx) => (
                    <div key={idx} className="medicines-87">
                      <input
                        type="text"
                        placeholder="Ingredient name (e.g. Amoxicillin)"
                        value={ing.name}
                        onChange={(e) => handleIngredientChange(idx, "name", e.target.value)}
                        
                        className="form-input medicines-88"
                      />
                      <input
                        type="text"
                        placeholder="Strength (e.g. 500)"
                        value={ing.strength || ""}
                        onChange={(e) => handleIngredientChange(idx, "strength", e.target.value)}
                        
                        className="form-input medicines-89"
                      />
                      <input
                        type="text"
                        placeholder="Unit (mg)"
                        value={ing.unit || ""}
                        onChange={(e) => handleIngredientChange(idx, "unit", e.target.value)}
                        
                        className="form-input medicines-90"
                      />
                      {(formData.ingredients || []).length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveIngredient(idx)}
                          
                          className="btn-icon medicines-91" aria-label="Close dialog"
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
          <div  onClick={(e) => e.stopPropagation()} className="modal-content medicines-92">
            <div className="modal-header">
              <div className="medicines-93">
                <div
                  className="medicines-94"
                >
                  <Bookmark size={15} />
                </div>
                <div>
                  <h2 className="medicines-95">
                    {selectedMedicine.brand_name}
                  </h2>
                  <p className="medicines-96">
                    Formulation ID #{selectedMedicine.id} • Store #{selectedMedicine.store_id}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedMedicine(null)} className="btn-icon" aria-label="Close dialog">
                <X size={16} />
              </button>
            </div>

            <div  className="modal-body medicines-97">
              {!editDraft && <button className="btn btn-secondary" disabled={savingBarcode} onClick={() => {
                setEditError("");
                setEditDraft({ brand_name: selectedMedicine.brand_name, generic_name: selectedMedicine.generic_name || "",
                  strength: selectedMedicine.strength || "", manufacturer: selectedMedicine.manufacturer || "",
                  dosage_form: selectedMedicine.dosage_form || "other", mrp: selectedMedicine.mrp ?? 0,
                  selling_price: selectedMedicine.selling_price ?? 0, gst_percentage: selectedMedicine.gst_percentage ?? 0,
                  is_prescription_only: selectedMedicine.is_prescription_only });
              }}>Edit medicine details</button>}
              {editDraft && <form onSubmit={async e => {
                e.preventDefault(); if (savingMedicine) return;
                setSavingMedicine(true); setEditError("");
                try {
                  const result = await updateMedicine(selectedMedicine.id, editDraft);
                  setMedicines(previous => previous.map(m => m.id === result.medicine.id ? result.medicine : m));
                  setSelectedMedicine(current => current?.id === result.medicine.id ? result.medicine : current);
                  setEditDraft(null); setSubmitSuccess("Medicine updated. Sync POS to refresh its cached details.");
                } catch (error) { setEditError(error instanceof Error ? error.message : "Could not update medicine."); }
                finally { setSavingMedicine(false); }
              }} className="medicines-98">
                <fieldset disabled={savingMedicine} className="medicines-99">
                  {(["brand_name", "generic_name", "strength", "manufacturer"] as const).map(field => <label className="form-group" key={field}>
                    {field.replaceAll("_", " ")}<input className="form-input" required={field === "brand_name"} maxLength={field === "strength" ? 100 : 300}
                      value={editDraft[field] || ""} onChange={e => setEditDraft({ ...editDraft, [field]: e.target.value })} />
                  </label>)}
                  <label className="form-group">Dosage form<select className="form-input" value={editDraft.dosage_form} onChange={e => setEditDraft({ ...editDraft, dosage_form: e.target.value })}>
                    {DOSAGE_FORMS.map(form => <option key={form}>{form}</option>)}
                  </select></label>
                  {(["mrp", "selling_price", "gst_percentage"] as const).map(field => <label className="form-group" key={field}>
                    {field.replaceAll("_", " ")}<input className="form-input" type="number" min={0} max={field === "gst_percentage" ? 100 : undefined} step="0.01" required
                      value={editDraft[field] ?? 0} onChange={e => setEditDraft({ ...editDraft, [field]: Number(e.target.value) })} />
                  </label>)}
                  <label><input type="checkbox" checked={!!editDraft.is_prescription_only} onChange={e => setEditDraft({ ...editDraft, is_prescription_only: e.target.checked })} /> Prescription required</label>
                </fieldset>
                {editError && <p role="alert">{editError}</p>}
                <div className="medicines-100"><button type="submit" className="btn btn-primary" disabled={savingMedicine}>Save medicine</button>
                  <button type="button" className="btn btn-secondary" disabled={savingMedicine} onClick={() => setEditDraft(null)}>Cancel</button></div>
              </form>}
              <section>
                <h3>Product barcodes</h3>
                <p className="medicines-101">Confirm this medicine, strength and pack before linking. Each scan adds one existing stock unit.</p>
                {(selectedMedicine.barcodes || []).map(code => (
                  <div key={code} className="medicines-102">
                    <code>{code}</code>
                    <button className="btn btn-secondary" disabled={savingBarcode} onClick={() => changeBarcode(selectedMedicine, code, true)}>Remove</button>
                  </div>
                ))}
                <form onSubmit={e => { e.preventDefault(); void changeBarcode(selectedMedicine, barcodeValue); }} className="medicines-103">
                  <input key={selectedMedicine.id} className="form-input" aria-label="Link product barcode" placeholder="Scan or type barcode" maxLength={64} required autoComplete="off"
                    value={barcodeValue} onChange={e => setBarcodeValue(e.target.value)} />
                  <button type="submit" className="btn btn-primary" disabled={savingBarcode}>Link barcode</button>
                </form>
                {barcodeMessage && <p role="status">{barcodeMessage}</p>}
              </section>
              {/* Core Details Grid */}
              <div
                className="medicines-104"
              >
                <div>
                  <div className="medicines-105">
                    Generic Molecule
                  </div>
                  <div className="medicines-106">
                    {selectedMedicine.generic_name || "N/A"}
                  </div>
                </div>

                <div>
                  <div className="medicines-107">
                    Manufacturer
                  </div>
                  <div className="medicines-108">
                    {selectedMedicine.manufacturer || "N/A"}
                  </div>
                </div>

                <div>
                  <div className="medicines-109">
                    Dosage & Route
                  </div>
                  <div className="medicines-110">
                    {selectedMedicine.dosage_form?.toUpperCase()} • {selectedMedicine.strength || "Standard"} ({selectedMedicine.route || "oral"})
                  </div>
                </div>

                <div>
                  <div className="medicines-111">
                    MRP / Rate
                  </div>
                  <div className="medicines-112">
                    ₹{selectedMedicine.mrp !== null ? Number(selectedMedicine.mrp).toFixed(2) : "0.00"}{" "}
                    {selectedMedicine.selling_price && `(SP: ₹${Number(selectedMedicine.selling_price).toFixed(2)})`}
                  </div>
                </div>

                <div>
                  <div className="medicines-113">
                    HSN & GST
                  </div>
                  <div className="medicines-114">
                    HSN {selectedMedicine.hsn_code || "3004"} • {selectedMedicine.gst_percentage || 12}% GST
                  </div>
                </div>

                <div>
                  <div className="medicines-115">
                    Regulatory Schedule
                  </div>
                  <div className="medicines-116">
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
                  <div className="medicines-117">
                    Active Pharmaceutical Ingredients (API)
                  </div>
                  <div className="medicines-118">
                    {selectedMedicine.ingredients.map((ing, idx) => (
                      <div
                        key={idx}
                        className="medicines-119"
                      >
                        <span className="medicines-120">{ing.name}</span>
                        <span className="medicines-121">
                          {ing.strength} {ing.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Storage Requirements */}
              {selectedMedicine.storage_requirements && (
                <div className="medicines-122">
                  <strong className="medicines-123">Storage Conditions:</strong>{" "}
                  {selectedMedicine.storage_requirements}
                </div>
              )}

              {/* Cardinal Navigation to Downstream Inventory */}
              <div
                className="medicines-124"
              >
                <div>
                  <div className="medicines-125">
                    Physical Batches & Stock
                  </div>
                  <div className="medicines-126">
                    View physical lots, supplier deliveries, and shelf locations
                  </div>
                </div>
                <Link href="/inventory"  className="btn btn-secondary medicines-127">
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
