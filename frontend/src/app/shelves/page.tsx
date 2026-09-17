"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  Location,
  Box,
  CheckCircle,
  AlertTriangle,
  Bookmark,
  File,
  Building,
} from "@duo-icons/react";
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
    loadData();
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
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      {/* Header — Aligned 64px height */}
      <header className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <h1 className="page-title">Shelves & Storage Locations</h1>
            <span className="status-badge info" style={{ fontSize: "0.6875rem", padding: "0.1rem 0.45rem" }}>
              PRD Phase 6
            </span>
          </div>
          <p className="page-subtitle">
            Physical Store Planogram & Fast Dispense Locator • Store #1
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <ThemeToggle />
          <button
            onClick={() => handleOpenAuditModal()}
            className="btn btn-secondary"
            style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}
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
            className="btn btn-secondary"
            style={{ padding: "0 0.625rem" }}
            title="Refresh layout data"
          >
            <RefreshCw size={14} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="page-body" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
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
            <button onClick={() => setStatusMessage(null)} className="btn-icon" style={{ width: "24px", height: "24px" }}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Operational Metrics Bar */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "1rem",
          }}
        >
          {/* Card 1: Storage Locations */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Storage Locations
              </span>
              <span className="status-badge info">
                <span className="badge-icon"><Location size={12} /></span>
                <span>Active</span>
              </span>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {planogram?.summary.total_locations ?? locations.length}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Physical Shelves, Racks & Fridges
            </div>
          </div>

          {/* Card 2: Stock Occupied */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Total Stock Occupied
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><Box size={12} /></span>
                <span>Logged</span>
              </span>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {planogram?.summary.total_occupied_units ?? 0}
              <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "var(--text-muted)", marginLeft: "0.375rem" }}>
                / {planogram?.summary.total_capacity_units ?? 0} units
              </span>
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Physical units logged across shelves
            </div>
          </div>

          {/* Card 3: Capacity Utilization */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Capacity Utilization
              </span>
              <span className="status-badge med">
                <span className="badge-icon"><Layers size={12} /></span>
                <span>Capacity</span>
              </span>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {planogram?.summary.store_utilization_pct ?? 0}%
            </div>
            <div style={{ width: "100%", backgroundColor: "var(--bg-surface-elevated)", height: "4px", borderRadius: "2px", overflow: "hidden", marginTop: "0.25rem" }}>
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
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Climate Safety
              </span>
              <span className={`status-badge ${(compliance?.summary.total_alerts ?? 0) === 0 ? "high" : "low"}`}>
                <span className="badge-icon"><ShieldCheck size={12} /></span>
                <span>{(compliance?.summary.total_alerts ?? 0) === 0 ? "Compliant" : "Violations"}</span>
              </span>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {(compliance?.summary.total_alerts ?? 0) === 0 ? "Safe" : `${compliance?.summary.total_alerts} Alerts`}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Cold-chain & narcotic safe regulations
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "0.75rem" }}>
          {[
            { id: "planogram", label: "Physical Planogram & Shelves", icon: Location },
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
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Filters */}
            <div className="card" style={{ padding: "0.875rem 1.25rem", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "0.75rem" }}>
              <div style={{ position: "relative", flex: "1 1 240px" }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search shelf name, coordinate code, or medicine..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: "2.125rem" }}
                />
                <Search size={14} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              </div>

              <div style={{ display: "flex", gap: "0.375rem", alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginRight: "0.25rem" }}>Zone:</span>
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
              <div style={{ padding: "4rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                Loading physical store planogram...
              </div>
            ) : filteredShelves.length === 0 ? (
              <div className="card" style={{ padding: "4rem", textAlign: "center" }}>
                <div style={{ width: "44px", height: "44px", borderRadius: "50%", backgroundColor: "var(--bg-surface-elevated)", margin: "0 auto 0.75rem", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                  <Location size={22} />
                </div>
                <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.25rem" }}>
                  No Storage Shelves Found
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                  Create your first physical storage location to start tracking batch positions and automated picking.
                </div>
                <button onClick={handleOpenNewLocation} className="btn btn-primary">
                  + Add Storage Location
                </button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
                {filteredShelves.map((shelf) => {
                  const rawLoc = locations.find((l) => l.id === shelf.location_id);

                  return (
                    <div key={shelf.location_id} className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "1rem" }}>
                      <div>
                        {/* Shelf Header */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <strong style={{ fontSize: "0.9375rem", color: "var(--text-primary)" }}>{shelf.name}</strong>
                              <span className="status-badge" style={{ fontSize: "0.625rem", padding: "0.1rem 0.4rem", textTransform: "uppercase" }}>
                                {shelf.location_type}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.75rem", fontFamily: "monospace", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                              <MapPin size={12} />
                              <span>{shelf.coordinate_code}</span>
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: "0.25rem" }}>
                            {rawLoc && (
                              <button onClick={() => handleOpenEditLocation(rawLoc)} className="btn-icon" title="Edit Location">
                                <Edit2 size={13} />
                              </button>
                            )}
                            {rawLoc && (
                              <button onClick={() => handleDeleteLocation(rawLoc)} className="btn-icon" title="Deactivate Location">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Climate & Capacity */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.75rem" }}>
                          {renderClimateBadge(shelf.climate_zone)}
                          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                            {shelf.current_occupied_units} / {shelf.capacity_units} units
                          </span>
                        </div>

                        {/* Capacity Bar */}
                        <div style={{ width: "100%", height: "4px", backgroundColor: "var(--bg-surface-elevated)", borderRadius: "2px", overflow: "hidden", marginTop: "0.5rem" }}>
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
                        <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border-subtle)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                            <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                              Stored Batches ({shelf.items.length})
                            </span>
                            <button
                              onClick={() => handleOpenAuditModal(shelf)}
                              style={{ background: "none", border: "none", color: "var(--brand-primary)", fontSize: "0.6875rem", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}
                            >
                              Audit Count
                            </button>
                          </div>

                          {shelf.items.length === 0 ? (
                            <div style={{ padding: "0.75rem", borderRadius: "var(--radius-sm)", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)", textAlign: "center", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              Empty shelf. Ready for batch inwarding.
                            </div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", maxHeight: "150px", overflowY: "auto" }}>
                              {shelf.items.map((item) => (
                                <div
                                  key={item.inventory_id}
                                  style={{
                                    padding: "0.5rem 0.625rem",
                                    borderRadius: "var(--radius-sm)",
                                    backgroundColor: "var(--bg-surface)",
                                    border: "1px solid var(--border-subtle)",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    fontSize: "0.75rem",
                                  }}
                                >
                                  <div>
                                    <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                                      {item.brand_name} <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: "0.6875rem" }}>{item.strength}</span>
                                    </div>
                                    <div style={{ fontFamily: "monospace", fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                                      Lot {item.batch_number} • Exp: {item.expiry_date}
                                    </div>
                                  </div>
                                  <div style={{ textAlign: "right" }}>
                                    <strong style={{ color: "var(--text-primary)" }}>{item.quantity_available} pcs</strong>
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
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-subtle)", paddingTop: "0.75rem" }}>
                        <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                          Tier {shelf.shelf_level} • Bin {shelf.bin_code}
                        </span>
                        <button onClick={() => handleOpenAuditModal(shelf)} className="btn btn-secondary" style={{ height: "28px", fontSize: "0.75rem", padding: "0 0.625rem" }}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                Fast Dispense Shelf Locator (PRD Phase 6)
              </h2>
              <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                Locate medicine storage coordinates, picking direction instructions, and FEFO allocation for counter dispensing.
              </p>

              <div style={{ position: "relative", width: "100%", maxWidth: "420px" }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search medicine brand name to locate..."
                  value={locatorSearch}
                  onChange={(e) => setLocatorSearch(e.target.value)}
                  style={{ paddingLeft: "2.125rem" }}
                />
                <Search size={14} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              </div>

              {/* Medicine buttons */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginTop: "0.25rem" }}>
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
              <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                Finding physical shelf coordinates...
              </div>
            ) : pickResult ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      Physical Picking Guide: {pickResult.brand_name}
                    </h3>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      {pickResult.total_available_locations} available storage positions found in pharmacy.
                    </div>
                  </div>
                  <Link href="/pos" className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                    <span>Open in POS Terminal</span>
                    <ArrowRight size={13} />
                  </Link>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem" }}>
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
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          {pick.is_fefo_priority && (
                            <span className="status-badge high" style={{ marginBottom: "0.375rem" }}>
                              <span className="badge-icon"><CheckCircle size={10} /></span>
                              <span>FEFO Priority 1st Pick</span>
                            </span>
                          )}
                          <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-primary)" }}>{pick.location_name}</div>
                          <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text-primary)", fontFamily: "monospace" }}>
                            {pick.coordinate_code}
                          </div>
                        </div>
                        {renderClimateBadge(pick.climate_zone)}
                      </div>

                      {/* Directional picking instruction banner */}
                      <div
                        style={{
                          padding: "0.75rem",
                          borderRadius: "var(--radius-sm)",
                          backgroundColor: "var(--bg-surface)",
                          border: "1px solid var(--border-subtle)",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.625rem",
                        }}
                      >
                        <Navigation size={18} style={{ color: "var(--status-info-text)", flexShrink: 0 }} />
                        <div>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>Directional Instruction</div>
                          <strong style={{ fontSize: "0.8125rem", color: "var(--text-primary)" }}>{pick.directional_guide}</strong>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", borderTop: "1px solid var(--border-subtle)", paddingTop: "0.5rem", fontSize: "0.75rem" }}>
                        <div>
                          <span style={{ fontSize: "0.625rem", color: "var(--text-muted)", display: "block" }}>Batch</span>
                          <strong style={{ fontFamily: "monospace", color: "var(--text-primary)" }}>{pick.batch_number}</strong>
                        </div>
                        <div>
                          <span style={{ fontSize: "0.625rem", color: "var(--text-muted)", display: "block" }}>Expiry</span>
                          <strong style={{ color: "var(--text-primary)" }}>{pick.expiry_date}</strong>
                        </div>
                        <div>
                          <span style={{ fontSize: "0.625rem", color: "var(--text-muted)", display: "block" }}>Available</span>
                          <strong style={{ color: "var(--status-high-text)" }}>{pick.quantity_available} pcs</strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="card" style={{ padding: "3rem", textAlign: "center" }}>
                <Navigation size={28} style={{ color: "var(--text-muted)", margin: "0 auto 0.75rem" }} />
                <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.25rem" }}>
                  Select a Medicine to Locate
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  Click any medicine above or enter a search query to view directional picking directions and stock positions.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Cycle Count & Stock Audit */}
        {activeTab === "cycle_count" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Physical Shelf Cycle Count & Variance Engine
                  </h2>
                  <span className="status-badge med" style={{ fontSize: "0.6875rem" }}>
                    PRD Rule 22
                  </span>
                </div>
                <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                  Conduct shelf-by-shelf physical stock audits. Detect inventory shrinkage, surpluses, and misplaced batches.
                </p>
              </div>

              <button onClick={() => handleOpenAuditModal()} className="btn btn-primary">
                <ClipboardCheck size={14} />
                <span>Start Shelf Audit</span>
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
              {(planogram?.shelves || []).map((shelf) => (
                <div key={shelf.location_id} className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "1rem" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>{shelf.name}</strong>
                      <span style={{ fontSize: "0.6875rem", fontFamily: "monospace", color: "var(--text-muted)" }}>{shelf.coordinate_code}</span>
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.375rem" }}>
                      Expected Stock: <strong style={{ color: "var(--text-primary)" }}>{shelf.current_occupied_units} units</strong> ({shelf.items.length} batches)
                    </div>
                  </div>

                  <button onClick={() => handleOpenAuditModal(shelf)} className="btn btn-secondary" style={{ width: "100%" }}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <ThermometerSnowflake size={18} style={{ color: "var(--status-info-text)" }} />
                <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Cold-Chain & Storage Safety Auditing
                </h2>
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                Monitors temperature requirements (e.g., insulin, biologics, vaccines requiring 2°C - 8°C) against physical storage zone allocations.
              </p>
            </div>

            {compliance?.alerts && compliance.alerts.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
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
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <strong style={{ fontSize: "0.8125rem", color: "var(--text-primary)" }}>{alert.title}</strong>
                        <span className={`status-badge ${alert.severity === "CRITICAL_VIOLATION" ? "low" : "med"}`} style={{ fontSize: "0.625rem" }}>
                          {alert.severity}
                        </span>
                      </div>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>{alert.message}</p>
                      {alert.remedy_instruction && (
                        <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--brand-primary)", marginTop: "0.375rem" }}>
                          Remedy: {alert.remedy_instruction}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card" style={{ padding: "3rem", textAlign: "center" }}>
                <ShieldCheck size={28} style={{ color: "var(--status-high-text)", margin: "0 auto 0.75rem" }} />
                <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.25rem" }}>
                  All Storage Zones Compliant
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
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
          <div className="modal-content" style={{ maxWidth: "480px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Location size={18} />
                <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  {editingLocation ? "Edit Storage Location" : "New Physical Storage Location"}
                </h2>
              </div>
              <button onClick={() => setShowLocationModal(false)} className="btn-icon">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveLocation}>
              <div className="modal-body" style={{ gap: "1rem" }}>
                <div className="form-group">
                  <label className="form-label">Location Name *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Shelf A-2, Fridge Unit 1, Narcotics Safe"
                    value={locFormName}
                    onChange={(e) => setLocFormName(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Storage Classification Type *</label>
                  <select
                    className="form-select"
                    value={locFormType}
                    onChange={(e) => setLocFormType(e.target.value)}
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
                  <label className="form-label">Description / Climate Requirements</label>
                  <textarea
                    rows={3}
                    className="form-textarea"
                    placeholder="Optional physical notes, e.g. Locked safe, bottom drawer, key required."
                    value={locFormDesc}
                    onChange={(e) => setLocFormDesc(e.target.value)}
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
          <div className="modal-content" style={{ maxWidth: "640px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <ClipboardCheck size={18} />
                <div>
                  <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Shelf Cycle Count Audit
                  </h2>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                    Physical Stock Verification (PRD Rule 22 & Phase 6)
                  </div>
                </div>
              </div>
              <button onClick={() => setShowAuditModal(false)} className="btn-icon">
                <X size={16} />
              </button>
            </div>

            <div className="modal-body" style={{ gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label">Target Shelf / Location</label>
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
                  }}
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.location_type})
                    </option>
                  ))}
                </select>
              </div>

              {/* Items Count List */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="form-label">Expected Shelf Items</span>
                  <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>Input physical counted units</span>
                </div>

                {(() => {
                  const activeShelf = planogram?.shelves.find((s) => s.location_id === auditLocationId);
                  const items = activeShelf?.items || [];

                  if (items.length === 0) {
                    return (
                      <div style={{ padding: "1rem", borderRadius: "var(--radius-sm)", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)", textAlign: "center", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        No recorded inventory on this shelf. All counts will evaluate to surplus if items exist physically.
                      </div>
                    );
                  }

                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                      {items.map((it) => {
                        const key = `${it.medicine_id}_${it.batch_number}`;
                        const currentCount = auditCounts[key] ?? 0;
                        const diff = currentCount - it.quantity_available;

                        return (
                          <div
                            key={it.inventory_id}
                            style={{
                              padding: "0.625rem 0.75rem",
                              borderRadius: "var(--radius-sm)",
                              backgroundColor: "var(--bg-surface)",
                              border: "1px solid var(--border-subtle)",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: "1rem",
                            }}
                          >
                            <div>
                              <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-primary)" }}>
                                {it.brand_name} {it.strength && `(${it.strength})`}
                              </div>
                              <div style={{ fontSize: "0.6875rem", fontFamily: "monospace", color: "var(--text-muted)" }}>
                                Lot: {it.batch_number} • System: {it.quantity_available} pcs
                              </div>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
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
                                className="form-input"
                                style={{ width: "70px", height: "30px", textAlign: "center", padding: "0 0.25rem", fontWeight: 700 }}
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
                <label className="form-label">Audit Notes / Discrepancy Reason</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Monthly cycle count, shelf consolidation, damage check"
                  value={auditNotes}
                  onChange={(e) => setAuditNotes(e.target.value)}
                />
              </div>

              {/* Preview Result */}
              {auditPreview && (
                <div
                  style={{
                    padding: "0.875rem",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ fontSize: "0.8125rem", color: "var(--text-primary)" }}>Audit Evaluation Result</strong>
                    <span className={`status-badge ${auditPreview.discrepancies_count === 0 ? "high" : "low"}`}>
                      {auditPreview.discrepancies_count === 0 ? "100% Match" : `${auditPreview.discrepancies_count} Discrepancies`}
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", borderTop: "1px solid var(--border-subtle)", paddingTop: "0.5rem", fontSize: "0.75rem" }}>
                    <div>
                      <span style={{ fontSize: "0.625rem", color: "var(--text-muted)", display: "block" }}>Matched Items</span>
                      <strong style={{ color: "var(--status-high-text)" }}>{auditPreview.matched_items_count}</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: "0.625rem", color: "var(--text-muted)", display: "block" }}>Net Variance</span>
                      <strong style={{ color: "var(--text-primary)" }}>{auditPreview.net_variance_units} units</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: "0.625rem", color: "var(--text-muted)", display: "block" }}>Financial Impact</span>
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
