"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Modal } from "@/components/ui/overlays";
import "@/styles/pwa.css";

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
const InstallContext = createContext<{ available: boolean; open: () => void }>({ available: false, open: () => {} });

export function InstallAppButton() {
  const { available, open } = useContext(InstallContext);
  if (!available) return null;
  return <button type="button" className="pwa-install" onClick={open}><Download size={16} aria-hidden="true" />Install SmartPharm</button>;
}

export default function PWAProvider({ children }: { children: ReactNode }) {
  const [available, setAvailable] = useState(false);
  const [help, setHelp] = useState(false);
  const [ios, setIos] = useState(false);
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [notice, setNotice] = useState("");
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState<ServiceWorker | null>(null);
  const requestedUpdate = useRef(false);
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();
  const safeToUpdate = pathname === "/login" && !isAuthenticated && !isLoading;

  useEffect(() => {
    if (!window.isSecureContext) return;
    const standalone = window.matchMedia("(display-mode: standalone)");
    const isStandalone = () => standalone.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const updateInstalled = () => setAvailable(!isStandalone());
    queueMicrotask(() => {
      updateInstalled();
      setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    });
    const beforeInstall = (event: Event) => {
      event.preventDefault(); setPrompt(event as InstallEvent);
      if (!isStandalone()) setAvailable(true);
    };
    const installed = () => { setPrompt(null); setHelp(false); setAvailable(false); setNotice(""); };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installed);
    standalone.addEventListener("change", updateInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", installed);
      standalone.removeEventListener("change", updateInstalled);
    };
  }, []);

  useEffect(() => {
    // Development stays worker-free. Production runs on HTTPS (or trusted localhost).
    if (process.env.NODE_ENV !== "production" || !window.isSecureContext || !("serviceWorker" in navigator)) return;
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let watched: ServiceWorker | null = null;
    let lastCheck = Date.now();
    const stateChanged = () => {
      if (!disposed && watched?.state === "installed" && registration?.waiting && navigator.serviceWorker.controller) {
        setWaiting(registration.waiting);
      }
    };
    const updateFound = () => {
      watched?.removeEventListener("statechange", stateChanged);
      watched = registration?.installing ?? null;
      watched?.addEventListener("statechange", stateChanged);
      stateChanged();
    };
    const controllerChanged = () => {
      // A first installation or another tab's lifecycle change never reloads this tab.
      if (requestedUpdate.current) window.location.reload();
    };
    const message = (event: MessageEvent) => {
      if (event.data?.type === "UPDATE_BLOCKED") {
        requestedUpdate.current = false;
        setNotice("Close the other SmartPharm tabs or app windows, then try again.");
      }
    };
    const check = () => {
      if (document.visibilityState === "visible" && navigator.onLine && Date.now() - lastCheck > 60 * 60 * 1000) {
        lastCheck = Date.now(); void registration?.update().catch(() => {});
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", controllerChanged);
    navigator.serviceWorker.addEventListener("message", message);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(value => {
      if (disposed) return;
      registration = value;
      if (value.waiting) setWaiting(value.waiting);
      value.addEventListener("updatefound", updateFound);
      updateFound();
    }).catch(() => { /* Unsupported/blocked storage must not prevent normal app use. */ });
    return () => {
      disposed = true;
      registration?.removeEventListener("updatefound", updateFound);
      watched?.removeEventListener("statechange", stateChanged);
      navigator.serviceWorker.removeEventListener("controllerchange", controllerChanged);
      navigator.serviceWorker.removeEventListener("message", message);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("online", check);
    };
  }, []);

  async function install() {
    if (!prompt || installing) return;
    setInstalling(true); setNotice("");
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setPrompt(null); // The native prompt is single-use, including dismissal.
      if (choice.outcome === "accepted") setHelp(false);
      else setNotice("Installation dismissed. You can still install later from your browser menu.");
    } catch {
      setPrompt(null); setNotice("Use your browser’s installation menu, if available.");
    } finally { setInstalling(false); }
  }

  return <InstallContext.Provider value={{ available, open: () => { setNotice(""); setHelp(true); } }}>
    {children}
    <Modal open={help} onClose={() => setHelp(false)} title="SmartPharm, one tap away">
      <div className="pwa-help">
        <p>Keep your pharmacy workspace in its own window, ready from your home screen or desktop.</p>
        {prompt ? <button type="button" className="pwa-primary" disabled={installing} onClick={() => void install()}><Download size={18} aria-hidden="true" />{installing ? "Opening install prompt…" : "Install SmartPharm"}</button>
          : ios ? <p>In Safari, open <strong>Share</strong>, choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>. If this option is missing, open this site directly in Safari.</p>
          : <p>In Chrome or Edge, look for <strong>Install app</strong> in the address bar or browser menu. On Safari for Mac, choose <strong>File → Add to Dock</strong> where supported. Some browsers only offer a bookmark; installation depends on your browser and device.</p>}
        <p className="pwa-note">An internet connection is needed to open new pages and sync. Installing does not upload local bills or grant camera access.</p>
        {notice && <p role="status">{notice}</p>}
      </div>
    </Modal>
    {waiting && waiting !== dismissed && <aside className="pwa-update" aria-label="App update">
      <div><p role="status"><strong>A SmartPharm update is ready.</strong></p><p>{safeToUpdate ? "Update when your work is saved and other app windows are closed." : "Finish your current work, then sign out to update. You can keep working."}</p>{notice && <p role="status">{notice}</p>}</div>
      {safeToUpdate && <button className="pwa-primary" type="button" onClick={() => { requestedUpdate.current = true; waiting.postMessage({ type: "ACTIVATE_UPDATE", pathname: window.location.pathname }); }}><RefreshCw size={16} aria-hidden="true" />Update now</button>}
      <button type="button" className="pwa-dismiss" aria-label="Dismiss update notice" onClick={() => setDismissed(waiting)}><X size={18} aria-hidden="true" /></button>
    </aside>}
  </InstallContext.Provider>;
}
