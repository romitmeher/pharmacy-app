/**
 * SmartPharm Frontend API Client
 * Connects Next.js frontend to Python/Flask backend for Vision, POS, Inventory, and Auth.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5000";

// Standard development/demonstration JWT token for store #1 pharmacist
const DEFAULT_DEV_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJzdG9yZV9pZCI6MSwicm9sZSI6IlBIQVJNQUNJU1QifQ.fake_token_for_dev";

export function getAuthToken(): string {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("smartpharm_jwt_token");
    if (stored) return stored;
  }
  return DEFAULT_DEV_TOKEN;
}

export function setAuthToken(token: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("smartpharm_jwt_token", token);
  }
}

export interface QualityAssessment {
  is_acceptable: boolean;
  blur_score: number;
  is_blurry: boolean;
  brightness_score: number;
  is_dark: boolean;
  is_underexposed: boolean;
  glare_ratio: number;
  is_glare: boolean;
  has_glare: boolean;
  resolution: { width: number; height: number };
  issues: string[];
  feedback: string[];
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectionResult {
  method: string;
  confidence: number;
  bbox: [number, number, number, number];
  is_cropped: boolean;
  bounding_box: BoundingBox;
}

export interface OCRWordBox {
  text: string;
  confidence: number;
  box: number[][];
}

export interface OCRResult {
  full_text: string;
  lines: string[];
  word_boxes: OCRWordBox[];
  avg_confidence: number;
}

export interface ExtractedEntities {
  brand_name: string | null;
  generic_name: string | null;
  strength: string | null;
  batch_number: string | null;
  expiry_date: string | null;
  mfg_date: string | null;
  mrp: number | null;
  manufacturer: string | null;
  confidence: number;
  brand_candidates: string[];
  raw_text: string;
}

export interface MatchCandidate {
  medicine_id: number;
  name: string;
  generic_name: string | null;
  strength: string | null;
  dosage_form: string | null;
  manufacturer: string | null;
  mrp: number | null;
  confidence_score: number;
  confidence_level: "HIGH" | "MEDIUM" | "LOW";
  score_breakdown: Record<string, number>;
  matched_batch: {
    batch_id: number;
    batch_number: string;
    expiry_date: string | null;
    mrp: number | null;
    purchase_price: number | null;
  } | null;
  is_new_batch: boolean;
  active_stock: number;
}

export interface MatchResult {
  top_candidate: MatchCandidate | null;
  alternatives: MatchCandidate[];
  low_confidence: boolean;
  warning_message: string | null;
  search_fallbacks: string[];
}

export interface RecognitionPipelineResponse {
  success: boolean;
  quality: QualityAssessment;
  detection: DetectionResult | null;
  ocr: OCRResult | null;
  extracted_entities: ExtractedEntities | null;
  match_result: MatchResult | null;
  human_verification_required: boolean;
  error_message?: string;
}

export interface VerifyPayload {
  medicine_id: number;
  batch_number?: string;
  expiry_date?: string;
  quantity?: number;
}

export interface VerifiedItemResponse {
  medicine_id: number;
  medicine_name: string;
  generic_name: string | null;
  strength: string | null;
  dosage_form: string | null;
  mrp: number | null;
  batch_number: string;
  batch_id: number | null;
  expiry_date: string | null;
  is_existing_batch: boolean;
  verified_quantity: number;
  verified_by_user_id: number | null;
}

/**
 * Check packaging image quality (focus, lighting, glare)
 */
export async function checkImageQuality(imageBase64: string): Promise<QualityAssessment> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/vision/quality-check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ image_base64: imageBase64 }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Quality check failed.");
  }
  return json.data;
}

/**
 * Run full end-to-end medicine recognition pipeline
 */
export async function recognizeMedicine(
  imageBase64: string,
  storeId?: number
): Promise<RecognitionPipelineResponse> {
  const token = getAuthToken();
  const url = storeId
    ? `${API_BASE_URL}/api/vision/recognize?store_id=${storeId}`
    : `${API_BASE_URL}/api/vision/recognize`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ image_base64: imageBase64 }),
  });

  const json = await res.json();
  if (!res.ok) {
    return {
      success: false,
      quality: json.quality,
      detection: null,
      ocr: null,
      extracted_entities: null,
      match_result: null,
      human_verification_required: true,
      error_message: json.message || "Failed to recognize packaging image.",
    };
  }
  return json.data;
}

/**
 * Confirm recognized medicine parameters (Human-in-the-loop)
 */
export async function verifyMedicineRecognition(
  payload: VerifyPayload
): Promise<VerifiedItemResponse> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/vision/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to verify medicine.");
  }
  return json.data;
}

// -------------------------------------------------------------
// Phase 3: Distributor Intelligence & Physical Delivery Verification
// -------------------------------------------------------------

export interface ParsedDraftItem {
  line_number: number;
  raw_item_name: string;
  cleaned_medicine_name: string;
  packing?: string;
  hsn_code?: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  free_quantity: number;
  purchase_rate: number;
  mrp: number;
  gst_percentage: number;
  total_amount: number;
  medicine_id?: number;
  is_new_medicine?: boolean;
}

export interface MatchedDraftData {
  purchase_invoice_id: number;
  status: string;
  invoice_number: string;
  supplier_id: number;
  distributor_name: string;
  total_amount: number;
  items_count: number;
  matched_draft: {
    distributor_name: string;
    invoice_number: string;
    invoice_date: string;
    subtotal: number;
    tax_amount: number;
    total_amount: number;
    items: ParsedDraftItem[];
  };
}

export interface DeliveryDiscrepancyLine {
  medicine_name: string;
  status: "MATCHED" | "QUANTITY_MISMATCH" | "MISSING_ITEM" | "EXTRA_ITEM" | "BATCH_MISMATCH" | "EXPIRY_MISMATCH" | "PRICING_DISCREPANCY";
  expected_quantity: number;
  actual_quantity: number;
  quantity_difference: number;
  expected_batch: string;
  actual_batch: string;
  expected_expiry: string | null;
  actual_expiry: string | null;
  expected_mrp: number;
  actual_mrp: number | null;
  financial_difference: number;
  notes: string;
}

