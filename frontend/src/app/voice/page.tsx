"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  processVoiceCommand,
  getSampleVoiceCommands,
  VoiceCommandResponse,
  VoiceActionCard,
  VoiceSampleCommand,
} from "@/lib/api";
import {
  isSpeechRecognitionSupported,
  startSpeechRecognition,
  SpeechController,
} from "@/lib/speechRecognition";

export default function VoicePharmacyWorkstation() {
  // Voice & Input State
  const [isListening, setIsListening] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>("");
  const [manualInput, setManualInput] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [speechController, setSpeechController] = useState<SpeechController | null>(null);
  const [micSupported, setMicSupported] = useState<boolean>(true);

  // Result & Samples State
  const [voiceResult, setVoiceResult] = useState<VoiceCommandResponse | null>(null);
  const [sampleCommands, setSampleCommands] = useState<VoiceSampleCommand[]>([]);
  const [actionConfirmed, setActionConfirmed] = useState<boolean>(false);

  useEffect(() => {
    setMicSupported(isSpeechRecognitionSupported());
    loadSampleCommands();
  }, []);

  async function loadSampleCommands() {
    try {
      const samples = await getSampleVoiceCommands();
      setSampleCommands(samples);
    } catch (err) {
      console.error("Failed to load sample commands:", err);
    }
  }

  function handleToggleListening() {
    if (isListening) {
      if (speechController) {
        speechController.stop();
      }
      setIsListening(false);
      return;
    }

    setErrorMessage(null);
    setTranscript("");
    setActionConfirmed(false);

    const controller = startSpeechRecognition(
      (spokenText) => {
        setTranscript(spokenText);
        handleExecuteCommand(spokenText);
      },
      (error) => {
        setErrorMessage(error);
        setIsListening(false);
      },
      () => {
        setIsListening(false);
      }
    );

    if (controller) {
      setSpeechController(controller);
      setIsListening(true);
    }
  }

  async function handleExecuteCommand(queryText: string) {
    if (!queryText.trim()) return;

    setIsProcessing(true);
    setErrorMessage(null);
    setActionConfirmed(false);

    try {
      const res = await processVoiceCommand(queryText);
      setVoiceResult(res);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to process voice command.");
    } finally {
      setIsProcessing(false);
    }
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualInput.trim()) return;
    setTranscript(manualInput);
    handleExecuteCommand(manualInput);
    setManualInput("");
  }

  function handleConfirmAction() {
    setActionConfirmed(true);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      {/* Header */}
      <header className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎙️</span>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
              Voice-Assisted Pharmacy Assistant
            </h1>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-950/80 text-indigo-400 border border-indigo-800">
              PRD Phase 6 & Rule 9
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Hands-free shelf location, stock availability, generic substitution, and POS counter billing
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 transition"
          >
            ← Main Hub
          </Link>
          <Link
            href="/shelves"
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-sky-800/60 bg-sky-950/40 text-sky-300 hover:bg-sky-900/50 transition"
          >
            🗄️ Shelf Map
          </Link>
          <Link
            href="/offline"
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-cyan-800/60 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/50 transition"
          >
            📶 Offline POS
          </Link>
        </div>
      </header>

      {/* Main Interaction Area */}
      <main className="max-w-6xl mx-auto mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Voice Console & Quick Pills (5 cols) */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          {/* Microphone Interactive Card */}
          <div className="p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
            {/* Background Glow */}
            <div
              className={`absolute inset-0 transition-opacity duration-700 pointer-events-none ${
                isListening ? "opacity-30 bg-gradient-to-b from-rose-600/30 to-indigo-600/30" : "opacity-0"
              }`}
            />

            {/* Giant Microphone Button */}
            <div className="relative my-4">
              {isListening && (
                <>
                  <div className="absolute -inset-4 rounded-full bg-rose-500/20 animate-ping" />
                  <div className="absolute -inset-8 rounded-full bg-rose-500/10 animate-pulse" />
                </>
              )}
              <button
                onClick={handleToggleListening}
                className={`relative w-28 h-28 rounded-full flex flex-col items-center justify-center transition-all transform active:scale-95 shadow-xl ${
                  isListening
                    ? "bg-rose-600 text-white shadow-rose-900/50 scale-105"
                    : "bg-gradient-to-tr from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500 shadow-indigo-950/50"
                }`}
              >
                <span className="text-4xl">{isListening ? "🛑" : "🎙️"}</span>
                <span className="text-[10px] font-bold tracking-wider uppercase mt-1">
                  {isListening ? "Stop" : "Speak"}
                </span>
              </button>
            </div>

            {/* Status Text */}
            <div className="mt-2">
              <div className="text-sm font-bold text-white">
                {isListening ? (
                  <span className="text-rose-400 animate-pulse flex items-center gap-2 justify-center">
                    <span className="w-2 h-2 rounded-full bg-rose-500" /> Listening for Indian pharma query...
                  </span>
                ) : isProcessing ? (
                  <span className="text-cyan-400 flex items-center gap-2 justify-center">
                    <span className="animate-spin text-base">⏳</span> Grounding with Catalog & Shelves...
                  </span>
                ) : (
                  <span className="text-slate-300">Tap microphone & speak command</span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Acoustic model tuned for Indian brand names and numerical strengths
              </p>
            </div>

            {/* Spoken Transcript Bubble */}
            {transcript && (
              <div className="w-full mt-5 p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 text-left text-xs">
                <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                  Heard Speech Transcript:
                </span>
                <p className="text-slate-200 font-mono italic">&ldquo;{transcript}&rdquo;</p>
              </div>
            )}

            {/* Error Message */}
            {errorMessage && (
              <div className="w-full mt-3 p-3 rounded-lg bg-rose-950/40 border border-rose-900 text-xs text-rose-300">
                ⚠️ {errorMessage}
              </div>
            )}

            {/* Manual Keyboard Fallback Input */}
            <div className="w-full mt-6 pt-5 border-t border-slate-800/80">
              <form onSubmit={handleManualSubmit} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Or type voice command manually..."
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition"
                >
                  Send
                </button>
              </form>
            </div>
          </div>

          {/* Curated Voice Command Pills */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <span>💡</span> Recommended Counter Phrases
            </h3>
            <div className="space-y-2">
              {sampleCommands.map((sample, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setTranscript(sample.phrase);
                    handleExecuteCommand(sample.phrase);
                  }}
                  className="w-full text-left p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-indigo-500/60 hover:bg-slate-850 transition text-xs group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-indigo-300 group-hover:text-indigo-200">
                      &ldquo;{sample.phrase}&rdquo;
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                      {sample.category}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">{sample.description}</div>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Right Column: Grounded Action Card (7 cols) */}
        <section className="lg:col-span-7 flex flex-col gap-6">
          {voiceResult ? (
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-5">
              {/* Action Card Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">
                    {voiceResult.intent === "LOCATE_SHELF"
                      ? "📍"
                      : voiceResult.intent === "CHECK_STOCK"
                      ? "📦"
                      : voiceResult.intent === "FIND_ALTERNATIVE"
                      ? "🔄"
                      : voiceResult.intent === "ADD_TO_BILL"
                      ? "🧾"
                      : "🔍"}
                  </span>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block">
                      Recognized Voice Intent
                    </span>
                    <h2 className="text-lg font-extrabold text-white">
                      {voiceResult.intent.replace("_", " ")}
                    </h2>
                  </div>
                </div>

                {/* Match Confidence Score */}
                <div className="text-right">
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                      voiceResult.confidence >= 0.8
                        ? "bg-emerald-950/80 text-emerald-300 border-emerald-800"
                        : "bg-amber-950/80 text-amber-300 border-amber-800"
                    }`}
                  >
                    {(voiceResult.confidence * 100).toFixed(0)}% Confidence
                  </span>
                </div>
              </div>

              {/* No Match Fallback Notice (PRD Rule 9) */}
              {voiceResult.status === "no_match" && (
                <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800 text-amber-300 text-xs space-y-1">
                  <div className="font-bold">⚠️ Ambiguous Medicine Identity</div>
                  <p>{voiceResult.message}</p>
                </div>
              )}

              {/* Action Card Content */}
              {voiceResult.action_card && (
                <div className="space-y-4">
                  {/* Medicine Identity Bar */}
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-500 uppercase font-semibold">Grounded Medicine</div>
                      <div className="text-base font-bold text-white">
                        {voiceResult.action_card.brand_name} {voiceResult.action_card.strength}
                      </div>
                      <div className="text-xs text-slate-400">
                        {voiceResult.action_card.generic_name}
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-xs text-slate-500">Unit MRP</div>
                      <div className="text-sm font-bold text-emerald-400">
                        ₹{voiceResult.action_card.unit_price.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Intent-Specific Views */}
                  {/* View 1: LOCATE_SHELF */}
                  {voiceResult.action_card.action_type === "SHELF_LOCATION" && (
                    <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                      <div className="text-xs font-bold text-sky-400 uppercase tracking-wider">
                        Storage Coordinates & Picking Route
                      </div>
                      <div className="text-sm text-white font-medium">
                        {voiceResult.action_card.summary}
                      </div>

                      {voiceResult.action_card.locations && voiceResult.action_card.locations.length > 0 ? (
                        <div className="space-y-2 mt-2">
                          {voiceResult.action_card.locations.map((loc, idx) => (
                            <div
                              key={idx}
                              className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                            >
                              <div>
                                <span className="font-bold text-white">{loc.location_name}</span>
                                <span className="text-slate-400 text-[11px] block mt-0.5">
                                  {loc.natural_direction} • Climate: {loc.climate_zone}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-[11px] text-cyan-400 font-bold">
                                  Batch {loc.batch_number}
                                </span>
                                <div className="text-emerald-400 font-semibold">{loc.quantity} units</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">No physical shelf assigned.</p>
                      )}
                    </div>
                  )}

                  {/* View 2: STOCK_AVAILABILITY */}
                  {voiceResult.action_card.action_type === "STOCK_AVAILABILITY" && (
                    <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                          Physical Stock Runway
                        </span>
                        <span className="text-sm font-black text-emerald-400 font-mono">
                          {voiceResult.action_card.total_stock} Units Total
                        </span>
                      </div>
                      <p className="text-xs text-slate-300">{voiceResult.action_card.summary}</p>

                      {voiceResult.action_card.active_batches && voiceResult.action_card.active_batches.length > 0 && (
                        <div className="space-y-1.5 mt-2">
                          {voiceResult.action_card.active_batches.map((b, idx) => (
                            <div
                              key={idx}
                              className="p-2 rounded-lg bg-slate-900 border border-slate-800/80 flex justify-between text-xs font-mono"
                            >
                              <span className="text-slate-300">
                                Batch {b.batch_number} (Exp: {b.expiry_date})
                              </span>
                              <span className="font-bold text-cyan-400">{b.stock} units</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* View 3: ALTERNATIVE_SUBSTITUTES */}
                  {voiceResult.action_card.action_type === "ALTERNATIVE_SUBSTITUTES" && (
                    <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                      <div className="text-xs font-bold text-violet-400 uppercase tracking-wider">
                        Bio-Equivalent Generic Substitutes
                      </div>
                      <p className="text-xs text-slate-300">{voiceResult.action_card.summary}</p>

                      {voiceResult.action_card.alternatives && voiceResult.action_card.alternatives.length > 0 ? (
                        <div className="space-y-2 mt-2">
                          {voiceResult.action_card.alternatives.map((alt, idx) => (
                            <div
                              key={idx}
                              className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                            >
                              <div>
                                <span className="font-bold text-white">
                                  {alt.brand_name} {alt.strength}
                                </span>
                                <span className="text-slate-400 text-[11px] block">
                                  {alt.generic_name}
                                </span>
                              </div>
                              <div className="text-right">
                                <div className="text-emerald-400 font-bold">₹{alt.mrp}</div>
                                <span
                                  className={`text-[10px] font-semibold ${
                                    alt.is_available ? "text-cyan-400" : "text-rose-400"
                                  }`}
                                >
                                  {alt.is_available ? `${alt.units_in_stock} in stock` : "Out of stock"}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">No alternative molecules registered.</p>
                      )}

                      {/* Clinical Safety Disclaimer (PRD Rule 20) */}
                      <div className="p-2.5 rounded-lg bg-indigo-950/30 border border-indigo-900 text-[11px] text-indigo-300 leading-relaxed">
                        🛡️ {voiceResult.action_card.clinical_disclaimer}
                      </div>
                    </div>
                  )}

                  {/* View 4: ADD_TO_POS */}
                  {voiceResult.action_card.action_type === "ADD_TO_POS" && (
                    <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                      <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                        Draft POS Bill Line Item
                      </div>
                      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-white text-sm">
                            {voiceResult.action_card.brand_name}
                          </span>
                          <span className="text-slate-400 block mt-0.5">
                            Quantity: <strong>{voiceResult.action_card.requested_quantity}</strong> unit(s) @ ₹
                            {voiceResult.action_card.unit_price} / unit
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-400 text-[10px]">Total Amount</span>
                          <div className="text-xl font-black text-emerald-400 font-mono">
                            ₹{voiceResult.action_card.total_amount?.toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {/* Human-in-the-Loop Confirmation Boundary (PRD Rule 9) */}
                      <div className="pt-2">
                        {actionConfirmed ? (
                          <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-600 text-emerald-300 text-xs text-center font-bold">
                            ✓ Line item confirmed! Forwarded to counter POS draft bill.
                          </div>
                        ) : (
                          <button
                            onClick={handleConfirmAction}
                            className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-950/40 transition flex items-center justify-center gap-2"
                          >
                            <span>✓</span> Pharmacist Review & Commit to Bill
                          </button>
                        )}
                        <p className="text-[11px] text-slate-500 text-center mt-1.5">
                          PRD Rule 9: Voice input requires explicit pharmacist confirmation before billing.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Empty State / Welcome Guide */
            <div className="p-12 rounded-3xl bg-slate-900 border border-slate-800 text-center flex flex-col items-center justify-center min-h-[400px]">
              <span className="text-5xl mb-3">🎙️</span>
              <h2 className="text-lg font-bold text-white">Voice Command Assistant Ready</h2>
              <p className="text-xs text-slate-400 max-w-md mt-1 leading-relaxed">
                Click the microphone button and ask questions like &ldquo;Where is Crocin 650?&rdquo;, &ldquo;Check stock of Dolo&rdquo;, or &ldquo;Add 2 strips of Crocin to bill&rdquo;.
              </p>
              <div className="flex items-center gap-2 mt-4 text-[11px] text-indigo-400 bg-indigo-950/40 px-3 py-1.5 rounded-full border border-indigo-900">
                <span>🛡️</span> Zero silent mutations: All actions require pharmacist review (PRD Rule 9)
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
