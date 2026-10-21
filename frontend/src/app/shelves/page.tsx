"use client";
import "./presentation.css";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  RefreshCw,
  Edit2,
  Trash2,
  Navigation,
  ClipboardCheck,
  ThermometerSnowflake,
  Layers,
  X,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  MapPin,
  Flame,
  Package,
  CheckCircle2,
  AlertTriangle,
  Bookmark,
  FileText,
  Building2,
} from "lucide-react";

import ThemeToggle from "@/components/ThemeToggle";
import {
  getStorePlanogram,
  getStorageLocations,
  createStorageLocation,
  updateStorageLocation,
  deleteStorageLocation,
  locateMedicineDispense,
  getStorageCompliance,
  conductShelfCycleCount,
  getMedicines,
  StorePlanogramSummary,
  PlanogramShelf,
  PhysicalLocation,
  DispensePickLocation,
  StorageComplianceData,
  ShelfAuditReport,
  Medicine,
} from "@/lib/api";

type ActiveTab = "planogram" | "locator" | "cycle_count" | "compliance";

export default function ShelvesPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("planogram");
  const [planogram, setPlanogram] = useState<StorePlanogramSummary | null>(null);
  const [locations, setLocations] = useState<PhysicalLocation[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [compliance, setCompliance] = useState<StorageComplianceData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Filters for planogram
  const [searchQuery, setSearchQuery] = useState("");
  const [zoneFilter, setZoneFilter] = useState<string>("ALL");

  // Fast Dispense Locator State
  const [locatorSearch, setLocatorSearch] = useState("");
  const [selectedMedicineId, setSelectedMedicineId] = useState<number | null>(null);
  const [pickResult, setPickResult] = useState<{
    brand_name: string;
    pick_locations: DispensePickLocation[];
    total_available_locations: number;
  } | null>(null);
  const [locatorLoading, setLocatorLoading] = useState(false);

  // New/Edit Location Modal State
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState<PhysicalLocation | null>(null);
  const [locFormName, setLocFormName] = useState("");
  const [locFormType, setLocFormType] = useState<string>("shelf");
  const [locFormDesc, setLocFormDesc] = useState("");
  const [modalSaving, setModalSaving] = useState(false);

  // Cycle Count Audit Modal & Runner State
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditLocationId, setAuditLocationId] = useState<number | null>(null);
  const [auditCounts, setAuditCounts] = useState<{ [key: string]: number }>({});
  const [auditNotes, setAuditNotes] = useState("");
  const [auditPreview, setAuditPreview] = useState<ShelfAuditReport | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditCommitting, setAuditCommitting] = useState(false);

  const [, startTransition] = useTransition();

  const loadData = async () => {
    try {
      setRefreshing(true);
      const [planoData, locsData, compData, medsData] = await Promise.all([
        getStorePlanogram().catch(() => null),
        getStorageLocations("all").catch(() => []),
        getStorageCompliance().catch(() => null),
        getMedicines({ per_page: 100 }).catch(() => ({ items: [] })),
      ]);

      startTransition(() => {
        setPlanogram(planoData);
        setLocations(locsData);
        setCompliance(compData);
        setMedicines(medsData.items || []);
        setLoading(false);
        setRefreshing(false);
      });
    } catch (err: unknown) {
      console.error("Failed to load shelf data:", err);
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to load storage data.",
      });
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => loadData());
  }, []);

  // Handle Fast Dispense Locate
  const handleLocateMedicine = async (medId: number) => {
    try {
      setLocatorLoading(true);
      setSelectedMedicineId(medId);
      const res = await locateMedicineDispense(medId);
      setPickResult(res);
      setLocatorLoading(false);
    } catch (err: unknown) {
      console.error("Locate failed:", err);
      setPickResult(null);
      setLocatorLoading(false);
    }
  };

  // Location Create/Edit Handler
  const handleOpenNewLocation = () => {
    setEditingLocation(null);
    setLocFormName("");
    setLocFormType("shelf");
    setLocFormDesc("");
    setShowLocationModal(true);
  };

  const handleOpenEditLocation = (loc: PhysicalLocation) => {
    setEditingLocation(loc);
    setLocFormName(loc.name);
    setLocFormType(loc.location_type || "shelf");
    setLocFormDesc(loc.description || "");
    setShowLocationModal(true);
  };

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locFormName.trim()) return;

    try {
      setModalSaving(true);
      if (editingLocation) {
        await updateStorageLocation(editingLocation.id, {
          name: locFormName.trim(),
          location_type: locFormType,
          description: locFormDesc.trim() || undefined,
        });
        setStatusMessage({ type: "success", text: `Location "${locFormName}" updated successfully.` });
      } else {
        await createStorageLocation({
          name: locFormName.trim(),
          location_type: locFormType,
          description: locFormDesc.trim() || undefined,
        });
        setStatusMessage({ type: "success", text: `Location "${locFormName}" created successfully.` });
      }
      setShowLocationModal(false);
      setModalSaving(false);
      loadData();
    } catch (err: unknown) {
      setModalSaving(false);
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save storage location.",
      });
    }
  };

  const handleDeleteLocation = async (loc: PhysicalLocation) => {
    if (!confirm(`Are you sure you want to deactivate location "${loc.name}"?`)) return;
    try {
      await deleteStorageLocation(loc.id);
      setStatusMessage({ type: "success", text: `Location "${loc.name}" deactivated.` });
      loadData();
    } catch (err: unknown) {
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to deactivate location.",
      });
    }
  };

  // Open Cycle Count Runner
  const handleOpenAuditModal = (shelf?: PlanogramShelf) => {
    const locId = shelf ? shelf.location_id : (locations[0]?.id ?? 1);
    setAuditLocationId(locId);
    setAuditPreview(null);
    setAuditNotes("");

    // Pre-populate audit counts with expected counts for convenience
    const counts: { [key: string]: number } = {};
    if (shelf) {
      shelf.items.forEach((it) => {
        counts[`${it.medicine_id}_${it.batch_number}`] = it.quantity_available;
      });
    } else {
      const activeShelf = planogram?.shelves.find((s) => s.location_id === locId);
      if (activeShelf) {
        activeShelf.items.forEach((it) => {
          counts[`${it.medicine_id}_${it.batch_number}`] = it.quantity_available;
        });
      }
    }
    setAuditCounts(counts);
    setShowAuditModal(true);
  };

  // Preview Cycle Count Discrepancies
  const handlePreviewAudit = async (applyReconciliation = false) => {
    if (!auditLocationId) return;
    try {
      if (applyReconciliation) setAuditCommitting(true);
      else setAuditLoading(true);

      const activeShelf = planogram?.shelves.find((s) => s.location_id === auditLocationId);
      const itemsList = activeShelf?.items || [];

      const scannedItems = itemsList.map((it) => ({
        medicine_id: it.medicine_id,
        batch_number: it.batch_number,
        scanned_quantity: auditCounts[`${it.medicine_id}_${it.batch_number}`] ?? 0,
      }));

      const res = await conductShelfCycleCount({
        location_id: auditLocationId,
        scanned_items: scannedItems,
        apply_adjustments: applyReconciliation,
        notes: auditNotes.trim() || undefined,
      });

      setAuditPreview(res);
      setAuditLoading(false);
      setAuditCommitting(false);

      if (applyReconciliation) {
        setStatusMessage({
          type: "success",
          text: `Cycle count reconciled! Audit trail record logged for location #${auditLocationId}.`,
        });
        setShowAuditModal(false);
        loadData();
      }
    } catch (err: unknown) {
      setAuditLoading(false);
      setAuditCommitting(false);
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Cycle count audit failed.",
      });
    }
  };

  // Filter shelves
  const filteredShelves = (planogram?.shelves || []).filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.coordinate_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.items.some((it) => it.brand_name.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesZone =
      zoneFilter === "ALL" ||
      (zoneFilter === "AMBIENT" && s.climate_zone === "AMBIENT") ||
      (zoneFilter === "COLD_CHAIN" && s.climate_zone === "COLD_CHAIN_FRIDGE") ||
      (zoneFilter === "SECURE" && s.climate_zone === "SECURE_DRAWER") ||
      (zoneFilter === "COUNTER" && s.climate_zone === "COUNTER_DISPENSE");

    return matchesSearch && matchesZone;
  });

  const renderClimateBadge = (zone: string) => {
    switch (zone) {
      case "COLD_CHAIN_FRIDGE":
        return (
          <span className="status-badge info">
            <span className="badge-icon"><ThermometerSnowflake size={12} /></span>
            <span>Cold Chain (2°C-8°C)</span>
          </span>
        );
      case "SECURE_DRAWER":
        return (
          <span className="status-badge med">
            <span className="badge-icon"><ShieldCheck size={12} /></span>
            <span>Secure Narcotics (Lock)</span>
          </span>
        );
      case "COUNTER_DISPENSE":
        return (
          <span className="status-badge high">
            <span className="badge-icon"><Flame size={12} /></span>
            <span>Counter Fast-Mover</span>
          </span>
        );
      default:
        return (
          <span className="status-badge">
            <span className="badge-icon"><Layers size={12} /></span>
            <span>Ambient Room Temp</span>
          </span>
        );
    }
  };

  return (
    <div className="shelves-1">
      {/* Header — Aligned 64px height */}
      <header className="page-header">
        <div>
          <div className="shelves-2">
            <h1 className="page-title">Shelves & Storage Locations</h1>
            <span  className="status-badge info shelves-3">
              PRD Phase 6
            </span>
          </div>
          <p className="page-subtitle">
            Physical Store Planogram & Fast Dispense Locator • Store #1
          </p>
        </div>

        <div className="shelves-4">
          <ThemeToggle />
          <button
            onClick={() => handleOpenAuditModal()}
            
            className="btn btn-secondary shelves-5"
          >
            <ClipboardCheck size={14} />
            <span>Cycle Count Audit</span>
          </button>

          <button onClick={handleOpenNewLocation} className="btn btn-primary">
            <Plus size={14} />
            <span>New Location</span>
          </button>

          <button
            onClick={loadData}
            disabled={refreshing}
            
            className="btn btn-secondary shelves-6"
            title="Refresh layout data" aria-label="Refresh"
          >
            <RefreshCw size={14} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div  className="page-body shelves-7">
        {/* Status Toast */}
        {statusMessage && (
          <div
            style={{
              padding: "0.75rem 1.25rem",
              borderRadius: "var(--radius-sm)",
              backgroundColor: statusMessage.type === "success" ? "var(--status-high-bg)" : "var(--status-low-bg)",
              border: `1px solid ${statusMessage.type === "success" ? "var(--status-high-border)" : "var(--status-low-border)"}`,
              color: statusMessage.type === "success" ? "var(--status-high-text)" : "var(--status-low-text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "0.8125rem",
              fontWeight: 700,
            }}
          >
            <span>{statusMessage.text}</span>
            <button onClick={() => setStatusMessage(null)}  className="btn-icon shelves-8" aria-label="Close dialog">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Operational Metrics Bar */}
        <div
          className="shelves-9"
        >
          {/* Card 1: Storage Locations */}
          <div  className="card shelves-10">
            <div className="shelves-11">
              <span className="shelves-12">
                Storage Locations
              </span>
              <span className="status-badge info">
                <span className="badge-icon"><MapPin size={12} /></span>
                <span>Active</span>
              </span>
            </div>
            <div className="shelves-13">
              {planogram?.summary.total_locations ?? locations.length}
            </div>
            <div className="shelves-14">
              Physical Shelves, Racks & Fridges
            </div>
          </div>

          {/* Card 2: Stock Occupied */}
          <div  className="card shelves-15">
            <div className="shelves-16">
              <span className="shelves-17">
                Total Stock Occupied
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><Package size={12} /></span>
                <span>Logged</span>
              </span>
            </div>
            <div className="shelves-18">
              {planogram?.summary.total_occupied_units ?? 0}
              <span className="shelves-19">
                / {planogram?.summary.total_capacity_units ?? 0} units
              </span>
            </div>
            <div className="shelves-20">
              Physical units logged across shelves
            </div>
          </div>

          {/* Card 3: Capacity Utilization */}
          <div  className="card shelves-21">
            <div className="shelves-22">
              <span className="shelves-23">
                Capacity Utilization
              </span>
              <span className="status-badge med">
                <span className="badge-icon"><Layers size={12} /></span>
                <span>Capacity</span>
              </span>
            </div>
            <div className="shelves-24">
              {planogram?.summary.store_utilization_pct ?? 0}%
            </div>
            <div className="shelves-25">
              <div
                style={{
                  height: "100%",
                  backgroundColor: "var(--status-med-text)",
                  width: `${Math.min(planogram?.summary.store_utilization_pct ?? 0, 100)}%`,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
          </div>

          {/* Card 4: Climate Safety & Alerts */}
          <div  className="card shelves-26">
            <div className="shelves-27">
              <span className="shelves-28">
                Climate Safety
              </span>
              <span className={`status-badge ${(compliance?.summary.total_alerts ?? 0) === 0 ? "high" : "low"}`}>
                <span className="badge-icon"><ShieldCheck size={12} /></span>
                <span>{(compliance?.summary.total_alerts ?? 0) === 0 ? "Compliant" : "Violations"}</span>
              </span>
            </div>
            <div className="shelves-29">
              {(compliance?.summary.total_alerts ?? 0) === 0 ? "Safe" : `${compliance?.summary.total_alerts} Alerts`}
            </div>
            <div className="shelves-30">
              Cold-chain & narcotic safe regulations
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="shelves-31">
          {[
            { id: "planogram", label: "Physical Planogram & Shelves", icon: MapPin },
            { id: "locator", label: "Fast Dispense Locator", icon: Navigation },
            { id: "cycle_count", label: "Cycle Count & Stock Audit", icon: ClipboardCheck },
            { id: "compliance", label: "Climate Safety", icon: ShieldCheck },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as ActiveTab)}
                className={`btn ${isActive ? "btn-primary" : "btn-secondary"}`}
                style={{ fontSize: "0.8125rem" }}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab 1: Physical Planogram & Shelves */}
        {activeTab === "planogram" && (
          <div className="shelves-33">
            {/* Filters */}
            <div  className="card shelves-34">
              <div className="shelves-35">
                <input
                  type="text"
                  
                  placeholder="Search shelf name, coordinate code, or medicine..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-input shelves-36"
                />
                <Search size={14} className="shelves-37" />
              </div>

              <div className="shelves-38">
                <span className="shelves-39">Zone:</span>
                {[
                  { id: "ALL", label: "All Units" },
                  { id: "AMBIENT", label: "Ambient" },
                  { id: "COLD_CHAIN", label: "Cold Chain (Fridge)" },
                  { id: "SECURE", label: "Secure Narcotics" },
                  { id: "COUNTER", label: "Counter Dispense" },
                ].map((z) => (
                  <button
                    key={z.id}
                    onClick={() => setZoneFilter(z.id)}
                    className={`btn ${zoneFilter === z.id ? "btn-primary" : "btn-secondary"}`}
                    style={{ height: "30px", padding: "0 0.625rem", fontSize: "0.75rem" }}
                  >
                    {z.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Shelf Grid */}
            {loading ? (
              <div className="shelves-41">
                Loading physical store planogram...
              </div>
            ) : filteredShelves.length === 0 ? (
              <div  className="card shelves-42">
                <div className="shelves-43">
                  <MapPin size={22} />
                </div>
                <div className="shelves-44">
                  No Storage Shelves Found
                </div>
                <div className="shelves-45">
                  Create your first physical storage location to start tracking batch positions and automated picking.
                </div>
                <button onClick={handleOpenNewLocation} className="btn btn-primary">
                  + Add Storage Location
                </button>
              </div>
            ) : (
              <div className="shelves-46">
                {filteredShelves.map((shelf) => {
                  const rawLoc = locations.find((l) => l.id === shelf.location_id);

                  return (
                    <div key={shelf.location_id}  className="card shelves-47">
                      <div>
                        {/* Shelf Header */}
                        <div className="shelves-48">
                          <div>
                            <div className="shelves-49">
                              <strong className="shelves-50">{shelf.name}</strong>
                              <span  className="status-badge shelves-51">
                                {shelf.location_type}
                              </span>
                            </div>
                            <div className="shelves-52">
                              <MapPin size={12} />
                              <span>{shelf.coordinate_code}</span>
                            </div>
                          </div>

                          <div className="shelves-53">
                            {rawLoc && (
                              <button onClick={() => handleOpenEditLocation(rawLoc)} className="btn-icon" title="Edit Location">
                                <Edit2 size={13} />
                              </button>
                            )}
                            {rawLoc && (
                              <button onClick={() => handleDeleteLocation(rawLoc)} className="btn-icon" title="Deactivate Location" aria-label="Delete">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Climate & Capacity */}
                        <div className="shelves-54">
                          {renderClimateBadge(shelf.climate_zone)}
                          <span className="shelves-55">
                            {shelf.current_occupied_units} / {shelf.capacity_units} units
                          </span>
                        </div>

                        {/* Capacity Bar */}
                        <div className="shelves-56">
                          <div
                            style={{
                              height: "100%",
                              width: `${Math.min(shelf.utilization_pct, 100)}%`,
                              backgroundColor: shelf.utilization_pct > 90 ? "var(--status-low-text)" : shelf.utilization_pct > 65 ? "var(--status-med-text)" : "var(--status-high-text)",
                              transition: "width 0.3s ease",
                            }}
                          />
                        </div>

                        {/* Stored Batches List */}
                        <div className="shelves-57">
                          <div className="shelves-58">
                            <span className="shelves-59">
                              Stored Batches ({shelf.items.length})
                            </span>
                            <button
                              onClick={() => handleOpenAuditModal(shelf)}
                              className="shelves-60"
                            >
                              Audit Count
                            </button>
                          </div>

                          {shelf.items.length === 0 ? (
                            <div className="shelves-61">
                              Empty shelf. Ready for batch inwarding.
                            </div>
                          ) : (
                            <div className="shelves-62">
                              {shelf.items.map((item) => (
                                <div
                                  key={item.inventory_id}
                                  className="shelves-63"
                                >
                                  <div>
                                    <div className="shelves-64">
                                      {item.brand_name} <span className="shelves-65">{item.strength}</span>
                                    </div>
                                    <div className="shelves-66">
                                      Lot {item.batch_number} • Exp: {item.expiry_date}
                                    </div>
                                  </div>
                                  <div className="shelves-67">
                                    <strong className="shelves-68">{item.quantity_available} pcs</strong>
                                    <div
                                      style={{
                                        fontSize: "0.625rem",
                                        fontWeight: 700,
                                        color: item.is_expired ? "var(--status-low-text)" : item.days_to_expiry <= 30 ? "var(--status-med-text)" : "var(--status-high-text)",
                                      }}
                                    >
                                      {item.is_expired ? "Expired" : `${item.days_to_expiry}d left`}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Footer Actions */}
                      <div className="shelves-69">
                        <span className="shelves-70">
                          Tier {shelf.shelf_level} • Bin {shelf.bin_code}
                        </span>
                        <button onClick={() => handleOpenAuditModal(shelf)}  className="btn btn-secondary shelves-71">
                          Verify Stock
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Fast Dispense Locator */}
        {activeTab === "locator" && (
          <div className="shelves-72">
            <div  className="card shelves-73">
              <h2 className="shelves-74">
                Fast Dispense Shelf Locator (PRD Phase 6)
              </h2>
              <p className="shelves-75">
                Locate medicine storage coordinates, picking direction instructions, and FEFO allocation for counter dispensing.
              </p>

              <div className="shelves-76">
                <input
                  type="text"
                  
                  placeholder="Search medicine brand name to locate..."
                  value={locatorSearch}
                  onChange={(e) => setLocatorSearch(e.target.value)}
                  className="form-input shelves-77"
                />
                <Search size={14} className="shelves-78" />
              </div>

              {/* Medicine buttons */}
              <div className="shelves-79">
                {medicines
                  .filter((m) => m.brand_name.toLowerCase().includes(locatorSearch.toLowerCase()))
                  .slice(0, 10)
                  .map((med) => (
                    <button
                      key={med.id}
                      onClick={() => handleLocateMedicine(med.id)}
                      className={`btn ${selectedMedicineId === med.id ? "btn-primary" : "btn-secondary"}`}
                      style={{ height: "30px", fontSize: "0.75rem", padding: "0 0.625rem" }}
                    >
                      <Bookmark size={12} />
                      <span>{med.brand_name} {med.strength && `(${med.strength})`}</span>
                    </button>
                  ))}
              </div>
            </div>

            {/* Results Display */}
            {locatorLoading ? (
              <div className="shelves-81">
                Finding physical shelf coordinates...
              </div>
            ) : pickResult ? (
              <div className="shelves-82">
                <div  className="card shelves-83">
                  <div>
                    <h3 className="shelves-84">
                      Physical Picking Guide: {pickResult.brand_name}
                    </h3>
                    <div className="shelves-85">
                      {pickResult.total_available_locations} available storage positions found in pharmacy.
                    </div>
                  </div>
                  <Link href="/pos"  className="btn btn-primary shelves-86">
                    <span>Open in POS Terminal</span>
                    <ArrowRight size={13} />
                  </Link>
                </div>

                <div className="shelves-87">
                  {pickResult.pick_locations.map((pick, idx) => (
                    <div
                      key={idx}
                      className="card"
                      style={{
                        borderColor: pick.is_fefo_priority ? "var(--status-high-border)" : "var(--border-default)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.75rem",
                      }}
                    >
                      <div className="shelves-88">
                        <div>
                          {pick.is_fefo_priority && (
                            <span  className="status-badge high shelves-89">
                              <span className="badge-icon"><CheckCircle2 size={10} /></span>
                              <span>FEFO Priority 1st Pick</span>
                            </span>
                          )}
                          <div className="shelves-90">{pick.location_name}</div>
                          <div className="shelves-91">
                            {pick.coordinate_code}
                          </div>
                        </div>
                        {renderClimateBadge(pick.climate_zone)}
                      </div>

                      {/* Directional picking instruction banner */}
                      <div
                        className="shelves-92"
                      >
                        <Navigation size={18} className="shelves-93" />
                        <div>
                          <div className="shelves-94">Directional Instruction</div>
                          <strong className="shelves-95">{pick.directional_guide}</strong>
                        </div>
                      </div>

                      <div className="shelves-96">
                        <div>
                          <span className="shelves-97">Batch</span>
                          <strong className="shelves-98">{pick.batch_number}</strong>
                        </div>
                        <div>
                          <span className="shelves-99">Expiry</span>
                          <strong className="shelves-100">{pick.expiry_date}</strong>
                        </div>
                        <div>
                          <span className="shelves-101">Available</span>
                          <strong className="shelves-102">{pick.quantity_available} pcs</strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div  className="card shelves-103">
                <Navigation size={28} className="shelves-104" />
                <div className="shelves-105">
                  Select a Medicine to Locate
                </div>
                <div className="shelves-106">
                  Click any medicine above or enter a search query to view directional picking directions and stock positions.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Cycle Count & Stock Audit */}
        {activeTab === "cycle_count" && (
          <div className="shelves-107">
            <div  className="card shelves-108">
              <div>
                <div className="shelves-109">
                  <h2 className="shelves-110">
                    Physical Shelf Cycle Count & Variance Engine
                  </h2>
                  <span  className="status-badge med shelves-111">
                    PRD Rule 22
                  </span>
                </div>
                <p className="shelves-112">
                  Conduct shelf-by-shelf physical stock audits. Detect inventory shrinkage, surpluses, and misplaced batches.
                </p>
              </div>

              <button onClick={() => handleOpenAuditModal()} className="btn btn-primary">
                <ClipboardCheck size={14} />
                <span>Start Shelf Audit</span>
              </button>
            </div>

            <div className="shelves-113">
              {(planogram?.shelves || []).map((shelf) => (
                <div key={shelf.location_id}  className="card shelves-114">
                  <div>
                    <div className="shelves-115">
                      <strong className="shelves-116">{shelf.name}</strong>
                      <span className="shelves-117">{shelf.coordinate_code}</span>
                    </div>
                    <div className="shelves-118">
                      Expected Stock: <strong className="shelves-119">{shelf.current_occupied_units} units</strong> ({shelf.items.length} batches)
                    </div>
                  </div>

                  <button onClick={() => handleOpenAuditModal(shelf)}  className="btn btn-secondary shelves-120">
                    <ClipboardCheck size={14} />
                    <span>Conduct Cycle Count</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Climate Safety */}
        {activeTab === "compliance" && (
          <div className="shelves-121">
            <div  className="card shelves-122">
              <div className="shelves-123">
                <ThermometerSnowflake size={18} className="shelves-124" />
                <h2 className="shelves-125">
                  Cold-Chain & Storage Safety Auditing
                </h2>
              </div>
              <p className="shelves-126">
                Monitors temperature requirements (e.g., insulin, biologics, vaccines requiring 2°C - 8°C) against physical storage zone allocations.
              </p>
            </div>

            {compliance?.alerts && compliance.alerts.length > 0 ? (
              <div className="shelves-127">
                {compliance.alerts.map((alert, idx) => (
                  <div
                    key={idx}
                    className="card"
                    style={{
                      borderColor: alert.severity === "CRITICAL_VIOLATION" ? "var(--status-low-border)" : "var(--status-med-border)",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.75rem",
                    }}
                  >
                    <span style={{ color: alert.severity === "CRITICAL_VIOLATION" ? "var(--status-low-text)" : "var(--status-med-text)", flexShrink: 0, marginTop: "2px", display: "inline-flex" }}>
                      <AlertTriangle size={18} />
                    </span>
                    <div className="shelves-128">
                      <div className="shelves-129">
                        <strong className="shelves-130">{alert.title}</strong>
                        <span className={`status-badge ${alert.severity === "CRITICAL_VIOLATION" ? "low" : "med"}`} style={{ fontSize: "0.625rem" }}>
                          {alert.severity}
                        </span>
                      </div>
                      <p className="shelves-132">{alert.message}</p>
                      {alert.remedy_instruction && (
                        <div className="shelves-133">
                          Remedy: {alert.remedy_instruction}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div  className="card shelves-134">
                <ShieldCheck size={28} className="shelves-135" />
                <div className="shelves-136">
                  All Storage Zones Compliant
                </div>
                <div className="shelves-137">
                  No cold-chain mismatches or shelf capacity overloads detected in pharmacy inventory.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL: Create/Edit Location */}
      {showLocationModal && (
        <div className="modal-backdrop">
          <div  className="modal-content shelves-138">
            <div className="modal-header">
              <div className="shelves-139">
                <MapPin size={18} />
                <h2 className="shelves-140">
                  {editingLocation ? "Edit Storage Location" : "New Physical Storage Location"}
                </h2>
              </div>
              <button onClick={() => setShowLocationModal(false)} className="btn-icon" aria-label="Close dialog">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveLocation}>
              <div  className="modal-body shelves-141">
                <div className="form-group">
                  <label className="form-label" htmlFor="shelves-field-1">Location Name *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Shelf A-2, Fridge Unit 1, Narcotics Safe"
                    value={locFormName}
                    onChange={(e) => setLocFormName(e.target.value)} id="shelves-field-1"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="shelves-field-2">Storage Classification Type *</label>
                  <select
                    className="form-select"
                    value={locFormType}
                    onChange={(e) => setLocFormType(e.target.value)} id="shelves-field-2"
                  >
                    <option value="shelf">Shelf (Ambient general medicines)</option>
                    <option value="rack">Rack (High-volume bulk medicines)</option>
                    <option value="drawer">Drawer (Small strip formulations / narcotics)</option>
                    <option value="fridge">Fridge (Cold-chain 2°C - 8°C insulin & biologics)</option>
                    <option value="counter">Counter (Fast-dispense OTC beneath terminal)</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="shelves-field-3">Description / Climate Requirements</label>
                  <textarea
                    rows={3}
                    className="form-textarea"
                    placeholder="Optional physical notes, e.g. Locked safe, bottom drawer, key required."
                    value={locFormDesc}
                    onChange={(e) => setLocFormDesc(e.target.value)} id="shelves-field-3"
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowLocationModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={modalSaving} className="btn btn-primary">
                  {modalSaving ? "Saving..." : editingLocation ? "Update Location" : "Create Location"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Cycle Count Audit Runner */}
      {showAuditModal && (
        <div className="modal-backdrop">
          <div  className="modal-content shelves-142">
            <div className="modal-header">
              <div className="shelves-143">
                <ClipboardCheck size={18} />
                <div>
                  <h2 className="shelves-144">
                    Shelf Cycle Count Audit
                  </h2>
                  <div className="shelves-145">
                    Physical Stock Verification (PRD Rule 22 & Phase 6)
                  </div>
                </div>
              </div>
              <button onClick={() => setShowAuditModal(false)} className="btn-icon" aria-label="Close dialog">
                <X size={16} />
              </button>
            </div>

            <div  className="modal-body shelves-146">
              <div className="form-group">
                <label className="form-label" htmlFor="shelves-field-4">Target Shelf / Location</label>
                <select
                  className="form-select"
                  value={auditLocationId ?? ""}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    setAuditLocationId(id);
                    const shelf = planogram?.shelves.find((s) => s.location_id === id);
                    const counts: { [key: string]: number } = {};
                    shelf?.items.forEach((it) => {
                      counts[`${it.medicine_id}_${it.batch_number}`] = it.quantity_available;
                    });
                    setAuditCounts(counts);
                    setAuditPreview(null);
                  }} id="shelves-field-4"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.location_type})
                    </option>
                  ))}
                </select>
              </div>

              {/* Items Count List */}
              <div className="shelves-147">
                <div className="shelves-148">
                  <span className="form-label">Expected Shelf Items</span>
                  <span className="shelves-149">Input physical counted units</span>
                </div>

                {(() => {
                  const activeShelf = planogram?.shelves.find((s) => s.location_id === auditLocationId);
                  const items = activeShelf?.items || [];

                  if (items.length === 0) {
                    return (
                      <div className="shelves-150">
                        No recorded inventory on this shelf. All counts will evaluate to surplus if items exist physically.
                      </div>
                    );
                  }

                  return (
                    <div className="shelves-151">
                      {items.map((it) => {
                        const key = `${it.medicine_id}_${it.batch_number}`;
                        const currentCount = auditCounts[key] ?? 0;
                        const diff = currentCount - it.quantity_available;

                        return (
                          <div
                            key={it.inventory_id}
                            className="shelves-152"
                          >
                            <div>
                              <div className="shelves-153">
                                {it.brand_name} {it.strength && `(${it.strength})`}
                              </div>
                              <div className="shelves-154">
                                Lot: {it.batch_number} • System: {it.quantity_available} pcs
                              </div>
                            </div>

                            <div className="shelves-155">
                              <input
                                type="number"
                                min={0}
                                value={currentCount}
                                onChange={(e) =>
                                  setAuditCounts({
                                    ...auditCounts,
                                    [key]: Math.max(0, parseInt(e.target.value) || 0),
                                  })
                                }
                                
                                className="form-input shelves-156"
                              />

                              <span
                                className={`status-badge ${diff === 0 ? "high" : diff < 0 ? "low" : "med"}`}
                                style={{ minWidth: "60px", justifyContent: "center" }}
                              >
                                {diff === 0 ? "Matched" : diff > 0 ? `+${diff}` : `${diff}`}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Notes */}
              <div className="form-group">
                <label className="form-label" htmlFor="shelves-field-5">Audit Notes / Discrepancy Reason</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Monthly cycle count, shelf consolidation, damage check"
                  value={auditNotes}
                  onChange={(e) => setAuditNotes(e.target.value)} id="shelves-field-5"
                />
              </div>

              {/* Preview Result */}
              {auditPreview && (
                <div
                  className="shelves-158"
                >
                  <div className="shelves-159">
                    <strong className="shelves-160">Audit Evaluation Result</strong>
                    <span className={`status-badge ${auditPreview.discrepancies_count === 0 ? "high" : "low"}`}>
                      {auditPreview.discrepancies_count === 0 ? "100% Match" : `${auditPreview.discrepancies_count} Discrepancies`}
                    </span>
                  </div>

                  <div className="shelves-161">
                    <div>
                      <span className="shelves-162">Matched Items</span>
                      <strong className="shelves-163">{auditPreview.matched_items_count}</strong>
                    </div>
                    <div>
                      <span className="shelves-164">Net Variance</span>
                      <strong className="shelves-165">{auditPreview.net_variance_units} units</strong>
                    </div>
                    <div>
                      <span className="shelves-166">Financial Impact</span>
                      <strong style={{ color: auditPreview.net_financial_variance < 0 ? "var(--status-low-text)" : "var(--status-high-text)" }}>
                        ₹{auditPreview.net_financial_variance.toFixed(2)}
                      </strong>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" onClick={() => setShowAuditModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                type="button"
                disabled={auditLoading || auditCommitting}
                onClick={() => handlePreviewAudit(false)}
                className="btn btn-secondary"
              >
                {auditLoading ? "Evaluating..." : "Preview Variances"}
              </button>
              <button
                type="button"
                disabled={auditCommitting || auditLoading}
                onClick={() => handlePreviewAudit(true)}
                className="btn btn-primary"
              >
                {auditCommitting ? "Reconciling..." : "Commit Reconciliation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