export interface DeliveryDiscrepancyReport {
  total_expected_items: number;
  total_actual_items: number;
  matched_items_count: number;
  discrepancy_count: number;
  total_expected_units: number;
  total_actual_units: number;
  total_financial_discrepancy: number;
  has_discrepancies: boolean;
  status: string;
  lines: DeliveryDiscrepancyLine[];
}

export interface ScanDistributorInvoiceResponse {
  status: string;
  message: string;
  data: MatchedDraftData;
}

export interface VerifyDeliveryResponse {
  status: string;
  purchase_invoice_id: number;
  invoice_number: string;
  report: DeliveryDiscrepancyReport;
}

export interface ActualScanPayload {
  medicine_name: string;
  batch_number: string;
  expiry_date?: string;
  actual_quantity: number;
  mrp?: number;
  medicine_id?: number;
}

export interface ConfirmDeliveryPayload {
  purchase_invoice_id: number;
  location_id?: number;
  received_items?: Array<{
    item_id?: number;
    medicine_id?: number;
    received_quantity?: number;
    batch_number?: string;
    expiry_date?: string;
    purchase_rate?: number;
    mrp?: number;
  }>;
}

/**
 * Upload and parse distributor invoice (PRD Rule 8 & 11: Creates Draft, NO inventory mutation)
 */
export async function scanDistributorInvoice(
  rawText?: string,
  invoiceFile?: File
): Promise<ScanDistributorInvoiceResponse> {
  const token = getAuthToken();
  let res: Response;

  if (invoiceFile) {
    const formData = new FormData();
    formData.append("invoice", invoiceFile);
    res = await fetch(`${API_BASE_URL}/api/distributor/scan-invoice`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
  } else {
    res = await fetch(`${API_BASE_URL}/api/distributor/scan-invoice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ raw_text: rawText }),
    });
  }

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to scan distributor invoice.");
  }
  return json;
}

/**
 * Compare Expected Invoice Items vs Actual Physical Scans (PRD Rule 12)
 */
export async function verifyPhysicalDelivery(
  purchaseInvoiceId: number,
  actualScans: ActualScanPayload[]
): Promise<VerifyDeliveryResponse> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/distributor/verify-delivery`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      purchase_invoice_id: purchaseInvoiceId,
      actual_scans: actualScans,
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to verify delivery.");
  }
  return json;
}

/**
 * Human Verification Confirmation: commits verified stock into Batch and Inventory (PRD Rule 11 & 12)
 */
export async function confirmDelivery(
  payload: ConfirmDeliveryPayload
): Promise<any> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/distributor/confirm-delivery`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to confirm delivery into inventory.");
  }
  return json;
}

// -------------------------------------------------------------
// Phase 4: Grounded AI / RAG Copilot & Decision Support
// -------------------------------------------------------------

export interface GroundedFact {
  category: string;
  record_id: number | null;
  summary: string;
  details: Record<string, any>;
}

export interface CopilotResponseData {
  intent: string;
  answer: string;
  grounded_facts: GroundedFact[];
  confidence: number;
  suggested_actions: string[];
  is_data_available: boolean;
  interaction_id?: number;
  session_id?: string;
  latency_ms?: number;
}

export interface AIInteractionRecord {
  id: number;
  store_id: number;
  user_id?: number | null;
  user_name?: string | null;
  session_id?: string | null;
  user_query: string;
  detected_intent?: string | null;
  response_text: string;
  retrieved_context?: Record<string, any> | null;
  citations?: any[] | null;
  latency_ms?: number | null;
  is_helpful?: boolean | null;
  feedback_notes?: string | null;
  feedback_recorded_at?: string | null;
export interface AlternativeCandidateData {
  medicine_id: number;
  brand_name: string;
  generic_name: string;
  strength: string | null;
  dosage_form: string | null;
  manufacturer: string | null;
  mrp: number;
  selling_price: number;
  units_in_stock: number;
  is_available: boolean;
  price_difference_pct: number;
  match_reasons: string[];
}

export interface AlternativeResponseData {
  original_medicine: {
    id: number;
    brand_name: string;
    generic_name: string;
    strength: string | null;
    mrp: number;
    in_stock: number;
  };
  total_candidates_found: number;
  available_candidates_count: number;
  candidates: AlternativeCandidateData[];
  disclaimer: string;
}

export interface PrescribedItemData {
  raw_text: string;
  detected_brand_or_generic: string;
  strength: string | null;
  dosage_instructions: string | null;
  duration: string | null;
  quantity_to_dispense: number;
  matched_medicine_id: number | null;
  matched_brand_name: string | null;
  matched_mrp: number | null;
  is_available: boolean;
  available_units: number;
  confidence: number;
  alternative_candidates: AlternativeCandidateData[];
}

export interface PrescriptionScanResponseData {
  total_detected: number;
  available_count: number;
  unavailable_count: number;
  is_fully_dispensable: boolean;
  notes: string;
  items: PrescribedItemData[];
  raw_ocr_text: string;
}

/**
 * Query Grounded Pharmacy Copilot (PRD Rule 19)
 */
export async function askCopilotQuery(
  query: string,
  sessionId?: string
): Promise<CopilotResponseData> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/ai/copilot/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, session_id: sessionId }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to query Copilot.");
  }
  return json.data;
}

/**
 * Submit Pharmacist Feedback on AI response (PRD Rule 19)
 */
export async function submitCopilotFeedback(
  interactionId: number,
  isHelpful: boolean,
  feedbackNotes?: string
): Promise<AIInteractionRecord> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/ai/copilot/feedback/${interactionId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ is_helpful: isHelpful, feedback_notes: feedbackNotes }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to submit Copilot feedback.");
  }
  return json.data;
}

/**
 * Retrieve Copilot interaction history for the store
 */
export async function getCopilotHistory(
  sessionId?: string,
  page: number = 1,
  perPage: number = 25
): Promise<{ items: AIInteractionRecord[]; total: number; page: number; per_page: number; pages: number }> {
  const token = getAuthToken();
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("per_page", String(perPage));
  if (sessionId) params.set("session_id", sessionId);

  const res = await fetch(`${API_BASE_URL}/api/ai/copilot/history?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to retrieve Copilot history.");
  }
  return json.data;
}

