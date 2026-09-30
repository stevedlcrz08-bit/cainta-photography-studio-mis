import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Clock,
  Download,
  RefreshCw,
  Smartphone,
  Shield,
  ChevronRight,
  Loader2,
  Lock,
  Upload,
  Camera,
  FileCheck
} from "lucide-react";
import type { GCashQRSession } from "../db/types";
import { apiRequest, resolveApiUrl, ApiError } from "../utils/apiClient.ts";

interface GCashQRModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaymentSuccess: (sessionId: string, paymentId: string) => void;
  bookingId?: string;
  printOrderId?: string;
  studioId: string;
  amount: number;
  paymentType: "Downpayment" | "Balance" | "Full Payment" | "PrintOrder";
  studioName: string;
  description?: string;
  authToken: string;
}

type ModalState = "loading" | "qr_ready" | "waiting" | "paid" | "expired" | "error";

const POLL_INTERVAL_MS = 4000;
const QR_LIFETIME_MS  = 30 * 60 * 1000; // 30 minutes

function formatTime(ms: number): string {
  const totalSecs = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSecs / 60).toString().padStart(2, "0");
  const s = (totalSecs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const GCASH_STEPS = [
  { icon: "1", text: "Open your GCash app" },
  { icon: "2", text: "Tap \"Pay QR\" or \"Scan QR\"" },
  { icon: "3", text: "Scan the QR code above" },
  { icon: "4", text: `Review the amount and confirm payment` },
];

export default function GCashQRModal({
  isOpen,
  onClose,
  onPaymentSuccess,
  bookingId,
  printOrderId,
  studioId,
  amount,
  paymentType,
  studioName,
  description,
  authToken,
}: GCashQRModalProps) {
  const [modalState, setModalState] = useState<ModalState>("loading");
  const [session, setSession] = useState<GCashQRSession | null>(null);
  const [timeLeftMs, setTimeLeftMs] = useState(QR_LIFETIME_MS);
  const [error, setError] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Proof submission states (Hybrid review model)
  const [refNo, setRefNo] = useState("");
  const [receiptBase64, setReceiptBase64] = useState("");
  const [isSubmittingProof, setIsSubmittingProof] = useState(false);
  const [proofSubmitted, setProofSubmitted] = useState(false);
  const [showProofForm, setShowProofForm] = useState(false);
  const [proofError, setProofError] = useState("");

  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseRef     = useRef<EventSource | null>(null);

  // ── Cleanup ─────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (pollRef.current)  { clearInterval(pollRef.current);  pollRef.current  = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (sseRef.current)   { sseRef.current.close();          sseRef.current   = null; }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      cleanup();
      setModalState("loading");
      setSession(null);
      setError("");
      setTimeLeftMs(QR_LIFETIME_MS);
    }
    return cleanup;
  }, [isOpen, cleanup]);

  // ── Countdown timer ──────────────────────────────────────────
  const startCountdown = (expiresAt: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        clearInterval(timerRef.current!);
        setModalState("expired");
        setTimeLeftMs(0);
        if (pollRef.current) clearInterval(pollRef.current);
      } else {
        setTimeLeftMs(remaining);
      }
    }, 1000);
  };

  // ── Shared handler for any confirmation signal (SSE or poll) ─
  const handlePaidConfirmation = useCallback((s: GCashQRSession) => {
    cleanup();
    setModalState("paid");
    setSession(s);
    // Call immediately — no artificial delay keeps the wizard from getting stuck
    onPaymentSuccess(s.id, s.paymentId || "");
  }, [cleanup, onPaymentSuccess]);

  // ── SSE real-time push (primary) ─────────────────────────────
  const startSSE = useCallback((sessionId: string) => {
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
    const es = new EventSource(`/api/payments/gcash/stream?token=${encodeURIComponent(authToken)}`);
    sseRef.current = es;
    es.addEventListener("GCASH_PAYMENT_CONFIRMED", (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data);
        if (payload.sessionId === sessionId) {
          handlePaidConfirmation({
            id: sessionId,
            paymentId: payload.paymentId,
            bookingId: payload.bookingId,
            studioId: "",
            customerId: "",
            gateway: "paymongo",
            amount: payload.amount,
            paymentType: "Downpayment",
            status: "paid",
            expiresAt: "",
            paidAt: payload.paidAt,
            createdAt: ""
          } as GCashQRSession);
        }
      } catch { /* ignore parse errors */ }
    });
    es.onerror = () => { /* SSE errors are non-fatal; polling acts as fallback */ };
  }, [authToken, handlePaidConfirmation]);

  // ── Polling fallback (fires every 4s if SSE is missed) ───────
  const startPolling = useCallback((sessionId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(resolveApiUrl(`/api/payments/gcash/session/${sessionId}`), {
          headers: { "Authorization": `Bearer ${authToken}` },
        });
        const data = await res.json();
        if (data.success && data.session) {
          const s: GCashQRSession = data.session;
          if (s.status === "paid") {
            handlePaidConfirmation(s);
          } else if (s.status === "expired" || s.status === "failed") {
            cleanup();
            setModalState("expired");
          }
        }
      } catch {
        // Silently ignore polling errors; SSE/webhook is primary confirmation
      }
    }, POLL_INTERVAL_MS);
  }, [authToken, cleanup, handlePaidConfirmation]);

  // ── Generate QR ──────────────────────────────────────────────
  const generateQR = useCallback(async () => {
    setIsGenerating(true);
    setModalState("loading");
    setError("");

    try {
      const body: Record<string, any> = {
        studioId,
        amount,
        paymentType,
        description: description || `${paymentType} for ${studioName}`,
      };
      if (bookingId)    body.bookingId    = bookingId;
      if (printOrderId) body.printOrderId = printOrderId;

      const data = await apiRequest("/api/payments/gcash/create-qr", {
        method: "POST",
        body
      });

      const newSession: GCashQRSession = data.session;
      setSession(newSession);

      const expiresAt = new Date(newSession.expiresAt).getTime();
      setTimeLeftMs(expiresAt - Date.now());
      setModalState("qr_ready");
      startSSE(newSession.id);
      startPolling(newSession.id);
      startCountdown(expiresAt);
    } catch (err: any) {
      setError(err.message || "Could not generate QR code. Please try again.");
      setModalState("error");
    } finally {
      setIsGenerating(false);
    }
  }, [studioId, amount, paymentType, bookingId, printOrderId, description, studioName, authToken, startSSE, startPolling]);

  useEffect(() => {
    if (isOpen) generateQR();
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Download QR ──────────────────────────────────────────────
  const getQrSrc = (raw?: string | null) => {
    if (!raw) return "";
    if (raw.startsWith("data:") || raw.startsWith("http")) return raw;
    return `data:image/png;base64,${raw}`;
  };

  const downloadQR = () => {
    if (!session?.qrCodeData) return;
    const link = document.createElement("a");
    link.href = getQrSrc(session.qrCodeData);
    link.download = `gcash-qr-${session.id}.png`;
    link.click();
  };

  // ── File upload & submit proof ────────────────────────────────
  const handleReceiptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProofError("Please select a screenshot image (JPG or PNG).");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setProofError("Screenshot file exceeds 8MB limit.");
      return;
    }
    setProofError("");
    const reader = new FileReader();
    reader.onload = () => {
      setReceiptBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitProof = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!session) return;
    if (!refNo.trim() && !receiptBase64) {
      setProofError("Please provide your GCash Reference Number or screenshot.");
      return;
    }
    setIsSubmittingProof(true);
    setProofError("");
    try {
      // ── Fast path: check if PayMongo already confirmed the payment ──────
      // This handles the common case where the customer paid but the webhook
      // hasn't fired yet. If the gateway confirms, we skip the manual proof
      // review step entirely and mark the payment as Paid immediately.
      try {
        const verifyData = await apiRequest("/api/payments/gcash/verify-intent", {
          method: "POST",
          body: { sessionId: session.id }
        });
        if (verifyData.success && (verifyData.confirmed || verifyData.alreadyPaid)) {
          // Gateway confirmed — trigger success right away, no manual review needed
          onPaymentSuccess(session.id, verifyData.session?.paymentId || verifyData.paymentId || "");
          return;
        }
      } catch {
        // verify-intent failed (network or gateway error) — fall through to manual proof
      }

      // ── Fallback: submit manual proof for studio review ─────────────────
      const data = await apiRequest("/api/payments/gcash/submit-proof", {
        method: "POST",
        body: {
          sessionId: session.id,
          referenceNumber: refNo.trim(),
          proofOfPayment: receiptBase64
        }
      });
      setProofSubmitted(true);
      setTimeout(() => {
        onPaymentSuccess(session.id, data.paymentId);
      }, 2500);
    } catch (err: any) {
      setProofError(err.message || "Failed to submit payment proof.");
    } finally {
      setIsSubmittingProof(false);
    }
  };

  if (!isOpen) return null;

  const pctLeft = (timeLeftMs / QR_LIFETIME_MS) * 100;
  const isUrgent = timeLeftMs < 5 * 60 * 1000; // < 5 min left

  // Circle ring progress (SVG)
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDash = (pctLeft / 100) * circumference;

  return (
    <div
      id="gcash-qr-modal-overlay"
      className="gcash-modal-overlay"
      onClick={(e) => { if ((e.target as HTMLElement).id === "gcash-qr-modal-overlay") onClose(); }}
    >
      <div className="gcash-modal-container" role="dialog" aria-modal="true" aria-labelledby="gcash-modal-title">

        {/* ── Header ─────────────────────────────────────── */}
        <div className="gcash-modal-header">
          <div className="gcash-modal-header-left">
            <div className="gcash-brand-badge">
              <div className="gcash-brand-icon">
                <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
                  <circle cx="12" cy="12" r="12" fill="#00a94f"/>
                  <text x="12" y="16" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold" fontFamily="Arial">G</text>
                </svg>
              </div>
              <span className="gcash-brand-name">GCash</span>
              <span className="gcash-brand-divider">·</span>
              <span className="gcash-brand-sub">QR Ph</span>
            </div>
          </div>
          <button id="gcash-modal-close-btn" className="gcash-modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* ── Security badge ──────────────────────────────── */}
        <div className="gcash-security-strip">
          <Lock size={11} />
          <span>Secured by BSP-licensed payment gateway · No receipt needed</span>
          <Shield size={11} />
        </div>

        {/* ── Body ───────────────────────────────────────── */}
        <div className="gcash-modal-body">

          {/* Amount card */}
          <div className="gcash-amount-card">
            <div className="gcash-amount-label">
              {paymentType === "Downpayment" ? "Downpayment" : paymentType === "Balance" ? "Remaining Balance" : "Payment"} · {studioName}
            </div>
            <div className="gcash-amount-value">
              ₱{amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
            </div>
            {description && <div className="gcash-amount-desc">{description}</div>}
          </div>

          {/* QR Panel */}
          {modalState === "loading" && (
            <div className="gcash-qr-panel gcash-qr-loading">
              <div className="gcash-qr-loading-ring">
                <Loader2 size={40} className="gcash-spin" />
              </div>
              <p className="gcash-loading-text">Generating secure QR code…</p>
              <p className="gcash-loading-sub">Connecting to payment gateway</p>
            </div>
          )}

          {(modalState === "qr_ready" || modalState === "waiting") && session?.qrCodeData && (
            <div className="gcash-qr-panel gcash-qr-active">
              {/* QR image */}
              <div className={`gcash-qr-wrapper ${isUrgent ? "gcash-qr-urgent" : ""}`}>
                <img
                  id="gcash-qr-image"
                  src={getQrSrc(session.qrCodeData)}
                  alt="GCash payment QR code"
                  className="gcash-qr-img"
                />
                <div className="gcash-qr-corner gcash-qr-corner-tl" />
                <div className="gcash-qr-corner gcash-qr-corner-tr" />
                <div className="gcash-qr-corner gcash-qr-corner-bl" />
                <div className="gcash-qr-corner gcash-qr-corner-br" />
              </div>

              {/* Timer ring */}
              <div className={`gcash-timer-row ${isUrgent ? "gcash-timer-urgent" : ""}`}>
                <div className="gcash-timer-ring">
                  <svg width="72" height="72" viewBox="0 0 72 72">
                    <circle cx="36" cy="36" r={radius} fill="none" stroke="rgba(0,169,79,0.15)" strokeWidth="5"/>
                    <circle
                      cx="36" cy="36" r={radius} fill="none"
                      stroke={isUrgent ? "#ef4444" : "#00a94f"}
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeDasharray={`${strokeDash} ${circumference}`}
                      transform="rotate(-90 36 36)"
                      style={{ transition: "stroke-dasharray 1s linear, stroke 0.5s" }}
                    />
                    <text x="36" y="42" textAnchor="middle" fontSize="14" fontWeight="700"
                      fill={isUrgent ? "#ef4444" : "#00a94f"} fontFamily="monospace">
                      {formatTime(timeLeftMs)}
                    </text>
                  </svg>
                </div>
                <div className="gcash-timer-info">
                  <p className="gcash-timer-label">
                    <Clock size={13} /> QR expires in
                  </p>
                  <p className="gcash-timer-hint">
                    {isUrgent
                      ? "⚠️ Expiring soon! Complete payment now."
                      : "Single-use · Valid for 30 minutes"}
                  </p>
                </div>
              </div>

              {/* Waiting pulse */}
              <div className="gcash-waiting-badge">
                <span className="gcash-waiting-dot" />
                Waiting for payment confirmation…
              </div>

              {/* Toggle to submit proof screenshot */}
              {!showProofForm && (
                <button
                  type="button"
                  onClick={() => setShowProofForm(true)}
                  className="w-full mt-3 py-2 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Camera size={14} /> I already scanned — Upload Receipt & Ref #
                </button>
              )}

              {showProofForm && (
                <div className="mt-3 p-4 bg-emerald-950/60 border border-emerald-500/40 rounded-2xl text-left space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-300 flex items-center gap-1">
                      <Camera size={13} /> Submit Proof of GCash Payment
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowProofForm(false)}
                      className="text-[10px] text-gray-400 hover:text-white"
                    >
                      Hide
                    </button>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-emerald-200">12-Digit GCash Ref # (Optional)</label>
                    <input
                      type="text"
                      value={refNo}
                      onChange={e => setRefNo(e.target.value)}
                      placeholder="e.g. 1029 3847 5612"
                      className="w-full bg-emerald-900/40 border border-emerald-600/40 rounded-xl px-3 py-2 text-xs text-white placeholder-emerald-400/40 focus:outline-none focus:border-emerald-400"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-emerald-200">Screenshot Receipt</label>
                    <div className="border border-dashed border-emerald-600/50 rounded-xl p-3 text-center bg-emerald-900/30 relative cursor-pointer hover:border-emerald-400 transition-all">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleReceiptUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      {receiptBase64 ? (
                        <div className="flex items-center justify-center gap-2 text-xs text-emerald-300 font-bold">
                          <CheckCircle2 size={15} /> Screenshot Attached!
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-xs text-emerald-300/70">
                          <Upload size={18} />
                          <span>Click to attach GCash confirmation screenshot</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {proofError && (
                    <p className="text-xs text-rose-400 font-semibold">{proofError}</p>
                  )}

                  <button
                    type="button"
                    onClick={handleSubmitProof}
                    disabled={isSubmittingProof}
                    className="w-full py-2 bg-[#00a94f] hover:bg-[#008f43] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer shadow"
                  >
                    {isSubmittingProof ? "Submitting..." : "Submit Proof for Studio Review"}
                  </button>
                </div>
              )}
            </div>
          )}

          {modalState === "paid" && (
            <div className="gcash-qr-panel gcash-qr-paid p-6 space-y-4">
              <div className="gcash-success-icon-ring">
                <CheckCircle2 size={56} className="gcash-success-icon" />
              </div>
              <h3 className="gcash-paid-title font-bold text-base text-white">Payment Received by Gateway!</h3>
              <p className="gcash-paid-sub text-xs text-emerald-300">
                ₱{amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })} captured via PayMongo
              </p>

              {proofSubmitted ? (
                <div className="bg-emerald-900/50 border border-emerald-500/50 rounded-xl p-3 text-xs text-emerald-200 text-center space-y-1">
                  <p className="font-bold">✅ Receipt & Ref # Submitted!</p>
                  <p className="text-[11px] text-emerald-300/80">
                    Your payment is queued for studio owner & administrator review. Your booking will be confirmed shortly.
                  </p>
                </div>
              ) : (
                <div className="bg-emerald-950/70 border border-emerald-600/40 rounded-2xl p-4 text-left space-y-3">
                  <p className="text-xs font-bold text-emerald-200">
                    📸 Attach GCash Receipt Screenshot for Studio Verification
                  </p>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-emerald-300">GCash Reference No.</label>
                    <input
                      type="text"
                      value={refNo}
                      onChange={e => setRefNo(e.target.value)}
                      placeholder="e.g. 1029 3847 5612"
                      className="w-full bg-emerald-900/40 border border-emerald-600/40 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-400"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-emerald-300">Screenshot</label>
                    <div className="border border-dashed border-emerald-600/50 rounded-xl p-2.5 text-center bg-emerald-900/30 relative cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleReceiptUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      {receiptBase64 ? (
                        <span className="text-xs text-emerald-300 font-bold">Screenshot Attached!</span>
                      ) : (
                        <span className="text-xs text-emerald-300/70 flex items-center justify-center gap-1">
                          <Upload size={14} /> Click to upload receipt screenshot
                        </span>
                      )}
                    </div>
                  </div>

                  {proofError && (
                    <p className="text-xs text-rose-400">{proofError}</p>
                  )}

                  <button
                    type="button"
                    onClick={handleSubmitProof}
                    disabled={isSubmittingProof}
                    className="w-full py-2 bg-[#00a94f] hover:bg-[#008f43] text-white rounded-xl text-xs font-bold uppercase cursor-pointer"
                  >
                    {isSubmittingProof ? "Submitting..." : "Submit to Studio Owner & Super Admin"}
                  </button>
                </div>
              )}
            </div>
          )}

          {modalState === "expired" && (
            <div className="gcash-qr-panel gcash-qr-error">
              <div className="gcash-error-icon-ring">
                <Clock size={48} className="gcash-error-icon" />
              </div>
              <h3 className="gcash-error-title">QR Code Expired</h3>
              <p className="gcash-error-sub">This QR code has expired after 30 minutes. Generate a new one to continue.</p>
              <button id="gcash-regenerate-btn" className="gcash-regen-btn" onClick={generateQR} disabled={isGenerating}>
                {isGenerating ? <Loader2 size={16} className="gcash-spin" /> : <RefreshCw size={16} />}
                Generate New QR Code
              </button>
            </div>
          )}

          {modalState === "error" && (
            <div className="gcash-qr-panel gcash-qr-error">
              <div className="gcash-error-icon-ring">
                <AlertCircle size={48} className="gcash-error-icon" />
              </div>
              <h3 className="gcash-error-title">Connection Error</h3>
              <p className="gcash-error-sub">{error}</p>
              <button id="gcash-retry-btn" className="gcash-regen-btn" onClick={generateQR} disabled={isGenerating}>
                {isGenerating ? <Loader2 size={16} className="gcash-spin" /> : <RefreshCw size={16} />}
                Try Again
              </button>
            </div>
          )}

          {/* Steps */}
          {(modalState === "qr_ready" || modalState === "waiting") && (
            <div className="gcash-steps">
              <p className="gcash-steps-title">
                <Smartphone size={14} /> How to pay:
              </p>
              {GCASH_STEPS.map((step, i) => (
                <div key={i} className="gcash-step-item">
                  <div className="gcash-step-num">{step.icon}</div>
                  <ChevronRight size={13} className="gcash-step-arrow" />
                  <span className="gcash-step-text">
                    {step.text}{i === 3 ? ` ₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────── */}
        {(modalState === "qr_ready" || modalState === "waiting") && (
          <div className="gcash-modal-footer">
            <button id="gcash-download-btn" className="gcash-download-btn" onClick={downloadQR} title="Download QR as image">
              <Download size={14} /> Download QR
            </button>
            <div className="gcash-footer-note">
              <QrCode size={12} />
              Works with GCash · Maya · All QR Ph-compatible apps
            </div>
          </div>
        )}

        {modalState === "paid" && (
          <div className="gcash-modal-footer gcash-modal-footer-center">
            <button id="gcash-close-success-btn" className="gcash-close-success-btn" onClick={onClose}>
              <CheckCircle2 size={15} /> Done
            </button>
          </div>
        )}
      </div>

      {/* ── Styles ─────────────────────────────────────── */}
      <style>{`
        .gcash-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 16px;
          animation: gcash-overlay-in 0.25s ease;
        }
        @keyframes gcash-overlay-in {
          from { opacity: 0 }
          to { opacity: 1 }
        }
        .gcash-modal-container {
          background: linear-gradient(160deg, #0a0e1a 0%, #0d1629 60%, #0a1520 100%);
          border: 1px solid rgba(0,169,79,0.25);
          border-radius: 20px;
          width: 100%;
          max-width: 420px;
          box-shadow:
            0 0 0 1px rgba(0,169,79,0.1),
            0 40px 80px rgba(0,0,0,0.6),
            0 0 60px rgba(0,169,79,0.08);
          overflow: hidden;
          animation: gcash-modal-in 0.3s cubic-bezier(0.34,1.56,0.64,1);
        }
        @keyframes gcash-modal-in {
          from { opacity:0; transform: scale(0.9) translateY(20px) }
          to   { opacity:1; transform: scale(1) translateY(0) }
        }

        /* Header */
        .gcash-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px 12px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .gcash-modal-header-left { display: flex; align-items: center; gap: 10px; }
        .gcash-brand-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(0,169,79,0.12);
          border: 1px solid rgba(0,169,79,0.3);
          border-radius: 100px;
          padding: 5px 12px 5px 6px;
        }
        .gcash-brand-icon {
          width: 28px; height: 28px;
          border-radius: 50%;
          overflow: hidden;
          display: flex; align-items: center; justify-content: center;
        }
        .gcash-brand-name { color: #fff; font-weight: 700; font-size: 14px; }
        .gcash-brand-divider { color: rgba(255,255,255,0.3); }
        .gcash-brand-sub { color: rgba(255,255,255,0.55); font-size: 12px; }
        .gcash-modal-close-btn {
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.6);
          border-radius: 8px;
          width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }
        .gcash-modal-close-btn:hover { background: rgba(255,255,255,0.13); color: #fff; }

        /* Security strip */
        .gcash-security-strip {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 7px 16px;
          background: rgba(0,169,79,0.07);
          border-bottom: 1px solid rgba(0,169,79,0.12);
          color: rgba(0,200,100,0.8);
          font-size: 10.5px;
          font-weight: 500;
          letter-spacing: 0.02em;
        }

        /* Body */
        .gcash-modal-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }

        /* Amount card */
        .gcash-amount-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          padding: 16px 20px;
          text-align: center;
        }
        .gcash-amount-label { color: rgba(255,255,255,0.5); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
        .gcash-amount-value {
          font-size: 32px;
          font-weight: 800;
          background: linear-gradient(135deg, #00d964, #00a94f);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          letter-spacing: -0.02em;
        }
        .gcash-amount-desc { color: rgba(255,255,255,0.4); font-size: 11.5px; margin-top: 4px; }

        /* QR Panel */
        .gcash-qr-panel {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          padding: 6px 0;
        }
        .gcash-qr-loading {
          padding: 30px 0;
        }
        .gcash-qr-loading-ring {
          width: 72px; height: 72px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0,169,79,0.08);
          border: 2px solid rgba(0,169,79,0.2);
          border-radius: 50%;
        }
        .gcash-spin { animation: gcash-spin 1s linear infinite; }
        @keyframes gcash-spin { to { transform: rotate(360deg) } }
        .gcash-loading-text { color: rgba(255,255,255,0.8); font-weight: 600; margin: 0; }
        .gcash-loading-sub { color: rgba(255,255,255,0.4); font-size: 12px; margin: 0; }

        .gcash-qr-wrapper {
          position: relative;
          background: #fff;
          border-radius: 16px;
          padding: 12px;
          box-shadow: 0 0 0 3px rgba(0,169,79,0.3), 0 0 30px rgba(0,169,79,0.15);
          transition: box-shadow 0.5s;
        }
        .gcash-qr-wrapper.gcash-qr-urgent {
          box-shadow: 0 0 0 3px rgba(239,68,68,0.5), 0 0 30px rgba(239,68,68,0.2);
          animation: gcash-urgent-pulse 1.5s ease-in-out infinite;
        }
        @keyframes gcash-urgent-pulse {
          0%,100% { box-shadow: 0 0 0 3px rgba(239,68,68,0.5), 0 0 30px rgba(239,68,68,0.15) }
          50%      { box-shadow: 0 0 0 6px rgba(239,68,68,0.3), 0 0 50px rgba(239,68,68,0.25) }
        }
        .gcash-qr-img { display: block; width: 200px; height: 200px; border-radius: 6px; }

        /* Corner decorators */
        .gcash-qr-corner {
          position: absolute;
          width: 18px; height: 18px;
          border-color: #00a94f; border-style: solid;
        }
        .gcash-qr-corner-tl { top: 6px; left: 6px; border-width: 3px 0 0 3px; border-radius: 4px 0 0 0; }
        .gcash-qr-corner-tr { top: 6px; right: 6px; border-width: 3px 3px 0 0; border-radius: 0 4px 0 0; }
        .gcash-qr-corner-bl { bottom: 6px; left: 6px; border-width: 0 0 3px 3px; border-radius: 0 0 0 4px; }
        .gcash-qr-corner-br { bottom: 6px; right: 6px; border-width: 0 3px 3px 0; border-radius: 0 0 4px 0; }

        /* Timer */
        .gcash-timer-row {
          display: flex; align-items: center; gap: 12px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          padding: 10px 16px;
          width: 100%;
        }
        .gcash-timer-row.gcash-timer-urgent { border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.05); }
        .gcash-timer-label {
          display: flex; align-items: center; gap: 4px;
          color: rgba(255,255,255,0.55); font-size: 11px; margin: 0;
        }
        .gcash-timer-hint { color: rgba(255,255,255,0.35); font-size: 10.5px; margin: 3px 0 0; }

        /* Waiting badge */
        .gcash-waiting-badge {
          display: flex; align-items: center; gap: 8px;
          color: rgba(0,200,120,0.9); font-size: 12px; font-weight: 500;
        }
        .gcash-waiting-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: #00c878;
          animation: gcash-blink 1.2s ease-in-out infinite;
        }
        @keyframes gcash-blink {
          0%,100% { opacity: 1; transform: scale(1) }
          50%      { opacity: 0.4; transform: scale(0.7) }
        }

        /* Success state */
        .gcash-qr-paid { padding: 30px 0; }
        .gcash-success-icon-ring {
          width: 96px; height: 96px;
          background: rgba(0,169,79,0.12);
          border: 2px solid rgba(0,169,79,0.4);
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          animation: gcash-success-pop 0.5s cubic-bezier(0.34,1.56,0.64,1);
        }
        @keyframes gcash-success-pop {
          from { transform: scale(0); opacity: 0 }
          to   { transform: scale(1); opacity: 1 }
        }
        .gcash-success-icon { color: #00c878; }
        .gcash-paid-title { color: #fff; font-size: 22px; font-weight: 700; margin: 0; }
        .gcash-paid-sub {
          font-size: 16px; font-weight: 600; margin: 4px 0 0;
          background: linear-gradient(135deg, #00d964, #00a94f);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .gcash-paid-note { color: rgba(255,255,255,0.4); font-size: 12px; margin: 8px 0 0; }

        /* Error/Expired state */
        .gcash-qr-error { padding: 30px 0; }
        .gcash-error-icon-ring {
          width: 80px; height: 80px;
          background: rgba(239,68,68,0.1);
          border: 2px solid rgba(239,68,68,0.3);
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
        }
        .gcash-error-icon { color: #f87171; }
        .gcash-error-title { color: #fff; font-size: 18px; font-weight: 700; margin: 0; }
        .gcash-error-sub { color: rgba(255,255,255,0.45); font-size: 13px; text-align: center; max-width: 280px; margin: 4px 0 0; }
        .gcash-regen-btn {
          display: flex; align-items: center; gap: 8px;
          background: linear-gradient(135deg, #00c878, #00a94f);
          color: #fff; border: none; border-radius: 10px;
          padding: 10px 22px; font-size: 13.5px; font-weight: 600;
          cursor: pointer; margin-top: 8px;
          transition: opacity 0.2s, transform 0.2s;
        }
        .gcash-regen-btn:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
        .gcash-regen-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Steps */
        .gcash-steps {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px;
          padding: 14px;
        }
        .gcash-steps-title {
          display: flex; align-items: center; gap: 6px;
          color: rgba(255,255,255,0.55); font-size: 11px;
          text-transform: uppercase; letter-spacing: 0.07em;
          margin: 0 0 10px;
        }
        .gcash-step-item {
          display: flex; align-items: center; gap: 8px;
          padding: 5px 0;
        }
        .gcash-step-num {
          width: 22px; height: 22px; border-radius: 50%;
          background: rgba(0,169,79,0.2); border: 1px solid rgba(0,169,79,0.4);
          color: #00c878; font-size: 11px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .gcash-step-arrow { color: rgba(255,255,255,0.2); flex-shrink: 0; }
        .gcash-step-text { color: rgba(255,255,255,0.65); font-size: 12.5px; }

        /* Footer */
        .gcash-modal-footer {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 20px 16px;
          border-top: 1px solid rgba(255,255,255,0.06);
          gap: 12px;
        }
        .gcash-modal-footer-center { justify-content: center; }
        .gcash-download-btn {
          display: flex; align-items: center; gap: 6px;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.7);
          border-radius: 8px; padding: 7px 14px;
          font-size: 12px; font-weight: 500; cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .gcash-download-btn:hover { background: rgba(255,255,255,0.12); color: #fff; }
        .gcash-footer-note {
          display: flex; align-items: center; gap: 5px;
          color: rgba(255,255,255,0.3); font-size: 10px;
          flex: 1; text-align: right; justify-content: flex-end;
        }
        .gcash-close-success-btn {
          display: flex; align-items: center; gap: 8px;
          background: linear-gradient(135deg, #00c878, #00a94f);
          color: #fff; border: none; border-radius: 10px;
          padding: 12px 36px; font-size: 14px; font-weight: 600;
          cursor: pointer; transition: opacity 0.2s;
        }
        .gcash-close-success-btn:hover { opacity: 0.9; }
      `}</style>
    </div>
  );
}
