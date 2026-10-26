"use client";
import "./presentation.css";
import { VirtualTableBody } from "@/components/ui/VirtualTableBody";

import React, { useState, useEffect, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  Bookmark,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ShoppingBag,
  User,
  Clock,
  PlusCircle,
  Search,
  X,
  Upload,
  Eye,
  Check,
  ArrowRight,
  Stethoscope,
  Sparkles,
} from "lucide-react";

import ThemeToggle from "@/components/ThemeToggle";
import {
  getPrescriptions,
  getPrescriptionDetail,
  savePrescription,
  verifyPrescription,
  scanDoctorPrescription,
  getMedicines,
  StoredPrescriptionRecord,
  SavePrescriptionPayload,
  Medicine,
} from "@/lib/api";

export default function PrescriptionsPage() {
  const router = useRouter();
  const [prescriptions, setPrescriptions] = useState<StoredPrescriptionRecord[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Modals
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [selectedRx, setSelectedRx] = useState<StoredPrescriptionRecord | null>(null);
  const [showVerifyModal, setShowVerifyModal] = useState<boolean>(false);

  // New Prescription Form State
  const [patientName, setPatientName] = useState<string>("");
  const [patientAge, setPatientAge] = useState<string>("");
  const [patientGender, setPatientGender] = useState<string>("Male");
  const [doctorName, setDoctorName] = useState<string>("");
  const [doctorRegNo, setDoctorRegNo] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [rawText, setRawText] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isScanningAI, setIsScanningAI] = useState<boolean>(false);
  const [scanWarnings, setScanWarnings] = useState<string[]>([]);
  const [recognitionMode, setRecognitionMode] = useState<"handwriting" | "printed">("handwriting");
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedFile) { queueMicrotask(() => setPreview(null)); return; }
    const url = URL.createObjectURL(selectedFile);
    queueMicrotask(() => setPreview(url));
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);
  const [scannedItems, setScannedItems] = useState<
    Array<{ extracted_name: string; original_text?: string; medicine_id?: number | null; dosage_instructions?: string; quantity_prescribed?: number; is_available?: boolean }>
  >([]);

  // Verification Form State
  const [verifyNotes, setVerifyNotes] = useState<string>("");

  const [isSubmitting, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchPrescriptionsList = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPrescriptions(
        page,
        20,
        statusFilter || undefined,
        searchQuery.trim() || undefined
      );
      setPrescriptions(res.items || []);
      setTotalCount(res.total || 0);
      setTotalPages(res.pages || 1);
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : "") || "Failed to load prescriptions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => fetchPrescriptionsList());
  }, [page, searchQuery, statusFilter]);

  // AI OCR Prescription Scan
  const handleRunAIScan = async (mode: "image" | "text" = selectedFile ? "image" : "text") => {
    if ((mode === "text" && !rawText.trim()) || (mode === "image" && !selectedFile)) {
      setActionError("Please paste prescription text or select an image file to scan.");
      return;
    }

    setIsScanningAI(true);
    setActionError(null);
    setActionSuccess(null);
    setScannedItems([]);
    setScanWarnings([]);
    try {
      const scanRes = await scanDoctorPrescription(
        rawText.trim() || undefined,
        mode === "image" ? selectedFile || undefined : undefined,
        recognitionMode
      );
      setScanWarnings(scanRes.warnings || []);
      if (scanRes.raw_ocr_text) setRawText(scanRes.raw_ocr_text);

      if (scanRes.items && scanRes.items.length > 0) {
        const mapped = scanRes.items.map((item) => ({
          extracted_name: [item.detected_brand_or_generic || item.raw_text, item.strength && !(item.detected_brand_or_generic || item.raw_text).replace(/\s/g,"").toLowerCase().includes(item.strength.replace(/\s/g,"").toLowerCase()) ? item.strength : ""].filter(Boolean).join(" "),
          original_text: item.raw_text,
          medicine_id: item.matched_medicine_id,
          dosage_instructions: [item.dosage_instructions, item.duration].filter(Boolean).join(" · ") || undefined,
          quantity_prescribed: item.quantity_to_dispense ?? undefined,
          is_available: item.is_available,
        }));
        setScannedItems(mapped);
        setActionSuccess(`${scanRes.items.length} draft medicine rows. Review and correct each row against the original.`);
      } else {
        setActionError("No medicine names could be read reliably. The extracted text is shown below. Use the original image to enter medicine rows manually; no medicines were guessed.");
      }
    } catch (err: unknown) {
      setActionError((err instanceof Error ? err.message : "") || "AI scanning failed.");
    } finally {
      setIsScanningAI(false);
    }
  };

  // Save new prescription
  const handleSavePrescription = (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientName.trim()) {
      setActionError("Patient Name is required.");
      return;
    }

    setActionError(null);
    if (!scannedItems.length || scannedItems.some(item => !item.extracted_name.trim() || !item.quantity_prescribed || item.quantity_prescribed < 1 || !Number.isInteger(item.quantity_prescribed))) {
      setActionError("Enter each medicine name and confirm a positive quantity before archiving.");
      return;
    }
    startTransition(async () => {
      try {
        const itemsToSave = scannedItems;

        const payload: SavePrescriptionPayload = {
          patient_name: patientName.trim(),
          patient_age: patientAge ? parseInt(patientAge) : undefined,
          patient_gender: patientGender,
          doctor_name: doctorName.trim() || undefined,
          doctor_reg_number: doctorRegNo.trim() || undefined,
          customer_phone: customerPhone.trim() || undefined,
          raw_text: rawText.trim() || undefined,
          items: itemsToSave,
        };

        await savePrescription(payload);
        setActionSuccess("Prescription archived and pending clinical sign-off!");
        setTimeout(() => {
          setShowUploadModal(false);
          resetUploadForm();
          fetchPrescriptionsList();
        }, 800);
      } catch (err: unknown) {
        setActionError((err instanceof Error ? err.message : "") || "Failed to save prescription.");
      }
    });
  };

  const resetUploadForm = () => {
    setPatientName("");
    setPatientAge("");
    setPatientGender("Male");
    setDoctorName("");
    setDoctorRegNo("");
    setCustomerPhone("");
    setRawText("");
    setSelectedFile(null);
    setScannedItems([]);
    setScanWarnings([]);
    setActionError(null);
    setActionSuccess(null);
  };

  // Handle Pharmacist Clinical Sign-off
  const handleVerifyPrescription = () => {
    if (!selectedRx) return;
    setActionError(null);
    startTransition(async () => {
      try {
        const updated = await verifyPrescription(selectedRx.id, {
          notes: verifyNotes.trim() || undefined,
        });
        setSelectedRx(updated);
        setActionSuccess(`Prescription #${updated.prescription_number} signed off by Licensed Pharmacist!`);
        setTimeout(() => {
          setShowVerifyModal(false);
          fetchPrescriptionsList();
        }, 800);
      } catch (err: unknown) {
        setActionError((err instanceof Error ? err.message : "") || "Failed to sign off prescription.");
      }
    });
  };

  // Open detail view
  const handleViewDetail = async (rx: StoredPrescriptionRecord) => {
    setSelectedRx(rx);
    try {
      const full = await getPrescriptionDetail(rx.id);
      setSelectedRx(full);
    } catch {
      // fallback to initial rx
    }
  };

  // Metrics
  const pendingCount = prescriptions.filter(
    (p) => p.status === "pending_verification"
  ).length;
  const verifiedCount = prescriptions.filter((p) => p.status === "verified").length;
  const dispensedCount = prescriptions.filter((p) => p.status === "dispensed").length;

  return (
    <div className="prescriptions-1">
      {/* Header — Aligned 64px height */}
      <header className="page-header">
        <div>
          <h1 className="page-title">Prescriptions & Verification</h1>
          <p className="page-subtitle">
            Doctor Rx Digitization • Human-in-the-Loop Clinical Verification • Store #1
          </p>
        </div>

        <div className="prescriptions-2">
          <ThemeToggle />
          <button
            onClick={() => {
              resetUploadForm();
              setShowUploadModal(true);
            }}
            className="btn btn-primary"
          >
            <PlusCircle size={16} />
            <span>Upload / Scan Rx</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div  className="page-body prescriptions-3">
        {/* Human-in-the-Loop Notice */}
        <div
          className="prescriptions-4"
        >
          <span className="prescriptions-5">
            <ClipboardList size={18} />
          </span>
          <div>
            <strong className="prescriptions-6">
              Human-in-the-Loop Mandate (PRD Rule 9 & 21):
            </strong>{" "}
            <span className="prescriptions-7">
              AI drafts prescription readings; all dispensing of Schedule H / H1 formulations legally requires licensed
              pharmacist verification and signature before physical release.
            </span>
          </div>
        </div>

        {/* Metrics Overview Row */}
        <div
          className="prescriptions-8"
        >
          <div  className="card prescriptions-9">
            <div className="prescriptions-10">
              <span className="prescriptions-11">
                Total Prescriptions
              </span>
              <span className="status-badge info">
                <span className="badge-icon"><ClipboardList size={12} /></span>
                <span>Archive</span>
              </span>
            </div>
            <div className="prescriptions-12">
              {totalCount}
            </div>
            <div className="prescriptions-13">
              Archived clinical doctor orders
            </div>
          </div>

          <div  className="card prescriptions-14">
            <div className="prescriptions-15">
              <span className="prescriptions-16">
                Pending Review
              </span>
              <span className="status-badge med">
                <span className="badge-icon"><AlertTriangle size={12} /></span>
                <span>Action Needed</span>
              </span>
            </div>
            <div className="prescriptions-17">
              {pendingCount}
            </div>
            <div className="prescriptions-18">
              Requires pharmacist clinical sign-off
            </div>
          </div>

          <div  className="card prescriptions-19">
            <div className="prescriptions-20">
              <span className="prescriptions-21">
                Verified & Ready
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><CheckCircle2 size={12} /></span>
                <span>Verified</span>
              </span>
            </div>
            <div className="prescriptions-22">
              {verifiedCount}
            </div>
            <div className="prescriptions-23">
              Ready for POS billing & dispensing
            </div>
          </div>

          <div  className="card prescriptions-24">
            <div className="prescriptions-25">
              <span className="prescriptions-26">
                Dispensed
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><CheckCircle2 size={12} /></span>
                <span>Completed</span>
              </span>
            </div>
            <div className="prescriptions-27">
              {dispensedCount}
            </div>
            <div className="prescriptions-28">
              Linked to completed POS sales
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div
          className="prescriptions-29"
        >
          <div className="prescriptions-30">
            <div className="prescriptions-31">
              <Search
                size={16}
                className="prescriptions-32"
              />
              <input
                type="text"
                placeholder="Search by patient name, doctor, or Rx #..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                
                className="form-input prescriptions-33"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="prescriptions-34" aria-label="Close dialog"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              
              className="form-select prescriptions-35"
            >
              <option value="">All Statuses</option>
              <option value="pending_verification">Pending Verification</option>
              <option value="verified">Verified</option>
              <option value="dispensed">Dispensed</option>
            </select>
          </div>

          <div className="prescriptions-36">
            Showing <strong>{prescriptions.length}</strong> of <strong>{totalCount}</strong> records
          </div>
        </div>

        {/* Prescriptions Table */}
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Rx Identifier</th>
                <th>Patient Details</th>
                <th>Doctor & Registration</th>
                <th>Prescribed Items</th>
                <th>Clinical Status</th>
                <th className="prescriptions-37">Actions</th>
              </tr>
            </thead>
            <VirtualTableBody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="prescriptions-38">
                    <div className="prescriptions-39">
                      Loading clinical prescriptions archive...
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="prescriptions-40">
                    <div className="prescriptions-41">
                      {error}
                    </div>
                    <button onClick={fetchPrescriptionsList} className="btn btn-secondary">
                      Retry
                    </button>
                  </td>
                </tr>
              ) : prescriptions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="prescriptions-42">
                    <div className="prescriptions-43">
                      <span className="prescriptions-44">
                        <ClipboardList size={32} />
                      </span>
                      <div className="prescriptions-45">
                        No prescriptions found
                      </div>
                      <div className="prescriptions-46">
                        {searchQuery
                          ? `No prescriptions match "${searchQuery}".`
                          : "Upload a doctor prescription photo or paste digital text to start verification."}
                      </div>
                      <button
                        onClick={() => {
                          resetUploadForm();
                          setShowUploadModal(true);
                        }}
                        
                        className="btn btn-primary prescriptions-47"
                      >
                        <PlusCircle size={16} />
                        <span>Upload First Prescription</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                prescriptions.map((rx) => {
                  const isPending = rx.status === "pending_verification";
                  const isVerified = rx.status === "verified";
                  const isDispensed = rx.status === "dispensed";

                  return (
                    <tr key={rx.id}>
                      {/* Rx Identifier & Date */}
                      <td>
                        <div className="prescriptions-48">
                          <span className="prescriptions-49">
                            {rx.prescription_number}
                          </span>
                          <span className="prescriptions-50">
                            {rx.created_at ? new Date(rx.created_at).toLocaleDateString("en-IN") : "—"}
                          </span>
                        </div>
                      </td>

                      {/* Patient Details */}
                      <td>
                        <div className="prescriptions-51">
                          <span className="prescriptions-52">
                            {rx.patient_name}
                          </span>
                          <span className="prescriptions-53">
                            {rx.patient_age ? `${rx.patient_age}y` : ""} {rx.patient_gender ? `• ${rx.patient_gender}` : ""}
                          </span>
                        </div>
                      </td>

                      {/* Doctor & Reg # */}
                      <td>
                        <div className="prescriptions-54">
                          <span className="prescriptions-55">
                            {rx.doctor_name ? `Dr. ${rx.doctor_name}` : "—"}
                          </span>
                          <span className="prescriptions-56">
                            {rx.doctor_reg_number ? `Reg: ${rx.doctor_reg_number}` : "Reg: N/A"}
                          </span>
                        </div>
                      </td>

                      {/* Prescribed Items Count */}
                      <td>
                        <span className="prescriptions-57">
                          {(rx.items || []).length} items prescribed
                        </span>
                      </td>

                      {/* Status */}
                      <td>
                        {isPending && (
                          <span className="status-badge med">
                            <span className="badge-icon"><AlertTriangle size={11} /></span>
                            <span>Pending Review</span>
                          </span>
                        )}
                        {isVerified && (
                          <span className="status-badge high">
                            <span className="badge-icon"><CheckCircle2 size={11} /></span>
                            <span>Verified Safe</span>
                          </span>
                        )}
                        {isDispensed && (
                          <span className="status-badge high">
                            <span className="badge-icon"><CheckCircle2 size={11} /></span>
                            <span>Dispensed #{rx.sale_invoice_number || rx.sale_id}</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="prescriptions-58">
                        <div className="prescriptions-59">
                          <button
                            onClick={() => handleViewDetail(rx)}
                            
                            className="btn btn-secondary prescriptions-60"
                            title="View Full Prescription Details"
                          >
                            <Eye size={13} />
                            <span>View</span>
                          </button>

                          {isPending && (
                            <button
                              onClick={() => {
                                setSelectedRx(rx);
                                setVerifyNotes("");
                                setShowVerifyModal(true);
                              }}
                              
                              className="btn btn-primary prescriptions-61"
                            >
                              <Check size={13} />
                              <span>Verify</span>
                            </button>
                          )}

                          {isVerified && (
                            <Link
                              href="/pos"
                              
                              className="btn btn-primary prescriptions-62"
                            >
                              <ShoppingBag size={13} />
                              <span>Dispense</span>
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </VirtualTableBody>
          </table>
        </div>
      </div>

      {/* =====================================================================
          Modal: Upload & AI Scan Doctor Prescription
          ===================================================================== */}
      {showUploadModal && (
        <div className="modal-backdrop" onClick={() => !isSubmitting && !isScanningAI && setShowUploadModal(false)}>
          <div  onClick={(e) => e.stopPropagation()} className="modal-content prescriptions-63">
            <div className="modal-header">
              <div className="prescriptions-64">
                <span className="prescriptions-65">
                  <ClipboardList size={18} />
                </span>
                <div>
                  <h2 className="prescriptions-66">
                    Capture & Digitize Prescription
                  </h2>
                  <p className="prescriptions-67">
                    Handwriting or printed OCR draft with pharmacist verification
                  </p>
                </div>
              </div>
              <button onClick={() => setShowUploadModal(false)} className="btn-icon" disabled={isSubmitting || isScanningAI} aria-label="Close dialog">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSavePrescription} className="prescriptions-68">
              <div className="modal-body">
                {actionError && (
                  <div
                    className="prescriptions-69"
                  >
                    {actionError}
                  </div>
                )}
                {actionSuccess && (
                  <div
                    className="prescriptions-70"
                  >
                    {actionSuccess}
                  </div>
                )}

                {/* Patient Information */}
                {scanWarnings.length > 0 && <div role="status" className="prescriptions-69">{scanWarnings.map((warning,index) => <p key={index}>{warning}</p>)}</div>}
                {preview && <Image src={preview} alt="Original prescription for comparison with the draft" width={600} height={800} unoptimized style={{width:"100%",height:"auto",maxHeight:420,objectFit:"contain"}} />}
                <div className="prescriptions-71">
                  <div className="form-group">
                    <label className="form-label" htmlFor="prescriptions-field-1">Patient Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ramesh Sharma"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      className="form-input" id="prescriptions-field-1"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="prescriptions-field-2">Age</label>
                    <input
                      type="number"
                      placeholder="45"
                      value={patientAge}
                      onChange={(e) => setPatientAge(e.target.value)}
                      className="form-input" id="prescriptions-field-2"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="prescriptions-field-3">Gender</label>
                    <select
                      value={patientGender}
                      onChange={(e) => setPatientGender(e.target.value)}
                      className="form-select" id="prescriptions-field-3"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                {/* Doctor Details */}
                <div className="prescriptions-72">
                  <div className="form-group">
                    <label className="form-label" htmlFor="prescriptions-field-4">Doctor Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Dr. V. K. Gupta"
                      value={doctorName}
                      onChange={(e) => setDoctorName(e.target.value)}
                      className="form-input" id="prescriptions-field-4"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="prescriptions-field-5">Doctor Medical Reg # (MCI/SMC)</label>
                    <input
                      type="text"
                      placeholder="e.g. MCI-29481"
                      value={doctorRegNo}
                      onChange={(e) => setDoctorRegNo(e.target.value)}
                      className="form-input" id="prescriptions-field-5"
                    />
                  </div>
                </div>

                {/* Input Mode: OCR / Text entry */}
                <div className="form-group">
                  <label className="form-label" htmlFor="prescriptions-field-6">Doctor Prescription Content (Paste Text or Upload Photo)</label>
                  <textarea
                    disabled={isScanningAI || isSubmitting}
                    rows={3}
                    placeholder="e.g. Rx: Tab Augmentin 625 Duo 1 tab BD x 5 days, Tab Paracetamol 650 TDS..."
                    value={rawText}
                    onChange={(e) => { setRawText(e.target.value); setScannedItems([]); setActionSuccess(null); }}
                    className="form-textarea" id="prescriptions-field-6"
                  />
                </div>

                {/* Image upload selector & AI run button */}
                <label className="form-label" htmlFor="prescription-recognition-mode">Image recognition<select id="prescription-recognition-mode" className="form-select" value={recognitionMode} disabled={isScanningAI} onChange={event => setRecognitionMode(event.target.value as "handwriting" | "printed")}><option value="handwriting">Handwriting AI · Google Gemini</option><option value="printed">Printed text · local OCR only</option></select></label>
                <div className="prescriptions-73">
                  <input
                    type="file"
                    disabled={isScanningAI || isSubmitting}
                    accept="image/*"
                    aria-label="Prescription image"
                    onChange={(e) => { setSelectedFile(e.target.files?.[0] || null); setScannedItems([]); setScanWarnings([]); setActionSuccess(null); }}
                    className="prescriptions-74"
                  />
                  <button
                    type="button"
                    onClick={() => void handleRunAIScan()}
                    disabled={isScanningAI}
                    
                    className="btn btn-secondary prescriptions-75"
                  >
                    <Sparkles size={14} />
                    <span>{isScanningAI ? "Reading prescription..." : selectedFile ? recognitionMode === "handwriting" ? "Read handwriting with AI" : "Read image locally" : "Parse entered text"}</span>
                  </button>
                  {selectedFile && rawText.trim() && <button type="button" className="btn btn-secondary" disabled={isScanningAI} onClick={() => void handleRunAIScan("text")}>Parse corrected text</button>}
                </div>
                <p className="form-label">{recognitionMode === "handwriting" ? "Handwriting mode sends the prescription image to Google Gemini when you select Read handwriting with AI. Choose printed mode to keep processing on this app’s server." : "Printed OCR runs on this app’s server. It does not send this image to an external AI provider."}</p>
                <button type="button" className="btn btn-secondary" disabled={isScanningAI || isSubmitting} onClick={() => setScannedItems(items => [...items, {extracted_name:"", quantity_prescribed:undefined, medicine_id:null, is_available:false}])}><PlusCircle size={14} />Add medicine manually</button>

                {/* Extracted Line Items List */}
                {scannedItems.length > 0 && (
                  <div className="prescriptions-76">
                    <p className="form-label">Draft medicine rows ({scannedItems.length}) — confirm names and quantities</p>
                    <div
                      className="prescriptions-77"
                    >
                      {scannedItems.map((it, idx) => (
                        <div
                          key={idx}
                          className="prescriptions-78"
                        >
                          <div style={{display:"grid",gap:8,flex:1}}>
                            {it.original_text && <p className="form-label">Read from original: {it.original_text}</p>}
                            <label>Medicine name<input required className="form-input" aria-label={`Medicine name ${idx+1}`} value={it.extracted_name} onChange={e => setScannedItems(items => items.map((row,i) => i===idx ? {...row,extracted_name:e.target.value,medicine_id:null,is_available:false}:row))} /></label>
                            <label>Directions as written<input className="form-input" aria-label={`Directions ${idx+1}`} value={it.dosage_instructions || ""} onChange={e => setScannedItems(items => items.map((row,i) => i===idx ? {...row,dosage_instructions:e.target.value}:row))} /></label>
                            <label>Confirmed quantity<input required type="number" min={1} step={1} className="form-input" aria-label={`Confirmed quantity ${idx+1}`} placeholder="Confirm from original" value={it.quantity_prescribed ?? ""} onChange={e => setScannedItems(items => items.map((row,i) => i===idx ? {...row,quantity_prescribed:e.target.value ? Number(e.target.value):undefined}:row))} /></label>
                          </div>
                          <button type="button" className="btn btn-secondary" aria-label={`Remove medicine ${idx+1}`} onClick={() => setScannedItems(items => items.filter((_,i) => i!==idx))}>Remove</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowUploadModal(false)} className="btn btn-secondary" disabled={isSubmitting || isScanningAI}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting || isScanningAI || !scannedItems.length}>
                  {isSubmitting ? "Archiving..." : "Archive for Clinical Sign-off"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          Modal: Pharmacist Clinical Verification Sign-Off
          ===================================================================== */}
      {showVerifyModal && selectedRx && (
        <div className="modal-backdrop" onClick={() => !isSubmitting && setShowVerifyModal(false)}>
          <div  onClick={(e) => e.stopPropagation()} className="modal-content prescriptions-81">
            <div className="modal-header">
              <div className="prescriptions-82">
                <span className="prescriptions-83">
                  <CheckCircle2 size={18} />
                </span>
                <div>
                  <h2 className="prescriptions-84">
                    Pharmacist Clinical Verification
                  </h2>
                  <p className="prescriptions-85">
                    Prescription #{selectedRx.prescription_number} • Schedule H Compliance
                  </p>
                </div>
              </div>
              <button onClick={() => setShowVerifyModal(false)} className="btn-icon" disabled={isSubmitting} aria-label="Close dialog">
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              {actionError && (
                <div
                  className="prescriptions-86"
                >
                  {actionError}
                </div>
              )}
              {actionSuccess && (
                <div
                  className="prescriptions-87"
                >
                  {actionSuccess}
                </div>
              )}

              <div
                className="prescriptions-88"
              >
                <div>
                  <span className="prescriptions-89">Patient: </span>
                  <strong className="prescriptions-90">{selectedRx.patient_name}</strong>
                  {selectedRx.patient_age && ` (${selectedRx.patient_age}y ${selectedRx.patient_gender || ""})`}
                </div>
                <div>
                  <span className="prescriptions-91">Prescribing Doctor: </span>
                  <strong className="prescriptions-92">{selectedRx.doctor_name || "Doctor Unspecified"}</strong>
                  {selectedRx.doctor_reg_number && ` (Reg: ${selectedRx.doctor_reg_number})`}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="prescriptions-field-7">Pharmacist Clinical Notes & Verification Observations</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Dosage verified with patient, no contraindications with current medications."
                  value={verifyNotes}
                  onChange={(e) => setVerifyNotes(e.target.value)}
                  className="form-textarea" id="prescriptions-field-7"
                />
              </div>

              <div
                className="prescriptions-93"
              >
                By signing off, I certify as a Registered Pharmacist under the Pharmacy Act 1948 that this prescription
                has been clinically evaluated and is safe for dispensing.
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" onClick={() => setShowVerifyModal(false)} className="btn btn-secondary" disabled={isSubmitting}>
                Cancel
              </button>
              <button type="button" onClick={handleVerifyPrescription} className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting ? "Signing Audit..." : "Sign-Off & Authorize Dispensing"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          Modal: Prescription Detail Quick View
          ===================================================================== */}
      {selectedRx && !showVerifyModal && (
        <div className="modal-backdrop" onClick={() => setSelectedRx(null)}>
          <div  onClick={(e) => e.stopPropagation()} className="modal-content prescriptions-94">
            <div className="modal-header">
              <div className="prescriptions-95">
                <span className="prescriptions-96">
                  <ClipboardList size={18} />
                </span>
                <div>
                  <h2 className="prescriptions-97">
                    Prescription #{selectedRx.prescription_number}
                  </h2>
                  <p className="prescriptions-98">
                    Archived on {selectedRx.created_at ? new Date(selectedRx.created_at).toLocaleString("en-IN") : "—"}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedRx(null)} className="btn-icon" aria-label="Close dialog">
                <X size={16} />
              </button>
            </div>

            <div  className="modal-body prescriptions-99">
              <div
                className="prescriptions-100"
              >
                <div>
                  <div className="prescriptions-101">Patient</div>
                  <div className="prescriptions-102">
                    {selectedRx.patient_name} ({selectedRx.patient_age ? `${selectedRx.patient_age}y` : "—"})
                  </div>
                </div>
                <div>
                  <div className="prescriptions-103">Doctor</div>
                  <div className="prescriptions-104">
                    {selectedRx.doctor_name || "—"} ({selectedRx.doctor_reg_number || "N/A"})
                  </div>
                </div>
                <div>
                  <div className="prescriptions-105">Status</div>
                  <div className="prescriptions-106">
                    <span className={`status-badge ${selectedRx.status === "verified" || selectedRx.status === "dispensed" ? "high" : "med"}`}>
                      <span className="badge-icon"><CheckCircle2 size={10} /></span>
                      <span>{selectedRx.status.toUpperCase()}</span>
                    </span>
                  </div>
                </div>
                <div>
                  <div className="prescriptions-107">Verified By</div>
                  <div className="prescriptions-108">
                    {selectedRx.verified_by_name || "Pending Pharmacist"}
                  </div>
                </div>
              </div>

              {/* Items */}
              <div>
                <label  className="form-label prescriptions-109">
                  Prescribed Line Items
                </label>
                <div className="prescriptions-110">
                  {(selectedRx.items || []).map((it, idx) => (
                    <div
                      key={idx}
                      className="prescriptions-111"
                    >
                      <div>
                        <strong className="prescriptions-112">{it.extracted_name}</strong>
                        {it.dosage_instructions && (
                          <span className="prescriptions-113">
                            ({it.dosage_instructions})
                          </span>
                        )}
                      </div>
                      <span className="prescriptions-114">
                        Qty: {it.quantity_prescribed}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              {selectedRx.status === "verified" && (
                <Link href="/pos"  className="btn btn-primary prescriptions-115">
                  <ShoppingBag size={14} />
                  <span>Dispense in POS</span>
                </Link>
              )}
              <button onClick={() => setSelectedRx(null)}  className="btn btn-secondary prescriptions-116">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