/**
 * Get Clinical Decision Support Alternative Medicines (PRD Rule 20)
 */
export async function getAlternativeMedicines(medicineId: number): Promise<AlternativeResponseData> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/ai/alternatives/${medicineId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to retrieve alternative medicines.");
  }
  return json.data;
}

/**
 * Doctor Prescription Extraction & Availability Verification (PRD Rule 21)
 */
export async function scanDoctorPrescription(
  text?: string,
  imageFile?: File
): Promise<PrescriptionScanResponseData> {
  const token = getAuthToken();
  let res: Response;

  if (imageFile) {
    const formData = new FormData();
    formData.append("prescription", imageFile);
    res = await fetch(`${API_BASE_URL}/api/ai/prescription/scan`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
  } else {
    res = await fetch(`${API_BASE_URL}/api/ai/prescription/scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text }),
    });
  }

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to scan prescription.");
  }
  return json.data;
}

/* ==========================================================================
   Phase 5: Machine Learning Client Contracts & Functions
   Strict compliance with SmartPharm PRD Rules 15, 16, 17, 18
   ========================================================================== */

export interface DailyForecastPoint {
  date: string;
  day_of_week: string;
  predicted_units: number;
  lower_bound: number;
  upper_bound: number;
}

export interface DemandForecastData {
  medicine_id: number;
  brand_name: string;
  horizon_days: number;
  model_family: string;
  average_daily_demand: number;
  total_forecasted_demand: number;
  evaluation_metrics: {
    mae: number;
    rmse: number;
  };
  historical_sales_days_count: number;
  is_sufficient_data: boolean;
  daily_forecasts: DailyForecastPoint[];
}

export interface StockOutPredictionItem {
  medicine_id: number;
  brand_name: string;
  current_stock: number;
  predicted_daily_demand: number;
  supplier_lead_time_days: number;
  safety_stock_units: number;
  runway_days: number;
  stockout_probability_7d: number;
  risk_level: "CRITICAL" | "HIGH_RISK" | "MEDIUM_RISK" | "HEALTHY";
  explanation: string;
  recommended_action: string;
}

export interface StockOutRisksResponseData {
  predictions: StockOutPredictionItem[];
  summary: {
    total_monitored: number;
    critical_risks: number;
    high_risks: number;
    medium_risks: number;
  };
}

export interface BatchExpiryPredictionItem {
  batch_id: number;
  batch_number: string;
  medicine_id: number;
  brand_name: string;
  expiry_date: string;
  days_to_expiry: number;
  quantity_in_stock: number;
  predicted_daily_demand: number;
  projected_units_sold_before_expiry: number;
  projected_unsold_units_at_expiry: number;
  sell_through_probability_pct: number;
  financial_risk_amount: number;
  risk_category: "CRITICAL_EXPIRED" | "HIGH_RISK" | "MODERATE_RISK" | "LOW_RISK";
  recommendation: string;
}

export interface ExpiryPredictionsResponseData {
  predictions: BatchExpiryPredictionItem[];
  summary: {
    total_batches_analyzed: number;
    high_risk_count: number;
    total_financial_loss_exposure: number;
  };
}

export interface ReorderRecommendationItem {
  medicine_id: number;
  brand_name: string;
  category: string | null;
  current_stock: number;
  open_po_quantity: number;
  forecasted_daily_demand: number;
  review_period_days: number;
  forecast_cycle_demand: number;
  supplier_lead_time_days: number;
  lead_time_demand: number;
  safety_stock: number;
  target_stock_level: number;
  net_deficit: number;
  recommended_order_quantity: number;
  estimated_purchase_rate: number;
  estimated_total_cost: number;
  urgency: "CRITICAL" | "HIGH" | "MEDIUM" | "ROUTINE";
  preferred_supplier_id: number | null;
  preferred_supplier_name: string | null;
  explanation: string;
}

export interface ReorderRecommendationsResponseData {
  recommendations: ReorderRecommendationItem[];
  summary: {
    actionable_items_count: number;
    critical_reorders_count: number;
    estimated_total_investment: number;
  };
}

export interface CreateReorderPODraftResponse {
  purchase_invoice_id: number;
  invoice_number: string;
  supplier_id: number;
  status: string;
  total_amount: number;
  items_count: number;
}

/**
 * Fetch ML Demand Forecast for a medicine (PRD Rule 16)
 */
export async function getDemandForecast(
  medicineId: number,
  horizonDays: number = 30
): Promise<DemandForecastData> {
  const token = getAuthToken();
  const res = await fetch(
    `${API_BASE_URL}/api/ml/forecast/${medicineId}?horizon_days=${horizonDays}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to fetch demand forecast.");
  }
  return json.data;
}

/**
 * Fetch Stock-Out Probability & Runway Predictions (PRD Rule 17)
 */
export async function getStockOutRisks(
  limit: number = 50,
  minRisk?: string
): Promise<StockOutRisksResponseData> {
  const token = getAuthToken();
  const query = new URLSearchParams({ limit: limit.toString() });
  if (minRisk) query.append("min_risk", minRisk);

  const res = await fetch(`${API_BASE_URL}/api/ml/stockout-risks?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to fetch stock-out risks.");
  }
  return json.data;
}

/**
 * Fetch Expiry Risk Predictions & Unsold Financial Loss Estimation (PRD Rule 15)
 */
export async function getExpiryPredictions(
  windowDays: number = 180,
  limit: number = 50,
  minRisk?: string
): Promise<ExpiryPredictionsResponseData> {
  const token = getAuthToken();
  const query = new URLSearchParams({
    window_days: windowDays.toString(),
    limit: limit.toString(),
  });
  if (minRisk) query.append("min_risk", minRisk);

  const res = await fetch(`${API_BASE_URL}/api/ml/expiry-predictions?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to fetch expiry risk predictions.");
  }
  return json.data;
}

/**
 * Fetch Smart Reorder Recommendations (PRD Rule 18)
 */
export async function getReorderRecommendations(
  limit: number = 50,
  minUrgency?: string
): Promise<ReorderRecommendationsResponseData> {
  const token = getAuthToken();
  const query = new URLSearchParams({ limit: limit.toString() });
  if (minUrgency) query.append("min_urgency", minUrgency);

  const res = await fetch(
    `${API_BASE_URL}/api/ml/reorder-recommendations?${query.toString()}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to fetch reorder recommendations.");
  }
  return json.data;
}

/**
 * 1-Click Draft Purchase Order Generation (PRD Rule 18)
 * Strict Human-in-the-Loop boundary: creates DRAFT PurchaseInvoice, zero auto inventory mutations.
 */
export async function createReorderDraftPO(
  supplierId: number,
  items: Array<{ medicine_id: number; quantity: number; purchase_rate: number }>,
  notes?: string
): Promise<CreateReorderPODraftResponse> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/ml/create-reorder-po`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      supplier_id: supplierId,
      items,
      notes,
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to create draft purchase order.");
  }
  return json.data;
}

/* ==========================================================================
   Phase 6: Shelf & Location Intelligence Client Contracts & Functions
   Strict compliance with SmartPharm PRD Phase 6
   ========================================================================== */

export interface ShelfStoredItemData {
  inventory_id: number;
  batch_id: number;
  medicine_id: number;
  brand_name: string;
  strength: string | null;
  dosage_form: string | null;
  batch_number: string;
  expiry_date: string;
  quantity_available: number;
  days_to_expiry: number;
  is_expired: boolean;
}

export interface ShelfLocationDetailData {
  location_id: number;
  name: string;
  description: string | null;
  location_type: string;
  climate_zone: "AMBIENT" | "COLD_CHAIN_FRIDGE" | "SECURE_DRAWER" | "COUNTER_DISPENSE";
  aisle: string;
  rack_number: string;
  shelf_level: number;
  bin_code: string;
  coordinate_code: string;
  capacity_units: number;
  current_occupied_units: number;
  utilization_pct: number;
  items_count: number;
  items: ShelfStoredItemData[];
}

export interface PlanogramResponseData {
  store_id: number;
  summary: {
    total_locations: number;
    total_capacity_units: number;
    total_occupied_units: number;
    store_utilization_pct: number;
  };
  shelves: ShelfLocationDetailData[];
}

export interface DispensePickLocationData {
  medicine_id: number;
  brand_name: string;
  strength: string | null;
  location_id: number;
  location_name: string;
  location_type: string;
  climate_zone: "AMBIENT" | "COLD_CHAIN_FRIDGE" | "SECURE_DRAWER" | "COUNTER_DISPENSE";
  coordinate_code: string;
  directional_guide: string;
  batch_number: string;
  expiry_date: string;
  quantity_available: number;
  is_fefo_priority: boolean;
}

export interface LocateMedicineResponseData {
  medicine_id: number;
  brand_name: string;
  pick_locations: DispensePickLocationData[];
  total_available_locations: number;
}

export interface StorageComplianceAlertData {
  alert_id: string;
  severity: "CRITICAL_VIOLATION" | "WARNING" | "OPTIMIZATION_TIP";
  medicine_id: number;
  brand_name: string;
  batch_number: string;
  location_id: number;
  location_name: string;
  location_type: string;
  units_affected: number;
  issue_title: string;
  description: string;
  action_required: string;
}

export interface ComplianceAlertsResponseData {
  alerts: StorageComplianceAlertData[];
  summary: {
    total_alerts: number;
    critical_violations: number;
    warnings: number;
    optimization_tips: number;
  };
}

export interface ShelfCycleCountItemReportData {
  medicine_id: number;
  brand_name: string;
  batch_number: string;
  expected_units: number;
  scanned_units: number;
  variance_units: number;
  variance_state: "MATCHED" | "DEFICIT" | "SURPLUS" | "UNEXPECTED_ON_SHELF" | "MISSING_FROM_SHELF";
  unit_cost: number;
  financial_impact: number;
  is_reconciled: boolean;
}

export interface ShelfAuditReportData {
  location_id: number;
  location_name: string;
  audit_date: string;
  audited_by_user_id: number;
  total_items_audited: number;
  matched_items_count: number;
  discrepancies_count: number;
  net_variance_units: number;
  net_financial_variance: number;
  is_committed: boolean;
  notes: string | null;
  items: ShelfCycleCountItemReportData[];
}

/**
 * Fetch physical store planogram layout (PRD Phase 6)
 */
export async function getShelfLayout(): Promise<PlanogramResponseData> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/shelf/layout`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to fetch shelf planogram layout.");
  }
  return json.data;
}

/**
 * Fast Dispense Locator for counter checkout (PRD Phase 6)
 */
export async function locateMedicineOnShelves(
  medicineId: number
): Promise<LocateMedicineResponseData> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/shelf/locate/${medicineId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to locate medicine coordinates.");
  }
  return json.data;
}

/**
 * Storage & Cold-Chain Compliance Alerts (PRD Phase 6 & Rule 23)
 */
export async function getStorageComplianceAlerts(): Promise<ComplianceAlertsResponseData> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/shelf/compliance-alerts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to fetch storage compliance alerts.");
  }
  return json.data;
}

/**
 * Submit Shelf Cycle Count Audit with optional authorized reconciliation (PRD Phase 6 & Rule 22)
 */
export async function submitShelfCycleCount(
  locationId: number,
  scannedItems: Array<{ medicine_id: number; batch_number: string; scanned_quantity: number }>,
  applyAdjustments: boolean = false,
  notes?: string
): Promise<ShelfAuditReportData> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/shelf/audit-count`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      location_id: locationId,
      scanned_items: scannedItems,
      apply_adjustments: applyAdjustments,
      notes,
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to submit shelf cycle count.");
  }
  return json.data;
}

