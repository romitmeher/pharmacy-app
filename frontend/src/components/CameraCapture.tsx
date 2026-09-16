"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { checkImageQuality, recognizeMedicine, QualityAssessment, RecognitionPipelineResponse } from "@/lib/api";

interface CameraCaptureProps {
  onRecognitionComplete: (result: RecognitionPipelineResponse, imageB64: string) => void;
  isProcessing?: boolean;
}

export default function CameraCapture({ onRecognitionComplete, isProcessing = false }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [streamActive, setStreamActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [qualityStatus, setQualityStatus] = useState<QualityAssessment | null>(null);
  const [isAnalyzingQuality, setIsAnalyzingQuality] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"camera" | "upload">("camera");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Initialize camera stream
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera API is not supported in this browser environment.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setStreamActive(true);
      }
    } catch (err: any) {
      console.warn("Camera access failed or unavailable:", err);
      setCameraError(err.message || "Unable to access camera. Please check browser permissions or use file upload.");
      setStreamActive(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
      setStreamActive(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "camera") {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [activeTab, startCamera, stopCamera]);

  // Capture frame from active video stream
  const captureFrame = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageB64 = canvas.toDataURL("image/jpeg", 0.92);
    await processCapturedImage(imageB64);
  };

  // Process captured/uploaded image with backend pipeline
  const processCapturedImage = async (imageB64: string) => {
    try {
      const pipelineResult = await recognizeMedicine(imageB64);
      onRecognitionComplete(pipelineResult, imageB64);
    } catch (err: any) {
      console.error("Recognition failed:", err);
      alert("Error recognizing image: " + (err.message || "Unknown error"));
    }
  };

  // Quick file drop or input
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readFileAndProcess(file);
  };

  const readFileAndProcess = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const b64 = reader.result as string;
      await processCapturedImage(b64);
    };
    reader.readAsDataURL(file);
  };

  // Pre-seeded packaging generator for instant testing in all environments
  const generateSampleImage = (type: "crocin" | "augmentin" | "unknown" | "glare") => {
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 450;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background countertop
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (type === "crocin") {
      // Blister pack
      ctx.fillStyle = "#d1d5db";
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 4;
      ctx.fillRect(50, 40, 500, 370);
      ctx.strokeRect(50, 40, 500, 370);

      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 34px -apple-system, sans-serif";
      ctx.fillText("Crocin 650", 90, 110);

      ctx.font = "500 20px -apple-system, sans-serif";
      ctx.fillStyle = "#334155";
      ctx.fillText("Paracetamol Tablets IP", 90, 150);

      ctx.font = "600 18px monospace";
      ctx.fillStyle = "#1e293b";
      ctx.fillText("B.No. LIVE-B20260913-01", 90, 210);
      ctx.fillText("MFD. 06/2024", 90, 250);
      ctx.fillText("EXP. 05/2027", 90, 290);
      ctx.fillText("M.R.P. Rs. 33.50", 90, 330);

      ctx.font = "italic 16px -apple-system, sans-serif";
      ctx.fillStyle = "#475569";
      ctx.fillText("GlaxoSmithKline Pharmaceuticals Ltd", 90, 375);
    } else if (type === "augmentin") {
      // White pharmaceutical box
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#0284c7";
      ctx.lineWidth = 4;
      ctx.fillRect(60, 50, 480, 350);
      ctx.strokeRect(60, 50, 480, 350);

      ctx.fillStyle = "#0284c7";
      ctx.fillRect(60, 50, 480, 45);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px -apple-system, sans-serif";
      ctx.fillText("GSK Pharmaceuticals", 80, 80);

      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 32px -apple-system, sans-serif";
      ctx.fillText("Augmentin 625 Duo", 80, 145);

      ctx.font = "500 18px -apple-system, sans-serif";
      ctx.fillStyle = "#475569";
      ctx.fillText("Amoxicillin & Potassium Clavulanate", 80, 185);

      ctx.font = "600 18px monospace";
      ctx.fillStyle = "#1e293b";
      ctx.fillText("B.No: AUG-2026-99", 80, 240);
      ctx.fillText("EXPIRY: 10/2027", 80, 280);
      ctx.fillText("M.R.P. Rs. 204.50", 80, 320);
    } else if (type === "unknown") {
      // Unrecognized garbled label
      ctx.fillStyle = "#e5e7eb";
      ctx.fillRect(80, 60, 440, 330);
      ctx.fillStyle = "#6b7280";
      ctx.font = "bold 24px -apple-system, sans-serif";
      ctx.fillText("Generic Herb Formulation 100", 110, 150);
      ctx.fillText("Batch 998822", 110, 200);
      ctx.fillText("Exp Date 2029", 110, 250);
    } else if (type === "glare") {
      // Saturated reflection
      ctx.fillStyle = "#e5e7eb";
      ctx.fillRect(50, 40, 500, 370);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(70, 60, 350, 280); // White glare saturation
    }

    const b64 = canvas.toDataURL("image/jpeg", 0.95);
    processCapturedImage(b64);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Tab Selectors */}
      <div style={{ display: "flex", gap: "0.5rem", background: "var(--bg-surface)", padding: "0.35rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", width: "fit-content" }}>
        <button
          onClick={() => setActiveTab("camera")}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "var(--radius-sm)",
            border: "none",
            background: activeTab === "camera" ? "var(--brand-500)" : "transparent",
            color: activeTab === "camera" ? "#ffffff" : "var(--text-secondary)",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span>📷 Live Camera</span>
        </button>
        <button
          onClick={() => setActiveTab("upload")}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "var(--radius-sm)",
            border: "none",
            background: activeTab === "upload" ? "var(--brand-500)" : "transparent",
            color: activeTab === "upload" ? "#ffffff" : "var(--text-secondary)",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span>📁 Upload Packaging File</span>
        </button>
      </div>

      {/* Main Viewport Card */}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "840px",
          minHeight: "480px",
          background: "#030712",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {activeTab === "camera" ? (
          <>
            {streamActive ? (
              <video
                ref={videoRef}
                playsInline
                muted
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            ) : (
              <div style={{ padding: "2rem", textAlign: "center", color: "#94a3b8" }}>
                <p style={{ fontSize: "1.1rem", marginBottom: "0.5rem", color: "#f8fafc" }}>
                  {cameraError ? "Camera Access Notice" : "Connecting to Pharmacy Camera..."}
                </p>
                <p style={{ fontSize: "0.9rem", maxWidth: "420px", margin: "0 auto 1.5rem" }}>
                  {cameraError || "Point webcam or counter camera at medicine box or blister strip."}
                </p>
                <button
                  onClick={startCamera}
                  style={{
                    padding: "0.6rem 1.25rem",
                    background: "var(--brand-500)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Retry Camera Access
                </button>
              </div>
            )}

            {/* Packaging Alignment Reticle */}
            {streamActive && (
              <div
                style={{
                  position: "absolute",
                  inset: "12%",
                  border: "2px dashed rgba(56, 189, 248, 0.75)",
                  borderRadius: "16px",
                  pointerEvents: "none",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "1rem",
                }}
              >
                <span
                  style={{
                    background: "rgba(15, 23, 42, 0.75)",
                    color: "#38bdf8",
                    padding: "0.25rem 0.75rem",
                    borderRadius: "999px",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                  }}
                >
                  ALIGN PACKAGING TEXT HERE
                </span>
                {isProcessing && <div className="animate-scan" />}
              </div>
            )}
          </>
        ) : (
          /* File Upload / Drag-and-Drop Area */
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) readFileAndProcess(file);
            }}
            style={{
              width: "100%",
              height: "100%",
              padding: "3rem 1.5rem",
              textAlign: "center",
              border: isDragOver ? "2px dashed var(--brand-500)" : "2px dashed var(--border-default)",
              background: isDragOver ? "rgba(2, 132, 199, 0.05)" : "transparent",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>📦</div>
            <h3 style={{ color: "#f8fafc", marginBottom: "0.5rem" }}>Drop Medicine Image Here</h3>
            <p style={{ color: "#94a3b8", fontSize: "0.9rem", maxWidth: "380px", marginBottom: "1.5rem" }}>
              Upload JPG, PNG, or WEBP photos of medicine blister strips, bottles, or carton packaging.
            </p>
            <label
              style={{
                padding: "0.65rem 1.5rem",
                background: "var(--brand-500)",
                color: "#ffffff",
                borderRadius: "var(--radius-sm)",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Browse Packaging File
              <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: "none" }} />
            </label>
          </div>
        )}

        {/* Hidden processing canvas */}
        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>

      {/* Action Bar */}
      <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        {activeTab === "camera" && streamActive && (
          <button
            onClick={captureFrame}
            disabled={isProcessing}
            style={{
              padding: "0.85rem 1.75rem",
              background: isProcessing ? "var(--border-default)" : "var(--brand-500)",
              color: "#ffffff",
              border: "none",
              borderRadius: "var(--radius-md)",
              fontSize: "1rem",
              fontWeight: 700,
              cursor: isProcessing ? "not-allowed" : "pointer",
              boxShadow: "0 4px 14px var(--brand-shadow)",
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
            }}
          >
            <span>{isProcessing ? "Processing OCR..." : "📸 Recognize Packaging"}</span>
          </button>
        )}

        {/* One-Click Real Pharma Test Samples */}
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", marginLeft: "auto" }}>
          <span style={{ fontSize: "0.85rem", color: "var(--text-tertiary)", fontWeight: 600 }}>
            TEST SAMPLES:
          </span>
          <button
            onClick={() => generateSampleImage("crocin")}
            disabled={isProcessing}
            style={{
              padding: "0.4rem 0.85rem",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              color: "var(--text-primary)",
            }}
          >
            Crocin 650 (Live Match)
          </button>
          <button
            onClick={() => generateSampleImage("augmentin")}
            disabled={isProcessing}
            style={{
              padding: "0.4rem 0.85rem",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              color: "var(--text-primary)",
            }}
          >
            Augmentin 625 Duo
          </button>
          <button
            onClick={() => generateSampleImage("unknown")}
            disabled={isProcessing}
            style={{
              padding: "0.4rem 0.85rem",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              color: "var(--text-primary)",
            }}
          >
            Rule 9 Low-Confidence
          </button>
          <button
            onClick={() => generateSampleImage("glare")}
            disabled={isProcessing}
            style={{
              padding: "0.4rem 0.85rem",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              color: "var(--text-primary)",
            }}
          >
            Foil Glare Sample
          </button>
        </div>
      </div>
    </div>
  );
}
