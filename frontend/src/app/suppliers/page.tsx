"use client";
import "./presentation.css";
import { VirtualTableBody } from "@/components/ui/VirtualTableBody";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  AlertTriangle,
  OctagonAlert,
  FileText,
  User,
  PlusCircle,
  Search,
  X,
  Edit2,
  Trash2,
  Phone,
  Mail,
  ShieldCheck,
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
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : "") || "Failed to load suppliers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => loadSuppliersList());
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
      } catch (err: unknown) {
        setActionError((err instanceof Error ? err.message : "") || "Failed to save supplier profile.");
      }
    });
  };

  const handleDeleteSupplier = (supId: number) => {
    if (!confirm("Are you sure you want to deactivate this distributor?")) return;
    startTransition(async () => {
      try {
        await deleteSupplier(supId);
        loadSuppliersList();
      } catch (err: unknown) {
        alert((err instanceof Error ? err.message : "") || "Failed to deactivate supplier.");
      }
    });
  };

  // Metrics
  const activeCount = suppliers.filter((s) => s.is_active !== false).length;
  const dlCount = suppliers.filter((s) => !!s.drug_license_number).length;
  const gstinCount = suppliers.filter((s) => !!s.gstin).length;

  return (
    <div className="suppliers-1">
      {/* Header — Aligned 64px height */}
      <header className="page-header">
        <div>
          <h1 className="page-title">Suppliers & Distributors</h1>
          <p className="page-subtitle">
            Wholesale Vendor Directory • Drug License & GSTIN Compliance • Store #1
          </p>
        </div>

        <div className="suppliers-2">
          <ThemeToggle />
          <button onClick={handleOpenCreate} className="btn btn-primary">
            <PlusCircle size={16} />
            <span>Register Distributor</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div  className="page-body suppliers-3">
        {/* Compliance Notice */}
        <div
          className="suppliers-4"
        >
          <span className="suppliers-5">
            <Building2 size={18} />
          </span>
          <div>
            <strong className="suppliers-6">
              Regulatory Vendor Governance:
            </strong>{" "}
            <span className="suppliers-7">
              All pharmaceutical suppliers must have validated Drug License credentials (Form 20B/21B) and active GSTIN
              registration to remain compliant under Indian State Pharmacy regulations.
            </span>
          </div>
        </div>

        {/* Metrics Overview Row */}
        <div
          className="suppliers-8"
        >
          <div  className="card suppliers-9">
            <div className="suppliers-10">
              <span className="suppliers-11">
                Total Distributors
              </span>
              <span className="status-badge info">
                <span className="badge-icon"><Building2 size={12} /></span>
                <span>Registry</span>
              </span>
            </div>
            <div className="suppliers-12">
              {suppliers.length}
            </div>
            <div className="suppliers-13">
              Registered wholesale partners
            </div>
          </div>

          <div  className="card suppliers-14">
            <div className="suppliers-15">
              <span className="suppliers-16">
                Active Vendors
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><CheckCircle2 size={12} /></span>
                <span>Procuring</span>
              </span>
            </div>
            <div className="suppliers-17">
              {activeCount}
            </div>
            <div className="suppliers-18">
              Eligible for purchase orders
            </div>
          </div>

          <div  className="card suppliers-19">
            <div className="suppliers-20">
              <span className="suppliers-21">
                Drug License Verified
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><CheckCircle2 size={12} /></span>
                <span>Compliant</span>
              </span>
            </div>
            <div className="suppliers-22">
              {dlCount}
            </div>
            <div className="suppliers-23">
              Hold active Form 20B/21B licenses
            </div>
          </div>

          <div  className="card suppliers-24">
            <div className="suppliers-25">
              <span className="suppliers-26">
                GSTIN Verified
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><CheckCircle2 size={12} /></span>
                <span>Tax Registered</span>
              </span>
            </div>
            <div className="suppliers-27">
              {gstinCount}
            </div>
            <div className="suppliers-28">
              Valid wholesale GST credentials
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div
          className="suppliers-29"
        >
          <div className="suppliers-30">
            <div className="suppliers-31">
              <Search
                size={16}
                className="suppliers-32"
              />
              <input
                type="text"
                placeholder="Search by distributor name, contact, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                
                className="form-input suppliers-33"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="suppliers-34" aria-label="Close dialog"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              
              className="form-select suppliers-35"
            >
              <option value="active">Active Vendors</option>
              <option value="all">All Vendors</option>
            </select>
          </div>

          <div className="suppliers-36">
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
                <th className="suppliers-37">Actions</th>
              </tr>
            </thead>
            <VirtualTableBody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="suppliers-38">
                    <div className="suppliers-39">
                      Loading suppliers directory...
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="suppliers-40">
                    <div className="suppliers-41">
                      {error}
                    </div>
                    <button onClick={loadSuppliersList} className="btn btn-secondary">
                      Retry
                    </button>
                  </td>
                </tr>
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="suppliers-42">
                    <div className="suppliers-43">
                      <span className="suppliers-44">
                        <Building2 size={32} />
                      </span>
                      <div className="suppliers-45">
                        No suppliers found
                      </div>
                      <div className="suppliers-46">
                        Register pharmaceutical distributors to manage purchase orders and inward shipments.
                      </div>
                      <button onClick={handleOpenCreate}  className="btn btn-primary suppliers-47">
                        <PlusCircle size={16} />
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
                      <div className="suppliers-48">
                        <span className="suppliers-49">
                          {sup.name}
                        </span>
                        {sup.address && (
                          <span className="suppliers-50">
                            {sup.address}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Contact Representative */}
                    <td>
                      <div className="suppliers-51">
                        <span className="suppliers-52">
                          <User size={13} />
                        </span>
                        <span className="suppliers-53">
                          {sup.contact_person || "—"}
                        </span>
                      </div>
                    </td>

                    {/* Phone & Email */}
                    <td>
                      <div className="suppliers-54">
                        <span className="suppliers-55">
                          {sup.phone || "—"}
                        </span>
                        <span className="suppliers-56">
                          {sup.email || ""}
                        </span>
                      </div>
                    </td>

                    {/* GSTIN & Drug License */}
                    <td>
                      <div className="suppliers-57">
                        <span className="suppliers-58">
                          GST: {sup.gstin || "N/A"}
                        </span>
                        <span className="suppliers-59">
                          DL: {sup.drug_license_number || "N/A"}
                        </span>
                      </div>
                    </td>

                    {/* Status */}
                    <td>
                      {sup.is_active !== false ? (
                        <span className="status-badge high">
                          <span className="badge-icon"><CheckCircle2 size={10} /></span>
                          <span>Active Partner</span>
                        </span>
                      ) : (
                        <span className="status-badge low">
                          <span className="badge-icon"><OctagonAlert size={10} /></span>
                          <span>Inactive</span>
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="suppliers-60">
                      <div className="suppliers-61">
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
                          title="Deactivate Supplier" aria-label="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </VirtualTableBody>
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
          <div  onClick={(e) => e.stopPropagation()} className="modal-content suppliers-62">
            <div className="modal-header">
              <div className="suppliers-63">
                <span className="suppliers-64">
                  <Building2 size={18} />
                </span>
                <div>
                  <h2 className="suppliers-65">
                    {editingSupplier ? "Edit Distributor Profile" : "Register Pharmaceutical Distributor"}
                  </h2>
                  <p className="suppliers-66">
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
                disabled={isSubmitting} aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitSave} className="suppliers-67">
              <div className="modal-body">
                {actionError && (
                  <div
                    className="suppliers-68"
                  >
                    {actionError}
                  </div>
                )}
                {actionSuccess && (
                  <div
                    className="suppliers-69"
                  >
                    {actionSuccess}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label" htmlFor="suppliers-field-1">Distributor / Agency Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. MedPlus Supply Network"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="form-input" id="suppliers-field-1"
                  />
                </div>

                <div className="suppliers-70">
                  <div className="form-group">
                    <label className="form-label" htmlFor="suppliers-field-2">Contact Person</label>
                    <input
                      type="text"
                      placeholder="e.g. Vikram Mehta"
                      value={formContactPerson}
                      onChange={(e) => setFormContactPerson(e.target.value)}
                      className="form-input" id="suppliers-field-2"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="suppliers-field-3">Phone Number</label>
                    <input
                      type="tel"
                      placeholder="e.g. 9876543210"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      className="form-input" id="suppliers-field-3"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="suppliers-field-4">Email Address</label>
                  <input
                    type="email"
                    placeholder="e.g. orders@medplus.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="form-input" id="suppliers-field-4"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="suppliers-field-5">Warehouse Physical Address</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Plot 42, Pharma Industrial Estate, Mumbai"
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    className="form-textarea" id="suppliers-field-5"
                  />
                </div>

                <div className="suppliers-71">
                  <div className="form-group">
                    <label className="form-label" htmlFor="suppliers-field-6">GSTIN (15 Digits)</label>
                    <input
                      type="text"
                      placeholder="e.g. 27AABCM8492Q1Z3"
                      value={formGstin}
                      onChange={(e) => setFormGstin(e.target.value.toUpperCase())}
                      className="form-input" id="suppliers-field-6"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="suppliers-field-7">Drug License Number (Form 20B/21B)</label>
                    <input
                      type="text"
                      placeholder="e.g. MH-MZ2-19284"
                      value={formDrugLicense}
                      onChange={(e) => setFormDrugLicense(e.target.value)}
                      className="form-input" id="suppliers-field-7"
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