// ==========================================
// Offline Synchronization Types & API (PRD Rule 24)
// ==========================================

export interface OfflinePackBatch {
  id: number;
  batch_number: string;
  expiry_date: string;
  mrp: number;
  purchase_price: number;
  quantity_available: number;
  location_name: string;
}

export interface OfflinePackMedicine {
  id: number;
  brand_name: string;
  generic_name: string;
  manufacturer: string;
  strength: string;
  dosage_form: string;
  category: string;
  prescription_required: boolean;
  mrp: number;
  selling_price: number;
  gst_percentage: number;
  storage_requirements: string;
  total_stock: number;
  batches: OfflinePackBatch[];
}

export interface OfflinePackLocation {
  id: number;
  name: string;
  type: string;
}

export interface OfflinePackData {
  store_id: number;
  store_name: string;
  generated_at: string;
  version_hash: string;
  total_medicines: number;
  total_active_batches: number;
  locations: OfflinePackLocation[];
  medicines: OfflinePackMedicine[];
}

export interface OfflineQueueItem {
  client_tx_id: string;
  client_timestamp: string;
  tx_type: string;
  sale_data: {
    items: Array<{
      medicine_id: number;
      batch_id: number;
      medicine_name?: string;
      batch_number?: string;
      quantity: number;
      discount_percentage?: number;
      unit_price?: number;
    }>;
    payments: Array<{
      payment_method: string;
      amount: number;
      transaction_reference?: string;
    }>;
    customer?: {
      name?: string;
      phone?: string;
    };
    notes?: string;
  };
}

