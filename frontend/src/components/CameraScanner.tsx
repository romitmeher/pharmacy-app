"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Upload } from "lucide-react";
import { Modal } from "@/components/ui/overlays";
import { cameraErrorMessage, stopCameraStream } from "@/lib/camera";
import "@/styles/camera-scanner.css";

type Controls = { stop(): void };
export default function CameraScanner({ onBarcode, onCapture, onClose }: {
  onBarcode: (code: string) => void;
  onCapture: (photo: File) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const controls = useRef<Controls | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const detected = useRef(false);
  const callbacks = useRef({ onBarcode, onCapture, onClose });
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState("Start the camera and point it at one printed barcode.");
  const [error, setError] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");

  useEffect(() => { callbacks.current = { onBarcode, onCapture, onClose }; }, [onBarcode, onCapture, onClose]);

  function release() {
    generation.current++;
    controls.current?.stop(); controls.current = null;
    stopCameraStream(stream.current); stream.current = null;
    if (video.current) video.current.srcObject = null;
  }
  function close() { release(); callbacks.current.onClose(); }

  useEffect(() => {
    mounted.current = true;
    const hidden = () => {
      if (document.hidden) {
        release(); setRunning(false); setStarting(false);
        setStatus("Camera paused while the app is in the background. Start again when ready.");
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => { mounted.current = false; release(); document.removeEventListener("visibilitychange", hidden); };
  }, []);

  async function start(deviceId = selectedDevice) {
    release();
    const session = generation.current;
    setStarting(true); setRunning(false); setError(""); setStatus("Allow camera access when your browser asks."); detected.current = false;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("Live camera requires HTTPS and a browser with camera support. Use the live SmartPharm website, photo upload or a hardware scanner.");
      setStarting(false); return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } }),
        width: { ideal: 1280 }, height: { ideal: 720 },
      } });
      if (!mounted.current || generation.current !== session) { stopCameraStream(media); return; }
      stream.current = media;
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (!mounted.current || generation.current !== session || !video.current) return;
      const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 250, delayBetweenScanSuccess: 1500 });
      const scanner = await reader.decodeFromStream(media, video.current, result => {
        if (!result || detected.current || generation.current !== session) return;
        detected.current = true;
        const code = result.getText();
        try { callbacks.current.onBarcode(code); }
        catch (problem) {
          if (mounted.current) {
            setError(problem instanceof Error ? problem.message : "Barcode could not be added.");
            setStatus("Scan paused. Correct the issue, then choose Scan again.");
          }
        }
      });
      if (!mounted.current || generation.current !== session) { scanner.stop(); stopCameraStream(media); return; }
      controls.current = scanner;
      setRunning(true); setStatus("Hold one barcode inside the viewfinder. A successful scan adds one stock unit, once.");
      const cameras = await navigator.mediaDevices.enumerateDevices();
      if (mounted.current && generation.current === session) {
        setDevices(cameras.filter(device => device.kind === "videoinput"));
        setSelectedDevice(media.getVideoTracks()[0]?.getSettings().deviceId || deviceId);
      }
    } catch (problem) {
      if (mounted.current && generation.current === session) { release(); setError(cameraErrorMessage(problem)); setRunning(false); setStarting(false); }
    } finally { if (mounted.current && generation.current === session) setStarting(false); }
  }

  async function capture() {
    const element = video.current;
    if (!element?.videoWidth || !element.videoHeight) return;
    detected.current = true;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1600 / Math.max(element.videoWidth, element.videoHeight));
    canvas.width = Math.round(element.videoWidth * scale); canvas.height = Math.round(element.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(element, 0, 0, canvas.width, canvas.height);
    const session = generation.current;
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", .92));
    if (!blob || !mounted.current || generation.current !== session) return;
    release(); callbacks.current.onCapture(new File([blob], "camera-packaging.jpg", { type: "image/jpeg" }));
  }

  return <Modal open onClose={close} title="Camera barcode scanner" footer={<button className="btn btn-secondary" type="button" onClick={close}>Close camera</button>}>
    <div className="camera-scanner">
      <div className="camera-scanner-view"><video ref={video} muted playsInline autoPlay aria-label="Live camera preview" /><div className="camera-scanner-target" aria-hidden="true" /></div>
      <p role="status">{status}</p>
      {error && <p role="alert" className="camera-scanner-error">{error}</p>}
      {devices.length > 1 && <label>Camera device<select className="form-select" value={selectedDevice} disabled={starting} onChange={event => { setSelectedDevice(event.target.value); void start(event.target.value); }}>{devices.map((device,index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index+1}`}</option>)}</select></label>}
      <div className="camera-scanner-actions">
        <button type="button" className="btn btn-primary" disabled={starting} onClick={() => { if (running) { detected.current = false; setError(""); setStatus("Ready for the next barcode."); } else { void start(); } }}>{starting ? "Starting camera…" : running ? "Scan again" : "Start camera"}</button>
        <button type="button" className="btn btn-secondary" disabled={!running} onClick={() => void capture()}><Camera size={16} aria-hidden="true" />Capture packaging photo</button>
        <label className="btn btn-secondary camera-scanner-upload"><Upload size={16} aria-hidden="true" />Upload packaging photo<input type="file" accept="image/*" aria-label="Upload packaging photo" onChange={event => { const file=event.target.files?.[0]; if(file){release();callbacks.current.onCapture(file);} }} /></label>
      </div>
      <p className="ui-hint">Live barcode decoding stays on your device. Capturing or uploading packaging sends that photo to SmartPharm for recognition. USB/Bluetooth scanners: focus the barcode field and scan with an Enter or Tab suffix.</p>
    </div>
  </Modal>;
}
