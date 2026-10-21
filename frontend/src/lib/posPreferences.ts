export interface PosPreferences {
  receiptSize: "thermal_80mm" | "a4";
  autoPrint: boolean;
  requireDoctor: boolean;
  barcodeBeep: boolean;
  showGst: boolean;
}
export const defaultPosPreferences: PosPreferences = {
  receiptSize: "thermal_80mm", autoPrint: true, requireDoctor: true, barcodeBeep: true, showGst: true,
};
export function readPosPreferences(storage: Pick<Storage, "getItem">): PosPreferences {
  try {
    return {
      receiptSize: storage.getItem("sp_pos_receipt_size") === "a4" ? "a4" : "thermal_80mm",
      autoPrint: storage.getItem("sp_pos_auto_print") !== "false",
      requireDoctor: storage.getItem("sp_pos_require_sch_h") !== "false",
      barcodeBeep: storage.getItem("sp_pos_barcode_beep") !== "false",
      showGst: storage.getItem("sp_pos_show_gst") !== "false",
    };
  } catch { return { ...defaultPosPreferences }; }
}
export function barcodeBeep(enabled: boolean) {
  if (!enabled) return;
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 1000; gain.gain.value = 0.06;
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.onended = () => { void context.close(); };
    oscillator.start(); oscillator.stop(context.currentTime + 0.08);
  } catch { /* Audio support must not affect billing. */ }
}