export interface SyncReplayResult {
  client_tx_id: string;
  status: "synced" | "already_synced" | "conflict" | "failed";
  applied_sale_id?: number;
  invoice_number?: string;
  total_amount?: number;
  conflict_reason?: string;
  synced_at?: string;
  message?: string;
  error?: string;
}

export interface SyncReplaySummary {
  total_submitted: number;
  synced: number;
  already_synced: number;
  conflicts: number;
  failed: number;
  results: SyncReplayResult[];
}

export interface SyncConflictItem {
  id: number;
  store_id: number;
  user_id: number;
  client_tx_id: string;
  tx_type: string;
  status: string;
  applied_sale_id?: number;
  conflict_reason?: string;
  client_timestamp: string;
  synced_at?: string;
  created_at: string;
}

export interface SyncStatusSummary {
  store_id: number;
  total_synced: number;
  total_conflicts: number;
  total_failed: number;
  last_synced_at: string | null;
  recent_conflicts: SyncConflictItem[];
}

/**
 * Fetch local store offline catalog snapshot (PRD Rule 24)
 */
export async function getOfflinePack(hash?: string): Promise<{ status: string; data?: OfflinePackData; version_hash?: string }> {
  const token = getAuthToken();
  const url = hash ? `${API_BASE_URL}/api/sync/offline-pack?hash=${encodeURIComponent(hash)}` : `${API_BASE_URL}/api/sync/offline-pack`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to fetch offline pack.");
  }
  return json;
}

/**
 * Replay queued offline transactions with idempotency protection
 */
export async function replaySyncQueue(transactions: OfflineQueueItem[]): Promise<SyncReplaySummary> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/sync/replay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ transactions }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to replay sync queue.");
  }
  return json.data;
}

/**
 * Get synchronization health summary and conflict statistics
 */
export async function getSyncStatus(): Promise<SyncStatusSummary> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/sync/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to fetch sync status.");
  }
  return json.data;
}

/**
 * Resolve flagged synchronization conflict with manager sign-off
 */
export async function resolveSyncConflict(
  syncId: number,
  resolution: string = "WRITE_OFF",
  notes?: string
): Promise<{ id: number; client_tx_id: string; status: string; resolution: string; message: string }> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/sync/resolve-conflict/${syncId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ resolution, notes }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to resolve sync conflict.");
  }
  return json.data;
}

// ==========================================
// Voice-Assisted Pharmacy Operations (PRD Phase 6 & Rule 9)
// ==========================================

export interface VoiceActionCard {
  medicine_id: number;
  brand_name: string;
  strength?: string;
  generic_name?: string;
  unit_price: number;
  confidence: number;
  requires_pharmacist_confirmation: boolean;
  action_type: "SHELF_LOCATION" | "STOCK_AVAILABILITY" | "ALTERNATIVE_SUBSTITUTES" | "ADD_TO_POS" | "MEDICINE_DETAILS";
  summary: string;
  locations?: Array<{
    location_name: string;
    climate_zone: string;
    natural_direction: string;
    batch_number: string;
    quantity: number;
  }>;
  total_stock?: number;
  active_batches?: Array<{
    batch_id: number;
    batch_number: string;
    stock: number;
    expiry_date: string;
  }>;
  alternatives?: Array<{
    medicine_id: number;
    brand_name: string;
    generic_name: string;
    strength: string;
    mrp: number;
    units_in_stock: number;
    is_available: boolean;
    price_difference_pct: number;
  }>;
  clinical_disclaimer?: string;
  requested_quantity?: number;
  total_amount?: number;
}

export interface VoiceCommandResponse {
  status: "success" | "no_match" | "error";
  raw_transcript: string;
  intent: "LOCATE_SHELF" | "CHECK_STOCK" | "FIND_ALTERNATIVE" | "ADD_TO_BILL" | "SEARCH_MEDICINE" | "UNKNOWN";
  extracted_query: string;
  confidence: number;
  message?: string;
  action_card: VoiceActionCard | null;
}

export interface VoiceSampleCommand {
  category: string;
  phrase: string;
  intent: string;
  description: string;
}

/**
 * Process spoken voice transcript and ground query against pharmacy catalog (PRD Phase 6)
 */
export async function processVoiceCommand(transcript: string): Promise<VoiceCommandResponse> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/voice/process-command`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ transcript }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to process voice command.");
  }
  return json.data;
}

/**
 * Retrieve curated voice commands for counter staff training
 */
export async function getSampleVoiceCommands(): Promise<VoiceSampleCommand[]> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/voice/sample-commands`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to fetch sample voice commands.");
  }
  return json.data;
}

// ==========================================
// Multi-Branch Operations & Transfers (PRD Phase 6 & Rule 25)
// ==========================================

export interface NetworkStore {
  id: number;
  name: string;
  address: string;
  phone: string;
  gstin: string;
  drug_license_number: string;
  staff_count: number;
  total_medicines: number;
  is_active: boolean;
}

export interface BranchBatchDetail {
  batch_id: number;
  batch_number: string;
  expiry_date: string;
  quantity_available: number;
  mrp: number;
}

export interface StoreStockDetail {
  store_id: number;
  store_name: string;
  is_current_store: boolean;
  medicine_id: number | null;
  total_stock: number;
  is_in_stock: boolean;
  batches: BranchBatchDetail[];
}

export interface CrossStoreStockResponse {
  medicine_id: number;
  brand_name: string;
  generic_name: string;
  strength: string;
  total_network_stock: number;
  stores_with_stock_count: number;
  stores: StoreStockDetail[];
}

export interface BranchMetric {
  store_id: number;
  store_name: string;
  total_sales: number;
  total_bills: number;
  gross_profit: number;
  margin_percentage: number;
}

export interface NetworkPerformanceSummary {
  network_total_sales: number;
  network_total_bills: number;
  total_branches: number;
  branch_performance: BranchMetric[];
}

export interface SupplierPriceDiscrepancy {
  medicine_brand: string;
  min_purchase_rate: number;
  max_purchase_rate: number;
  variance_percentage: number;
  potential_savings_per_unit: number;
  store_rates: Array<{
    batch_id: number;
    batch_number: string;
    store_id: number;
    store_name: string;
    purchase_price: number;
    mrp: number;
  }>;
}

export interface StockTransferItemData {
  id: number;
  transfer_id: number;
  medicine_id: number;
  medicine_name?: string;
  strength?: string;
  batch_id: number;
  batch_number?: string;
  expiry_date?: string;
  quantity: number;
}

export interface StockTransferData {
  id: number;
  transfer_number: string;
  source_store_id: number;
  source_store_name?: string;
  destination_store_id: number;
  destination_store_name?: string;
  created_by_user_id: number;
  status: "draft" | "in_transit" | "received" | "cancelled";
  dispatched_at: string | null;
  received_at: string | null;
  notes: string | null;
  created_at: string;
  items: StockTransferItemData[];
}

/**
 * List all stores in the pharmacy network (PRD Rule 25)
 */
export async function getNetworkStores(): Promise<NetworkStore[]> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/multibranch/stores`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to fetch network stores.");
  }
  return json.data;
}

/**
 * Compare inventory of a medicine across all network branches
 */
export async function getCrossStoreStock(medicineId: number): Promise<CrossStoreStockResponse> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/multibranch/stock-comparison/${medicineId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to fetch cross-store stock.");
  }
  return json.data;
}

/**
 * Get consolidated network sales, bills, and gross margins across branches
 */
export async function getNetworkAnalytics(): Promise<NetworkPerformanceSummary> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/multibranch/analytics`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to fetch network analytics.");
  }
  return json.data;
}

/**
 * Compare supplier purchase rates across branches to optimize bulk purchasing
 */
export async function getSupplierPriceComparison(): Promise<SupplierPriceDiscrepancy[]> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/multibranch/supplier-price-comparison`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to fetch supplier price comparison.");
  }
  return json.data;
}

/**
 * Create an inter-store transfer request in DRAFT status
 */
export async function createStockTransfer(
  sourceStoreId: number,
  destinationStoreId: number,
  items: Array<{ medicine_id: number; batch_id: number; quantity: number }>,
  notes?: string
): Promise<StockTransferData> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/multibranch/transfers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      source_store_id: sourceStoreId,
      destination_store_id: destinationStoreId,
      items,
      notes,
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to create stock transfer.");
  }
  return json.data;
}

/**
 * Confirm dispatch from source store
 */
export async function dispatchStockTransfer(transferId: number): Promise<StockTransferData> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/multibranch/transfers/${transferId}/dispatch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to dispatch stock transfer.");
  }
  return json.data;
}

/**
 * Confirm receipt at destination store
 */
export async function receiveStockTransfer(transferId: number, locationId?: number): Promise<StockTransferData> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/multibranch/transfers/${transferId}/receive`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ location_id: locationId }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to receive stock transfer.");
  }
  return json.data;
}

/**
 * List inter-store transfers
 */
export async function listStockTransfers(): Promise<StockTransferData[]> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/multibranch/transfers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to list stock transfers.");
  }
  return json.data;
}

export interface Medicine {
  id: number;
  brand_name: string;
  generic_name: string;
  strength?: string;
  dosage_form?: string;
  mrp: number;
  selling_price?: number;
  manufacturer?: string;
}

/**
 * Fetch paginated medicines from store catalog
 */
export async function getMedicines(
  page: number = 1,
  perPage: number = 50
): Promise<{ medicines: Medicine[]; total: number; page: number; per_page: number }> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/medicines?page=${page}&per_page=${perPage}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to fetch medicines.");
  }
  return json;
}

/* ==========================================================================
   PRD Rule 7 & 22: Centralized Audit Logging Client Contracts & Functions
   ========================================================================== */

export interface AuditLogEntry {
  id: number;
  store_id: number;
  user_id: number | null;
  user_name: string;
  user_role: string;
  entity_type: string;
  entity_id: string;
  action: string;
  old_values: Record<string, any>;
  new_values: Record<string, any>;
  reason: string;
  ip_address?: string | null;
  created_at: string;
}

export interface AuditSummaryMetrics {
  total_audit_events: number;
  events_today: number;
  adjustments_last_7d: number;
  reconciliations_last_7d: number;
}

export interface AuditLogFilter {
  entity_type?: string;
  action?: string;
  user_id?: number;
  search?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  per_page?: number;
}

export interface AuditLogsResponse {
  success: boolean;
  data: AuditLogEntry[];
  pagination: {
    page: number;
    per_page: number;
    total_count: number;
    total_pages: number;
  };
}

/**
 * Retrieve filterable, paginated audit logs (PRD Rule 22 & 26).
 */
export async function getAuditLogs(filter?: AuditLogFilter): Promise<AuditLogsResponse> {
  const token = getAuthToken();
  const params = new URLSearchParams();
  if (filter?.entity_type) params.set("entity_type", filter.entity_type);
  if (filter?.action) params.set("action", filter.action);
  if (filter?.user_id) params.set("user_id", String(filter.user_id));
  if (filter?.search) params.set("search", filter.search);
  if (filter?.start_date) params.set("start_date", filter.start_date);
  if (filter?.end_date) params.set("end_date", filter.end_date);
  if (filter?.page) params.set("page", String(filter.page));
  if (filter?.per_page) params.set("per_page", String(filter.per_page));

  const url = `${API_BASE_URL}/api/audit-logs?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to fetch audit logs.");
  }
  return json;
}

/**
 * Retrieve executive summary counts for audit events.
 */
export async function getAuditSummary(): Promise<AuditSummaryMetrics> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/audit-logs/summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to fetch audit summary.");
  }
  return json.data;
}

/**
 * Retrieve single audit log detail with complete before/after state diff.
 */
export async function getAuditDetail(logId: number): Promise<AuditLogEntry> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/audit-logs/${logId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || `Failed to fetch audit log #${logId}.`);
  }
  return json.data;
}

/* ==========================================================================
   PRD Rules 7, 8, 14, 22: Sales Returns & Refunds Client Contracts & Functions
   ========================================================================== */

export interface EligibleReturnItem {
  sale_item_id: number;
  medicine_id: number;
  medicine_name: string;
  batch_id: number;
  batch_number: string;
  quantity_sold: number;
  quantity_already_returned: number;
  quantity_eligible_for_return: number;
  unit_price: number;
  total_line_amount: number;
}

export interface EligibleReturnItemsData {
  sale_id: number;
  invoice_number: string;
  sale_date: string;
  customer_id?: number | null;
  customer_name: string;
  total_amount: number;
  payment_status: string;
  total_remaining_units: number;
  is_fully_returned: boolean;
  items: EligibleReturnItem[];
}

export interface ReturnItemData {
  id: number;
  return_id: number;
  sale_item_id: number;
  medicine_id: number;
  medicine_name: string;
  batch_id: number;
  batch_number: string;
  quantity_returned: number;
  unit_price: number;
  refund_amount: number;
  restock_condition: "restocked_to_inventory" | "written_off_damaged" | "discarded_expired";
}

export interface ReturnData {
  id: number;
  store_id: number;
  sale_id: number;
  sale_invoice_number: string;
  user_id: number;
  user_name: string;
  return_number: string;
  return_date: string;
  total_refund_amount: number;
  refund_method: string;
  reason: string;
  status: string;
  items: ReturnItemData[];
  created_at: string;
}

export interface CreateReturnItemInput {
  sale_item_id: number;
  quantity_returned: number;
  restock_condition: "restocked_to_inventory" | "written_off_damaged" | "discarded_expired";
}

export interface CreateReturnPayload {
  sale_id: number;
  refund_method: string;
  reason: string;
  items: CreateReturnItemInput[];
}

/**
 * Fetch line items eligible for return from an original sale invoice.
 */
export async function getEligibleReturnItems(saleId: number): Promise<EligibleReturnItemsData> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/returns/eligible-items/${saleId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to fetch eligible return items.");
  }
  return json.data;
}

/**
 * Submit a customer return with atomic inventory restocking and refund calculation.
 */
export async function processSaleReturn(payload: CreateReturnPayload): Promise<ReturnData> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/returns`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to process customer return.");
  }
  return json.data;
}

/**
 * Query historical return records.
 */
export async function getSaleReturns(
  page: number = 1,
  perPage: number = 25,
  saleId?: number
): Promise<{ data: ReturnData[]; pagination: { page: number; per_page: number; total_count: number; total_pages: number } }> {
  const token = getAuthToken();
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("per_page", String(perPage));
  if (saleId) params.set("sale_id", String(saleId));

  const res = await fetch(`${API_BASE_URL}/api/returns?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to fetch return records.");
  }
  return json;
}

/**
 * Retrieve single return invoice detail.
 */
export async function getSaleReturnDetail(returnId: number): Promise<ReturnData> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/returns/${returnId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || `Failed to fetch return #${returnId}.`);
  }
  return json.data;
}

/* ==========================================================================
   Prescriptions Storage, Compliance & Audit API (PRD Rules 7, 9, 21, 22, 23, 26)
   ========================================================================== */

export interface StoredPrescriptionItem {
  id?: number;
  prescription_id?: number;
  medicine_id?: number | null;
  medicine_name?: string | null;
  extracted_name: string;
  dosage_instructions?: string | null;
  quantity_prescribed?: number;
  is_available: boolean;
}

export interface StoredPrescriptionRecord {
  id: number;
  store_id: number;
  prescription_number: string;
  customer_id?: number | null;
  customer_name?: string | null;
  doctor_name?: string | null;
  doctor_reg_number?: string | null;
  patient_name: string;
  patient_age?: number | null;
  patient_gender?: string | null;
  raw_text?: string | null;
  image_path?: string | null;
  status: "pending_verification" | "verified" | "dispensed" | "cancelled";
  verified_by_user_id?: number | null;
  verified_by_name?: string | null;
  sale_id?: number | null;
  sale_invoice_number?: string | null;
  dispensed_at?: string | null;
  notes?: string | null;
  items: StoredPrescriptionItem[];
  created_at: string;
}

export interface SavePrescriptionPayload {
  prescription_number?: string;
  patient_name: string;
  patient_age?: number;
  patient_gender?: string;
  doctor_name?: string;
  doctor_reg_number?: string;
  customer_phone?: string;
  customer_id?: number;
  raw_text?: string;
  image_path?: string;
  notes?: string;
  items: {
    extracted_name: string;
    medicine_id?: number | null;
    dosage_instructions?: string;
    quantity_prescribed?: number;
    is_available?: boolean;
  }[];
}

export interface VerifyPrescriptionPayload {
  doctor_name?: string;
  doctor_reg_number?: string;
  patient_name?: string;
  notes?: string;
  items?: {
    extracted_name: string;
    medicine_id?: number | null;
    dosage_instructions?: string;
    quantity_prescribed?: number;
    is_available?: boolean;
  }[];
}

/**
 * Persist a captured or extracted prescription in the database.
 */
export async function savePrescription(
  payload: SavePrescriptionPayload
): Promise<StoredPrescriptionRecord> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/prescriptions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to save prescription document.");
  }
  return json.data;
}

/**
 * List prescriptions archive with filters and pagination.
 */
export async function getPrescriptions(
  page: number = 1,
  perPage: number = 25,
  status?: string,
  search?: string
): Promise<{ items: StoredPrescriptionRecord[]; total: number; page: number; per_page: number; pages: number }> {
  const token = getAuthToken();
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("per_page", String(perPage));
  if (status) params.set("status", status);
  if (search) params.set("search", search);

  const res = await fetch(`${API_BASE_URL}/api/prescriptions?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to fetch prescriptions archive.");
  }
  return json.data;
}

/**
 * Retrieve prescription document detail (automatically records PRESCRIPTION_ACCESS audit log).
 */
export async function getPrescriptionDetail(
  rxId: number
): Promise<StoredPrescriptionRecord> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/prescriptions/${rxId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || `Failed to fetch prescription #${rxId}.`);
  }
  return json.data;
}

/**
 * Pharmacist clinical sign-off and verification.
 */
export async function verifyPrescription(
  rxId: number,
  payload: VerifyPrescriptionPayload
): Promise<StoredPrescriptionRecord> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/prescriptions/${rxId}/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || `Failed to verify prescription #${rxId}.`);
  }
  return json.data;
}

/**
 * Link verified prescription to a completed Sale invoice.
 */
export async function dispensePrescription(
  rxId: number,
  saleId: number
): Promise<StoredPrescriptionRecord> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/prescriptions/${rxId}/dispense`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ sale_id: saleId }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || `Failed to mark prescription #${rxId} as dispensed.`);
  }
  return json.data;
}

/* ==========================================================================
   Operating Expenses & Store P&L Ledger API (PRD Rules 7, 22, 26, 29, 30)
   ========================================================================== */

export interface ExpenseRecord {
  id: number;
  store_id: number;
  expense_number: string;
  user_id: number;
  user_name?: string | null;
  category: string;
  amount: number;
  payment_method: string;
  expense_date: string;
  vendor_recipient?: string | null;
  receipt_reference?: string | null;
  receipt_image_path?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface RecordExpensePayload {
  category: string;
  amount: number;
  payment_method?: string;
  expense_date?: string;
  vendor_recipient?: string;
  receipt_reference?: string;
  receipt_image_path?: string;
  notes?: string;
}

export interface PnLSummaryData {
  period: {
    start_date?: string | null;
    end_date?: string | null;
  };
  revenue: {
    total_bills: number;
    gross_sales: number;
    discounts: number;
    refunds: number;
    net_revenue: number;
  };
  cogs: {
    total_cogs: number;
    gross_profit: number;
    gross_margin_percentage: number;
  };
  operating_expenses: {
    total_expenses: number;
    by_category: Record<string, number>;
  };
  net_performance: {
    net_operating_profit: number;
    net_margin_percentage: number;
    is_profitable: boolean;
  };
}

/**
 * Record a pharmacy operating expense.
 */
export async function recordExpense(
  payload: RecordExpensePayload
): Promise<ExpenseRecord> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/expenses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to record operating expense.");
  }
  return json.data;
}

/**
 * List operating expenses with filter criteria.
 */
export async function getExpenses(
  page: number = 1,
  perPage: number = 25,
  category?: string,
  startDate?: string,
  endDate?: string
): Promise<{
  items: ExpenseRecord[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
  summary: { total_amount: number; by_category: Record<string, number> };
}> {
  const token = getAuthToken();
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("per_page", String(perPage));
  if (category) params.set("category", category);
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);

  const res = await fetch(`${API_BASE_URL}/api/expenses?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to fetch operating expenses.");
  }
  return json.data;
}

/**
 * Calculate Store Profit & Loss summary.
 */
export async function getStorePnLSummary(
  startDate?: string,
  endDate?: string
): Promise<PnLSummaryData> {
  const token = getAuthToken();
  const params = new URLSearchParams();
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);

  const res = await fetch(`${API_BASE_URL}/api/expenses/pnl-summary?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to fetch P&L summary.");
  }
  return json.data;
}

/**
 * Retrieve single operating expense detail.
 */
export async function getExpenseDetail(expId: number): Promise<ExpenseRecord> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/expenses/${expId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || `Failed to fetch expense #${expId}.`);
  }
  return json.data;
}


