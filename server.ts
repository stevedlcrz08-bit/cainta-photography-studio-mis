import express from "express";
import path from "path";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";

import nodemailer from "nodemailer";

import os from "os";
import fs from "fs/promises";
import crypto from "crypto";
import { v2 as cloudinary } from "cloudinary";

// Load environment variables
dotenv.config();

// ─── Cloudinary configuration ───────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});
const USE_CLOUDINARY = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

import { db } from "./src/db/database.ts";
import { buildBookingReceiptPDF, buildPrintOrderReceiptPDF } from "./src/utils/pdfGenerator.ts";
import { UserRole, Booking, Payment, PrintOrder, AuditLog, Notification, Review, Studio, StudioService, StudioPackage, PackageAddon, ChatbotFAQ, PhotoProofingGallery, MediaFile, StudioAvailability, AvailabilityBlackout } from "./src/db/types.ts";

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

// ── Global safety nets — prevent any unhandled rejection from crashing the process ──
process.on("unhandledRejection", (reason: any) => {
  console.error("[Server] Unhandled Promise Rejection (caught by safety net):", reason?.message || reason);
});
process.on("uncaughtException", (err: any) => {
  console.error("[Server] Uncaught Exception (caught by safety net):", err?.message || err);
});
const authSessions = new Map<string, { userId: string; expiresAt: number }>();
const passwordResetTokens = new Map<string, { userId: string; email: string; expiresAt: number }>();
const passwordResetOtps = new Map<string, { userId: string; email: string; otpHash: string; expiresAt: number; attempts: number }>();
const emailVerificationTokens = new Map<string, { userId: string; email: string; expiresAt: number }>();
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
const isServerless = !!(process.env.VERCEL || process.env.FUNCTION_TARGET || process.env.K_SERVICE || process.env.FIREBASE_CONFIG);
const MEDIA_ROOT = isServerless ? path.join(os.tmpdir(), "protected-media") : path.join(process.cwd(), "protected-media");
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ? process.env.GOOGLE_CLIENT_ID.trim() : "";

async function verifyGoogleIdToken(credential: string) {
  if (!credential || !credential.includes(".")) {
    throw new Error("Invalid Google credential format.");
  }

  const tokenInfoUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
  const response = await fetch(tokenInfoUrl);
  if (!response.ok) {
    throw new Error("Google identity token could not be verified.");
  }

  const payload: any = await response.json();
  if (!payload?.email || !payload?.sub || !payload?.name) {
    throw new Error("Google identity payload is incomplete.");
  }

  if (GOOGLE_CLIENT_ID && payload.aud && payload.aud !== GOOGLE_CLIENT_ID) {
    throw new Error("Google client configuration mismatch.");
  }

  if (!["accounts.google.com", "https://accounts.google.com"].includes(payload.iss || "")) {
    throw new Error("Google token issuer mismatch.");
  }

  return {
    email: String(payload.email).trim().toLowerCase(),
    fullName: String(payload.name || payload.email.split("@")[0]).trim(),
    googleId: String(payload.sub),
    picture: String(payload.picture || "")
  };
}

type ChatbotFaqSuggestion = {
  id: string;
  question: string;
  answer: string;
  studioId: string;
  category: string;
  frequency: number;
  createdAt: string;
  lastSeenAt: string;
  source: "chatbot";
};

const faqSuggestionStore = new Map<string, ChatbotFaqSuggestion>();

function normalizeFaqQuestion(question: string): string {
  return question.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function looksLikeQuestion(question: string): boolean {
  const normalized = question.trim().toLowerCase();
  return normalized.includes("?") || /\b(what|where|when|why|how|who|can|could|is|are|do|does|which|will|should|booking|book|price|payment|cost|studio)\b/.test(normalized);
}

function rememberFaqSuggestion(question: string, answer: string, studioId?: string): void {
  if (!question || !answer) return;
  if (!looksLikeQuestion(question)) return;

  const normalized = normalizeFaqQuestion(question);
  if (!normalized) return;

  const now = new Date().toISOString();
  const existing = faqSuggestionStore.get(normalized);
  if (existing) {
    existing.answer = answer;
    existing.frequency += 1;
    existing.lastSeenAt = now;
    existing.studioId = existing.studioId || studioId || "GLOBAL";
    return;
  }

  if (faqSuggestionStore.size > 500) {
    const oldestKey = Array.from(faqSuggestionStore.keys()).sort((a, b) => {
      const aa = faqSuggestionStore.get(a)!;
      const bb = faqSuggestionStore.get(b)!;
      return new Date(aa.lastSeenAt).getTime() - new Date(bb.lastSeenAt).getTime();
    })[0];
    if (oldestKey) faqSuggestionStore.delete(oldestKey);
  }

  faqSuggestionStore.set(normalized, {
    id: generateId("SUG"),
    question: question.trim(),
    answer: answer.trim(),
    studioId: studioId || "GLOBAL",
    category: "Suggested",
    frequency: 1,
    createdAt: now,
    lastSeenAt: now,
    source: "chatbot"
  });
}

// ── SSE Client Registry (real-time payment confirmations) ────────────────────
const sseClients = new Map<string, Set<express.Response>>();
function broadcastSSE(userId: string, data: Record<string, any>): void {
  const clients = sseClients.get(userId);
  if (!clients || clients.size === 0) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try { client.write(payload); } catch { clients.delete(client); }
  }
}

function checkLoginRateLimit(key: string): { allowed: boolean; waitMinutes?: number } {
  const now = Date.now();
  const attempt = loginAttempts.get(key);
  if (attempt && attempt.lockedUntil > now) {
    const waitMinutes = Math.ceil((attempt.lockedUntil - now) / 60000);
    return { allowed: false, waitMinutes };
  }
  return { allowed: true };
}

function recordLoginFailure(key: string): number {
  const now = Date.now();
  const attempt = loginAttempts.get(key) || { count: 0, lockedUntil: 0 };
  attempt.count += 1;
  const failureCount = attempt.count;
  if (attempt.count >= 5) {
    attempt.lockedUntil = now + 15 * 60 * 1000; // 15 min lockout
    attempt.count = 0;
  }
  loginAttempts.set(key, attempt);
  return failureCount;
}

function clearLoginAttempts(key: string) {
  loginAttempts.delete(key);
}

// Do not serve requests against the pre-hydration in-memory database.
app.use(async (_req, _res, next) => {
  await db.waitUntilReady();
  next();
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});

// Restrict browser access to configured frontend origins and add baseline API headers.
app.use((req, res, next) => {
  const configuredOrigins = (process.env.FRONTEND_ORIGINS || "http://localhost:3000")
    .split(",").map(origin => origin.trim()).filter(Boolean);
  const requestOrigin = req.header("Origin");
  
  const isOriginAllowed = !requestOrigin || 
    configuredOrigins.includes("*") || 
    configuredOrigins.includes(requestOrigin) ||
    configuredOrigins.some(pattern => pattern.startsWith("*.") && requestOrigin.endsWith(pattern.slice(1))) ||
    (process.env.NODE_ENV !== "production" && requestOrigin.startsWith("http://localhost"));

  if (requestOrigin && isOriginAllowed) {
    res.header("Access-Control-Allow-Origin", requestOrigin);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Vary", "Origin");
  }
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("X-Content-Type-Options", "nosniff");
  res.header("X-Frame-Options", "DENY");
  res.header("Referrer-Policy", "same-origin");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// ── IMPORTANT: Webhook route needs raw body for HMAC signature verification ──
// This MUST be registered BEFORE express.json() so the raw buffer is preserved.
app.post("/api/webhooks/paymongo", express.raw({ type: "application/json" }), async (req, res) => {
  // ── [Anti-Fraud Layer 2] HMAC-SHA256 webhook signature verification ──────
  const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET || "";
  const signatureHeader = (req.headers["paymongo-signature"] as string) || "";

  if (!webhookSecret || !signatureHeader) {
    console.warn("[GCash Webhook] Rejected: missing signature or webhook secret not configured.");
    return res.status(400).json({ error: "Missing signature" });
  }

  const rawBody = req.body as Buffer;
  const expectedSig = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");

  // PayMongo sends the signature as a plain hex string in the Paymongo-Signature header.
  // Use timing-safe comparison to prevent timing-based attacks.
  let sigValid = false;
  try {
    const expectedBuf = Buffer.from(expectedSig, "hex");
    const actualBuf   = Buffer.from(signatureHeader.trim(), "hex");
    // timingSafeEqual requires identical byte lengths; if lengths differ the
    // header is definitely wrong — no need to compare.
    if (expectedBuf.length === actualBuf.length && expectedBuf.length > 0) {
      sigValid = crypto.timingSafeEqual(expectedBuf, actualBuf);
    }
  } catch {
    sigValid = false;
  }
  if (!sigValid) {
    console.warn("[GCash Webhook] REJECTED — invalid HMAC signature. Possible spoofed request.");
    return res.status(401).json({ error: "Invalid signature" });
  }

  // Parse body after verification
  let event: any;
  try {
    event = JSON.parse(rawBody.toString());
  } catch {
    return res.status(400).json({ error: "Invalid JSON payload" });
  }

  // ── [Anti-Fraud Layer 3] Idempotency guard — prevent replay attacks ──────
  const eventId = event?.data?.id || event?.id || "";
  if (!eventId) {
    console.warn("[GCash Webhook] Missing event ID — rejecting.");
    return res.status(400).json({ error: "Missing event ID" });
  }

  // Acknowledge receipt immediately (PayMongo expects 2xx within 30s)
  res.status(200).json({ received: true });

  // Process asynchronously after responding
  setImmediate(async () => {
    try {
      // Check if already processed (idempotency)
      const [existing] = await db.pool.execute(
        "SELECT event_id FROM webhook_events WHERE event_id = ?",
        [eventId]
      );
      if ((existing as any[]).length > 0) {
        console.log(`[GCash Webhook] Skipped — event ${eventId} already processed.`);
        return;
      }

      const eventType = event?.data?.attributes?.type || event?.type || "unknown";
      const paymentIntentId = event?.data?.attributes?.data?.attributes?.payment_intent_id
        || event?.data?.attributes?.payment_intent_id
        || event?.data?.attributes?.data?.id
        || "";
      const gatewayAmount = event?.data?.attributes?.data?.attributes?.amount
        || event?.data?.attributes?.amount || 0; // in centavos
      const gatewayAmountPHP = gatewayAmount / 100;

      console.log(`[GCash Webhook] Processing event: ${eventType} (${eventId}), intent: ${paymentIntentId}`);

      if (eventType === "payment.paid" || eventType === "source.chargeable") {
        // Find the QR session linked to this payment intent
        const [sessions] = await db.pool.execute(
          "SELECT * FROM gcash_qr_sessions WHERE gateway_payment_intent_id = ? AND status = 'pending' LIMIT 1",
          [paymentIntentId]
        );
        const sessionRows = sessions as any[];

        if (sessionRows.length === 0) {
          // Try by source ID as fallback
          console.warn(`[GCash Webhook] No pending session found for intent: ${paymentIntentId}`);
          await db.pool.execute(
            "INSERT INTO webhook_events (event_id, gateway, event_type, raw_payload) VALUES (?, 'paymongo', ?, ?)",
            [eventId, eventType, JSON.stringify(event).substring(0, 65535)]
          );
          return;
        }

        const session = sessionRows[0];

        // ── [Anti-Fraud Layer 4] Amount integrity verification ────────────
        if (Math.abs(gatewayAmountPHP - Number(session.amount)) > 0.01) {
          console.error(
            `[GCash FRAUD ALERT] Amount mismatch! Gateway: ₱${gatewayAmountPHP}, Session: ₱${session.amount}, Session: ${session.id}`
          );
          // Mark session as suspicious and log; do NOT credit payment
          await db.pool.execute(
            "UPDATE gcash_qr_sessions SET status = 'failed', webhook_event_id = ? WHERE id = ?",
            [eventId, session.id]
          );
          await db.pool.execute(
            "INSERT INTO webhook_events (event_id, gateway, event_type, session_id, raw_payload) VALUES (?, 'paymongo', 'FRAUD_AMOUNT_MISMATCH', ?, ?)",
            [eventId, session.id, JSON.stringify(event).substring(0, 65535)]
          );
          // Flag the payment with suspicious fraud score
          if (session.payment_id) {
            await db.pool.execute(
              "UPDATE payments SET fraud_score = -1 WHERE id = ?",
              [session.payment_id]
            );
          }
          return;
        }

        // ── All checks passed — process the payment ───────────────────────
        const paidAt = new Date().toISOString();
        const gatewayTransactionId = event?.data?.attributes?.data?.id ||
          event?.data?.attributes?.payment_intent_id || eventId;
        const fraudScore = event?.data?.attributes?.data?.attributes?.risk_score ?? null;

        // 1. Update QR session
        await db.pool.execute(
          "UPDATE gcash_qr_sessions SET status = 'paid', paid_at = ?, webhook_event_id = ? WHERE id = ?",
          [paidAt, eventId, session.id]
        );

        // 2. Create or update booking payment record.
        // GCash QR is confirmed directly by the payment gateway — no manual
        // studio verification step needed. Mark the payment as 'Paid' right
        // away so that syncBookingPaymentTotals / the inline recalculation
        // below will immediately confirm the booking.
        let paymentId = session.payment_id;
        if (session.booking_id && !paymentId) {
          paymentId = `PAY-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
          await db.pool.execute(
            `INSERT INTO payments
              (id, gcash_session_id, booking_id, studio_id, customer_id, amount, payment_type,
               payment_method, payment_status, reference_number, gateway_transaction_id,
               fraud_score, payment_channel, payment_date, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'GCash', 'Paid', ?, ?, ?, 'gcash_qr', NOW(), NOW())`,
            [
              paymentId, session.id, session.booking_id, session.studio_id,
              session.customer_id, session.amount, session.payment_type,
              gatewayTransactionId, gatewayTransactionId, fraudScore
            ]
          );
          await db.pool.execute(
            "UPDATE gcash_qr_sessions SET payment_id = ? WHERE id = ?",
            [paymentId, session.id]
          );
          // Sync in-memory payments array so the recalculation below sees the new record
          db.payments.push({
            id: paymentId,
            bookingId: session.booking_id,
            studioId: session.studio_id,
            customerId: session.customer_id,
            amount: Number(session.amount),
            paymentType: (session.payment_type as any) || "Downpayment",
            paymentMethod: "GCash",
            paymentStatus: "Paid",
            referenceNumber: gatewayTransactionId,
            paymentDate: paidAt,
            createdAt: paidAt,
            gcashSessionId: session.id,
            gatewayTransactionId,
            fraudScore,
            paymentChannel: "gcash_qr"
          } as any);
        } else if (session.booking_id) {
          await db.pool.execute(
            `UPDATE payments SET payment_status = 'Paid', gateway_transaction_id = ?,
              fraud_score = ?, payment_channel = 'gcash_qr' WHERE id = ?`,
            [gatewayTransactionId, fraudScore, paymentId]
          );
          // Sync in-memory record
          const existingPayIdx = db.payments.findIndex(p => p.id === paymentId);
          if (existingPayIdx !== -1) {
            db.payments[existingPayIdx] = {
              ...db.payments[existingPayIdx],
              paymentStatus: "Paid",
              gatewayTransactionId,
              fraudScore,
              paymentChannel: "gcash_qr"
            } as any;
          }
        } else if (session.print_order_id) {
          // Print orders are cash-only at pickup — GCash QR sessions should never
          // reference a print_order_id. Log and skip to avoid writing a defunct status.
          console.warn(`[GCash Webhook] Unexpected print_order_id on QR session ${session.id} — print orders are cash-only. Skipping.`);
        }

        // 3. Sync booking payment totals if this is a booking payment
        if (session.booking_id) {
          const bookingRow = db.bookings.find(b => b.id === session.booking_id);
          if (bookingRow) {
            // Reload from DB
            const [rows] = await db.pool.execute(
              "SELECT * FROM payments WHERE booking_id = ?",
              [session.booking_id]
            );
            const allPayments = rows as any[];
            const verifiedTotal = allPayments
              .filter(p => p.payment_status === "Paid")
              .reduce((s, p) => s + Number(p.amount), 0);

            const newAmountPaid = Math.min(bookingRow.totalAmount, verifiedTotal);
            const newBalance = Math.max(0, bookingRow.totalAmount - newAmountPaid);
            const newPaymentStatus = newBalance === 0 ? "Paid" :
              newAmountPaid >= bookingRow.downPaymentAmount ? "Partially Paid" : "Unpaid";
            const newBookingStatus =
              newBalance === 0 || newAmountPaid >= bookingRow.downPaymentAmount ? "Confirmed" : bookingRow.status;

            await db.pool.execute(
              `UPDATE bookings SET amount_paid = ?, remaining_balance = ?, payment_status = ?,
                final_payment_status = ?, status = ? WHERE id = ?`,
              [
                newAmountPaid, newBalance, newPaymentStatus,
                newBalance === 0 ? "Paid" : "Pending",
                newBookingStatus, session.booking_id
              ]
            );

            // Refresh in-memory db
            const idx = db.bookings.findIndex(b => b.id === session.booking_id);
            if (idx !== -1) {
              db.bookings[idx] = {
                ...db.bookings[idx],
                amountPaid: newAmountPaid,
                remainingBalance: newBalance,
                paymentStatus: newPaymentStatus as any,
                finalPaymentStatus: newBalance === 0 ? "Paid" : "Pending",
                status: newBookingStatus as any,
              };
            }

            // 4. Notify customer + studio
            const booking = db.bookings.find(b => b.id === session.booking_id)!;
            const studio = db.studios.find(s => s.id === session.studio_id);
            const studioName = studio?.name || "Studio";
            const typeLabel = session.payment_type === "Downpayment" ? "Downpayment" : "Final Payment";

            notifyUser(
              session.customer_id,
              `GCash Payment Confirmed — ${typeLabel}`,
              `Your GCash payment of ₱${Number(session.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })} for ${studioName} has been confirmed instantly via QR Ph. Booking: ${session.booking_id}.`,
              "success",
              session.studio_id
            );
            notifyUser(
              db.users.find(u => u.studioId === session.studio_id)?.id || "",
              `GCash Payment Received — ${typeLabel}`,
              `₱${Number(session.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })} GCash QR payment received for Booking ${session.booking_id}. ${session.payment_type === "Downpayment" ? "Booking confirmed." : "Fully paid."}`,
              "success",
              session.studio_id
            );

            // Email notification
            const customer = db.customers.find(c => c.id === session.customer_id);
            if (customer?.email) {
              sendEmailNotification(
                customer.email,
                `GCash Payment Confirmed — ${typeLabel}`,
                `Your GCash QR payment of ₱${Number(session.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })} for your booking at ${studioName} has been confirmed automatically. No receipt upload needed!\n\nBooking ID: ${session.booking_id}\nPayment ID: ${paymentId}\nGateway Ref: ${gatewayTransactionId}`,
                "success"
              );
            }
          }
        }

        // 5. Log idempotency record
        await db.pool.execute(
          "INSERT INTO webhook_events (event_id, gateway, event_type, payment_id, session_id, raw_payload) VALUES (?, 'paymongo', ?, ?, ?, ?)",
          [eventId, eventType, paymentId, session.id, JSON.stringify(event).substring(0, 65535)]
        );

        // 6. Broadcast SSE to any connected frontend clients
        broadcastSSE(session.customer_id, {
          type: "GCASH_PAYMENT_CONFIRMED",
          sessionId: session.id,
          paymentId,
          bookingId: session.booking_id,
          amount: session.amount,
          paidAt
        });

        console.log(`[GCash Webhook] ✅ Payment confirmed: ${paymentId} for session ${session.id}`);
      }
    } catch (err: any) {
      console.error("[GCash Webhook] Processing error:", err?.message || err);
    }
  });
});

// Enable JSON parser with enough room for an 8 MB base64 media payload.
app.use(express.json({ limit: "12mb" }));
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ success: false, message: "The file is too large. Please select a file that is 8 MB or smaller." });
  }
  next(err);
});


// Public reads are intentionally narrow. Every other API request must authenticate.
app.use((req, res, next) => {
  if (!req.path.startsWith("/api/")) return next();
  const publicApi = [
    /^\/api\/auth\/(login|register|forgot-password|verify-reset-otp|reset-password|verify-email|google)$/,
    /^\/api\/studios\/?$/,
    /^\/api\/studios\/[^/]+$/,
    /^\/api\/reviews\/?$/,
    /^\/api\/categories\/?$/,
    /^\/api\/cms\/?$/,
    /^\/api\/custom-pages\/?$/,
    /^\/api\/media\/[^/]+$/,
    /^\/api\/services\/?$/,
    /^\/api\/packages\/?$/,
    /^\/api\/addons\/?$/,
    /^\/api\/print-products\/?$/,
    /^\/api\/system\/audio\/?$/,
    /^\/api\/system\/demo-video\/?$/,
    /^\/api\/chatbot\/faqs\/?$/,
    /^\/api\/chatbot\/message\/?$/,
    // GCash webhook is public (auth via HMAC signature, not session token)
    /^\/api\/webhooks\/paymongo$/
  ];
  const isPublicRead = req.method === "GET" && publicApi.some(pattern => pattern.test(req.path));
  const isPublicChatbotMessage = req.method === "POST" && /^\/api\/chatbot\/message\/?$/.test(req.path);
  if (isPublicRead || publicApi.some(pattern => pattern.test(req.path) && req.path.startsWith("/api/auth/")) || isPublicChatbotMessage) {
    return next();
  }
  if (!getAuthenticatedUser(req)) {
    return res.status(401).json({ success: false, message: "Authentication is required." });
  }
  next();
});

// ----------------------------------------------------
// SMTP EMAIL NOTIFICATION TRANSPORTER SETUP
// Works on Render (root .env) and Firebase Functions (functions/.env)
// Gmail requires: 2FA enabled + App Password generated in Google Account
// Firebase Functions (Blaze plan) allows outbound SMTP on port 587/465.
// ----------------------------------------------------
const smtpEmail = (process.env.SMTP_EMAIL || "").trim();
const smtpPassword = (process.env.SMTP_APP_PASSWORD || "").trim().replace(/\s+/g, "");
// Optional: custom SMTP host/port for non-Gmail providers (e.g. SendGrid, Mailgun)
const smtpHost = (process.env.SMTP_HOST || "smtp.gmail.com").trim();
const smtpPort = parseInt(process.env.SMTP_PORT || "465", 10);
const smtpSecure = process.env.SMTP_SECURE !== "false"; // default true (SSL/TLS)
// Display name shown in email From header
const smtpFromName = (process.env.EMAIL_FROM_NAME || "Cainta Photography Studio MIS").replace(/^"|"$/g, "").trim();

let mailTransporter: nodemailer.Transporter | null = null;

function createMailTransporter(): nodemailer.Transporter | null {
  if (!smtpEmail || !smtpPassword) {
    console.log("[SMTP] Notice: SMTP_EMAIL or SMTP_APP_PASSWORD not set — email disabled.");
    return null;
  }
  // Use explicit host/port instead of service shorthand to ensure compatibility
  // across all Node.js environments including Firebase Functions serverless containers.
  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,         // true = TLS on port 465; false = STARTTLS on 587
    auth: {
      user: smtpEmail,
      pass: smtpPassword
    },
    tls: {
      // Do not fail on self-signed certs (cloud environments sometimes use them)
      rejectUnauthorized: false
    }
  } as nodemailer.TransportOptions);
}

if (smtpEmail && smtpPassword) {
  mailTransporter = createMailTransporter();
  if (mailTransporter) {
    mailTransporter.verify((error) => {
      if (error) {
        console.warn("[SMTP] Email transport verification failed:", error.message);
        console.warn("[SMTP] Hint: ensure SMTP_EMAIL and SMTP_APP_PASSWORD are correct.");
        console.warn("[SMTP] For Gmail: enable 2FA and generate an App Password at myaccount.google.com.");
        console.warn("[SMTP] For Firebase Functions: set vars with 'firebase functions:config:set' or in functions/.env");
      } else {
        console.log(`[SMTP] ✅ Email notifications active — sender: ${smtpFromName} <${smtpEmail}> via ${smtpHost}:${smtpPort}`);
      }
    });
  }
} else {
  console.log("[SMTP] Notice: SMTP credentials not fully configured in .env");
}

// Rich HTML Email Dispatcher (High-End Luxury Studio Design)
async function sendEmailNotification(
  toEmail: string, 
  title: string, 
  message: string, 
  type: "info" | "success" | "warning" | "error" = "info",
  actionUrl?: string,
  actionLabel?: string,
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>
) {
  // Lazy re-init: in serverless environments the transporter may not have been
  // created at cold-start if env vars are injected after module load.
  if (!mailTransporter && smtpEmail && smtpPassword) {
    mailTransporter = createMailTransporter();
  }
  if (!mailTransporter || !smtpEmail) {
    console.log(`[SMTP Simulated] Email to ${toEmail}: [${title}] ${message}`);
    return;
  }

  const typeConfig: Record<string, { badge: string; badgeBg: string; badgeColor: string; accentGrad: string; icon: string }> = {
    success: {
      badge: "VERIFIED UPDATE",
      badgeBg: "#ecfdf5",
      badgeColor: "#059669",
      accentGrad: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
      icon: "✓"
    },
    warning: {
      badge: "ACTION REQUIRED",
      badgeBg: "#fffbeb",
      badgeColor: "#d97706",
      accentGrad: "linear-gradient(135deg, #d97706 0%, #f59e0b 100%)",
      icon: "⚡"
    },
    error: {
      badge: "ATTENTION",
      badgeBg: "#fef2f2",
      badgeColor: "#dc2626",
      accentGrad: "linear-gradient(135deg, #dc2626 0%, #ef4444 100%)",
      icon: "!"
    },
    info: {
      badge: "STUDIO NOTIFICATION",
      badgeBg: "#f5f3ef",
      badgeColor: "#78716c",
      accentGrad: "linear-gradient(135deg, #1c1917 0%, #292524 100%)",
      icon: "✦"
    }
  };

  const config = typeConfig[type] || typeConfig.info;
  const currentYear = new Date().getFullYear();
  const dateFormatted = new Date().toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f6f5f1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1c1917;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f6f5f1; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Email Container -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 580px; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.06); border: 1px solid #e7e5e0;">
          
          <!-- Header Banner (Luxury Dark Obsidian & Gold Accent) -->
          <tr>
            <td style="background: #181615; padding: 36px 32px 30px; text-align: center; border-bottom: 2px solid #d97706;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <!-- Logo / Badge Emblem -->
                    <div style="display: inline-block; background: #262322; border: 1px solid #3e3a37; border-radius: 16px; padding: 10px 18px; margin-bottom: 16px;">
                      <span style="color: #f59e0b; font-size: 16px; margin-right: 6px;">📷</span>
                      <span style="color: #faf9f6; font-size: 12px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase;">Cainta Photography MIS</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <p style="margin: 0; color: #a8a29e; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; font-weight: 600;">
                      Centralized Photography Studio Network &bull; Rizal
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content Area -->
          <tr>
            <td style="padding: 36px 32px 28px;">
              <!-- Type Badge -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom: 18px;">
                <tr>
                  <td style="background-color: ${config.badgeBg}; border: 1px solid ${config.badgeColor}22; border-radius: 30px; padding: 5px 14px;">
                    <span style="color: ${config.badgeColor}; font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">
                      ${config.icon} ${config.badge}
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Main Title -->
              <h1 style="margin: 0 0 16px 0; color: #1c1917; font-size: 20px; font-weight: 800; line-height: 1.35; letter-spacing: -0.3px;">
                ${title}
              </h1>

              <!-- Message Callout Card -->
              <div style="background-color: #faf9f6; border: 1px solid #e7e5e0; border-left: 4px solid #d97706; border-radius: 14px; padding: 20px 22px; margin-bottom: 24px;">
                <p style="margin: 0; color: #44403c; font-size: 14px; line-height: 1.65;">
                  ${message}
                </p>
              </div>

              <!-- Metadata Summary Box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #fdfdfc; border: 1px solid #f0ede6; border-radius: 14px; padding: 14px 18px; margin-bottom: 28px;">
                <tr>
                  <td style="font-size: 11px; color: #78716c; padding: 4px 0;">
                    <strong style="color: #1c1917;">Timestamp:</strong> ${dateFormatted}
                  </td>
                  <td align="right" style="font-size: 11px; color: #78716c; padding: 4px 0;">
                    <strong style="color: #1c1917;">Status:</strong> <span style="color: #059669; font-weight: 700;">Verified System Transaction</span>
                  </td>
                </tr>
              </table>

              <!-- Optional CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${actionUrl || 'http://localhost:3000'}" style="display: inline-block; background-color: #1c1917; color: #ffffff; text-decoration: none; font-size: 12px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; padding: 14px 32px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.12);">
                      ${actionLabel || 'Access Studio MIS Portal →'}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <div style="border-top: 1px solid #f0ede6;"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px 32px; text-align: center; background-color: #faf9f6;">
              <p style="margin: 0 0 6px 0; font-size: 11px; color: #78716c; font-weight: 600;">
                Cainta Photography Studio Management Information System
              </p>
              <p style="margin: 0 0 12px 0; font-size: 10px; color: #a8a29e; line-height: 1.5;">
                Town Center &bull; Felix Avenue &bull; Valley Golf &bull; Imelda Avenue &bull; Cainta, Rizal<br/>
                This is an automated notification. Please do not reply directly to this email.
              </p>
              <p style="margin: 0; font-size: 10px; color: #d6d3d1;">
                &copy; ${currentYear} Cainta Photography Studio MIS. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  try {
    await mailTransporter.sendMail({
      from: `"${smtpFromName}" <${smtpEmail}>`,
      to: toEmail,
      subject: `[Cainta Photography] ${title}`,
      text: `${title}\n\n${message}\n\nTimestamp: ${dateFormatted}\n\n-- Cainta Photography Studio MIS`,
      html: htmlContent,
      attachments: attachments?.map(item => ({
        filename: item.filename,
        content: item.content,
        contentType: item.contentType || "application/octet-stream"
      }))
    });
    console.log(`[SMTP] Successfully delivered email notification to ${toEmail} for: "${title}"`);
  } catch (err: any) {
    console.error(`[SMTP] Failed to send email to ${toEmail}:`, err?.message || err);
  }
}

// Helper to generate unique IDs
const generateId = (prefix: string) => `${prefix}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

function createAuthToken(userId: string): string {
  const token = `${generateId("SESSION")}-${Math.random().toString(36).slice(2)}`;
  authSessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function getAuthenticatedUser(req: express.Request) {
  const header = req.header("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const session = token ? authSessions.get(token) : undefined;
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    authSessions.delete(token);
    return null;
  }
  const userId = session.userId;
  const user = db.users.find(item => item.id === userId) || db.customers.find(customer => customer.id === userId) || null;
  if (user && getStudioAccountStatus(user) !== null && getStudioAccountStatus(user) !== "approved") {
    authSessions.delete(token);
    return null;
  }
  return user;
}

function requireAuthenticatedUser(req: express.Request, res: express.Response) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ success: false, message: "Authentication is required." });
    return null;
  }
  return user;
}

function requireRole(req: express.Request, res: express.Response, ...roles: UserRole[]) {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return null;
  if (!roles.includes(user.role as UserRole)) {
    res.status(403).json({ success: false, message: "You do not have permission to perform this action." });
    return null;
  }
  return user;
}

function getStudioAccountStatus(user: any): "approved" | "pending" | "rejected" | "suspended" | null {
  if (user.role !== UserRole.STUDIO_ADMIN) return null;
  const studio = db.studios.find(item => item.id === user.studioId || item.ownerId === user.id);
  if (!studio) return "pending";
  if (studio.status === "suspended") return "suspended";
  if (studio.status === "rejected") return "rejected";
  return studio.isApproved || studio.status === "approved" ? "approved" : "pending";
}

function requireStudioAccess(req: express.Request, res: express.Response, studioId: string) {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return null;
  if (user.role === UserRole.SUPER_ADMIN) return user;
  const studioUser = "studioId" in user ? user : null;
  if (!studioUser || ![UserRole.STUDIO_ADMIN, UserRole.STUDIO_STAFF].includes(user.role as UserRole) || studioUser.studioId !== studioId) {
    res.status(403).json({ success: false, message: "You do not have access to this studio." });
    return null;
  }
  return user;
}

function requireStudioOwner(req: express.Request, res: express.Response, studioId: string) {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return null;
  if (user.role !== UserRole.STUDIO_ADMIN) {
    res.status(403).json({ success: false, message: "Only the studio owner can manage this studio's availability." });
    return null;
  }
  const studio = db.studios.find(item => item.id === studioId);
  if (!studio || studio.ownerId !== user.id) {
    res.status(403).json({ success: false, message: "Only the studio owner can manage this studio's availability." });
    return null;
  }
  return user;
}

function requireBookingAccess(req: express.Request, res: express.Response, booking: Booking, allowStudio = true) {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return null;
  const ownsBooking = user.role === UserRole.CUSTOMER && booking.customerId === user.id;
  const studioUser = "studioId" in user ? user : null;
  const managesStudio = allowStudio && [UserRole.SUPER_ADMIN, UserRole.STUDIO_ADMIN, UserRole.STUDIO_STAFF].includes(user.role as UserRole) &&
    (user.role === UserRole.SUPER_ADMIN || studioUser?.studioId === booking.studioId);
  if (!ownsBooking && !managesStudio) {
    res.status(403).json({ success: false, message: "You do not have access to this booking." });
    return null;
  }
  return user;
}

function canManageStudioPayment(user: any, studioId: string): boolean {
  const studio = db.studios.find(item => item.id === studioId);
  return user.role === UserRole.STUDIO_ADMIN &&
    user.studioId === studioId &&
    studio?.ownerId === user.id;
}

function publicUser(user: any, authToken: string) {
  const { passwordHash, ...safeUser } = user;
  return { ...safeUser, authToken };
}

function expireUnpaidBooking(booking: Booking): boolean {
  if (!booking.paymentDueAt || !["Pending", "Awaiting Payment"].includes(booking.status)) return false;
  if (booking.amountPaid >= booking.downPaymentAmount || new Date(booking.paymentDueAt) > new Date()) return false;
  booking.status = "Expired";
  db.save();
  notifyUser(booking.customerId, "Booking Payment Hold Expired", `Booking ${booking.id} expired because the downpayment was not received before the payment deadline.`, "error", booking.studioId);
  return true;
}

// Logger helper
function logAction(userId: string, email: string, action: string, entityType: string, entityId: string) {
  const log: AuditLog = {
    id: generateId("LOG"),
    userId,
    userEmail: email,
    action,
    entityType,
    entityId,
    timestamp: new Date().toISOString()
  };
  db.addAuditLog(log);
}

// System-wide Notifications helper (Creates in-app notification + Sends SMTP email)
function notifyUser(userId: string, title: string, message: string, type: "info" | "success" | "warning" | "error" = "info", studioId?: string) {
  const notif: Notification = {
    id: generateId("NOTIF"),
    userId,
    studioId,
    title,
    message,
    isRead: false,
    type,
    createdAt: new Date().toISOString()
  };
  db.addNotification(notif);

  // Automatically lookup user / customer email and trigger real-time SMTP dispatch
  const recipient = db.users.find(u => u.id === userId) || db.customers.find(c => c.id === userId);
  if (recipient && recipient.email) {
    sendEmailNotification(recipient.email, title, message, type).catch(err => {
      console.warn("[SMTP] Notification email dispatch warning:", err);
    });
  }
}

async function sendReceiptCopyEmail(
  customerEmail: string,
  title: string,
  message: string,
  fileName: string,
  pdfBuffer: Buffer
) {
  await sendEmailNotification(
    customerEmail,
    title,
    message,
    "success",
    undefined,
    undefined,
    [{ filename: fileName, content: pdfBuffer, contentType: "application/pdf" }]
  );
}

function parseMediaData(value: unknown): { mimeType: string; bytes: Buffer } | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^data:((?:image\/(?:jpeg|png|webp)|application\/pdf|video\/(?:mp4|webm|quicktime|x-matroska|x-msvideo)));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;

  const mimeType = match[1];
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) return null;

  if (mimeType.startsWith("video/")) {
    return { mimeType, bytes };
  }

  const hasSignature = mimeType === "image/jpeg"
    ? bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    : mimeType === "image/png"
      ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : mimeType === "image/webp"
        ? bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP"
        : bytes.subarray(0, 5).toString("ascii") === "%PDF-";

  if (!hasSignature) return null;
  return { mimeType, bytes };
}

function reconcileStudioBrandingMedia(studioId: string) {
  const studioIndex = db.studios.findIndex(item => item.id === studioId);
  if (studioIndex === -1) return;

  const media = db.mediaFiles.filter(item =>
    item.entityType === "studio" &&
    item.entityId === studioId &&
    item.accessStatus === "active" &&
    (item.purpose === "STUDIO_LOGO" || item.purpose === "STUDIO_COVER")
  );

  const latestByPurpose = new Map<string, string>();
  for (const item of media) {
    if (!latestByPurpose.has(item.purpose)) {
      // If storageKey is a Cloudinary URL use it directly (CDN, permanent).
      // Otherwise fall back to the proxied /api/media/:id route.
      const url = item.storageKey.startsWith("https://")
        ? item.storageKey
        : `/api/media/${item.id}`;
      latestByPurpose.set(item.purpose, url);
    }
  }

  if (latestByPurpose.has("STUDIO_LOGO")) db.studios[studioIndex].logo = latestByPurpose.get("STUDIO_LOGO") || db.studios[studioIndex].logo;
  if (latestByPurpose.has("STUDIO_COVER")) db.studios[studioIndex].coverImage = latestByPurpose.get("STUDIO_COVER") || db.studios[studioIndex].coverImage;
}

async function saveProtectedMedia(ownerId: string, entityType: string, entityId: string, purpose: string, value: unknown, originalName?: string) {
  const parsed = parseMediaData(value);
  if (!parsed) return null;

  // Bug 2 fix: wrap the entire storage + DB-write path in a try/catch so that
  // Cloudinary API errors, local fs.writeFile failures, or mysqlInsert errors
  // return null (which every caller converts to a 400) rather than propagating
  // as an unhandled rejection that Express turns into a 500 with no client message.
  try {
  const mediaId = generateId("MEDIA");
  const extension = parsed.mimeType === "application/pdf" ? "pdf" : parsed.mimeType.split("/")[1];
  const storageKey = `${mediaId}.${extension}`;
  let cloudinaryUrl: string | undefined;

  if (USE_CLOUDINARY) {
    // Upload buffer to Cloudinary as a data URI — permanent, survives server restarts
    const dataUri = `data:${parsed.mimeType};base64,${parsed.bytes.toString("base64")}`;
    const resourceType = parsed.mimeType.startsWith("video/") ? "video"
      : parsed.mimeType === "application/pdf" ? "raw"
      : "image";
    const uploadResult = await cloudinary.uploader.upload(dataUri, {
      public_id: mediaId,
      folder: "cainta-mis",
      resource_type: resourceType,
      overwrite: false,
    });
    cloudinaryUrl = uploadResult.secure_url;
  } else {
    // Fallback: write to local disk (development / no Cloudinary configured)
    await fs.mkdir(MEDIA_ROOT, { recursive: true });
    await fs.writeFile(path.join(MEDIA_ROOT, storageKey), parsed.bytes, { flag: "wx" });
  }

  const media: MediaFile = {
    id: mediaId,
    ownerId,
    entityType,
    entityId,
    purpose,
    originalName,
    mimeType: parsed.mimeType,
    sizeBytes: parsed.bytes.length,
    checksum: crypto.createHash("sha256").update(parsed.bytes).digest("hex"),
    // storageKey holds either the Cloudinary secure URL (permanent) or the local filename
    storageKey: cloudinaryUrl ?? storageKey,
    accessStatus: "active",
    createdAt: new Date().toISOString()
  };
  db.addMediaFile(media);
  if (entityType === "studio") {
    reconcileStudioBrandingMedia(entityId);
    await db.save();
  }
  // Return the final public URL: Cloudinary CDN URL if uploaded there, otherwise the /api/media proxy
  const mediaUrl = cloudinaryUrl ?? `/api/media/${mediaId}`;
  return { mediaId, mimeType: media.mimeType, size: media.sizeBytes, url: mediaUrl };
  } catch (err: any) {
    console.error("[saveProtectedMedia] Storage error:", err?.message || err);
    return null;
  }
}

function canAccessMedia(user: any, media: { ownerId: string; entityType: string; entityId: string }) {
  if (user.role === UserRole.SUPER_ADMIN || user.id === media.ownerId) return true;
  if (media.entityType === "payment") {
    const payment = db.payments.find(item => item.id === media.entityId);
    const booking = payment ? db.bookings.find(item => item.id === payment.bookingId) : undefined;
    return !!payment && !!booking && ((user.role === UserRole.CUSTOMER && payment.customerId === user.id) ||
      ([UserRole.STUDIO_ADMIN, UserRole.STUDIO_STAFF].includes(user.role) && user.studioId === payment.studioId));
  }
  if (media.entityType === "studio") {
    const studio = db.studios.find(item => item.id === media.entityId);
    return !!studio && (user.studioId === studio.id || user.id === studio.ownerId);
  }
  if (media.entityType === "print-order") {
    const order = db.printOrders.find(item => item.id === media.entityId);
    return !!order && ((user.role === UserRole.CUSTOMER && order.customerId === user.id) ||
      ([UserRole.STUDIO_ADMIN, UserRole.STUDIO_STAFF].includes(user.role) && user.studioId === order.studioId));
  }
  if (media.entityType === "photo-proofing") {
    const gallery = db.photoProofings.find(item => item.id === media.entityId);
    return !!gallery && ((user.role === UserRole.CUSTOMER && gallery.customerId === user.id) ||
      ([UserRole.STUDIO_ADMIN, UserRole.STUDIO_STAFF].includes(user.role) && user.studioId === gallery.studioId) ||
      user.role === UserRole.SUPER_ADMIN);
  }
  if (media.entityType === "service") {
    const service = db.services.find(item => item.id === media.entityId);
    return !!service && ([UserRole.STUDIO_ADMIN, UserRole.STUDIO_STAFF].includes(user.role) && user.studioId === service.studioId);
  }
  if (media.entityType === "package") {
    const pkg = db.packages.find(item => item.id === media.entityId);
    return !!pkg && ([UserRole.STUDIO_ADMIN, UserRole.STUDIO_STAFF].includes(user.role) && user.studioId === pkg.studioId);
  }
  if (media.entityType === "addon") {
    const addon = db.addons.find(item => item.id === media.entityId);
    return !!addon && ([UserRole.STUDIO_ADMIN, UserRole.STUDIO_STAFF].includes(user.role) && user.studioId === addon.studioId);
  }
  return false;
}

app.post("/api/media", async (req, res) => {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;
  const { entityType, entityId, purpose, fileData, originalName } = req.body;
  if (!entityType || !entityId || !purpose || !fileData) {
    return res.status(400).json({ success: false, message: "entityType, entityId, purpose, and fileData are required." });
  }
  if ((String(purpose) === "HERO_BACKGROUND" || String(purpose) === "SYSTEM_DEMO_VIDEO") &&
    (user.role !== UserRole.SUPER_ADMIN || String(entityType) !== (String(purpose) === "HERO_BACKGROUND" ? "cms" : "system") || String(entityId) !== (String(purpose) === "HERO_BACKGROUND" ? "heroBackground" : "demo-video"))) {
    return res.status(403).json({ success: false, message: "Only a superadmin can upload this protected media." });
  }
  const media = await saveProtectedMedia(user.id, String(entityType), String(entityId), String(purpose), fileData, originalName);
  if (!media) return res.status(400).json({ success: false, message: "The file type or size is not supported." });
  const mediaUrl = media.url;
  if (String(purpose) === "HERO_BACKGROUND" && String(entityType) === "cms" && String(entityId) === "heroBackground") {
    const cmsIndex = db.cmsSettings.findIndex(setting => setting.key === "heroBackground");
    if (cmsIndex >= 0) {
      db.cmsSettings[cmsIndex].value = mediaUrl;
    } else {
      db.cmsSettings.push({ id: "heroBackground", key: "heroBackground", value: mediaUrl });
    }
    await db.save();
  }
  res.json({ success: true, media, url: mediaUrl });
});

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// Auth Endpoints
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required." });
  }

  const rateLimitKey = `${req.ip || "local"}:${String(email).toLowerCase()}`;
  const rateLimit = checkLoginRateLimit(rateLimitKey);
  if (!rateLimit.allowed) {
    return res.status(429).json({ 
      success: false, 
      message: `Too many failed login attempts. Account temporarily locked. Please try again in ${rateLimit.waitMinutes} minute(s).` 
    });
  }

  // Check across users (admins & studio admins) and customers table
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase()) ||
               db.customers.find(c => c.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    recordLoginFailure(rateLimitKey);
    return res.status(401).json({ success: false, message: "Invalid email or password" });
  }

  // Pure bcrypt password validation
  let isPasswordValid = false;
  try {
    if (user.passwordHash.startsWith("$2a$") || user.passwordHash.startsWith("$2b$")) {
      isPasswordValid = bcrypt.compareSync(password, user.passwordHash);
    }
  } catch {
    isPasswordValid = false;
  }

  if (!isPasswordValid) {
    const failureCount = recordLoginFailure(rateLimitKey);
    if (failureCount === 3 || failureCount === 5) {
      notifyUser(
        user.id,
        "Multiple Failed Login Attempts",
        `We detected ${failureCount} unsuccessful login attempts for your account. If this was not you, change your password immediately and contact support.`,
        "error"
      );
    }
    return res.status(401).json({ success: false, message: "Invalid email or password" });
  }

  const studioAccountStatus = getStudioAccountStatus(user);
  if (studioAccountStatus && studioAccountStatus !== "approved") {
    const messages = {
      pending: "Your studio registration is awaiting Super Admin approval. You cannot access the Studio Portal yet.",
      rejected: "Your studio registration was rejected. Please contact the Super Admin for more information.",
      suspended: "Your studio account is suspended. Please contact the Super Admin."
    };
    return res.status(403).json({ success: false, message: messages[studioAccountStatus] });
  }

  clearLoginAttempts(rateLimitKey);
  const authToken = createAuthToken(user.id);
  res.json({ success: true, user: publicUser(user, authToken) });
});

app.post("/api/auth/google", async (req, res) => {
  const credential = typeof req.body?.credential === "string" ? req.body.credential.trim() : "";
  if (!credential) {
    return res.status(400).json({ success: false, message: "Missing Google credential." });
  }

  try {
    if (!GOOGLE_CLIENT_ID) {
      return res.status(500).json({ success: false, message: "Google client ID is not configured on the server." });
    }

    const googleIdentity = await verifyGoogleIdToken(credential);
    const normalizedEmail = googleIdentity.email;

    const existingUser = db.users.find(u => u.email.toLowerCase() === normalizedEmail) ||
      db.customers.find(c => c.email.toLowerCase() === normalizedEmail);

    if (existingUser) {
      existingUser.fullName = existingUser.fullName || googleIdentity.fullName;
      existingUser.email = normalizedEmail;
      (existingUser as any).authProvider = "google";
      (existingUser as any).googleId = googleIdentity.googleId;
      if (googleIdentity.picture) (existingUser as any).picture = googleIdentity.picture;

      const authToken = createAuthToken(existingUser.id);
      db.save();
      return res.json({ success: true, user: publicUser(existingUser, authToken) });
    }

    const customer: any = {
      id: generateId("CUST"),
      email: normalizedEmail,
      passwordHash: bcrypt.hashSync(`${Date.now()}-${crypto.randomUUID()}-google-social`, 10),
      fullName: googleIdentity.fullName,
      role: UserRole.CUSTOMER,
      contactNumber: "",
      address: "",
      authProvider: "google",
      googleId: googleIdentity.googleId,
      picture: googleIdentity.picture,
      createdAt: new Date().toISOString()
    };

    db.addCustomer(customer);
    const authToken = createAuthToken(customer.id);
    return res.json({ success: true, user: publicUser(customer, authToken) });
  } catch (error: any) {
    console.error("[Google Login]", error?.message || error);
    return res.status(401).json({ success: false, message: "Google authentication failed." });
  }
});

app.get("/api/auth/session", (req, res) => {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;
  const token = req.header("Authorization")?.slice(7).trim() || "";
  res.json({ success: true, user: publicUser(user, token) });
});

app.post("/api/auth/forgot-password", async (req, res) => {
  const normalizedEmail = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
    return res.status(400).json({ success: false, message: "A valid email address is required." });
  }

  const user = db.users.find(u => u.email.toLowerCase() === normalizedEmail) ||
               db.customers.find(c => c.email.toLowerCase() === normalizedEmail);

  if (user) {
    const otp = String(crypto.randomInt(100000, 1000000)).padStart(6, "0");
    const expiresAt = Date.now() + 10 * 60 * 1000;
    passwordResetOtps.set(normalizedEmail, {
      userId: user.id,
      email: user.email,
      otpHash: crypto.createHash("sha256").update(otp).digest("hex"),
      expiresAt,
      attempts: 0
    });
    await sendEmailNotification(
      user.email,
      "Your Password Reset OTP",
      `We received a request to reset your Cainta Photography Studio MIS password. Your one-time verification code is <strong>${otp}</strong>. This code expires in 10 minutes. If you did not make this request, you can safely ignore this email.`,
      "warning",
    );
    notifyUser(user.id, "Password Reset OTP Dispatched", "A password reset verification code has been sent to your email address.", "info");
    logAction(user.id, user.email, "Requested password reset", "USER", user.id);
  }

  // Always return success to prevent email enumeration
  res.json({ 
    success: true, 
    message: "If an account matches that email address, a password reset OTP has been sent." 
  });
});

app.post("/api/auth/verify-reset-otp", (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const otp = typeof req.body.otp === "string" ? req.body.otp.trim() : "";

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ success: false, message: "A valid email address is required." });
  }

  if (!otp || otp.length < 6) {
    return res.status(400).json({ success: false, message: "A valid 6-digit OTP is required." });
  }

  const resetRecord = passwordResetOtps.get(email);
  if (!resetRecord || resetRecord.expiresAt <= Date.now()) {
    passwordResetOtps.delete(email);
    return res.status(400).json({ success: false, message: "The OTP is invalid or has expired. Request a new OTP." });
  }

  resetRecord.attempts += 1;
  if (resetRecord.attempts > 5) {
    passwordResetOtps.delete(email);
    return res.status(400).json({ success: false, message: "Too many OTP attempts. Please request a fresh OTP." });
  }

  const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(otpHash), Buffer.from(resetRecord.otpHash))) {
    const attemptsLeft = 5 - resetRecord.attempts;
    if (attemptsLeft <= 0) {
      passwordResetOtps.delete(email);
      return res.status(400).json({ success: false, message: "Too many OTP attempts. Please request a fresh OTP." });
    }
    return res.status(400).json({ success: false, message: `Invalid OTP. ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} remaining.` });
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  passwordResetTokens.set(resetToken, {
    userId: resetRecord.userId,
    email: resetRecord.email,
    expiresAt: Date.now() + 15 * 60 * 1000
  });
  passwordResetOtps.delete(email);
  res.json({ success: true, resetToken });
});

app.post("/api/auth/reset-password", (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || typeof token !== "string" || !token.trim()) {
    return res.status(400).json({ success: false, message: "A valid verification token is required." });
  }

  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
    return res.status(400).json({ success: false, message: "A password with at least 6 characters is required." });
  }

  const resetRecord = passwordResetTokens.get(token);
  if (!resetRecord || resetRecord.expiresAt <= Date.now()) {
    passwordResetTokens.delete(token);
    return res.status(400).json({ success: false, message: "Password reset link is invalid or has expired." });
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  let updated = false;

  const uIndex = db.users.findIndex(u => u.id === resetRecord.userId);
  if (uIndex !== -1) {
    db.users[uIndex].passwordHash = hashedPassword;
    updated = true;
  } else {
    const cIndex = db.customers.findIndex(c => c.id === resetRecord.userId);
    if (cIndex !== -1) {
      db.customers[cIndex].passwordHash = hashedPassword;
      updated = true;
    }
  }

  if (!updated) {
    return res.status(404).json({ success: false, message: "User account not found." });
  }

  passwordResetTokens.delete(token);
  db.save();

  // Invalidate any active sessions for security
  for (const [sToken, session] of authSessions.entries()) {
    if (session.userId === resetRecord.userId) {
      authSessions.delete(sToken);
    }
  }

  logAction(resetRecord.userId, resetRecord.email, "Reset account password", "USER", resetRecord.userId);
  notifyUser(resetRecord.userId, "Password Reset Successful", "Your password has been changed successfully. You can now log in with your new credentials.", "success");

  res.json({ success: true, message: "Password has been successfully reset. Please log in with your new password." });
});

app.post("/api/auth/verify-email", (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ success: false, message: "Verification token is required." });
  }

  const record = emailVerificationTokens.get(token);
  if (!record || record.expiresAt <= Date.now()) {
    emailVerificationTokens.delete(token);
    return res.status(400).json({ success: false, message: "Email verification link is invalid or has expired." });
  }

  emailVerificationTokens.delete(token);
  res.json({ success: true, message: "Email verified successfully." });
});

app.post("/api/auth/logout", (req, res) => {
  const header = req.header("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token) authSessions.delete(token);
  res.json({ success: true });
});

app.put("/api/auth/account", (req, res) => {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;
  const { fullName, email, contactNumber, address, currentPassword, newPassword } = req.body;
  if (!String(fullName || "").trim() || !String(email || "").trim()) {
    return res.status(400).json({ success: false, message: "Full name and email are required." });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const duplicate = [...db.users, ...db.customers].find(item => item.id !== user.id && item.email.toLowerCase() === normalizedEmail);
  if (duplicate) return res.status(400).json({ success: false, message: "Email is already registered." });

  const changingPassword = Boolean(newPassword);
  if (changingPassword) {
    if (typeof newPassword !== "string" || newPassword.length < 6 || !currentPassword) {
      return res.status(400).json({ success: false, message: "Current password and a new password of at least 6 characters are required." });
    }
    if (!bcrypt.compareSync(currentPassword, user.passwordHash)) {
      return res.status(400).json({ success: false, message: "Current password is incorrect." });
    }
  }

  const updates: any = { fullName: String(fullName).trim(), email: String(email).trim(), contactNumber: contactNumber || "", address: address || "" };
  if (changingPassword) updates.passwordHash = bcrypt.hashSync(newPassword, 10);
  const target = user.role === UserRole.CUSTOMER ? db.customers.find(item => item.id === user.id) : db.users.find(item => item.id === user.id);
  if (!target) return res.status(404).json({ success: false, message: "Account not found." });
  Object.assign(target, updates);

  let authToken = req.header("Authorization")?.slice(7).trim() || "";
  if (changingPassword) {
    for (const [token, session] of authSessions.entries()) {
      if (session.userId === user.id) authSessions.delete(token);
    }
    authToken = createAuthToken(user.id);
  }
  db.save();
  logAction(user.id, target.email, "Updated account credentials", "USER", user.id);
  res.json({ success: true, user: publicUser(target, authToken) });
});

app.post("/api/auth/register", async (req, res) => {
  const { email, password, fullName, contactNumber, address, role, studioName, studioAddress, latitude, longitude, businessPermit, validId, otherDocs } = req.body;

  if (!email || !password || !fullName) {
    return res.status(400).json({ success: false, message: "Required fields are missing." });
  }

  // Check both users and customers tables to prevent duplicate email registration
  const existingInUsers = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  const existingInCustomers = db.customers.find(c => c.email.toLowerCase() === email.toLowerCase());
  if (existingInUsers || existingInCustomers) {
    return res.status(400).json({ success: false, message: "Email is already registered." });
  }

  const targetRole = role === UserRole.STUDIO_ADMIN ? UserRole.STUDIO_ADMIN : UserRole.CUSTOMER;
  const userId = generateId(targetRole === "CUSTOMER" ? "CUST" : "U");
  let studioId: string | undefined;

  // Securely hash user password with bcrypt
  const hashedPassword = bcrypt.hashSync(password, 10);

  // If registering as a Customer -> Insert into separate dedicated customers table
  if (targetRole === "CUSTOMER") {
    const newCustomer = {
      id: userId,
      email,
      passwordHash: hashedPassword,
      fullName,
      role: "CUSTOMER" as const,
      contactNumber,
      address,
      createdAt: new Date().toISOString()
    };

    db.addCustomer(newCustomer);
    logAction(userId, email, `Registered customer account in customers table`, "CUSTOMER", userId);

    const authToken = createAuthToken(newCustomer.id);
    return res.json({ success: true, user: publicUser(newCustomer, authToken) });
  }

  // If registering as a Studio Admin, we create their pending studio and save to users table
  if (targetRole === UserRole.STUDIO_ADMIN) {
    studioId = generateId("ST");
    const newStudio: Studio = {
      id: studioId,
      name: studioName || `${fullName}'s Photography Studio`,
      ownerId: userId,
      logo: "",
      coverImage: "",
      location: studioAddress || "Cainta, Rizal",
      rating: 5.0,
      reviewCount: 0,
      startingPrice: 1000,
      categories: ["Portrait Photography"],
      description: "Welcome to our newly registered photography studio! Complete our profile setup to list services, customizable packages, and receive instant bookings.",
      address: studioAddress || address || "Cainta, Rizal",
      contactInfo: contactNumber || "+63 900 000 0000",
      email: email,
      businessHours: "09:00 AM - 06:00 PM",
      isApproved: false,
      status: "pending",
      printingAvailable: true,
      latitude: Number.isFinite(Number(latitude)) ? Number(latitude) : undefined,
      longitude: Number.isFinite(Number(longitude)) ? Number(longitude) : undefined,
      businessPermit: undefined,
      validId: undefined,
      otherDocs: undefined,
      createdAt: new Date().toISOString()
    };
    const documentMedia: Array<{ purpose: string; value: string; name: string }> = [
      { purpose: "BUSINESS_PERMIT", value: businessPermit, name: "business-permit" },
      { purpose: "OWNER_VALID_ID", value: validId, name: "owner-valid-id" },
      { purpose: "SUPPORTING_DOCUMENT", value: otherDocs, name: "supporting-document" }
    ];
    // Create the real owner first so addStudio() does not synthesize a fallback owner.
    const newUser = {
      id: userId,
      email,
      passwordHash: hashedPassword,
      fullName,
      role: targetRole as UserRole,
      studioId,
      contactNumber,
      address,
      createdAt: new Date().toISOString()
    };
    db.addUser(newUser);
    db.addStudio(newStudio);
    for (const document of documentMedia) {
      if (document.value) {
        const media = await saveProtectedMedia(userId, "studio", studioId, document.purpose, document.value, document.name);
        if (media) (newStudio as any)[document.purpose === "BUSINESS_PERMIT" ? "businessPermit" : document.purpose === "OWNER_VALID_ID" ? "validId" : "otherDocs"] = `/api/media/${media.mediaId}`;
      }
    }
    await db.save();
    logAction(userId, email, `Registered new photography studio: ${newStudio.name}`, "STUDIO", studioId);
    
    // Notify super admin
    db.users.filter(u => u.role === UserRole.SUPER_ADMIN).forEach(admin => {
      notifyUser(admin.id, "New Studio Registration", `Studio '${newStudio.name}' has registered and is pending verification.`, "warning");
    });
  }

  res.json({
    success: true,
    message: "Registration submitted successfully. Please wait for Super Admin approval before signing in to the Studio Portal."
  });
});

// CMS Content Management Endpoints
app.get("/api/cms", (req, res) => {
  const cmsMap: { [key: string]: string } = {};
  db.cmsSettings.forEach(s => {
    cmsMap[s.key] = s.value;
  });
  res.json({ success: true, cms: cmsMap });
});

app.post("/api/cms", (req, res) => {
  if (!requireRole(req, res, UserRole.SUPER_ADMIN)) return;
  const updates = req.body;
  if (!updates || typeof updates !== "object") {
    return res.status(400).json({ success: false, message: "Invalid payload." });
  }

  for (const [key, value] of Object.entries(updates)) {
    const stringVal = String(value);
    const index = db.cmsSettings.findIndex(s => s.key === key);
    if (index !== -1) {
      db.cmsSettings[index].value = stringVal;
    } else {
      db.cmsSettings.push({
        id: key,
        key: key,
        value: stringVal
      });
    }
  }

  db.save();
  logAction("system", "system@cainta-mis.com", "Updated system content settings (CMS)", "SYSTEM", "CMS");
  res.json({ success: true, message: "CMS settings updated successfully.", cms: db.cmsSettings });
});

// System Settings (Theme, colors, feature toggles, nav visibility)
app.get("/api/admin/settings", (req, res) => {
  if (!requireRole(req, res, UserRole.SUPER_ADMIN)) return;
  res.json({ success: true, settings: db.systemSettings });
});

app.post("/api/admin/settings", (req, res) => {
  if (!requireRole(req, res, UserRole.SUPER_ADMIN)) return;
  const updates = req.body;
  if (!updates) {
    return res.status(400).json({ success: false, message: "Invalid payload." });
  }
  db.updateSystemSettings(updates);
  logAction("system", "system@cainta-mis.com", "Updated system settings & UI config", "SYSTEM", "SETTINGS");
  res.json({ success: true, settings: db.systemSettings });
});

// The approved audio is public read-only configuration. Only the endpoint above can change it.
app.get("/api/system/audio", (_req, res) => {
  res.json({
    success: true,
    audioUrl: db.systemSettings.customAudioUrl || "",
    isEnabled: db.systemSettings.isSoundEnabled && db.systemSettings.customAudioEnabled !== false
  });
});

app.get("/api/system/demo-video", (_req, res) => {
  const demoVideo = db.mediaFiles.find(item =>
    item.entityType === "system" &&
    item.entityId === "demo-video" &&
    item.purpose === "SYSTEM_DEMO_VIDEO" &&
    item.accessStatus === "active"
  );

  res.json({
    success: true,
    demoVideoUrl: demoVideo ? `/api/media/${demoVideo.id}` : (db.systemSettings.demoVideoUrl || "")
  });
});

// SMTP Status & Test Email Dispatch Endpoint
app.get("/api/admin/smtp-status", (req, res) => {
  if (!requireRole(req, res, UserRole.SUPER_ADMIN)) return;
  res.json({
    success: true,
    isConfigured: !!(smtpEmail && smtpPassword),
    senderEmail: smtpEmail || "Not configured",
    smtpHost,
    smtpPort,
    smtpSecure,
    fromName: smtpFromName,
    service: smtpHost === "smtp.gmail.com" ? "Gmail SMTP" : smtpHost
  });
});

app.post("/api/admin/send-test-email", async (req, res) => {
  if (!requireRole(req, res, UserRole.SUPER_ADMIN)) return;
  const { toEmail } = req.body;
  const targetEmail = toEmail || smtpEmail;

  if (!targetEmail) {
    return res.status(400).json({ success: false, message: "No recipient email address specified." });
  }

  if (!mailTransporter || !smtpEmail) {
    return res.status(500).json({
      success: false,
      message: "SMTP is not active. Please check SMTP_EMAIL and SMTP_APP_PASSWORD in .env."
    });
  }

  try {
    await sendEmailNotification(
      targetEmail,
      "Test Notification from Cainta Photography MIS",
      "Congratulations! Your Gmail SMTP configuration is fully operational. Real-time booking confirmations, payment approvals, studio applications, and client proofing notifications will now be delivered to your inbox automatically.",
      "success"
    );
    res.json({
      success: true,
      message: `Test email notification successfully sent to ${targetEmail} via Gmail SMTP!`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `SMTP error: ${err?.message || "Failed to dispatch email"}` });
  }
});

// Custom Pages Builder Endpoints
app.get("/api/custom-pages", (req, res) => {
  if (req.method !== "GET" && !requireRole(req, res, UserRole.SUPER_ADMIN)) return;
  res.json({ success: true, pages: db.customPages });
});

app.post("/api/custom-pages", (req, res) => {
  if (!requireRole(req, res, UserRole.SUPER_ADMIN)) return;
  const { title, slug, isPublished, showInNavbar, blocks } = req.body;
  if (!title || !slug) {
    return res.status(400).json({ success: false, message: "Title and slug are required." });
  }
  const newPage = {
    id: generateId("PAGE"),
    title,
    slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    isPublished: isPublished !== undefined ? isPublished : true,
    showInNavbar: showInNavbar !== undefined ? showInNavbar : true,
    blocks: blocks || [],
    createdAt: new Date().toISOString()
  };
  db.customPages.push(newPage);
  db.save();
  logAction("system", "system@cainta-mis.com", `Created custom page: ${title}`, "PAGE", newPage.id);
  res.json({ success: true, page: newPage });
});

app.put("/api/custom-pages/:id", (req, res) => {
  if (!requireRole(req, res, UserRole.SUPER_ADMIN)) return;
  const index = db.customPages.findIndex(p => p.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Custom page not found." });
  }
  const updated = {
    ...db.customPages[index],
    ...req.body
  };
  db.customPages[index] = updated;
  db.save();
  logAction("system", "system@cainta-mis.com", `Updated custom page: ${updated.title}`, "PAGE", updated.id);
  res.json({ success: true, page: updated });
});

app.delete("/api/custom-pages/:id", (req, res) => {
  if (!requireRole(req, res, UserRole.SUPER_ADMIN)) return;
  const index = db.customPages.findIndex(p => p.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Custom page not found." });
  }
  const removed = db.customPages.splice(index, 1)[0];
  db.save();
  logAction("system", "system@cainta-mis.com", `Deleted custom page: ${removed.title}`, "PAGE", removed.id);
  res.json({ success: true, message: "Custom page deleted successfully." });
});

// Admin-Only Direct Studio Owner Registration
app.post("/api/admin/register-studio", async (req, res) => {
  if (!requireRole(req, res, UserRole.SUPER_ADMIN)) return;
  const { 
    email, password, fullName, contactNumber, userAddress,
    studioName, description, categories, startingPrice, businessHours,
    address, location, latitude, longitude, businessPermit, validId, otherDocs
  } = req.body;

  if (!email || !password || !fullName || !studioName) {
    return res.status(400).json({ success: false, message: "Required fields are missing." });
  }

  const existing = db.users.find(u => u.email.toLowerCase() === email.toLowerCase()) ||
                   db.customers.find(c => c.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return res.status(400).json({ success: false, message: "Email is already registered." });
  }

  const userId = generateId("U");
  const studioId = generateId("ST");
  const hashedPassword = bcrypt.hashSync(password, 10);

  // 1. Create registered studio
  const newStudio: Studio = {
    id: studioId,
    name: studioName,
    ownerId: userId,
    logo: "",
    coverImage: "",
    location: location || "Cainta, Rizal",
    rating: 5.0,
    reviewCount: 0,
    startingPrice: Number(startingPrice) || 1000,
    categories: Array.isArray(categories) ? categories : ["Portrait Photography"],
    description: description || "Centralized photography studio.",
    address: address || userAddress || "Cainta, Rizal",
    contactInfo: contactNumber || "+63 900 000 0000",
    email: email,
    businessHours: businessHours || "09:00 AM - 06:00 PM",
    isApproved: true,
    status: "approved",
    printingAvailable: true,
    latitude: latitude !== undefined ? Number(latitude) : undefined,
    longitude: longitude !== undefined ? Number(longitude) : undefined,
    businessPermit: undefined,
    validId: undefined,
    otherDocs: undefined,
    registeredByAdmin: true,
    createdAt: new Date().toISOString()
  };

  const documentMedia: Array<{ purpose: string; value: string; name: string }> = [
    { purpose: "BUSINESS_PERMIT", value: businessPermit, name: "business-permit" },
    { purpose: "OWNER_VALID_ID", value: validId, name: "owner-valid-id" },
    { purpose: "SUPPORTING_DOCUMENT", value: otherDocs, name: "supporting-document" }
  ];

  // 2. Create registered user
  const newUser = {
    id: userId,
    email,
    passwordHash: hashedPassword,
    fullName,
    role: UserRole.STUDIO_ADMIN,
    studioId,
    contactNumber,
    address: userAddress,
    createdAt: new Date().toISOString()
  };

  db.addStudio(newStudio);
  db.addUser(newUser);
  for (const document of documentMedia) {
    if (document.value) {
      const media = await saveProtectedMedia(userId, "studio", studioId, document.purpose, document.value, document.name);
      if (media) (newStudio as any)[document.purpose === "BUSINESS_PERMIT" ? "businessPermit" : document.purpose === "OWNER_VALID_ID" ? "validId" : "otherDocs"] = `/api/media/${media.mediaId}`;
    }
  }
  await db.save();
  
  logAction("system", "system@cainta-mis.com", `Directly registered and verified studio owner account: ${email} for studio ${studioName}`, "STUDIO", studioId);
  notifyUser(userId, "Welcome to Cainta Studio Network", `Your studio '${studioName}' has been directly registered and approved by the Super Admin.`, "success", studioId);

  res.json({ success: true, message: "Studio and owner registered successfully by admin.", user: newUser, studio: newStudio });
});

// Admin-Only Direct Generic User Creation (Customer, Studio Staff, Super Admin)
app.post("/api/admin/create-user", (req, res) => {
  if (!requireRole(req, res, UserRole.SUPER_ADMIN)) return;
  const { email, password, fullName, contactNumber, address, role, studioId } = req.body;

  if (!email || !password || !fullName || !role) {
    return res.status(400).json({ success: false, message: "Email, password, name, and role are required." });
  }

  const existingInUsers = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  const existingInCustomers = db.customers.find(c => c.email.toLowerCase() === email.toLowerCase());
  if (existingInUsers || existingInCustomers) {
    return res.status(400).json({ success: false, message: "Email is already registered." });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  if (role === "CUSTOMER") {
    const userId = generateId("CUST");
    const newCustomer = {
      id: userId,
      email,
      passwordHash: hashedPassword,
      fullName,
      role: "CUSTOMER" as const,
      contactNumber,
      address,
      createdAt: new Date().toISOString()
    };
    db.addCustomer(newCustomer);
    logAction("system", "system@cainta-mis.com", `Admin created customer user account: ${email}`, "CUSTOMER", userId);
    return res.json({ success: true, message: "Customer account created successfully.", user: newCustomer });
  } else {
    const userId = generateId("U");
    const newUser = {
      id: userId,
      email,
      passwordHash: hashedPassword,
      fullName,
      role: role as UserRole,
      studioId: studioId || undefined,
      contactNumber,
      address,
      createdAt: new Date().toISOString()
    };
    db.addUser(newUser);
    logAction("system", "system@cainta-mis.com", `Admin created user account (${role}): ${email}`, "USER", userId);
    return res.json({ success: true, message: `User account (${role}) created successfully.`, user: newUser });
  }
});

// Studio Endpoints
app.get("/api/studios", (req, res) => {
  // Only approved studios appear publicly, unless a super-admin wants all, or we supply query param
  const { includePending } = req.query;
  if (includePending === "true") {
    if (!requireRole(req, res, UserRole.SUPER_ADMIN)) return;
    return res.json({ success: true, studios: db.studios });
  }
  const approved = db.studios.filter(s => s.status === "approved" || s.isApproved);
  res.json({ success: true, studios: approved });
});

app.get("/api/studios/:id", (req, res) => {
  const studio = db.studios.find(s => s.id === req.params.id);
  if (!studio) {
    return res.status(404).json({ success: false, message: "Studio not found" });
  }
  reconcileStudioBrandingMedia(studio.id);
  if (!studio.isApproved && studio.status !== "approved") {
    const user = requireRole(req, res, UserRole.SUPER_ADMIN, UserRole.STUDIO_ADMIN);
    if (!user || (user.role === UserRole.STUDIO_ADMIN && user.studioId !== studio.id)) return;
  }
  // Load related information
  const services = db.services.filter(s => s.studioId === studio.id && s.isActive);
  const packages = db.packages.filter(p => p.studioId === studio.id && p.isActive);
  const addons = db.addons.filter(a => a.studioId === studio.id);
  const reviews = db.reviews.filter(r => r.studioId === studio.id);
  const printProducts = db.printProducts.filter(p => p.studioId === studio.id && p.isActive);

  res.json({
    success: true,
    studio,
    services,
    packages,
    addons,
    reviews,
    printProducts
  });
});

app.post("/api/studios", (req, res) => {
  if (!requireRole(req, res, UserRole.SUPER_ADMIN)) return;
  const studioId = generateId("ST");
  const newStudio: Studio = {
    id: studioId,
    ...req.body,
    rating: 5.0,
    reviewCount: 0,
    isApproved: false,
    status: "pending",
    createdAt: new Date().toISOString()
  };
  db.addStudio(newStudio);
  res.json({ success: true, studio: newStudio });
});

app.put("/api/studios/:id", async (req, res) => {
  const index = db.studios.findIndex(s => s.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Studio not found." });
  }
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;
  const isOwnerOrAdmin = user.role === UserRole.SUPER_ADMIN || 
                         (user.role === UserRole.STUDIO_ADMIN && (user.studioId === req.params.id || db.studios[index].ownerId === user.id));
  if (!isOwnerOrAdmin) {
    return res.status(403).json({ success: false, message: "You cannot update this studio." });
  }
  const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;
  const ownerFields = [
    "name", "logo", "coverImage", "location", "categories", "description", "address",
    "contactInfo", "email", "businessHours", "printingAvailable", "latitude", "longitude",
    "startingPrice", "blockedDates"
  ];
  const adminFields = [...ownerFields, "ownerId", "isApproved", "status", "businessPermit", "validId", "otherDocs", "registeredByAdmin"];
  const allowedFields = isSuperAdmin ? adminFields : ownerFields;
  const unknownFields = Object.keys(req.body).filter(field => !allowedFields.includes(field));
  if (unknownFields.length > 0) {
    return res.status(400).json({ success: false, message: `Unknown or protected studio fields: ${unknownFields.join(", ")}.` });
  }
  const updates: Record<string, any> = {};
  for (const field of allowedFields) {
    if (field in req.body) updates[field] = req.body[field];
  }
  if (updates.latitude !== undefined && (typeof updates.latitude !== "number" || updates.latitude < -90 || updates.latitude > 90)) {
    return res.status(400).json({ success: false, message: "Latitude must be a number between -90 and 90." });
  }
  if (updates.longitude !== undefined && (typeof updates.longitude !== "number" || updates.longitude < -180 || updates.longitude > 180)) {
    return res.status(400).json({ success: false, message: "Longitude must be a number between -180 and 180." });
  }
  const uploadFields: Array<{ field: "logo" | "coverImage" | "businessPermit" | "validId" | "otherDocs"; purpose: string }> = [
    { field: "logo", purpose: "STUDIO_LOGO" },
    { field: "coverImage", purpose: "STUDIO_COVER" },
    { field: "businessPermit", purpose: "BUSINESS_PERMIT" },
    { field: "validId", purpose: "OWNER_VALID_ID" },
    { field: "otherDocs", purpose: "SUPPORTING_DOCUMENT" }
  ];
  for (const upload of uploadFields) {
    const value = updates[upload.field];
    if (typeof value === "string" && value.startsWith("data:")) {
      const media = await saveProtectedMedia(user.id, "studio", req.params.id, upload.purpose, value, upload.field);
      if (!media) return res.status(400).json({ success: false, message: `${upload.field} is not a supported file.` });
      updates[upload.field] = media.url;
    }
  }
  db.studios[index] = { ...db.studios[index], ...updates };
  reconcileStudioBrandingMedia(req.params.id);
  await db.save();
  logAction(user.id, user.email, "Updated studio profile", "STUDIO", req.params.id);
  res.json({ success: true, studio: db.studios[index] });
});

app.put("/api/studios/:id/approve", (req, res) => {
  if (!requireRole(req, res, UserRole.SUPER_ADMIN)) return;
  const index = db.studios.findIndex(s => s.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Studio not found." });
  }
  db.studios[index].isApproved = true;
  db.studios[index].status = "approved";
  db.save();

  const studio = db.studios[index];
  logAction("system", "system@cainta-mis.com", `Approved studio registration: ${studio.name}`, "STUDIO", studio.id);
  notifyUser(studio.ownerId, "Studio Approved", `Your studio '${studio.name}' has been verified and approved by the Super Admin! You can now start receiving client bookings.`, "success", studio.id);

  res.json({ success: true, studio });
});

app.put("/api/studios/:id/reject", (req, res) => {
  const admin = requireRole(req, res, UserRole.SUPER_ADMIN);
  if (!admin) return;
  const index = db.studios.findIndex(s => s.id === req.params.id);
  if (index === -1) return res.status(404).json({ success: false, message: "Studio not found." });

  const studio = db.studios[index];
  studio.isApproved = false;
  studio.status = "rejected";
  db.save();
  for (const [token, session] of authSessions.entries()) {
    if (session.userId === studio.ownerId) authSessions.delete(token);
  }
  logAction(admin.id, admin.email, `Rejected studio registration: ${studio.name}`, "STUDIO", studio.id);
  notifyUser(studio.ownerId, "Studio Registration Rejected", `Your studio '${studio.name}' was rejected by the Super Admin.`, "error", studio.id);
  res.json({ success: true, studio });
});

app.put("/api/admin/users/:id/status", (req, res) => {
  const admin = requireRole(req, res, UserRole.SUPER_ADMIN);
  if (!admin) return;
  const { status } = req.body;
  if (!["approved", "rejected", "suspended"].includes(status)) {
    return res.status(400).json({ success: false, message: "Status must be approved, rejected, or suspended." });
  }
  const user = db.users.find(item => item.id === req.params.id);
  if (!user || user.role !== UserRole.STUDIO_ADMIN) {
    return res.status(400).json({ success: false, message: "Only studio-owner accounts can be moderated here." });
  }
  const studio = db.studios.find(item =>
    item.ownerId === user.id ||
    item.id === user.studioId ||
    (item.email && user.email && item.email.toLowerCase() === user.email.toLowerCase())
  );
  if (!studio) return res.status(404).json({ success: false, message: "Owner studio not found." });

  studio.status = status;
  studio.isApproved = status === "approved";
  db.save();
  if (status !== "approved") {
    for (const [token, session] of authSessions.entries()) {
      if (session.userId === user.id) authSessions.delete(token);
    }
  }
  logAction(admin.id, admin.email, `${status[0].toUpperCase()}${status.slice(1)} studio owner account`, "USER", user.id);
  notifyUser(user.id, `Studio Account ${status[0].toUpperCase()}${status.slice(1)}`, `Your studio account has been ${status} by the Super Admin.`, status === "approved" ? "success" : "error", studio.id);
  res.json({ success: true, user, studio });
});

app.delete("/api/studios/:id", (req, res) => {
  const admin = requireRole(req, res, UserRole.SUPER_ADMIN);
  if (!admin) return;
  const index = db.studios.findIndex(s => s.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Studio not found." });
  }
  const studio = db.studios[index];
  const hasActiveBookings = db.bookings.some(booking => booking.studioId === studio.id && !["Completed", "Cancelled", "Rejected", "Expired", "No Show"].includes(booking.status));
  if (hasActiveBookings) {
    return res.status(409).json({ success: false, message: "This studio has active bookings and cannot be archived yet." });
  }
  studio.status = "suspended";
  studio.isApproved = false;
  db.save();
  logAction(admin.id, admin.email, `Archived studio: ${studio.name}`, "STUDIO", studio.id);
  res.json({ success: true, message: "Studio archived successfully.", studio });
});

// Studio Staff Management Endpoints
app.get("/api/studios/:id/staff", (req, res) => {
  const user = requireStudioAccess(req, res, req.params.id);
  if (!user) return;
  const staff = db.users
    .filter(u => u.studioId === req.params.id && [UserRole.STUDIO_ADMIN, UserRole.STUDIO_STAFF].includes(u.role))
    .map(u => {
      const { passwordHash, ...safe } = u;
      return safe;
    });
  res.json({ success: true, staff });
});

app.post("/api/studios/:id/staff/invite", (req, res) => {
  const user = requireStudioAccess(req, res, req.params.id);
  if (!user) return;
  if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.STUDIO_ADMIN) {
    return res.status(403).json({ success: false, message: "Only studio administrators can invite staff." });
  }

  const { email, fullName, password, contactNumber } = req.body;
  if (!email || !fullName) {
    return res.status(400).json({ success: false, message: "Staff email and full name are required." });
  }

  const existing = db.users.find(u => u.email.toLowerCase() === email.trim().toLowerCase()) ||
                   db.customers.find(c => c.email.toLowerCase() === email.trim().toLowerCase());
  if (existing) {
    return res.status(400).json({ success: false, message: "An account with this email already exists." });
  }

  const staffId = generateId("STAFF");
  const defaultPassword = password || "Staff123!";
  const hashedPassword = bcrypt.hashSync(defaultPassword, 10);

  const newStaff = {
    id: staffId,
    email: email.trim(),
    passwordHash: hashedPassword,
    fullName: fullName.trim(),
    role: UserRole.STUDIO_STAFF,
    studioId: req.params.id,
    contactNumber: contactNumber || undefined,
    createdAt: new Date().toISOString()
  };

  db.addUser(newStaff);
  logAction(user.id, user.email, `Invited new studio staff: ${fullName}`, "USER", staffId);
  sendEmailNotification(
    email.trim(),
    "Studio Staff Invitation",
    `You have been invited to join the studio management team on Cainta Photography Studio MIS. Your temporary login password is: ${defaultPassword}`,
    "info"
  );

  const { passwordHash: _, ...safeStaff } = newStaff;
  res.json({ success: true, staff: safeStaff });
});

app.delete("/api/studios/:id/staff/:staffId", (req, res) => {
  const user = requireStudioAccess(req, res, req.params.id);
  if (!user) return;
  if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.STUDIO_ADMIN) {
    return res.status(403).json({ success: false, message: "Only studio administrators can remove staff." });
  }

  const index = db.users.findIndex(u => u.id === req.params.staffId && u.studioId === req.params.id && u.role === UserRole.STUDIO_STAFF);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Staff member not found or is not removable." });
  }

  const removed = db.users.splice(index, 1)[0];
  db.save();
  logAction(user.id, user.email, `Removed staff member: ${removed.fullName}`, "USER", removed.id);
  res.json({ success: true, message: "Staff member removed successfully." });
});

// Users & Customers Endpoints
app.get("/api/users", (req, res) => {
  if (!requireRole(req, res, UserRole.SUPER_ADMIN)) return;
  // Combines admin/studio users and customers for comprehensive system overview
  const allAccounts = [
    ...db.users,
    ...db.customers.map(c => ({ ...c, role: "CUSTOMER" as const }))
  ];
  res.json({ success: true, users: allAccounts });
});

app.delete("/api/users/:id", (req, res) => {
  const admin = requireRole(req, res, UserRole.SUPER_ADMIN);
  if (!admin) return;

  const userId = req.params.id;

  const userIndex = db.users.findIndex(u => u.id === userId);
  if (userIndex !== -1) {
    const removed = db.users.splice(userIndex, 1)[0];
    // Mark as deleted BEFORE save() so ensureIntegrity() and mysqlInsert()
    // don't re-create this account during the persist call that follows.
    db.markUserDeleted(removed.id);
    for (const [token, session] of authSessions.entries()) {
      if (session.userId === removed.id) authSessions.delete(token);
    }
    db.save();
    logAction(admin.id, admin.email, `Deleted user account: ${removed.fullName || removed.email}`, "USER", removed.id);
    return res.json({ success: true, message: "User deleted successfully." });
  }

  const customerIndex = db.customers.findIndex(c => c.id === userId);
  if (customerIndex !== -1) {
    const removed = db.customers.splice(customerIndex, 1)[0];
    // Same guard — mark before save so the deleted ID is never re-inserted.
    db.markUserDeleted(removed.id);
    for (const [token, session] of authSessions.entries()) {
      if (session.userId === removed.id) authSessions.delete(token);
    }
    db.save();
    logAction(admin.id, admin.email, `Deleted customer account: ${removed.fullName || removed.email}`, "USER", removed.id);
    return res.json({ success: true, message: "Customer deleted successfully." });
  }

  return res.status(404).json({ success: false, message: "User not found." });
});

// Dedicated Customers Table Endpoint
app.get("/api/customers", (req, res) => {
  if (!requireRole(req, res, UserRole.SUPER_ADMIN)) return;
  res.json({ success: true, customers: db.customers });
});

// ── Archive a customer (soft-delete) ────────────────────────────────────────
app.put("/api/customers/:id/archive", (req, res) => {
  const admin = requireRole(req, res, UserRole.SUPER_ADMIN);
  if (!admin) return;

  const idx = db.customers.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Customer not found." });

  db.customers[idx] = {
    ...db.customers[idx],
    isArchived: true,
    archivedAt: new Date().toISOString(),
    archivedBy: admin.id
  };
  db.save();
  logAction(admin.id, admin.email, `Archived customer: ${db.customers[idx].fullName}`, "CUSTOMER", req.params.id);
  res.json({ success: true, customer: db.customers[idx] });
});

// ── Unarchive a customer ─────────────────────────────────────────────────────
app.put("/api/customers/:id/unarchive", (req, res) => {
  const admin = requireRole(req, res, UserRole.SUPER_ADMIN);
  if (!admin) return;

  const idx = db.customers.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Customer not found." });

  db.customers[idx] = {
    ...db.customers[idx],
    isArchived: false,
    archivedAt: undefined,
    archivedBy: undefined
  };
  db.save();
  logAction(admin.id, admin.email, `Unarchived customer: ${db.customers[idx].fullName}`, "CUSTOMER", req.params.id);
  res.json({ success: true, customer: db.customers[idx] });
});

// ── Permanently delete an archived customer ──────────────────────────────────
app.delete("/api/customers/:id", (req, res) => {
  const admin = requireRole(req, res, UserRole.SUPER_ADMIN);
  if (!admin) return;

  const idx = db.customers.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Customer not found." });

  const customer = db.customers[idx];
  if (!customer.isArchived) {
    return res.status(409).json({ success: false, message: "Archive this customer first before permanently deleting." });
  }

  db.customers.splice(idx, 1);
  db.markUserDeleted(customer.id);
  for (const [token, session] of authSessions.entries()) {
    if (session.userId === customer.id) authSessions.delete(token);
  }
  db.save();
  logAction(admin.id, admin.email, `Permanently deleted customer: ${customer.fullName}`, "CUSTOMER", customer.id);
  res.json({ success: true, message: "Customer permanently deleted." });
});

// Global Services
app.get("/api/services", (req, res) => {
  res.json({ success: true, services: db.services });
});

// Global Packages
app.get("/api/packages", (req, res) => {
  res.json({ success: true, packages: db.packages });
});

// Global Addons
app.get("/api/addons", (req, res) => {
  res.json({ success: true, addons: db.addons });
});

// Global Reviews - PUBLIC: submitted reviews are visible unless rejected or intentionally hidden by the studio owner
app.get("/api/reviews", (req, res) => {
  const visibleReviews = db.reviews.filter(r => r.status !== "rejected" && r.isVisible !== false);
  res.json({ success: true, reviews: visibleReviews });
});

// Categories
app.get("/api/categories", (req, res) => {
  res.json({ success: true, categories: db.categories });
});

app.post("/api/categories", (req, res) => {
  if (!requireRole(req, res, UserRole.SUPER_ADMIN)) return;
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const description = typeof req.body.description === "string" ? req.body.description.trim() : "";
  if (!name) {
    return res.status(400).json({ success: false, message: "Category name is required." });
  }
  if (db.categories.some(category => category.name.toLowerCase() === name.toLowerCase())) {
    return res.status(409).json({ success: false, message: "A category with this name already exists." });
  }
  const newCat = {
    id: generateId("CAT"),
    name,
    description,
    createdAt: new Date().toISOString()
  };
  db.addCategory(newCat);
  res.json({ success: true, category: newCat });
});

app.put("/api/categories/:id", (req, res) => {
  if (!requireRole(req, res, UserRole.SUPER_ADMIN)) return;
  const category = db.categories.find(item => item.id === req.params.id);
  if (!category) {
    return res.status(404).json({ success: false, message: "Category not found." });
  }
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const description = typeof req.body.description === "string" ? req.body.description.trim() : "";
  if (!name) {
    return res.status(400).json({ success: false, message: "Category name is required." });
  }
  if (db.categories.some(item => item.id !== category.id && item.name.toLowerCase() === name.toLowerCase())) {
    return res.status(409).json({ success: false, message: "A category with this name already exists." });
  }
  category.name = name;
  category.description = description;
  db.save();
  res.json({ success: true, category });
});

app.delete("/api/categories/:id", (req, res) => {
  if (!requireRole(req, res, UserRole.SUPER_ADMIN)) return;
  const index = db.categories.findIndex(c => c.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Category not found." });
  }
  db.categories.splice(index, 1);
  db.save();
  res.json({ success: true, message: "Category removed successfully." });
});

// Service management
app.get("/api/studios/:studioId/services", (req, res) => {
  const services = db.services.filter(s => s.studioId === req.params.studioId);
  res.json({ success: true, services });
});

app.post("/api/studios/:studioId/services", async (req, res) => {
  const user = requireStudioAccess(req, res, req.params.studioId);
  if (!user) return;
  const newService: StudioService = {
    id: generateId("SRV"),
    studioId: req.params.studioId,
    name: req.body.name,
    description: req.body.description,
    category: req.body.category,
    basePrice: Number(req.body.basePrice),
    durationMinutes: Number(req.body.durationMinutes),
    image: "",
    images: [],
    isActive: true,
    availableDays: req.body.availableDays || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    availableSlots: req.body.availableSlots || ["09:00 AM", "10:30 AM", "01:00 PM", "02:30 PM", "04:00 PM"],
    requirements: req.body.requirements || ["Arrive 10 minutes early"],
    createdAt: new Date().toISOString()
  };
  const submittedImages = Array.isArray(req.body.images) ? req.body.images : (req.body.image ? [req.body.image] : []);
  for (const [index, submittedImage] of submittedImages.entries()) {
    if (typeof submittedImage === "string" && (/^https?:\/\//.test(submittedImage) || submittedImage.startsWith("/api/media/"))) {
      newService.images?.push(submittedImage);
      continue;
    }
    const media = await saveProtectedMedia(user.id, "service", newService.id, "SERVICE_IMAGE", submittedImage, `service-image-${index + 1}`);
    if (!media) return res.status(400).json({ success: false, message: "Service images must be supported images smaller than 8 MB." });
    newService.images?.push(`/api/media/${media.mediaId}`);
  }
  newService.image = newService.images?.[0] || "";
  db.addService(newService);
  res.json({ success: true, service: newService });
});

app.put("/api/services/:id", async (req, res) => {
  const index = db.services.findIndex(s => s.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Service not found." });
  }
  const user = requireStudioAccess(req, res, db.services[index].studioId);
  if (!user) return;
  const service = db.services[index];
  const submittedImages = Array.isArray(req.body.images) ? req.body.images : (req.body.image ? [req.body.image] : undefined);
  let protectedImages = service.images || (service.image ? [service.image] : []);
  if (submittedImages) {
    protectedImages = [];
    for (const [imageIndex, submittedImage] of submittedImages.entries()) {
      if (typeof submittedImage === "string" && submittedImage.startsWith("/api/media/")) {
        protectedImages.push(submittedImage);
        continue;
      }
      if (typeof submittedImage === "string" && /^https?:\/\//.test(submittedImage)) {
        protectedImages.push(submittedImage);
        continue;
      }
      const media = await saveProtectedMedia(user.id, "service", service.id, "SERVICE_IMAGE", submittedImage, `service-image-${imageIndex + 1}`);
      if (!media) return res.status(400).json({ success: false, message: "Service images must be supported images smaller than 8 MB." });
      protectedImages.push(`/api/media/${media.mediaId}`);
    }
  }
  db.services[index] = { ...service, ...req.body, images: protectedImages, image: protectedImages[0] || "" };
  db.save();
  res.json({ success: true, service: db.services[index] });
});

app.delete("/api/services/:id", (req, res) => {
  const index = db.services.findIndex(s => s.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Service not found." });
  }
  if (!requireStudioAccess(req, res, db.services[index].studioId)) return;
  db.services.splice(index, 1);
  db.save();
  res.json({ success: true, message: "Service deleted." });
});

// Packages
app.get("/api/studios/:studioId/packages", (req, res) => {
  const packages = db.packages.filter(p => p.studioId === req.params.studioId);
  res.json({ success: true, packages });
});

app.post("/api/studios/:studioId/packages", async (req, res) => {
  const user = requireStudioAccess(req, res, req.params.studioId);
  if (!user) return;
  const newPkg: StudioPackage = {
    id: generateId("PKG"),
    studioId: req.params.studioId,
    name: req.body.name,
    description: req.body.description,
    price: Number(req.body.price),
    durationMinutes: Number(req.body.durationMinutes),
    editedPhotosCount: Number(req.body.editedPhotosCount),
    includedPrints: req.body.includedPrints || "None",
    photographerCount: Number(req.body.photographerCount),
    includedServices: req.body.includedServices || [],
    termsAndConditions: req.body.termsAndConditions || "No terms specified.",
    image: "",
    isActive: true,
    createdAt: new Date().toISOString()
  };
  if (req.body.image) {
    const media = await saveProtectedMedia(user.id, "package", newPkg.id, "PACKAGE_IMAGE", req.body.image, "package-image");
    if (!media) return res.status(400).json({ success: false, message: "Package image must be a supported image smaller than 8 MB." });
    newPkg.image = `/api/media/${media.mediaId}`;
  }
  db.addPackage(newPkg);
  res.json({ success: true, package: newPkg });
});

app.put("/api/packages/:id", async (req, res) => {
  const index = db.packages.findIndex(p => p.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Package not found." });
  }
  const user = requireStudioAccess(req, res, db.packages[index].studioId);
  if (!user) return;
  const pkg = db.packages[index];
  let image = pkg.image;
  if (req.body.image && req.body.image !== pkg.image) {
    const media = await saveProtectedMedia(user.id, "package", pkg.id, "PACKAGE_IMAGE", req.body.image, "package-image");
    if (!media) return res.status(400).json({ success: false, message: "Package image must be a supported image smaller than 8 MB." });
    image = `/api/media/${media.mediaId}`;
  }
  db.packages[index] = { ...pkg, ...req.body, image };
  db.save();
  res.json({ success: true, package: db.packages[index] });
});

app.delete("/api/packages/:id", (req, res) => {
  const index = db.packages.findIndex(p => p.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Package not found." });
  }
  if (!requireStudioAccess(req, res, db.packages[index].studioId)) return;
  db.packages.splice(index, 1);
  db.save();
  res.json({ success: true, message: "Package deleted." });
});

// Addons
app.get("/api/studios/:studioId/addons", (req, res) => {
  const addons = db.addons.filter(a => a.studioId === req.params.studioId);
  res.json({ success: true, addons });
});

app.post("/api/studios/:studioId/addons", async (req, res) => {
  const user = requireStudioAccess(req, res, req.params.studioId);
  if (!user) return;
  const newAddon: PackageAddon = {
    id: generateId("ADD"),
    studioId: req.params.studioId,
    name: req.body.name,
    price: Number(req.body.price),
    description: req.body.description || "",
    image: "",
    createdAt: new Date().toISOString()
  };
  if (req.body.image) {
    const media = await saveProtectedMedia(user.id, "addon", newAddon.id, "ADDON_IMAGE", req.body.image, "addon-image");
    if (!media) return res.status(400).json({ success: false, message: "Add-on image must be a supported image smaller than 8 MB." });
    newAddon.image = `/api/media/${media.mediaId}`;
  }
  db.addAddon(newAddon);
  res.json({ success: true, addon: newAddon });
});

app.delete("/api/addons/:id", (req, res) => {
  const index = db.addons.findIndex(a => a.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Addon not found." });
  }
  if (!requireStudioAccess(req, res, db.addons[index].studioId)) return;
  db.addons.splice(index, 1);
  db.save();
  res.json({ success: true, message: "Addon removed." });
});

function parseHHMM(value: string): number {
  if (!value || typeof value !== "string") return 0;
  const [hourRaw, minuteRaw] = String(value).split(":");
  const hour = Number(hourRaw || 0);
  const minute = Number(minuteRaw || 0);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return 0;
  return hour * 60 + minute;
}

// Studio owner-only availability endpoints
app.get("/api/studios/:studioId/availability", (req, res) => {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;
  if (user.role === UserRole.CUSTOMER) {
    return res.status(403).json({ success: false, message: "Only studio staff can view this information." });
  }
  if (user.role === UserRole.STUDIO_STAFF && user.studioId !== req.params.studioId) {
    return res.status(403).json({ success: false, message: "You do not have access to this studio." });
  }
  if (user.role === UserRole.STUDIO_ADMIN && user.studioId !== req.params.studioId) {
    return res.status(403).json({ success: false, message: "You do not have access to this studio." });
  }
  const availability = db.availabilities.filter(a => a.studioId === req.params.studioId);
  res.json({ success: true, availability });
});

app.post("/api/studios/:studioId/availability", (req, res) => {
  const user = requireStudioOwner(req, res, req.params.studioId);
  if (!user) return;

  const payload = req.body || {};
  const dayOfWeek = Number(payload.dayOfWeek);
  if (Number.isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return res.status(400).json({ success: false, message: "Please select a valid day of week." });
  }

  const openingTime = String(payload.openingTime || "09:00");
  const closingTime = String(payload.closingTime || "18:00");
  const start = parseHHMM(openingTime);
  const end = parseHHMM(closingTime);
  if (start >= end) {
    return res.status(400).json({ success: false, message: "Closing time must be after opening time." });
  }

  const existing = db.availabilities.find(a => a.studioId === req.params.studioId && a.dayOfWeek === dayOfWeek);
  const item: StudioAvailability = existing || {
    id: generateId("AVL"),
    studioId: req.params.studioId,
    dayOfWeek,
    openingTime,
    closingTime,
    isAvailable: payload.isAvailable !== false,
    slotDurationMinutes: Number(payload.slotDurationMinutes) || 60,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (existing) {
    Object.assign(existing, {
      openingTime,
      closingTime,
      isAvailable: payload.isAvailable !== false,
      slotDurationMinutes: Number(payload.slotDurationMinutes) || 60,
      updatedAt: new Date().toISOString()
    });
  } else {
    db.availabilities.push(item);
  }

  db.save();
  res.json({ success: true, availability: item });
});

app.put("/api/studios/:studioId/availability/:id", (req, res) => {
  const user = requireStudioOwner(req, res, req.params.studioId);
  if (!user) return;

  const index = db.availabilities.findIndex(a => a.id === req.params.id && a.studioId === req.params.studioId);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Availability not found." });
  }

  const payload = req.body || {};
  const openingTime = String(payload.openingTime || db.availabilities[index].openingTime);
  const closingTime = String(payload.closingTime || db.availabilities[index].closingTime);
  const start = parseHHMM(openingTime);
  const end = parseHHMM(closingTime);
  if (start >= end) {
    return res.status(400).json({ success: false, message: "Closing time must be after opening time." });
  }

  db.availabilities[index] = {
    ...db.availabilities[index],
    dayOfWeek: Number(payload.dayOfWeek ?? db.availabilities[index].dayOfWeek),
    openingTime,
    closingTime,
    isAvailable: payload.isAvailable !== false,
    slotDurationMinutes: Number(payload.slotDurationMinutes) || db.availabilities[index].slotDurationMinutes,
    updatedAt: new Date().toISOString()
  };

  db.save();
  res.json({ success: true, availability: db.availabilities[index] });
});

app.delete("/api/studios/:studioId/availability/:id", (req, res) => {
  const user = requireStudioOwner(req, res, req.params.studioId);
  if (!user) return;

  const index = db.availabilities.findIndex(a => a.id === req.params.id && a.studioId === req.params.studioId);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Availability not found." });
  }

  db.availabilities.splice(index, 1);
  db.save();
  res.json({ success: true, message: "Availability removed." });
});

// Blackout date endpoints (owner-only)
app.get("/api/studios/:studioId/blackouts", (req, res) => {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;
  if (user.role === UserRole.CUSTOMER) {
    return res.status(403).json({ success: false, message: "Only studio staff can view this information." });
  }
  if (user.role === UserRole.STUDIO_STAFF && user.studioId !== req.params.studioId) {
    return res.status(403).json({ success: false, message: "You do not have access to this studio." });
  }
  if (user.role === UserRole.STUDIO_ADMIN && user.studioId !== req.params.studioId) {
    return res.status(403).json({ success: false, message: "You do not have access to this studio." });
  }
  const blackouts = db.blackouts.filter(b => b.studioId === req.params.studioId);
  res.json({ success: true, blackouts });
});

app.post("/api/studios/:studioId/blackouts", (req, res) => {
  const user = requireStudioOwner(req, res, req.params.studioId);
  if (!user) return;

  const blackout: AvailabilityBlackout = {
    id: generateId("BLK"),
    studioId: req.params.studioId,
    blackoutDate: String(req.body.blackoutDate || new Date().toISOString().slice(0, 10)),
    startTime: String(req.body.startTime || "00:00"),
    endTime: String(req.body.endTime || "23:59"),
    reason: String(req.body.reason || "Studio closure"),
    isRecurring: Boolean(req.body.isRecurring),
    recurrenceRule: req.body.recurrenceRule || undefined,
    createdAt: new Date().toISOString()
  };

  db.blackouts.push(blackout);
  db.save();
  res.json({ success: true, blackout });
});

app.delete("/api/studios/:studioId/blackouts/:id", (req, res) => {
  const user = requireStudioOwner(req, res, req.params.studioId);
  if (!user) return;

  const index = db.blackouts.findIndex(b => b.id === req.params.id && b.studioId === req.params.studioId);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Blackout not found." });
  }

  db.blackouts.splice(index, 1);
  db.save();
  res.json({ success: true, message: "Blackout removed." });
});

// Helper to parse time slot string (e.g., "09:00 AM", "01:30 PM", "14:00") into minutes from midnight
function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 540; // Default 9:00 AM
  const clean = timeStr.trim().toUpperCase();
  const isPM = clean.includes("PM");
  const isAM = clean.includes("AM");
  const numbers = clean.replace(/[^0-9:]/g, "");
  const parts = numbers.split(":");
  let hours = parseInt(parts[0], 10) || 9;
  const minutes = parseInt(parts[1], 10) || 0;

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

// Bookings
app.get("/api/bookings", (req, res) => {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;
  db.bookings.forEach(expireUnpaidBooking);
  const { customerId, studioId } = req.query;
  let filtered = db.bookings.map(booking => {
    const pendingPaymentAmount = db.payments
      .filter(payment => payment.bookingId === booking.id && payment.paymentStatus === "Pending Verification")
      .reduce((sum, payment) => sum + Number(payment.amount), 0);
    // Attach refund details from the refunded payment record so customers can see them
    const refundedPayment = db.payments.find(
      p => p.bookingId === booking.id && p.paymentStatus === "Refunded"
    ) as any;
    return {
      ...booking,
      pendingPaymentAmount,
      refundAmount: refundedPayment?.refundAmount ?? null,
      refundReason: refundedPayment?.refundReason ?? null,
      refundedAt: refundedPayment?.refundedAt ?? null,
    };
  });
  if (user.role === UserRole.CUSTOMER) filtered = filtered.filter(b => b.customerId === user.id);
  else if (user.role === UserRole.STUDIO_ADMIN || user.role === UserRole.STUDIO_STAFF) filtered = filtered.filter(b => b.studioId === user.studioId);
  if (customerId && user.role === UserRole.SUPER_ADMIN) filtered = filtered.filter(b => b.customerId === customerId);
  if (studioId && user.role === UserRole.SUPER_ADMIN) filtered = filtered.filter(b => b.studioId === studioId);
  res.json({ success: true, bookings: filtered });
});

app.get("/api/bookings/:id", (req, res) => {
  const booking = db.bookings.find(b => b.id === req.params.id);
  if (!booking) {
    return res.status(404).json({ success: false, message: "Booking not found." });
  }
  if (!requireBookingAccess(req, res, booking)) return;
  res.json({ success: true, booking });
});

app.post("/api/bookings", (req, res) => {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;
  const { studioId, customerId, serviceId, packageId, bookingDate, timeSlot, addons, customerDetails, totalAmount, paymentOption } = req.body;

  if (user.role !== UserRole.CUSTOMER || customerId !== user.id) {
    return res.status(403).json({ success: false, message: "Only the authenticated customer can create this booking." });
  }

  const studio = db.studios.find(item => item.id === studioId && (item.status === "approved" || item.isApproved));
  if (!studio) {
    return res.status(400).json({ success: false, message: "Bookings are available only for approved studios." });
  }
  if (!serviceId) {
    return res.status(400).json({ success: false, message: "Please select a service before booking." });
  }
  const selectedPackage = packageId
    ? db.packages.find(item => item.id === packageId && item.studioId === studioId)
    : undefined;
  if (packageId && !selectedPackage) {
    return res.status(400).json({ success: false, message: "The selected package is not valid for this studio." });
  }
  const selectedService = serviceId ? db.services.find(item => item.id === serviceId && item.studioId === studioId && item.isActive) : undefined;
  if (serviceId && !selectedService) {
    return res.status(400).json({ success: false, message: "The selected service is not valid for this studio." });
  }
  const requestedDate = new Date(`${bookingDate}T00:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(bookingDate)) || Number.isNaN(requestedDate.getTime()) || requestedDate < new Date(new Date().toDateString())) {
    return res.status(400).json({ success: false, message: "Booking date must be today or a future date." });
  }

  const dayName = requestedDate.toLocaleDateString("en-US", { weekday: "long" });
  const dayOfWeek = requestedDate.getDay();
  const studioAvailability = db.availabilities.find(a => a.studioId === studioId && a.dayOfWeek === dayOfWeek);
  if (studioAvailability && !studioAvailability.isAvailable) {
    return res.status(400).json({ success: false, message: `The studio is closed on ${dayName}. Please choose another day.` });
  }
  if (studioAvailability) {
    const start = parseHHMM(studioAvailability.openingTime);
    const end = parseHHMM(studioAvailability.closingTime);
    const slotStart = parseTimeToMinutes(timeSlot);
    if (slotStart < start || slotStart >= end) {
      return res.status(400).json({ success: false, message: "The selected time is outside the studio owner's working hours." });
    }
  }

  const blackout = db.blackouts.find(b => b.studioId === studioId && b.blackoutDate === bookingDate);
  if (blackout) {
    const blackStart = parseHHMM(blackout.startTime);
    const blackEnd = parseHHMM(blackout.endTime);
    const slotStart = parseTimeToMinutes(timeSlot);
    if (slotStart >= blackStart && slotStart < blackEnd) {
      return res.status(400).json({ success: false, message: `The studio is blocked on ${bookingDate} for: ${blackout.reason || "schedule closure"}.` });
    }
  }

  if (selectedService) {
    if (!selectedService.availableDays.includes(dayName) || !selectedService.availableSlots.includes(timeSlot)) {
      return res.status(400).json({ success: false, message: "The selected date or time is not available for this service." });
    }
  }
  const selectedAddons = (Array.isArray(addons) ? addons : []).reduce((validAddons: { addonId: string; quantity: number; price: number }[], addon: any) => {
    const catalogAddon = db.addons.find(item => item.id === addon.addonId && item.studioId === studioId);
    if (!catalogAddon) return validAddons;
    const quantity = Math.max(1, Number(addon.quantity) || 1);
    validAddons.push({ addonId: catalogAddon.id, quantity, price: Number(catalogAddon.price) });
    return validAddons;
  }, []);
  const calculatedTotal = (selectedPackage ? Number(selectedPackage.price) : Number(selectedService?.basePrice || 0)) + selectedAddons.reduce((sum, addon) => {
    return sum + addon.price * addon.quantity;
  }, 0);
  const normalizedPaymentOption = paymentOption === "Full Payment" ? "Full Payment" : "Downpayment";

  // Determine duration of shoot in minutes
  let shootDuration = 60; // Default 1 hour
  if (packageId) {
    const pkg = db.packages.find(p => p.id === packageId);
    if (pkg?.durationMinutes) shootDuration = pkg.durationMinutes;
  } else if (serviceId) {
    const srv = db.services.find(s => s.id === serviceId);
    if (srv?.durationMinutes) shootDuration = srv.durationMinutes;
  }

  const newStartMinutes = parseTimeToMinutes(timeSlot);
  const newEndMinutes = newStartMinutes + shootDuration;

  // Advanced Time-Range Overlap Conflict Check:
  // (StartA < EndB) AND (EndA > StartB)
  const overlappingBooking = db.bookings.find(b => {
    if (b.studioId !== studioId || b.bookingDate !== bookingDate) return false;
    if (["Cancelled", "Rejected", "Expired"].includes(b.status)) return false;

    // Find duration of existing booking
    let existingDuration = 60;
    if (b.packageId) {
      const p = db.packages.find(pkg => pkg.id === b.packageId);
      if (p?.durationMinutes) existingDuration = p.durationMinutes;
    } else if (b.serviceId) {
      const s = db.services.find(srv => srv.id === b.serviceId);
      if (s?.durationMinutes) existingDuration = s.durationMinutes;
    }

    const existingStart = parseTimeToMinutes(b.timeSlot);
    const existingEnd = existingStart + existingDuration;

    // Interval collision condition
    return newStartMinutes < existingEnd && newEndMinutes > existingStart;
  });

  if (overlappingBooking) {
    return res.status(400).json({ 
      success: false, 
      message: `Time slot conflict! Studio already has booking #${overlappingBooking.id} scheduled at ${overlappingBooking.timeSlot} on ${bookingDate}. Please choose another time.` 
    });
  }

  const bookingId = generateId("BK-2026");
  const newBooking: Booking = {
    id: bookingId,
    studioId,
    customerId,
    serviceId,
    packageId,
    bookingDate,
    timeSlot,
    addons: selectedAddons,
    customerDetails,
    status: "Pending",
    totalAmount: calculatedTotal,
    amountPaid: 0,
    downPaymentAmount: normalizedPaymentOption === "Full Payment" ? calculatedTotal : Math.round(calculatedTotal * 0.3 * 100) / 100,
    remainingBalance: calculatedTotal,
    paymentStatus: "Unpaid",
    finalPaymentStatus: "Pending",
    paymentOption: normalizedPaymentOption,
    paymentDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString()
  };

  db.addBooking(newBooking);

  // Notifications
  notifyUser(customerId, "Booking Created", `Your booking at ${db.studios.find(s=>s.id===studioId)?.name} is successfully created. Complete payment to secure your slot!`, "info");
  
  // Find studio admin to notify
  const studioAdmin = db.users.find(u => u.studioId === studioId && u.role === UserRole.STUDIO_ADMIN);
  if (studioAdmin) {
    notifyUser(studioAdmin.id, "New Booking Received", `A new booking (${bookingId}) has been made for ${bookingDate} at ${timeSlot}.`, "warning", studioId);
  }

  res.json({ success: true, booking: newBooking });
});

app.put("/api/bookings/:id/cancel", (req, res) => {
  const index = db.bookings.findIndex(b => b.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Booking not found." });
  }

  const booking = db.bookings[index];
  const user = requireBookingAccess(req, res, booking, false);
  if (!user) return;
  if (user.role !== UserRole.CUSTOMER) {
    return res.status(403).json({ success: false, message: "Only the customer can cancel this booking." });
  }

  const cancellableStatuses = ["Pending", "Awaiting Payment", "Confirmed", "Rescheduled"];
  if (!cancellableStatuses.includes(booking.status)) {
    return res.status(400).json({ success: false, message: `Bookings in ${booking.status} status can no longer be cancelled.` });
  }

  const reason = String(req.body.reason || "Customer requested cancellation").trim();
  db.bookings[index] = {
    ...booking,
    status: "Cancelled",
    cancellationReason: reason || "Customer requested cancellation",
    cancelledBy: user.id,
    cancelledAt: new Date().toISOString()
  };
  db.save();

  const studio = db.studios.find(item => item.id === booking.studioId);
  const studioOwner = studio ? db.users.find(item => item.id === studio.ownerId) : undefined;
  const message = `Booking ${booking.id} for ${booking.bookingDate} at ${booking.timeSlot} was cancelled by the customer. Reason: ${reason || "Customer requested cancellation"}`;
  if (studioOwner) notifyUser(studioOwner.id, "Booking Cancelled by Customer", message, "warning", booking.studioId);
  notifyUser(user.id, "Booking Cancellation Confirmed", `Your booking ${booking.id} has been cancelled successfully.`, "success", booking.studioId);
  logAction(user.id, user.email, "Cancelled booking", "BOOKING", booking.id);

  res.json({ success: true, booking: db.bookings[index] });
});

app.put("/api/bookings/:id/assign-staff", (req, res) => {
  const index = db.bookings.findIndex(b => b.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Booking not found." });
  }

  const booking = db.bookings[index];
  const user = requireStudioAccess(req, res, booking.studioId);
  if (!user) return;

  const { staffId, staffName } = req.body;
  if (!staffId || !staffName) {
    return res.status(400).json({ success: false, message: "Staff ID and staff name are required." });
  }

  (db.bookings[index] as any).assignedStaffId = staffId;
  (db.bookings[index] as any).assignedStaffName = staffName;
  db.save();

  logAction(user.id, user.email, `Assigned staff ${staffName} to booking ${booking.id}`, "BOOKING", booking.id);
  notifyUser(staffId, "Booking Assigned", `You have been assigned to shoot booking ${booking.id} on ${booking.bookingDate} at ${booking.timeSlot}.`, "info", booking.studioId);

  res.json({ success: true, booking: db.bookings[index] });
});

app.put("/api/bookings/:id/checklist", (req, res) => {
  const index = db.bookings.findIndex(b => b.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Booking not found." });
  }

  const booking = db.bookings[index];
  const user = requireStudioAccess(req, res, booking.studioId);
  if (!user) return;

  const { checklist } = req.body;
  if (!Array.isArray(checklist)) {
    return res.status(400).json({ success: false, message: "Checklist must be an array." });
  }

  (db.bookings[index] as any).preShootChecklist = checklist;
  db.save();

  res.json({ success: true, booking: db.bookings[index] });
});

app.put("/api/bookings/:id/status", (req, res) => {
  const { status, amountPaid, paymentStatus } = req.body;
  const index = db.bookings.findIndex(b => b.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Booking not found." });
  }

  const original = db.bookings[index];
  const user = requireBookingAccess(req, res, original);
  if (!user || user.role === UserRole.CUSTOMER) {
    if (user?.role === UserRole.CUSTOMER) res.status(403).json({ success: false, message: "Customers cannot change booking status." });
    return;
  }
  const allowedTransitions: Record<string, string[]> = {
    Pending: ["Awaiting Payment", "Cancelled", "Expired"],
    "Awaiting Payment": ["Pending", "Confirmed", "Cancelled", "Expired"],
    Confirmed: ["Ongoing", "Completed", "Rescheduled", "Cancelled"],
    Rescheduled: ["Confirmed", "Cancelled"],
    Ongoing: ["Completed", "No Show"],
    Completed: []
  };
  if (status && status !== original.status && !allowedTransitions[original.status]?.includes(status)) {
    return res.status(400).json({ success: false, message: `Invalid booking status transition from ${original.status} to ${status}.` });
  }
  db.bookings[index] = {
    ...original,
    status: status || original.status,
    amountPaid: amountPaid !== undefined ? Number(amountPaid) : original.amountPaid,
    paymentStatus: paymentStatus || original.paymentStatus
  };

  // Auto-create photo proofing gallery when the booking is fulfilled/completed.
  if ((status || original.status) === "Completed") {
    const existingProofing = db.photoProofings.find(p => p.bookingId === original.id);
    if (!existingProofing) {
      const newGallery: PhotoProofingGallery = {
        id: generateId("PRF"),
        bookingId: original.id,
        studioId: original.studioId,
        customerId: original.customerId,
        photos: [],
        watermarkText: `${db.studios.find(s => s.id === original.studioId)?.name?.toUpperCase() || "CAINTA STUDIO"} - PROOF ONLY`,
        watermarkPosition: "repeat_diagonal",
        watermarkOpacity: 0.35,
        status: "sent_to_client",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.addPhotoProofing(newGallery);
      notifyUser(
        original.customerId,
        "Photo Proofing Gallery Ready",
        `Your photo proofing gallery for Booking #${original.id} is now ready for review.`,
        "success",
        original.studioId
      );
    }
  }

  db.save();

  // Notify customer
  notifyUser(original.customerId, `Booking Status Updated`, `Your booking ${original.id} status is now: ${status || original.status}`, "success");

  res.json({ success: true, booking: db.bookings[index] });
});

app.put("/api/bookings/:id/requirements", async (req, res) => {
  const { fileName, fileData } = req.body;
  const index = db.bookings.findIndex(b => b.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Booking not found." });
  }
  const user = requireBookingAccess(req, res, db.bookings[index], false);
  if (!user) return;
  if (user.role !== UserRole.CUSTOMER) {
    return res.status(403).json({ success: false, message: "Only the booking customer can submit requirements." });
  }
  if (!fileData || typeof fileData !== "string") {
    return res.status(400).json({ success: false, message: "A requirement file is required." });
  }
  const media = await saveProtectedMedia(user.id, "booking", req.params.id, "BOOKING_REQUIREMENT", fileData, fileName || "booking-requirement");
  if (!media) {
    return res.status(400).json({ success: false, message: "Requirement must be a supported image or PDF smaller than 8 MB." });
  }
  db.bookings[index].requirementsDoc = `/api/media/${media.mediaId}`;
  db.save();
  res.json({ success: true, booking: db.bookings[index] });
});

// Payments
function syncBookingPaymentTotals(booking: Booking) {
  const bookingPayments = db.payments.filter(payment => payment.bookingId === booking.id);
  const verifiedPayments = bookingPayments.filter(payment => payment.paymentStatus === "Paid");
  const paidAmount = Math.min(booking.totalAmount, verifiedPayments.reduce((sum, payment) => sum + Number(payment.amount), 0));
  const hasPendingPayment = bookingPayments.some(payment => payment.paymentStatus === "Pending Verification");

  booking.amountPaid = paidAmount;
  booking.remainingBalance = Math.max(0, booking.totalAmount - paidAmount);
  booking.finalPaymentStatus = booking.remainingBalance === 0 ? "Paid" : "Pending";
  booking.paymentStatus = hasPendingPayment
    ? "Pending Verification"
    : booking.finalPaymentStatus === "Paid"
      ? "Paid"
      : paidAmount > 0
        ? "Partially Paid"
        : "Unpaid";

  if (booking.finalPaymentStatus === "Paid" || paidAmount >= booking.downPaymentAmount) {
    booking.status = "Confirmed";
  }
}

app.get("/api/payments", (req, res) => {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;
  const { studioId, customerId } = req.query;
  let filtered = db.payments.map(p => ({
    ...p,
    status: (p as any).status || p.paymentStatus
  }));
  if (user.role === UserRole.CUSTOMER) {
    filtered = filtered.filter(p => p.customerId === user.id);
  } else if (user.role === UserRole.STUDIO_ADMIN || user.role === UserRole.STUDIO_STAFF) {
    filtered = filtered.filter(p => p.studioId === user.studioId);
  }
  if (studioId && user.role === UserRole.SUPER_ADMIN) filtered = filtered.filter(p => p.studioId === studioId);
  if (customerId && user.role === UserRole.SUPER_ADMIN) filtered = filtered.filter(p => p.customerId === customerId);
  res.json({ success: true, payments: filtered });
});

app.post("/api/payments", async (req, res) => {
  try {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;
  const { bookingId, amount, paymentMethod, referenceNumber, proofOfPayment, paymentType } = req.body;
  const booking = db.bookings.find(item => item.id === bookingId);
  const paymentAmount = Number(amount);
  const requestedPaymentType = (paymentType === "Full Payment" ? "Full Payment" : paymentType === "Balance" ? "Balance" : "Downpayment");

  if (!booking || user.role !== UserRole.CUSTOMER || booking.customerId !== user.id) {
    return res.status(400).json({ success: false, message: "The payment does not match a valid booking." });
  }
  if (["Cancelled", "Rejected", "Expired"].includes(booking.status)) {
    return res.status(400).json({ success: false, message: "This booking cannot accept a payment." });
  }

  // Determine expected amount per payment type
  let expectedAmount: number;
  if (requestedPaymentType === "Full Payment") {
    // Fresh full payment — no prior downpayment
    expectedAmount = booking.totalAmount;
  } else if (requestedPaymentType === "Balance") {
    // Customer paying the remaining balance after a downpayment
    syncBookingPaymentTotals(booking);
    expectedAmount = booking.remainingBalance;
    if (booking.amountPaid < (booking.downPaymentAmount || 0)) {
      return res.status(400).json({ success: false, message: "Downpayment must be verified before submitting the remaining balance." });
    }
  } else {
    expectedAmount = booking.downPaymentAmount;
  }

  if (!Number.isFinite(paymentAmount) || Math.abs(paymentAmount - expectedAmount) > 0.01) {
    return res.status(400).json({ success: false, message: `The selected ${requestedPaymentType.toLowerCase()} must be exactly ₱${Number(expectedAmount).toLocaleString()}.` });
  }
  if (!["Cash", "GCash", "Bank Transfer", "Online Payment"].includes(paymentMethod)) {
    return res.status(400).json({ success: false, message: "Choose a valid payment method." });
  }
  if (paymentMethod !== "Cash" && (!referenceNumber?.trim() || !proofOfPayment)) {
    return res.status(400).json({ success: false, message: "Reference number and proof of payment are required for this payment method." });
  }
  if (proofOfPayment && !parseMediaData(proofOfPayment)) {
    return res.status(400).json({ success: false, message: "Proof of payment must be a JPEG, PNG, WebP, or PDF file smaller than 8 MB." });
  }
  // Block duplicate submissions — but only for the same payment type
  if (db.payments.some(payment =>
    payment.bookingId === bookingId &&
    payment.paymentType === requestedPaymentType &&
    ["Pending Verification", "Paid"].includes(payment.paymentStatus)
  )) {
    return res.status(400).json({ success: false, message: `A ${requestedPaymentType.toLowerCase()} has already been submitted for this booking.` });
  }

  // Security Check: Duplicate Reference Number Validation
  if (referenceNumber && referenceNumber.trim()) {
    const cleanRef = referenceNumber.trim();
    const duplicatePayment = db.payments.find(p => p.referenceNumber && p.referenceNumber.trim().toUpperCase() === cleanRef.toUpperCase());
    if (duplicatePayment) {
      return res.status(400).json({ 
        success: false, 
        message: `Security Alert: Reference number '${cleanRef}' has already been submitted for Payment ${duplicatePayment.id}. Duplicate receipts are strictly rejected.` 
      });
    }
  }
  
  const paymentId = generateId("PAY");
  const paymentMedia = proofOfPayment ? await saveProtectedMedia(user.id, "payment", paymentId, "PAYMENT_PROOF", proofOfPayment, "payment-proof") : null;
  const newPayment: Payment = {
    id: paymentId,
    bookingId,
    studioId: booking.studioId,
    customerId: booking.customerId,
    amount: paymentAmount,
    paymentType: requestedPaymentType,
    paymentMethod,
    paymentStatus: "Pending Verification",
    referenceNumber,
    proofOfPayment: paymentMedia ? `/api/media/${paymentMedia.mediaId}` : undefined,
    paymentDate: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    reviewedBy: undefined,
    reviewedAt: undefined
  };
  (newPayment as any).status = "For Verification";

  db.addPayment(newPayment);
  logAction(user.id, user.email, `Submitted ${requestedPaymentType.toLowerCase()}`, "PAYMENT", paymentId);

  syncBookingPaymentTotals(booking);
  db.save();

  // Notify studio admin and customer through in-app notification and email.
  const studioAdmin = db.users.find(u => u.studioId === booking.studioId && u.role === UserRole.STUDIO_ADMIN);
  if (studioAdmin) {
    notifyUser(
      studioAdmin.id, 
      "Payment Submitted for Verification",
      `A ${paymentMethod} ${requestedPaymentType} for Booking ${bookingId} was submitted for studio verification. Your slot is not confirmed until the payment is verified.`,
      "info",
      booking.studioId
    );
  }
  notifyUser(
    booking.customerId,
    "Payment Submitted for Verification",
    `Your ${paymentMethod} ${requestedPaymentType} of ₱${paymentAmount.toLocaleString()} for Booking ${bookingId} is awaiting studio verification.`,
    "info",
    booking.studioId
  );

  res.json({ success: true, payment: newPayment });
  } catch (err: any) {
    console.error("[POST /api/payments] Unhandled error:", err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: err?.message || "An unexpected error occurred while submitting your payment." });
    }
  }
});

app.get("/api/media/:id", async (req, res) => {
  const media = db.mediaFiles.find(item => item.id === req.params.id && item.accessStatus === "active");
  if (!media) {
    return res.status(404).json({ success: false, message: "Media file not found." });
  }
  const publicPurposes = ["STUDIO_LOGO", "STUDIO_COVER", "SERVICE_IMAGE", "PACKAGE_IMAGE", "ADDON_IMAGE", "PRINT_PRODUCT_IMAGE", "SYSTEM_DEMO_VIDEO"];
  const relatedStudioId = media.entityType === "studio"
    ? media.entityId
    : media.entityType === "service"
      ? db.services.find(item => item.id === media.entityId)?.studioId
      : media.entityType === "package"
        ? db.packages.find(item => item.id === media.entityId)?.studioId
        : media.entityType === "print-product"
          ? db.printProducts.find(item => item.id === media.entityId)?.studioId
          : media.entityType === "addon"
            ? db.addons.find(item => item.id === media.entityId)?.studioId
        : undefined;
  const relatedStudio = relatedStudioId ? db.studios.find(item => item.id === relatedStudioId) : undefined;
  const isPublicMedia = (publicPurposes.includes(media.purpose) && !!relatedStudio && (relatedStudio.isApproved || relatedStudio.status === "approved")) ||
    (media.purpose === "HERO_BACKGROUND" && media.entityType === "cms" && media.entityId === "heroBackground") ||
    (media.purpose === "SYSTEM_DEMO_VIDEO" && media.entityType === "system" && media.entityId === "demo-video");

  let user = null as any;
  if (isPublicMedia) {
    user = getAuthenticatedUser(req);
  } else {
    user = requireAuthenticatedUser(req, res);
    if (!user) return;
    if (!canAccessMedia(user, media)) {
      return res.status(404).json({ success: false, message: "Media file not found." });
    }
  }

  // If storageKey is a Cloudinary URL (starts with https://), redirect directly.
  // This avoids proxying the file through the server and survives restarts.
  if (media.storageKey.startsWith("https://")) {
    res.setHeader("Cache-Control", isPublicMedia ? "public, max-age=31536000, immutable" : "private, no-store");
    return res.redirect(302, media.storageKey);
  }

  // Fallback: serve from local disk (dev environment / legacy files)
  try {
    const fileBuffer = await fs.readFile(path.join(MEDIA_ROOT, media.storageKey));
    res.type(media.mimeType);
    res.setHeader("Cache-Control", "private, no-store");
    return res.send(fileBuffer);
  } catch {
    return res.status(404).json({ success: false, message: "Media file is unavailable." });
  }
});

app.put("/api/payments/:id/verify", (req, res) => {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;
  const { approved, reason } = req.body;
  const index = db.payments.findIndex(p => p.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Payment not found." });
  }

  const payment = db.payments[index];
  if (!canManageStudioPayment(user, payment.studioId)) {
    return res.status(403).json({ success: false, message: "You are not allowed to review this payment." });
  }
  if (payment.paymentStatus !== "Pending Verification") {
    return res.status(400).json({ success: false, message: "Only pending payments can be verified." });
  }
  const paymentBooking = db.bookings.find(item => item.id === payment.bookingId);
  if (!paymentBooking || ["Cancelled", "Expired"].includes(paymentBooking.status)) {
    return res.status(400).json({ success: false, message: "Payments cannot be verified for cancelled or expired bookings." });
  }
  if (typeof approved !== "boolean") {
    return res.status(400).json({ success: false, message: "An explicit approval decision is required." });
  }
  if (!approved && !String(reason || "").trim()) {
    return res.status(400).json({ success: false, message: "A rejection reason is required." });
  }
  db.payments[index].paymentStatus = approved ? "Paid" : "Failed";
  (db.payments[index] as any).status = approved ? "Verified" : "Rejected";
  (db.payments[index] as any).reviewedBy = user.id;
  (db.payments[index] as any).reviewedAt = new Date().toISOString();
  (db.payments[index] as any).rejectionReason = approved ? undefined : String(reason).trim();
  db.save();

  // Also update booking status
  const bIndex = db.bookings.findIndex(b => b.id === payment.bookingId);
  if (bIndex !== -1) {
    syncBookingPaymentTotals(db.bookings[bIndex]);
    if (!approved) db.bookings[bIndex].status = "Pending";
    db.save();
    
    // Notify customer
    const customer = db.customers.find(c => c.id === db.bookings[bIndex].customerId) || db.users.find(u => u.id === db.bookings[bIndex].customerId);
    if (approved && customer?.email) {
      const receiptDoc = buildBookingReceiptPDF(db.bookings[bIndex], db.studios.find(s => s.id === payment.studioId), payment);
      const pdfBuffer = Buffer.from(receiptDoc.output("arraybuffer"));
      sendReceiptCopyEmail(
        customer.email,
        "Official Receipt Copy",
        `Your official receipt for Booking ${payment.bookingId} is attached here. Please keep this copy for your records.`,
        `Receipt_${payment.bookingId}_CaintaMIS.pdf`,
        pdfBuffer
      ).catch(err => console.warn("[SMTP] Receipt copy email warning:", err));
    }
    notifyUser(
      db.bookings[bIndex].customerId,
      approved ? "Payment Verified & Slot Confirmed" : "Downpayment Rejected",
      approved
        ? `Your downpayment of ₱${payment.amount} has been verified for booking ${payment.bookingId}. Remaining balance: ₱${db.bookings[bIndex].remainingBalance}.`
        : `Your downpayment for booking ${payment.bookingId} was rejected. Reason: ${String(reason).trim()}`,
      approved ? "success" : "error",
      payment.studioId
    );
  }

  logAction(user.id, user.email, approved ? "Approved downpayment" : "Rejected downpayment", "PAYMENT", payment.id);

  res.json({ success: true, payment: db.payments[index] });
});

app.post("/api/bookings/:id/balance-payment", (req, res) => {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;
  const booking = db.bookings.find(item => item.id === req.params.id);
  const amount = Number(req.body.amount);
  if (!booking) return res.status(404).json({ success: false, message: "Booking not found." });
  if (!canManageStudioPayment(user, booking.studioId)) {
    return res.status(403).json({ success: false, message: "You are not allowed to record this payment." });
  }
  syncBookingPaymentTotals(booking);
  if (booking.amountPaid < booking.downPaymentAmount) {
    return res.status(400).json({ success: false, message: "Verify the down payment before recording the remaining balance." });
  }
  if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount - booking.remainingBalance) > 0.01) {
    return res.status(400).json({ success: false, message: `Balance payment must be exactly ₱${booking.remainingBalance.toLocaleString()}.` });
  }

  const payment: Payment = {
    id: generateId("PAY"), bookingId: booking.id, studioId: booking.studioId, customerId: booking.customerId,
    amount, paymentType: "Balance", paymentMethod: req.body.paymentMethod || "Cash", paymentStatus: "Paid",
    referenceNumber: req.body.referenceNumber, paymentDate: new Date().toISOString(), createdAt: new Date().toISOString()
  };
  db.addPayment(payment);
  syncBookingPaymentTotals(booking);
  db.save();
  const customer = db.customers.find(c => c.id === booking.customerId) || db.users.find(u => u.id === booking.customerId);
  if (customer?.email) {
    const receiptDoc = buildBookingReceiptPDF(booking, db.studios.find(s => s.id === booking.studioId), payment);
    const pdfBuffer = Buffer.from(receiptDoc.output("arraybuffer"));
    sendReceiptCopyEmail(
      customer.email,
      "Final Payment Receipt Copy",
      `Your final payment receipt for Booking ${booking.id} is attached here. Thank you for choosing Cainta Photography Studio.`,
      `Receipt_${booking.id}_CaintaMIS.pdf`,
      pdfBuffer
    ).catch(err => console.warn("[SMTP] Final receipt copy email warning:", err));
  }
  notifyUser(booking.customerId, "Final Payment Recorded", `Your final payment of ₱${amount} has been recorded at the studio. Your booking is fully paid.`, "success", booking.studioId);
  res.json({ success: true, payment, booking });
});

// ──────────────────────────────────────────────────────────────────
// REFUND ENDPOINT — Studio admin / super-admin only
// PUT /api/payments/:id/refund
// ──────────────────────────────────────────────────────────────────
app.put("/api/payments/:id/refund", async (req, res) => {
  try {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;

  const index = db.payments.findIndex(p => p.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Payment not found." });
  }

  const payment = db.payments[index];

  // Only studio admin (for their own studio) or super admin can process refunds
  if (!canManageStudioPayment(user, payment.studioId)) {
    return res.status(403).json({ success: false, message: "You are not allowed to process refunds for this payment." });
  }

  // Only paid payments can be refunded
  if (payment.paymentStatus !== "Paid") {
    return res.status(400).json({
      success: false,
      message: `Only verified/paid payments can be refunded. Current status: ${payment.paymentStatus}`
    });
  }

  const reason = String(req.body.reason || "Refund requested by studio").trim();
  const refundAmount = Number(req.body.refundAmount) || payment.amount;

  if (!Number.isFinite(refundAmount) || refundAmount <= 0 || refundAmount > payment.amount) {
    return res.status(400).json({ success: false, message: `Refund amount must be between ₱1 and ₱${payment.amount.toLocaleString()}.` });
  }

  // Mark payment as refunded
  db.payments[index] = {
    ...payment,
    paymentStatus: "Refunded",
    reviewedBy: user.id,
    reviewedAt: new Date().toISOString(),
    rejectionReason: reason
  };
  (db.payments[index] as any).refundedAt = new Date().toISOString();
  (db.payments[index] as any).refundAmount = refundAmount;
  (db.payments[index] as any).refundReason = reason;
  (db.payments[index] as any).refundedBy = user.id;

  // Update booking payment status
  const bookingIndex = db.bookings.findIndex(b => b.id === payment.bookingId);
  if (bookingIndex !== -1) {
    const booking = db.bookings[bookingIndex];
    syncBookingPaymentTotals(booking);
    // Override paymentStatus to Refunded after sync
    const isFullRefund = refundAmount >= booking.amountPaid;
    booking.paymentStatus = "Refunded";
    booking.amountPaid = Math.max(0, booking.amountPaid - refundAmount);
    booking.remainingBalance = Math.min(booking.totalAmount, booking.totalAmount - booking.amountPaid);
    if (isFullRefund) {
      booking.status = "Cancelled";
      booking.cancellationReason = `Refund issued: ${reason}`;
      booking.cancelledAt = new Date().toISOString();
      booking.cancelledBy = user.id;
    }
    db.save();

    // Notify customer
    const studio = db.studios.find(s => s.id === payment.studioId);
    const studioName = studio?.name || "the studio";
    const customer = db.customers.find(c => c.id === booking.customerId) || db.users.find(u => u.id === booking.customerId);

    notifyUser(
      booking.customerId,
      "Refund Processed",
      `₱${refundAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })} refund for Booking ${booking.id} has been processed by ${studioName}. Reason: ${reason}`,
      "warning",
      payment.studioId
    );

    // Email notification to customer
    if (customer?.email) {
      sendEmailNotification(
        customer.email,
        `Refund Processed — ₱${refundAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
        `Your refund of ₱${refundAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })} for Booking ${booking.id} at ${studioName} has been processed.\n\nReason: ${reason}\n\nPayment ID: ${payment.id}\nRefund Date: ${new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}\n\nPlease allow 3–7 business days for the refund to reflect in your account.`,
        "warning"
      );
    }

    logAction(user.id, (user as any).email || user.id, `Processed ₱${refundAmount} refund for booking ${booking.id}`, "PAYMENT", payment.id);
  }

  db.save();
  res.json({ success: true, payment: db.payments[index], message: `₱${refundAmount.toLocaleString()} refund processed successfully.` });
  } catch (err: any) {
    console.error("[Refund] Unexpected error:", err?.message || err);
    res.status(500).json({ success: false, message: err?.message || "An unexpected error occurred while processing the refund." });
  }
});

// ──────────────────────────────────────────────────────────────────
// BOOKING RESCHEDULE — Customer or Studio admin
// PUT /api/bookings/:id/reschedule
// ──────────────────────────────────────────────────────────────────
app.put("/api/bookings/:id/reschedule", async (req, res) => {
  try {
  const index = db.bookings.findIndex(b => b.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Booking not found." });
  }

  const booking = db.bookings[index];
  const user = requireBookingAccess(req, res, booking, false);
  if (!user) return;

  // Only customers can request reschedule on their own bookings;
  // studio admin can also reschedule confirmed/rescheduled bookings.
  const reschedulableStatuses = ["Confirmed", "Rescheduled", "Awaiting Payment", "Pending"];
  if (!reschedulableStatuses.includes(booking.status)) {
    return res.status(400).json({
      success: false,
      message: `Bookings in '${booking.status}' status cannot be rescheduled.`
    });
  }

  if (user.role === UserRole.CUSTOMER && booking.customerId !== user.id) {
    return res.status(403).json({ success: false, message: "You can only reschedule your own bookings." });
  }

  const { newDate, newTimeSlot, reason } = req.body;

  if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(newDate))) {
    return res.status(400).json({ success: false, message: "A valid new booking date (YYYY-MM-DD) is required." });
  }
  if (!newTimeSlot || typeof newTimeSlot !== "string") {
    return res.status(400).json({ success: false, message: "A new time slot is required." });
  }

  // Date must be today or future
  const requestedDate = new Date(`${newDate}T00:00:00`);
  if (Number.isNaN(requestedDate.getTime()) || requestedDate < new Date(new Date().toDateString())) {
    return res.status(400).json({ success: false, message: "Reschedule date must be today or a future date." });
  }

  const dayName = requestedDate.toLocaleDateString("en-US", { weekday: "long" });
  const dayOfWeek = requestedDate.getDay();

  // Studio availability check
  const studioAvailability = db.availabilities.find(a => a.studioId === booking.studioId && a.dayOfWeek === dayOfWeek);
  if (studioAvailability && !studioAvailability.isAvailable) {
    return res.status(400).json({ success: false, message: `The studio is closed on ${dayName}. Please choose another day.` });
  }
  if (studioAvailability) {
    const start = parseHHMM(studioAvailability.openingTime);
    const end = parseHHMM(studioAvailability.closingTime);
    const slotStart = parseTimeToMinutes(newTimeSlot);
    if (slotStart < start || slotStart >= end) {
      return res.status(400).json({ success: false, message: "The selected time is outside the studio's working hours." });
    }
  }

  // Blackout check
  const blackout = db.blackouts.find(b => b.studioId === booking.studioId && b.blackoutDate === newDate);
  if (blackout) {
    const blackStart = parseHHMM(blackout.startTime);
    const blackEnd = parseHHMM(blackout.endTime);
    const slotStart = parseTimeToMinutes(newTimeSlot);
    if (slotStart >= blackStart && slotStart < blackEnd) {
      return res.status(400).json({ success: false, message: `The studio is blocked on ${newDate}: ${blackout.reason || "scheduled closure"}.` });
    }
  }

  // Determine shoot duration for overlap check
  let shootDuration = 60;
  if (booking.packageId) {
    const pkg = db.packages.find(p => p.id === booking.packageId);
    if (pkg?.durationMinutes) shootDuration = pkg.durationMinutes;
  } else if (booking.serviceId) {
    const srv = db.services.find(s => s.id === booking.serviceId);
    if (srv?.durationMinutes) shootDuration = srv.durationMinutes;
  }

  const newStartMinutes = parseTimeToMinutes(newTimeSlot);
  const newEndMinutes = newStartMinutes + shootDuration;

  // Time-range overlap check (exclude the current booking itself)
  const overlapping = db.bookings.find(b => {
    if (b.id === booking.id) return false;
    if (b.studioId !== booking.studioId || b.bookingDate !== newDate) return false;
    if (["Cancelled", "Rejected", "Expired"].includes(b.status)) return false;

    let existingDuration = 60;
    if (b.packageId) {
      const p = db.packages.find(pkg => pkg.id === b.packageId);
      if (p?.durationMinutes) existingDuration = p.durationMinutes;
    } else if (b.serviceId) {
      const s = db.services.find(srv => srv.id === b.serviceId);
      if (s?.durationMinutes) existingDuration = s.durationMinutes;
    }
    const existingStart = parseTimeToMinutes(b.timeSlot);
    const existingEnd = existingStart + existingDuration;
    return newStartMinutes < existingEnd && newEndMinutes > existingStart;
  });

  if (overlapping) {
    return res.status(400).json({
      success: false,
      message: `Time slot conflict! Booking #${overlapping.id} is already scheduled at ${overlapping.timeSlot} on ${newDate}. Please choose a different time.`
    });
  }

  const oldDate = booking.bookingDate;
  const oldSlot = booking.timeSlot;
  const rescheduleReason = String(reason || "Customer requested reschedule").trim();

  db.bookings[index] = {
    ...booking,
    bookingDate: newDate,
    timeSlot: newTimeSlot,
    status: "Rescheduled",
  };
  (db.bookings[index] as any).rescheduleReason = rescheduleReason;
  (db.bookings[index] as any).rescheduledAt = new Date().toISOString();
  (db.bookings[index] as any).rescheduledBy = user.id;
  (db.bookings[index] as any).previousDate = oldDate;
  (db.bookings[index] as any).previousTimeSlot = oldSlot;

  db.save();

  const studio = db.studios.find(s => s.id === booking.studioId);
  const studioName = studio?.name || "the studio";

  // Notify both parties
  if (user.role === UserRole.CUSTOMER) {
    // Notify studio admin
    const studioAdmin = db.users.find(u => u.studioId === booking.studioId && u.role === UserRole.STUDIO_ADMIN);
    if (studioAdmin) {
      notifyUser(
        studioAdmin.id,
        "Booking Rescheduled by Customer",
        `Booking ${booking.id} has been rescheduled from ${oldDate} ${oldSlot} to ${newDate} ${newTimeSlot}. Reason: ${rescheduleReason}`,
        "warning",
        booking.studioId
      );
    }
    notifyUser(
      booking.customerId,
      "Reschedule Confirmed",
      `Your booking ${booking.id} has been rescheduled to ${newDate} at ${newTimeSlot} at ${studioName}.`,
      "success",
      booking.studioId
    );
  } else {
    // Studio rescheduled — notify customer
    notifyUser(
      booking.customerId,
      `Booking Rescheduled by ${studioName}`,
      `Your booking ${booking.id} has been rescheduled from ${oldDate} ${oldSlot} to ${newDate} at ${newTimeSlot}. Reason: ${rescheduleReason}. Please contact the studio if you have concerns.`,
      "warning",
      booking.studioId
    );
  }

  // Email notifications
  const customer = db.customers.find(c => c.id === booking.customerId) || db.users.find(u => u.id === booking.customerId);
  if (customer?.email) {
    sendEmailNotification(
      customer.email,
      `Booking Rescheduled — ${newDate} at ${newTimeSlot}`,
      `Your booking ${booking.id} at ${studioName} has been rescheduled.\n\nPrevious: ${oldDate} at ${oldSlot}\nNew Schedule: ${newDate} at ${newTimeSlot}\n\nReason: ${rescheduleReason}\n\nIf you did not request this change or have concerns, please contact ${studioName} directly.`,
      "info"
    );
  }

  logAction(user.id, (user as any).email || user.id, `Rescheduled booking ${booking.id} from ${oldDate} to ${newDate} ${newTimeSlot}`, "BOOKING", booking.id);

  res.json({ success: true, booking: db.bookings[index] });
  } catch (err: any) {
    console.error("[Reschedule] Unexpected error:", err?.message || err);
    res.status(500).json({ success: false, message: err?.message || "An unexpected error occurred while rescheduling." });
  }
});

// ── Archive a booking (soft-delete) ─────────────────────────────────────────
// Allowed for: SUPER_ADMIN (any booking), STUDIO_ADMIN (own studio), CUSTOMER (own booking — only terminal statuses)
app.put("/api/bookings/:id/archive", (req, res) => {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;

  const idx = db.bookings.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Booking not found." });
  const booking = db.bookings[idx];

  // Role-based access
  const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;
  const isStudioOwner = (user.role === UserRole.STUDIO_ADMIN || user.role === UserRole.STUDIO_STAFF) && user.studioId === booking.studioId;
  const isOwningCustomer = user.role === UserRole.CUSTOMER && booking.customerId === user.id;
  if (!isSuperAdmin && !isStudioOwner && !isOwningCustomer) {
    return res.status(403).json({ success: false, message: "Access denied." });
  }

  // Customers can only archive terminal-status bookings
  const terminalStatuses = ["Completed", "Cancelled", "Rejected", "Expired", "No Show"];
  if (isOwningCustomer && !terminalStatuses.includes(booking.status)) {
    return res.status(409).json({ success: false, message: "Only completed, cancelled, or expired bookings can be archived." });
  }

  db.bookings[idx] = {
    ...booking,
    isArchived: true,
    archivedAt: new Date().toISOString(),
    archivedBy: user.id
  };
  db.save();
  logAction(user.id, (user as any).email || user.id, `Archived booking ${booking.id}`, "BOOKING", booking.id);
  res.json({ success: true, booking: db.bookings[idx] });
});

// ── Unarchive a booking ──────────────────────────────────────────────────────
app.put("/api/bookings/:id/unarchive", (req, res) => {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;

  const idx = db.bookings.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Booking not found." });
  const booking = db.bookings[idx];

  const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;
  const isStudioOwner = (user.role === UserRole.STUDIO_ADMIN || user.role === UserRole.STUDIO_STAFF) && user.studioId === booking.studioId;
  const isOwningCustomer = user.role === UserRole.CUSTOMER && booking.customerId === user.id;
  if (!isSuperAdmin && !isStudioOwner && !isOwningCustomer) {
    return res.status(403).json({ success: false, message: "Access denied." });
  }

  db.bookings[idx] = {
    ...booking,
    isArchived: false,
    archivedAt: undefined,
    archivedBy: undefined
  };
  db.save();
  logAction(user.id, (user as any).email || user.id, `Unarchived booking ${booking.id}`, "BOOKING", booking.id);
  res.json({ success: true, booking: db.bookings[idx] });
});

// ── Permanently delete an archived booking ───────────────────────────────────
// Restricted to SUPER_ADMIN only
app.delete("/api/bookings/:id", (req, res) => {
  const admin = requireRole(req, res, UserRole.SUPER_ADMIN);
  if (!admin) return;

  const idx = db.bookings.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Booking not found." });
  const booking = db.bookings[idx];

  if (!booking.isArchived) {
    return res.status(409).json({ success: false, message: "Archive this booking first before permanently deleting." });
  }

  db.bookings.splice(idx, 1);
  db.save();
  logAction(admin.id, admin.email, `Permanently deleted booking ${booking.id}`, "BOOKING", booking.id);
  res.json({ success: true, message: "Booking permanently deleted." });
});

// Photo Proofing Endpoints
app.get("/api/photo-proofing/booking/:bookingId", (req, res) => {
  const booking = db.bookings.find(item => item.id === req.params.bookingId);
  if (!booking) return res.status(404).json({ success: false, message: "Booking not found." });
  if (!requireBookingAccess(req, res, booking)) return;
  const gallery = db.photoProofings.find(p => p.bookingId === req.params.bookingId);
  res.json({ success: true, gallery: gallery || null });
});

app.post("/api/photo-proofing", (req, res) => {
  const { bookingId, studioId, customerId, photos, watermarkText, watermarkPosition, watermarkOpacity } = req.body;
  const booking = db.bookings.find(item => item.id === bookingId);
  if (!booking || booking.studioId !== studioId || booking.customerId !== customerId) {
    return res.status(400).json({ success: false, message: "Gallery details do not match a valid booking." });
  }
  const user = requireStudioAccess(req, res, studioId);
  if (!user) return;
  
  const proofingId = generateId("PRF");
  const newGallery: PhotoProofingGallery = {
    id: proofingId,
    bookingId,
    studioId,
    customerId,
    photos: photos || [],
    watermarkText: watermarkText || "PROOF - CAINTA STUDIO",
    watermarkPosition: watermarkPosition || "repeat_diagonal",
    watermarkOpacity: watermarkOpacity !== undefined ? watermarkOpacity : 0.35,
    status: "sent_to_client",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.addPhotoProofing(newGallery);

  // Notify customer that photo proofing is ready
  notifyUser(
    customerId,
    "Photo Proofing Gallery Ready",
    `Your watermarked photo proofs for Booking #${bookingId} are now ready for review! Star your favorites for editing.`,
    "success",
    studioId
  );

  res.json({ success: true, gallery: newGallery });
});

app.put("/api/photo-proofing/:id/photos", (req, res) => {
  const { photos, status, watermarkText, watermarkOpacity, watermarkPosition } = req.body;
  const index = db.photoProofings.findIndex(p => p.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Photo proofing gallery not found." });
  }

  const existing = db.photoProofings[index];
  const booking = db.bookings.find(item => item.id === existing.bookingId);
  if (!booking || !requireBookingAccess(req, res, booking)) return;
  const user = getAuthenticatedUser(req);
  const studioOperator = user && user.role !== UserRole.CUSTOMER;
  if (studioOperator && user?.role !== UserRole.SUPER_ADMIN && user?.studioId !== existing.studioId) {
    return res.status(403).json({ success: false, message: "You do not have access to this gallery." });
  }
  if (user?.role === UserRole.CUSTOMER && status && status !== "client_reviewed") {
    return res.status(403).json({ success: false, message: "Customers can only submit gallery selections." });
  }
  db.photoProofings[index] = {
    ...existing,
    photos: photos || existing.photos,
    status: status || existing.status,
    watermarkText: watermarkText || existing.watermarkText,
    watermarkOpacity: watermarkOpacity !== undefined ? watermarkOpacity : existing.watermarkOpacity,
    watermarkPosition: watermarkPosition || existing.watermarkPosition,
    updatedAt: new Date().toISOString()
  };
  db.save();

  // Notify studio admin if customer reviewed
  if (status === "client_reviewed") {
    const studioAdmin = db.users.find(u => u.studioId === existing.studioId && u.role === UserRole.STUDIO_ADMIN);
    if (studioAdmin) {
      notifyUser(
        studioAdmin.id,
        "Photo Proofing Selections Submitted",
        `Customer reviewed photo proofs for Booking #${existing.bookingId} and submitted retouch notes.`,
        "info",
        existing.studioId
      );
    }
  }

  res.json({ success: true, gallery: db.photoProofings[index] });
});

app.put("/api/photo-proofing/:id/deliver", (req, res) => {
  const { finalDriveLink, status } = req.body;
  const index = db.photoProofings.findIndex(p => p.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Photo proofing gallery not found." });
  }

  const existing = db.photoProofings[index];
  if (!requireStudioAccess(req, res, existing.studioId)) return;
  db.photoProofings[index] = {
    ...existing,
    finalDriveLink: finalDriveLink || existing.finalDriveLink,
    status: status || "completed",
    updatedAt: new Date().toISOString()
  };
  db.save();

  // Notify customer
  notifyUser(
    existing.customerId,
    "Final High-Res Photos Delivered!",
    `Your high-resolution edited photoshoot files are ready for download! Access them via your Customer Dashboard portal.`,
    "success",
    existing.studioId
  );

  res.json({ success: true, gallery: db.photoProofings[index] });
});

// Notifications API
app.put("/api/notifications/:id/read", (req, res) => {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;
  const index = db.notifications.findIndex(n => n.id === req.params.id);
  if (index !== -1 && db.notifications[index].userId !== user.id) {
    return res.status(403).json({ success: false, message: "You cannot update another user's notification." });
  }
  if (index !== -1) {
    db.notifications[index].isRead = true;
    db.save();
  }
  res.json({ success: true });
});

app.post("/api/notifications/dispatch", (req, res) => {
  const actor = requireRole(req, res, UserRole.SUPER_ADMIN, UserRole.STUDIO_ADMIN);
  if (!actor) return;
  const { userId, studioId, channel, recipientContact, title, message, type } = req.body;
  const targetUser = db.users.find(u => u.id === userId) || db.customers.find(c => c.id === userId);

  if (!targetUser) {
    return res.status(404).json({ success: false, message: "Notification recipient not found." });
  }

  const targetStudioId = "studioId" in targetUser ? targetUser.studioId : undefined;
  if (studioId && targetUser.role !== UserRole.SUPER_ADMIN && targetStudioId !== studioId) {
    return res.status(403).json({ success: false, message: "Notification target is outside the user's studio." });
  }

  const notif: Notification = {
    id: generateId("DISPATCH"),
    userId,
    studioId,
    title: title || `${channel || "App"} Notification`,
    message,
    isRead: false,
    type: type || "info",
    channel: channel || "SMS",
    recipientContact: recipientContact || "+63 900 000 0000",
    createdAt: new Date().toISOString()
  };

  db.addNotification(notif);
  res.json({ success: true, notification: notif });
});

// Printing Products
app.get("/api/print-products", (req, res) => {
  const { studioId } = req.query;
  const filtered = (studioId ? db.printProducts.filter(p => p.studioId === studioId) : db.printProducts)
    .filter(product => product.isActive !== false)
    .map(product => {
    const images = db.mediaFiles
      .filter(media => media.entityType === "print-product" && media.entityId === product.id && media.purpose === "PRINT_PRODUCT_IMAGE" && media.accessStatus === "active")
      .map(media => `/api/media/${media.id}`);
    return { ...product, images: images.length > 0 ? images : (product.images?.length ? product.images : [product.image]) };
  });
  res.json({ success: true, products: filtered, printProducts: filtered });
});

app.post("/api/print-products", async (req, res) => {
  const { studioId, name, description, size, price, image, images, estimatedHours } = req.body;
  const user = requireStudioAccess(req, res, studioId);
  if (!user) return;
  const submittedImages = Array.isArray(images) ? images.filter((value: unknown): value is string => typeof value === "string" && value.length > 0) : [];
  const firstImage = submittedImages[0] || image || "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=300&fit=crop";
  const newProd: any = {
    id: generateId("PRD"),
    studioId,
    name,
    description,
    size,
    price: Number(price),
    image: firstImage,
    images: submittedImages,
    inStock: true,
    estimatedHours: Number(estimatedHours) || 24,
    isActive: true,
    createdAt: new Date().toISOString()
  };
  db.addPrintProduct(newProd);
  const savedImages: string[] = [];
  for (let index = 0; index < submittedImages.length; index += 1) {
    const media = await saveProtectedMedia(user.id, "print-product", newProd.id, "PRINT_PRODUCT_IMAGE", submittedImages[index], `print-product-${index + 1}`);
    if (!media) {
      return res.status(400).json({ success: false, message: "Each catalog image must be a JPEG, PNG, or WebP image smaller than 8 MB." });
    }
    savedImages.push(`/api/media/${media.mediaId}`);
  }
  if (savedImages.length > 0) {
    newProd.image = savedImages[0];
    newProd.images = savedImages;
    db.printProducts[db.printProducts.length - 1] = newProd;
    await db.save();
  }
  res.json({ success: true, product: newProd });
});

app.delete("/api/print-products/:id", async (req, res) => {
  const index = db.printProducts.findIndex(p => p.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Product not found." });
  }
  if (!requireStudioAccess(req, res, db.printProducts[index].studioId)) return;
  db.printProducts[index].isActive = false;
  try {
    await db.save();
  } catch {
    return res.status(500).json({ success: false, message: "Product could not be removed from storage." });
  }
  res.json({ success: true, message: "Print product removed." });
});

app.put("/api/print-products/:id", async (req, res) => {
  const index = db.printProducts.findIndex(product => product.id === req.params.id);
  if (index === -1) return res.status(404).json({ success: false, message: "Product not found." });
  const product = db.printProducts[index];
  const user = requireStudioAccess(req, res, product.studioId);
  if (!user) return;
  const { name, description, size, price, images, estimatedHours } = req.body;
  if (!String(name || "").trim() || !String(size || "").trim() || !Number.isFinite(Number(price))) {
    return res.status(400).json({ success: false, message: "Name, size, and a valid price are required." });
  }
  const submittedImages = Array.isArray(images) ? images.filter((value: unknown): value is string => typeof value === "string" && value.length > 0) : [];
  const savedImages: string[] = [];
  for (let imageIndex = 0; imageIndex < submittedImages.length; imageIndex += 1) {
    const media = await saveProtectedMedia(user.id, "print-product", product.id, "PRINT_PRODUCT_IMAGE", submittedImages[imageIndex], `print-product-${imageIndex + 1}`);
    if (!media) return res.status(400).json({ success: false, message: "Each catalog image must be a JPEG, PNG, or WebP image smaller than 8 MB." });
    savedImages.push(`/api/media/${media.mediaId}`);
  }
  if (savedImages.length > 0) {
    db.mediaFiles
      .filter(media => media.entityType === "print-product" && media.entityId === product.id && media.purpose === "PRINT_PRODUCT_IMAGE")
      .forEach(media => { media.accessStatus = "deleted"; });
  }
  db.printProducts[index] = {
    ...product,
    name: String(name).trim(),
    description: String(description || "Premium photo print option.").trim(),
    size: String(size).trim(),
    price: Number(price),
    estimatedHours: Number(estimatedHours) || 24,
    ...(savedImages.length > 0 ? { image: savedImages[0], images: savedImages } : {})
  };
  await db.save();
  res.json({ success: true, product: db.printProducts[index] });
});

// Print orders
app.get("/api/print-orders", (req, res) => {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;
  const { customerId, studioId } = req.query;
  let filtered = db.printOrders;
  if (user.role === UserRole.CUSTOMER) filtered = filtered.filter(o => o.customerId === user.id);
  else if (user.role === UserRole.STUDIO_ADMIN || user.role === UserRole.STUDIO_STAFF) filtered = filtered.filter(o => o.studioId === user.studioId);
  if (customerId && user.role === UserRole.SUPER_ADMIN) filtered = filtered.filter(o => o.customerId === customerId);
  if (studioId && user.role === UserRole.SUPER_ADMIN) filtered = filtered.filter(o => o.studioId === studioId);
  res.json({ success: true, printOrders: filtered });
});

app.post("/api/print-orders", async (req, res) => {
  // Print orders are pickup-only. Payment is always cash at the studio counter.
  // paymentMethod, referenceNumber, and proofOfPayment from the client are ignored.
  const { studioId, customerId, productId, quantity, uploadedPhoto, totalAmount } = req.body;
  const user = requireRole(req, res, UserRole.CUSTOMER);
  if (!user) return;
  if (customerId !== user.id) return res.status(403).json({ success: false, message: "Customer identity is derived from the authenticated session." });
  const product = db.printProducts.find(item => item.id === productId && item.studioId === studioId && item.isActive && item.inStock);
  const orderQuantity = Number(quantity);
  if (!product || !Number.isInteger(orderQuantity) || orderQuantity < 1 || orderQuantity > 100) {
    return res.status(400).json({ success: false, message: "The selected print product or quantity is invalid." });
  }
  const calculatedTotal = Number(product.price) * orderQuantity;
  if (!Number.isFinite(calculatedTotal) || Math.abs(calculatedTotal - Number(totalAmount)) > 0.01) {
    return res.status(400).json({ success: false, message: "The order total does not match the selected product and quantity." });
  }

  const orderId = generateId("PR-2026");
  const photoMedia = await saveProtectedMedia(user.id, "print-order", orderId, "PRINT_UPLOAD", uploadedPhoto, "print-photo");
  if (!photoMedia) {
    return res.status(400).json({ success: false, message: "The print photo must be a JPEG, PNG, or WebP image smaller than 8 MB." });
  }
  const newOrder: PrintOrder = {
    id: orderId,
    studioId,
    customerId,
    productId,
    quantity: orderQuantity,
    uploadedPhoto: `/api/media/${photoMedia.mediaId}`,
    status: "Pending",
    totalAmount: calculatedTotal,
    paymentMethod: "Cash",
    paymentStatus: "Unpaid",
    createdAt: new Date().toISOString()
  };

  db.addPrintOrder(newOrder);

  // Notify studio admin
  const studioAdmin = db.users.find(u => u.studioId === studioId && u.role === UserRole.STUDIO_ADMIN);
  if (studioAdmin) {
    notifyUser(studioAdmin.id, "New Print Order", `A new print order (${orderId}) has been received.`, "warning", studioId);
  }

  res.json({ success: true, printOrder: newOrder });
});

app.put("/api/print-orders/:id/cancel", (req, res) => {
  const index = db.printOrders.findIndex(o => o.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Print order not found." });
  }

  const order = db.printOrders[index];
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;

  const canCancel =
    (user.role === UserRole.CUSTOMER && order.customerId === user.id) ||
    (user.role === UserRole.SUPER_ADMIN) ||
    ((user.role === UserRole.STUDIO_ADMIN || user.role === UserRole.STUDIO_STAFF) && user.studioId === order.studioId);

  if (!canCancel) {
    return res.status(403).json({ success: false, message: "You cannot cancel this print order." });
  }

  const cancellableStatuses = ["Pending", "Confirmed", "Processing", "Quality Check", "Ready for Pickup"];
  if (!cancellableStatuses.includes(order.status)) {
    return res.status(400).json({ success: false, message: `Print orders in ${order.status} status cannot be cancelled.` });
  }

  const reason = String(req.body?.reason || "Customer requested cancellation").trim();
  db.printOrders[index] = {
    ...order,
    status: "Cancelled",
    paymentStatus: order.paymentStatus === "Paid" ? "Paid" : order.paymentStatus
  };
  db.save();

  notifyUser(order.customerId, "Print Order Cancelled", `Your print order ${order.id} has been cancelled. ${reason ? `Reason: ${reason}` : ""}`.trim(), "warning");
  res.json({ success: true, printOrder: db.printOrders[index] });
});

app.put("/api/print-orders/:id/status", (req, res) => {
  const { status } = req.body;
  const index = db.printOrders.findIndex(o => o.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Print order not found." });
  }

  const original = db.printOrders[index];
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;
  const canManage = user.role === UserRole.SUPER_ADMIN ||
    ((user.role === UserRole.STUDIO_ADMIN || user.role === UserRole.STUDIO_STAFF) && user.studioId === original.studioId);
  if (!canManage) return res.status(403).json({ success: false, message: "You cannot update this print order." });
  const allowedTransitions: Record<string, string[]> = {
    Pending: ["Confirmed", "Cancelled"],
    Confirmed: ["Processing", "Cancelled"],
    Processing: ["Quality Check", "Ready for Pickup", "Cancelled"],
    "Quality Check": ["Ready for Pickup", "Processing"],
    "Ready for Pickup": ["Completed"],
    Completed: [],
    Cancelled: []
  };
  if (status && status !== original.status && !allowedTransitions[original.status]?.includes(status)) {
    return res.status(400).json({ success: false, message: `Invalid print order transition from ${original.status} to ${status}.` });
  }
  if (status === "Completed" && original.paymentStatus !== "Paid") {
    return res.status(400).json({ success: false, message: "A print order must be paid before completion." });
  }
  db.printOrders[index] = {
    ...original,
    status: status || original.status
  };
  db.save();

  notifyUser(original.customerId, "Print Order Update", `Your print order ${original.id} status is now: ${status || original.status}`, "info");

  res.json({ success: true, printOrder: db.printOrders[index] });
});

app.put("/api/print-orders/:id/payment/record-cash", (req, res) => {
  const user = requireStudioAccess(req, res, db.printOrders.find(order => order.id === req.params.id)?.studioId || "");
  if (!user) return;
  const index = db.printOrders.findIndex(order => order.id === req.params.id);
  if (index === -1) return res.status(404).json({ success: false, message: "Print order not found." });
  
  if (db.printOrders[index].paymentStatus === "Paid") {
    return res.status(400).json({ success: false, message: "Order is already paid." });
  }

  const now = new Date().toISOString();
  db.printOrders[index].paymentStatus = "Paid";
  db.printOrders[index].paymentMethod = "Cash";
  (db.printOrders[index] as any).paidAt = now;
  (db.printOrders[index] as any).cashReceivedBy = user.id;

  if (req.body?.cashTendered !== undefined) {
    (db.printOrders[index] as any).cashTendered = Number(req.body.cashTendered);
  }
  if (req.body?.changeAmount !== undefined) {
    (db.printOrders[index] as any).changeAmount = Number(req.body.changeAmount);
  }

  // If markCompleted is true or if already Ready for Pickup, mark status as Completed
  if (req.body?.markCompleted !== false && (req.body?.markCompleted === true || db.printOrders[index].status === "Ready for Pickup")) {
    db.printOrders[index].status = "Completed";
  }

  db.save();

  logAction(
    user.id,
    (user as any).email || user.id,
    `Recorded cash on hand payment of ₱${db.printOrders[index].totalAmount} for Print Order ${db.printOrders[index].id} (Studio Counter Pickup)`,
    "PRINT_ORDER",
    db.printOrders[index].id
  );

  notifyUser(
    db.printOrders[index].customerId,
    "Payment Received & Order Released",
    `Your cash payment of ₱${db.printOrders[index].totalAmount} for print order ${db.printOrders[index].id} has been recorded at the studio counter. Thank you!`,
    "success",
    db.printOrders[index].studioId
  );

  const customer = db.customers.find(c => c.id === db.printOrders[index].customerId) || db.users.find(u => u.id === db.printOrders[index].customerId);
  if (customer?.email) {
    const product = db.printProducts.find(p => p.id === db.printOrders[index].productId);
    const receiptDoc = buildPrintOrderReceiptPDF(db.printOrders[index], db.studios.find(s => s.id === db.printOrders[index].studioId), product);
    const pdfBuffer = Buffer.from(receiptDoc.output("arraybuffer"));
    sendReceiptCopyEmail(
      customer.email,
      "Print Order Receipt Copy",
      `Your cash payment receipt for Print Order ${db.printOrders[index].id} is attached here.`,
      `Print_Order_${db.printOrders[index].id}_Receipt.pdf`,
      pdfBuffer
    ).catch(err => console.warn("[SMTP] Print receipt copy email warning:", err));
  }
  res.json({ success: true, printOrder: db.printOrders[index] });
});

// ── Archive a print order (soft-delete) ─────────────────────────────────────
app.put("/api/print-orders/:id/archive", (req, res) => {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;

  const idx = db.printOrders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Print order not found." });
  const order = db.printOrders[idx];

  const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;
  const isStudioOwner = (user.role === UserRole.STUDIO_ADMIN || user.role === UserRole.STUDIO_STAFF) && user.studioId === order.studioId;
  const isOwningCustomer = user.role === UserRole.CUSTOMER && order.customerId === user.id;
  if (!isSuperAdmin && !isStudioOwner && !isOwningCustomer) {
    return res.status(403).json({ success: false, message: "Access denied." });
  }

  const terminalStatuses = ["Completed", "Cancelled"];
  if (isOwningCustomer && !terminalStatuses.includes(order.status)) {
    return res.status(409).json({ success: false, message: "Only completed or cancelled print orders can be archived." });
  }

  db.printOrders[idx] = {
    ...order,
    isArchived: true,
    archivedAt: new Date().toISOString(),
    archivedBy: user.id
  };
  db.save();
  logAction(user.id, (user as any).email || user.id, `Archived print order ${order.id}`, "PRINT_ORDER", order.id);
  res.json({ success: true, printOrder: db.printOrders[idx] });
});

// ── Unarchive a print order ──────────────────────────────────────────────────
app.put("/api/print-orders/:id/unarchive", (req, res) => {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;

  const idx = db.printOrders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Print order not found." });
  const order = db.printOrders[idx];

  const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;
  const isStudioOwner = (user.role === UserRole.STUDIO_ADMIN || user.role === UserRole.STUDIO_STAFF) && user.studioId === order.studioId;
  const isOwningCustomer = user.role === UserRole.CUSTOMER && order.customerId === user.id;
  if (!isSuperAdmin && !isStudioOwner && !isOwningCustomer) {
    return res.status(403).json({ success: false, message: "Access denied." });
  }

  db.printOrders[idx] = {
    ...order,
    isArchived: false,
    archivedAt: undefined,
    archivedBy: undefined
  };
  db.save();
  logAction(user.id, (user as any).email || user.id, `Unarchived print order ${order.id}`, "PRINT_ORDER", order.id);
  res.json({ success: true, printOrder: db.printOrders[idx] });
});

// ── Permanently delete an archived print order ───────────────────────────────
app.delete("/api/print-orders/:id", (req, res) => {
  const admin = requireRole(req, res, UserRole.SUPER_ADMIN);
  if (!admin) return;

  const idx = db.printOrders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Print order not found." });
  const order = db.printOrders[idx];

  if (!order.isArchived) {
    return res.status(409).json({ success: false, message: "Archive this print order first before permanently deleting." });
  }

  db.printOrders.splice(idx, 1);
  db.save();
  logAction(admin.id, admin.email, `Permanently deleted print order ${order.id}`, "PRINT_ORDER", order.id);
  res.json({ success: true, message: "Print order permanently deleted." });
});

// Reviews
app.post("/api/reviews", (req, res) => {
  const { studioId, customerId, customerName, bookingId, rating, comment } = req.body;
  const user = requireRole(req, res, UserRole.CUSTOMER);
  if (!user) return;
  if (customerId !== user.id) return res.status(403).json({ success: false, message: "Customer identity is derived from the authenticated session." });
  
  // Verify completed booking exists and hasn't been reviewed yet
  const completedBooking = db.bookings.find(b => b.id === bookingId && b.customerId === customerId && b.status === "Completed");
  if (!completedBooking) {
    return res.status(400).json({ success: false, message: "You can only review completed bookings." });
  }

  const alreadyReviewed = db.reviews.some(r => r.bookingId === bookingId);
  if (alreadyReviewed) {
    return res.status(400).json({ success: false, message: "You have already reviewed this booking." });
  }
  if (!Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5 || !String(comment || "").trim()) {
    return res.status(400).json({ success: false, message: "A rating from 1 to 5 and a comment are required." });
  }

  const reviewId = generateId("REV");
  const newReview: Review = {
    id: reviewId,
    studioId,
    customerId,
    customerName,
    bookingId,
    rating: Number(rating),
    comment,
    status: "pending", // Requires admin approval before going public
    isVisible: true,
    createdAt: new Date().toISOString()
  };

  db.addReview(newReview);

  logAction(customerId, customerName, `Submitted review REV-${reviewId} for studio ${studioId}`, "REVIEW", reviewId);

  res.json({ success: true, review: newReview, message: "Your review has been submitted and is pending admin approval." });
});

// ====================================================================
// ADMIN REVIEW MANAGEMENT ENDPOINTS (SUPER_ADMIN only)
// ====================================================================

// GET all reviews (admin sees ALL statuses: pending, approved, rejected)
app.get("/api/admin/reviews", (req, res) => {
  if (!requireRole(req, res, UserRole.SUPER_ADMIN)) return;
  const allReviews = [...db.reviews].sort((a, b) => {
    // pending first, then approved, rejected last
    const order = { pending: 0, approved: 1, rejected: 2 };
    return (order[a.status] ?? 1) - (order[b.status] ?? 1);
  });
  res.json({ success: true, reviews: allReviews });
});

// Approve a review
app.put("/api/admin/reviews/:id/approve", (req, res) => {
  if (!requireRole(req, res, UserRole.SUPER_ADMIN)) return;
  const { id } = req.params;
  const idx = db.reviews.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Review not found." });

  db.reviews[idx].status = "approved";
  db.save();

  // Recalculate Studio Rating based on approved reviews only
  const studioId = db.reviews[idx].studioId;
  const studioIdx = db.studios.findIndex(s => s.id === studioId);
  if (studioIdx !== -1) {
    const approvedReviews = db.reviews.filter(r => r.studioId === studioId && r.status === "approved");
    const avgRating = approvedReviews.length > 0
      ? approvedReviews.reduce((sum, r) => sum + r.rating, 0) / approvedReviews.length
      : 0;
    db.studios[studioIdx].rating = parseFloat(avgRating.toFixed(1));
    db.studios[studioIdx].reviewCount = approvedReviews.length;
    db.save();
  }

  logAction("SYSTEM", "system@admin", `Approved review ${id}`, "REVIEW", id);
  res.json({ success: true, review: db.reviews[idx] });
});

// Reject a review
app.put("/api/admin/reviews/:id/reject", (req, res) => {
  if (!requireRole(req, res, UserRole.SUPER_ADMIN)) return;
  const { id } = req.params;
  const idx = db.reviews.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Review not found." });

  db.reviews[idx].status = "rejected";
  db.save();

  // Recalculate Studio Rating based on approved reviews only
  const studioId = db.reviews[idx].studioId;
  const studioIdx = db.studios.findIndex(s => s.id === studioId);
  if (studioIdx !== -1) {
    const approvedReviews = db.reviews.filter(r => r.studioId === studioId && r.status === "approved");
    const avgRating = approvedReviews.length > 0
      ? approvedReviews.reduce((sum, r) => sum + r.rating, 0) / approvedReviews.length
      : 0;
    db.studios[studioIdx].rating = parseFloat(avgRating.toFixed(1));
    db.studios[studioIdx].reviewCount = approvedReviews.length;
    db.save();
  }

  logAction("SYSTEM", "system@admin", `Rejected review ${id}`, "REVIEW", id);
  res.json({ success: true, review: db.reviews[idx] });
});

// Hard delete a review (admin only)
app.delete("/api/admin/reviews/:id", (req, res) => {
  if (!requireRole(req, res, UserRole.SUPER_ADMIN)) return;
  const { id } = req.params;
  const idx = db.reviews.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Review not found." });

  const studioId = db.reviews[idx].studioId;
  db.reviews.splice(idx, 1);
  db.save();

  // Recalculate Studio Rating after deletion
  const studioIdx = db.studios.findIndex(s => s.id === studioId);
  if (studioIdx !== -1) {
    const approvedReviews = db.reviews.filter(r => r.studioId === studioId && r.status === "approved");
    const avgRating = approvedReviews.length > 0
      ? approvedReviews.reduce((sum, r) => sum + r.rating, 0) / approvedReviews.length
      : 0;
    db.studios[studioIdx].rating = parseFloat(avgRating.toFixed(1));
    db.studios[studioIdx].reviewCount = approvedReviews.length;
    db.save();
  }

  logAction("SYSTEM", "system@admin", `Deleted review ${id}`, "REVIEW", id);
  res.json({ success: true, message: "Review deleted successfully." });
});

// ====================================================================
// STUDIO OWNER REVIEW ENDPOINTS (STUDIO_ADMIN only)
// ====================================================================

// GET reviews for a specific studio (studio owner sees pending + approved, not rejected)
app.get("/api/studio/reviews", (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ success: false, message: "studioId is required." });
  if (!requireStudioAccess(req, res, String(studioId))) return;
  const studioReviews = db.reviews
    .filter(r => r.studioId === studioId && r.status !== "rejected")
    .map(r => ({ ...r, isVisible: r.isVisible !== false }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({ success: true, reviews: studioReviews });
});

// Studio owner toggles whether a review is visible publicly
app.put("/api/studio/reviews/:id/visibility", (req, res) => {
  const { id } = req.params;
  const { studioId, visible } = req.body;
  if (!studioId) return res.status(400).json({ success: false, message: "studioId is required." });
  if (!requireStudioAccess(req, res, studioId)) return;

  const idx = db.reviews.findIndex(r => r.id === id && r.studioId === studioId);
  if (idx === -1) return res.status(404).json({ success: false, message: "Review not found or not yours." });

  db.reviews[idx].isVisible = Boolean(visible);
  db.save();

  logAction(studioId, studioId, `Studio changed review ${id} visibility to ${Boolean(visible) ? "public" : "hidden"}`, "REVIEW", id);
  res.json({ success: true, review: db.reviews[idx] });
});

// Studio owner replies to a review
app.put("/api/studio/reviews/:id/reply", (req, res) => {
  const { id } = req.params;
  const { reply, studioId } = req.body;
  if (!reply || !studioId) return res.status(400).json({ success: false, message: "reply and studioId are required." });
  if (!requireStudioAccess(req, res, studioId)) return;

  const idx = db.reviews.findIndex(r => r.id === id && r.studioId === studioId);
  if (idx === -1) return res.status(404).json({ success: false, message: "Review not found or not yours." });

  db.reviews[idx].reply = reply;
  db.reviews[idx].replyAt = new Date().toISOString();
  db.save();

  logAction(studioId, studioId, `Studio replied to review ${id}`, "REVIEW", id);
  res.json({ success: true, review: db.reviews[idx] });
});

// Favorites
app.get("/api/favorites", (req, res) => {
  const { customerId } = req.query;
  const user = requireRole(req, res, UserRole.CUSTOMER);
  if (!user) return;
  if (customerId !== user.id) return res.status(403).json({ success: false, message: "Favorite access is limited to the authenticated customer." });
  const filtered = db.favorites.filter(f => f.customerId === customerId);
  res.json({ success: true, favorites: filtered });
});

app.post("/api/favorites", (req, res) => {
  const { customerId, studioId } = req.body;
  const user = requireRole(req, res, UserRole.CUSTOMER);
  if (!user) return;
  if (customerId !== user.id) return res.status(403).json({ success: false, message: "Customer identity is derived from the authenticated session." });
  const exists = db.favorites.find(f => f.customerId === customerId && f.studioId === studioId);
  if (exists) {
    return res.json({ success: true, message: "Already favorited" });
  }
  const newFav = {
    id: generateId("FAV"),
    customerId,
    studioId,
    createdAt: new Date().toISOString()
  };
  db.addFavorite(newFav);
  res.json({ success: true, favorite: newFav });
});

app.delete("/api/favorites", (req, res) => {
  const { customerId, studioId } = req.body;
  const user = requireRole(req, res, UserRole.CUSTOMER);
  if (!user) return;
  if (customerId !== user.id) return res.status(403).json({ success: false, message: "Customer identity is derived from the authenticated session." });
  const index = db.favorites.findIndex(f => f.customerId === customerId && f.studioId === studioId);
  if (index !== -1) {
    db.favorites.splice(index, 1);
    db.save();
  }
  res.json({ success: true, message: "Favorite removed." });
});

// Knowledge Base / FAQ FAQs
app.get("/api/chatbot/faqs", (req, res) => {
  const { studioId } = req.query;
  const filtered = studioId ? db.faqs.filter(f => f.studioId === studioId || f.studioId === "GLOBAL") : db.faqs;
  res.json({ success: true, faqs: filtered });
});

app.get("/api/chatbot/faq-suggestions", (_req, res) => {
  const suggestions = Array.from(faqSuggestionStore.values())
    .filter(s => s.frequency >= 2)
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());

  res.json({ success: true, suggestions });
});

app.post("/api/chatbot/faq-suggestions/:id/approve", (req, res) => {
  const suggestion = Array.from(faqSuggestionStore.values()).find(s => s.id === req.params.id);
  if (!suggestion) {
    return res.status(404).json({ success: false, message: "Suggested FAQ not found." });
  }

  const newFAQ: ChatbotFAQ = {
    id: generateId("FAQ"),
    studioId: suggestion.studioId || "GLOBAL",
    question: suggestion.question,
    answer: suggestion.answer,
    category: suggestion.category || "Suggested",
    createdAt: new Date().toISOString(),
    frequency: suggestion.frequency,
    isSuggestion: false,
    source: "chatbot"
  };

  db.addFAQ(newFAQ);
  faqSuggestionStore.delete(normalizeFaqQuestion(suggestion.question));

  res.json({ success: true, faq: newFAQ });
});

app.post("/api/chatbot/faqs", (req, res) => {
  const { studioId, question, answer, category } = req.body;
  if (!requireStudioAccess(req, res, studioId)) return;
  const newFAQ: ChatbotFAQ = {
    id: generateId("FAQ"),
    studioId,
    question,
    answer,
    category: category || "FAQ",
    createdAt: new Date().toISOString()
  };
  db.addFAQ(newFAQ);
  res.json({ success: true, faq: newFAQ });
});

app.delete("/api/chatbot/faqs/:id", (req, res) => {
  const index = db.faqs.findIndex(f => f.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "FAQ not found." });
  }
  if (!requireStudioAccess(req, res, db.faqs[index].studioId)) return;
  db.faqs.splice(index, 1);
  db.save();
  res.json({ success: true, message: "FAQ removed." });
});

// Notifications Endpoints
app.get("/api/notifications", (req, res) => {
  const { userId } = req.query;
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;
  if (userId !== user.id) return res.status(403).json({ success: false, message: "Notification access is limited to the authenticated user." });
  const filtered = db.notifications.filter(n => n.userId === userId);
  res.json({ success: true, notifications: filtered });
});

app.put("/api/notifications/mark-read", (req, res) => {
  const { userId, notifId } = req.body;
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;
  if (userId && userId !== user.id) return res.status(403).json({ success: false, message: "Notification access is limited to the authenticated user." });
  if (notifId) {
    const notif = db.notifications.find(n => n.id === notifId);
    if (notif) {
      notif.isRead = true;
      db.save();
    }
  } else if (userId) {
    db.notifications.forEach(n => {
      if (n.userId === userId) n.isRead = true;
    });
    db.save();
  }
  res.json({ success: true });
});

// Audit Logs
app.get("/api/audit-logs", (req, res) => {
  if (!requireRole(req, res, UserRole.SUPER_ADMIN)) return;
  res.json({ success: true, logs: db.auditLogs, auditLogs: db.auditLogs });
});

// ----------------------------------------------------
// ANALYTICS & SALES REPORTING
// ----------------------------------------------------
app.get("/api/reports/sales", (req, res) => {
  const user = requireRole(req, res, UserRole.SUPER_ADMIN, UserRole.STUDIO_ADMIN, UserRole.STUDIO_STAFF);
  if (!user) return;
  const { studioId, startDate, endDate } = req.query;
  const scopedStudioId = user.role === UserRole.SUPER_ADMIN ? studioId as string | undefined : ("studioId" in user ? user.studioId : undefined);
  let targetBookings = db.bookings.filter(b => !["Cancelled", "Expired", "Rejected"].includes(b.status));
  let targetPrints = db.printOrders.filter(p => !["Cancelled"].includes(p.status));

  if (scopedStudioId) {
    targetBookings = targetBookings.filter(b => b.studioId === scopedStudioId);
    targetPrints = targetPrints.filter(p => p.studioId === scopedStudioId);
  }

  // Filter by date range if provided
  if (startDate) {
    targetBookings = targetBookings.filter(b => b.bookingDate >= (startDate as string));
    targetPrints = targetPrints.filter(p => p.createdAt >= (startDate as string));
  }
  if (endDate) {
    targetBookings = targetBookings.filter(b => b.bookingDate <= (endDate as string));
    targetPrints = targetPrints.filter(p => p.createdAt <= (endDate as string));
  }

  const bookingSales = targetBookings.reduce((sum, b) => sum + db.payments
    .filter(p => p.bookingId === b.id && p.paymentStatus === "Paid")
    .reduce((paymentSum, p) => paymentSum + Number(p.amount), 0), 0);
  const printingSales = targetPrints.reduce((sum, p) => sum + (p.paymentStatus === "Paid" ? p.totalAmount : 0), 0);
  const totalSales = bookingSales + printingSales;

  res.json({
    success: true,
    summary: {
      bookingSales,
      printingSales,
      totalSales,
        outstandingBalances: targetBookings.reduce((sum, b) => sum + Math.max(0, b.remainingBalance), 0),
      bookingCount: targetBookings.length,
      printOrderCount: targetPrints.length
    }
  });
});

app.get("/api/reports/bookings", (req, res) => {
  const user = requireRole(req, res, UserRole.SUPER_ADMIN, UserRole.STUDIO_ADMIN, UserRole.STUDIO_STAFF);
  if (!user) return;
  const { studioId } = req.query;
  let targetBookings = db.bookings;
  const scopedStudioId = user.role === UserRole.SUPER_ADMIN ? studioId as string | undefined : ("studioId" in user ? user.studioId : undefined);
  if (scopedStudioId) {
    targetBookings = targetBookings.filter(b => b.studioId === scopedStudioId);
  }

  // Aggregate by status
  const statusCounts = targetBookings.reduce((acc: any, b) => {
    acc[b.status] = (acc[b.status] || 0) + 1;
    return acc;
  }, {});

  const months = Array.from({ length: 12 }, (_, index) => new Date(new Date().getFullYear(), index, 1)
    .toLocaleDateString("en-US", { month: "short" }));
  const trend = months.map(m => {
    const val = db.bookings.filter(b => {
      if (scopedStudioId && b.studioId !== scopedStudioId) return false;
      const bMonth = new Date(b.createdAt).getMonth();
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return monthNames[bMonth].substring(0, 3) === m && db.payments.some(p => p.bookingId === b.id && p.paymentStatus === "Paid");
    });

    const printVal = db.printOrders.filter(p => {
      if (scopedStudioId && p.studioId !== scopedStudioId) return false;
      const pMonth = new Date(p.createdAt).getMonth();
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return monthNames[pMonth].substring(0, 3) === m && p.paymentStatus === "Paid";
    });

    return {
      name: m,
      bookings: val.length,
      revenue: val.reduce((sum, b) => sum + db.payments.filter(p => p.bookingId === b.id && p.paymentStatus === "Paid").reduce((paid, p) => paid + Number(p.amount), 0), 0) + printVal.reduce((sum, p) => sum + p.totalAmount, 0),
      printing: printVal.reduce((sum, p) => sum + p.totalAmount, 0)
    };
  });

  res.json({
    success: true,
    statusCounts,
    trend
  });
});

app.get("/api/reports/daily-closing", (req, res) => {
  const user = requireRole(req, res, UserRole.SUPER_ADMIN, UserRole.STUDIO_ADMIN);
  if (!user) return;

  const { studioId, date } = req.query;
  const targetStudioId = user.role === UserRole.SUPER_ADMIN ? studioId as string | undefined : ("studioId" in user ? user.studioId : undefined);
  const targetDate = (date as string) || new Date().toISOString().split("T")[0];

  const verifiedPayments = db.payments.filter(p => {
    if (targetStudioId && p.studioId !== targetStudioId) return false;
    if (p.paymentStatus !== "Paid") return false;
    const paymentDay = (p.paymentDate || p.createdAt || "").split("T")[0];
    return paymentDay === targetDate;
  });

  const verifiedPrints = db.printOrders.filter(pr => {
    if (targetStudioId && pr.studioId !== targetStudioId) return false;
    if (pr.paymentStatus !== "Paid") return false;
    const printDay = ((pr as any).paidAt || pr.createdAt || "").split("T")[0];
    return printDay === targetDate;
  });

  const totalDownpayments = verifiedPayments.filter(p => p.paymentType === "Downpayment").reduce((sum, p) => sum + Number(p.amount), 0);
  const totalBalanceCollections = verifiedPayments.filter(p => p.paymentType === "Balance").reduce((sum, p) => sum + Number(p.amount), 0);
  const totalPrintRevenue = verifiedPrints.reduce((sum, p) => sum + Number(p.totalAmount), 0);
  const grossCollections = totalDownpayments + totalBalanceCollections + totalPrintRevenue;

  const byMethod = {
    cash: verifiedPayments.filter(p => p.paymentMethod === "Cash").reduce((s, p) => s + Number(p.amount), 0) +
          verifiedPrints.filter(p => p.paymentMethod === "Cash").reduce((s, p) => s + Number(p.totalAmount), 0),
    gcash: verifiedPayments.filter(p => p.paymentMethod === "GCash").reduce((s, p) => s + Number(p.amount), 0) + 0,
    bankTransfer: verifiedPayments.filter(p => p.paymentMethod === "Bank Transfer").reduce((s, p) => s + Number(p.amount), 0) + 0,
    online: verifiedPayments.filter(p => p.paymentMethod === "Online Payment").reduce((s, p) => s + Number(p.amount), 0) + 0
  };

  const bookingTransactions = verifiedPayments.map(p => ({
    id: p.id,
    bookingId: p.bookingId,
    type: p.paymentType,
    method: p.paymentMethod,
    amount: p.amount,
    referenceNumber: p.referenceNumber || "N/A",
    timestamp: p.paymentDate || p.createdAt
  }));

  const printTransactions = verifiedPrints.map(pr => ({
    id: pr.id,
    bookingId: pr.id,
    type: "Print Order Pickup",
    method: "Cash",
    amount: pr.totalAmount,
    referenceNumber: pr.referenceNumber || "Studio Counter Cash",
    timestamp: (pr as any).paidAt || pr.createdAt
  }));

  res.json({
    success: true,
    closingReport: {
      date: targetDate,
      studioId: targetStudioId || "ALL_STUDIOS",
      grossCollections,
      totalDownpayments,
      totalBalanceCollections,
      totalPrintRevenue,
      cashOnHandToday: byMethod.cash,
      paymentCount: verifiedPayments.length + verifiedPrints.length,
      breakdownByMethod: byMethod,
      transactions: [...bookingTransactions, ...printTransactions]
    }
  });
});

app.get("/api/audit-events", (req, res) => {
  const user = requireRole(req, res, UserRole.SUPER_ADMIN, UserRole.STUDIO_ADMIN);
  if (!user) return;

  const { entityType, entityId, limit } = req.query;
  let events = [...db.auditLogs];

  if (entityType) {
    events = events.filter(e => e.entityType.toLowerCase() === String(entityType).toLowerCase());
  }
  if (entityId) {
    events = events.filter(e => e.entityId === String(entityId));
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const maxLimit = Number(limit) || 100;

  res.json({ success: true, auditEvents: events.slice(0, maxLimit) });
});

// Automatic Background Job: Check and expire unpaid booking holds every 60 seconds
setInterval(() => {
  const now = new Date();
  let updated = false;
  for (const b of db.bookings) {
    if (["Pending", "Awaiting Payment"].includes(b.status) && b.paymentDueAt && new Date(b.paymentDueAt) <= now && b.amountPaid < b.downPaymentAmount) {
      // Only expire if no pending verification payment exists
      const hasPendingProof = db.payments.some(p => p.bookingId === b.id && p.paymentStatus === "Pending Verification");
      if (!hasPendingProof) {
        b.status = "Expired";
        b.paymentStatus = "Failed";
        updated = true;
        notifyUser(b.customerId, "Booking Payment Hold Expired", `Booking ${b.id} expired because the downpayment was not received before the deadline. The time slot has been released.`, "error", b.studioId);
        logAction("SYSTEM", "system@caintaphotography.com", "Auto-expired unpaid booking hold", "BOOKING", b.id);
      }
    }
  }
  if (updated) db.save();
}, 60 * 1000);

// ----------------------------------------------------
// AI CHATBOT (GEMINI PROXY)
// ----------------------------------------------------
app.post("/api/chatbot/message", async (req, res) => {
  const { message, studioId, history } = req.body;

  if (!message) {
    return res.status(400).json({ success: false, message: "Query message is required." });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const validGeminiKey = Boolean(
    apiKey &&
    apiKey !== "MY_GEMINI_API_KEY" &&
    apiKey.startsWith("AIza") &&
    apiKey.length >= 39
  );
  if (!validGeminiKey) {
    console.warn("[Chatbot] Rejecting Gemini request: GEMINI_API_KEY is not configured or has an invalid format.");
    return res.status(503).json({
      success: false,
      message: "The chatbot is temporarily unavailable. Please try again shortly."
    });
  }

  try {
    // 1. Retrieve knowledge context from database
    let studioContext = "";
    let faqsContext = "";
    
    // Global and Studio specific FAQs
    const relevantFAQs = db.faqs.filter(f => f.studioId === "GLOBAL" || (studioId && f.studioId === studioId));
    faqsContext = relevantFAQs.map(f => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n");

    if (studioId) {
      const studio = db.studios.find(s => s.id === studioId);
      if (studio) {
        const services = db.services.filter(s => s.studioId === studioId && s.isActive);
        const packages = db.packages.filter(p => p.studioId === studioId && p.isActive);
        studioContext = `
STUDIO PROFILE DETAILS:
Name: ${studio.name}
Description: ${studio.description}
Address: ${studio.address}
Location: ${studio.location}
Contact: ${studio.contactInfo}
Email: ${studio.email}
Business Hours: ${studio.businessHours}
Rating: ${studio.rating} (${studio.reviewCount} reviews)
Starting Price: ${studio.startingPrice} PHP
Printing Available: ${studio.printingAvailable ? "Yes" : "No"}

AVAILABLE SERVICES:
${services.map(s => `- ${s.name} (Base Price: ${s.basePrice} PHP, Duration: ${s.durationMinutes} mins) - Description: ${s.description}`).join("\n")}

AVAILABLE CUSTOMIZABLE PACKAGES:
${packages.map(p => `- ${p.name} (Price: ${p.price} PHP, Duration: ${p.durationMinutes} mins, Edited Photos: ${p.editedPhotosCount}, Prints: ${p.includedPrints}) - Description: ${p.description}`).join("\n")}
`;
      }
    } else {
      // General platform discovery context
      studioContext = `
ALL REGISTERED PHOTOGRAPHY STUDIOS IN CAINTA, RIZAL:
${db.studios.map(s => `- ${s.name} (Location: ${s.location}, Rating: ${s.rating}, Starting Price: ${s.startingPrice} PHP). Focus categories: ${s.categories.join(", ")}. ID: ${s.id}`).join("\n")}
`;
    }

    const systemInstruction = `
You are the official AI-assisted chatbot support for the Cainta Photography Studio MIS platform.
Your job is to answer customer questions accurately and guide them towards booking the perfect photography session or print order.

CRITICAL SECURITY AND SAFETY CONSTRAINTS:
1. You must NOT invent or make up prices, available schedules, booking confirmations, payment confirmations, or studio policies.
2. If the user asks a question whose specific answer cannot be found in the database/FAQ/studio context below, you MUST respond exactly with:
"I don't have enough information to answer that accurately. Please contact the studio or use the booking page."
Do NOT invent details to "fill the gap" or sound helpful. This is an absolute security boundary!
3. Prioritize the provided database context over any generic AI training.
4. Keep replies warm, concise, and conversational, as if you are a helpful studio receptionist. Use plain text only: no asterisks, markdown headings, bullet symbols, numbered lists, backticks, or decorative formatting. Write in short natural paragraphs.
5. When guiding the user to act or navigate, embed special link tokens directly inside your sentence where the link naturally belongs. The frontend renders these as clickable buttons or links. Never put a token on its own orphan line — weave it naturally into your sentence.

AVAILABLE LINK TOKENS:

Booking & studio exploration — ONLY use these when you have a real studio ID from the database below:
- [book_now:STUDIO_ID] — opens the booking wizard for that studio
- [view_services:STUDIO_ID] — shows the studio's services
- [view_packages:STUDIO_ID] — shows the studio's packages
- [go_studio:STUDIO_ID] — navigates to a specific studio's profile page
IMPORTANT: NEVER use "GLOBAL" as a STUDIO_ID. If you don't have a specific studio ID, use [go_page:directory] instead.

Page navigation (dark nav buttons — use the exact page key, no placeholder substitution):
- [go_page:landing] — home / landing page
- [go_page:directory] — browse all studios in Cainta (use this when no specific studio is known)
- [go_page:login] — login or register page
- [go_page:customer-dashboard] — customer's bookings & account
- [go_page:customer-dashboard-prints] — customer's print orders
- [go_page:customer-dashboard-bookings] — customer's booking history
- [go_page:PAGE_KEY|Custom Button Label] — any page with a custom label, e.g. [go_page:directory|Find a Studio]

External URLs (blue link buttons — only use when a real verified URL exists in the context):
- [external_link:https://example.com|Link Label] — opens in a new tab

EXAMPLES of correct usage:
- "You can browse all available studios here: [go_page:directory|Browse Studios]"
- "To make a reservation at ${studioId ? "this studio" : "Lumina Portraiture"}, tap here: [book_now:${studioId || "USE_REAL_ID_FROM_LIST"}]"
- "You can check your confirmed bookings in [go_page:customer-dashboard|My Dashboard]"
- "View the full profile for this studio: [go_studio:${studioId || "USE_REAL_ID_FROM_LIST"}]"
- When no studio is selected: "Browse our studios to find the right one for you: [go_page:directory|Browse All Studios]"

STUDIO IDs IN CONTEXT (always copy-paste the exact ID — never guess or invent one):
${studioId ? `Current studio context ID: ${studioId}` : `No specific studio selected. Use studio IDs from the ALL REGISTERED STUDIOS list below. Do NOT use "GLOBAL" as an ID.`}

CURRENT DATABASE/STUDIO CONTEXT:
${studioContext}

FAQs & KNOWLEDGE BASE:
${faqsContext}
`;

    const contents = [
      ...(Array.isArray(history) ? history : [])
        .filter(item => item && (item.role === "user" || item.role === "model") && typeof item.text === "string")
        .map(item => ({ role: item.role, parts: [{ text: item.text }] })),
      { role: "user", parts: [{ text: String(message) }] },
    ];
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents,
          generationConfig: { temperature: 0.3 },
        }),
      },
    );
    const responseData = await geminiResponse.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };
    if (!geminiResponse.ok) {
      throw new Error(responseData.error?.message || `Gemini API request failed with HTTP ${geminiResponse.status}.`);
    }
    const responseText = responseData.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();
    if (!responseText) {
      throw new Error("Gemini API returned an empty response.");
    }

    rememberFaqSuggestion(message, responseText, studioId || "GLOBAL");
    res.json({ success: true, text: responseText });

  } catch (error: any) {
    console.error("Gemini Chatbot API error:", error);
    res.status(503).json({
      success: false,
      message: "The chatbot is temporarily unavailable. Please try again shortly."
    });
  }
});

// Helper to retrieve local LAN IP address
function getLocalNetworkIp(): string {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal && !net.address.startsWith("169.254")) {
        return net.address;
      }
    }
  }
  return "127.0.0.1";
}


// ============================================================
// GCASH QR PAYMENT SYSTEM — API ENDPOINTS
// ============================================================

// ── Helpers ─────────────────────────────────────────────────────────────────
const PAYMONGO_BASE = "https://api.paymongo.com/v1";
const GCASH_QR_LIFETIME_MS = 30 * 60 * 1000;
const PAYMONGO_SECRET = process.env.PAYMONGO_SECRET_KEY || "";
const PAYMONGO_IS_LIVE = process.env.PAYMONGO_MODE === "live";

function paymongoHeaders() {
  return {
    "Authorization": `Basic ${Buffer.from(PAYMONGO_SECRET + ":").toString("base64")}`,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
}

async function callPayMongo(method: string, path: string, body?: Record<string, any>): Promise<any> {
  const res = await fetch(`${PAYMONGO_BASE}${path}`, {
    method,
    headers: paymongoHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json() as any;
  if (!res.ok) {
    const errDetail = json?.errors?.[0]?.detail || json?.message || "PayMongo API error";
    throw new Error(`PayMongo ${method} ${path} failed (${res.status}): ${errDetail}`);
  }
  return json;
}

// ── SSE: real-time payment confirmation stream ───────────────────────────────
// Customers connect here and receive a push when their QR payment lands.
app.get("/api/payments/gcash/stream", (req, res) => {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  const userId = user.id;
  if (!sseClients.has(userId)) sseClients.set(userId, new Set());
  sseClients.get(userId)!.add(res);

  // Send initial ping
  res.write(`data: ${JSON.stringify({ type: "connected", userId })}\n\n`);

  // Heartbeat every 25s to prevent proxy timeouts
  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(heartbeat); }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.get(userId)?.delete(res);
    if (sseClients.get(userId)?.size === 0) sseClients.delete(userId);
  });
});

// ── POST /api/payments/gcash/create-qr ──────────────────────────────────────
// Creates a PayMongo Payment Intent + QR Ph source, returns QR image to frontend
app.post("/api/payments/gcash/create-qr", async (req, res) => {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;

  const { bookingId, printOrderId, studioId, amount, paymentType, description } = req.body;

  if (!studioId || !amount || !paymentType) {
    return res.status(400).json({ success: false, message: "studioId, amount, and paymentType are required." });
  }

  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum < 1) {
    return res.status(400).json({ success: false, message: "Invalid amount." });
  }

  // Validate booking if provided
  if (bookingId) {
    const booking = db.bookings.find(b => b.id === bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found." });
    }
    // Customer must own the booking
    if (user.role === "CUSTOMER" && booking.customerId !== user.id) {
      return res.status(403).json({ success: false, message: "Not your booking." });
    }
  }

  if (!PAYMONGO_SECRET) {
    return res.status(503).json({
      success: false,
      message: "GCash QR payments are not configured yet. Please contact the studio."
    });
  }

  try {
    // Get studio info for QR description
    const studio = db.studios.find(s => s.id === studioId);
    const studioName = studio?.name || "Photography Studio";
    const desc = description || `${paymentType} — ${studioName}`;

    // Flatten metadata to pure strings (PayMongo strictly rejects nested objects or nulls in metadata)
    const metadata: Record<string, string> = {
      studio_id: String(studioId),
      customer_id: String(user.id),
      payment_type: String(paymentType),
      platform: "cainta_photography_mis"
    };
    if (bookingId) metadata.booking_id = String(bookingId);
    if (printOrderId) metadata.print_order_id = String(printOrderId);

    // 1. Create PayMongo Payment Intent
    const intentBody = {
      data: {
        attributes: {
          amount: Math.round(amountNum * 100), // convert to centavos
          payment_method_allowed: ["qrph"],
          currency: "PHP",
          capture_type: "automatic",
          description: desc,
          metadata
        }
      }
    };

    const intentResponse = await callPayMongo("POST", "/payment_intents", intentBody);
    const intentId = intentResponse?.data?.id;
    const clientKey = intentResponse?.data?.attributes?.client_key;

    if (!intentId) {
      throw new Error("PayMongo did not return a payment intent ID.");
    }

    // 2. Create PayMongo Payment Method for QR Ph
    const customerName = (user as any).fullName || user.email?.split("@")[0] || "Customer";
    const customerEmail = user.email || "customer@cainta-studio.com";
    const customerPhone = (user as any).contactNumber || "+63 900 000 0000";

    const pmBody = {
      data: {
        attributes: {
          type: "qrph",
          billing: {
            name: customerName,
            email: customerEmail,
            phone: customerPhone
          }
        }
      }
    };

    const pmResponse = await callPayMongo("POST", "/payment_methods", pmBody);
    const paymentMethodId = pmResponse?.data?.id;

    if (!paymentMethodId) {
      throw new Error("PayMongo did not return a payment method ID for QR Ph.");
    }

    // 3. Attach Payment Method to Payment Intent to generate the dynamic QR Ph code
    const attachBody = {
      data: {
        attributes: {
          payment_method: paymentMethodId,
          client_key: clientKey
        }
      }
    };

    const attachResponse = await callPayMongo("POST", `/payment_intents/${intentId}/attach`, attachBody);

    // 4. Extract generated QR Code image (base64 data URI)
    const nextAction = attachResponse?.data?.attributes?.next_action;
    let qrCodeData = nextAction?.code?.image_url || "";
    if (qrCodeData && !qrCodeData.startsWith("data:") && !qrCodeData.startsWith("http")) {
      qrCodeData = `data:image/png;base64,${qrCodeData}`;
    }

    // 5. Create QR session in DB
    const sessionId = `GQR-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    const expiresAt = new Date(Date.now() + GCASH_QR_LIFETIME_MS).toISOString();

    await db.pool.execute(
      `INSERT INTO gcash_qr_sessions
        (id, booking_id, print_order_id, studio_id, customer_id, gateway,
         gateway_payment_intent_id, gateway_source_id, gateway_checkout_url,
         qr_code_data, amount, payment_type, status, expires_at)
       VALUES (?, ?, ?, ?, ?, 'paymongo', ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        sessionId, bookingId || null, printOrderId || null, studioId, user.id,
        intentId, paymentMethodId || null, null,
        qrCodeData || null, amountNum, paymentType, expiresAt
      ]
    );

    // 6. Log audit
    const auditId = generateId("LOG");
    await db.pool.execute(
      "INSERT INTO audit_logs (id, user_id, user_email, action, entity_type, entity_id) VALUES (?, ?, ?, ?, 'GCASH_QR', ?)",
      [auditId, user.id, user.email, `Generated GCash QR for ${paymentType} ₱${amountNum}`, sessionId]
    );

    return res.json({
      success: true,
      session: {
        id: sessionId,
        gateway: "paymongo",
        gatewayPaymentIntentId: intentId,
        gatewaySourceId: paymentMethodId || null,
        gatewayCheckoutUrl: null,
        qrCodeData: qrCodeData || null,
        amount: amountNum,
        paymentType,
        status: "pending",
        expiresAt,
        createdAt: new Date().toISOString()
      }
    });
  } catch (err: any) {
    console.error("[GCash QR] Create QR error:", err?.message || err);
    return res.status(502).json({
      success: false,
      message: err?.message?.includes("PayMongo")
        ? err.message
        : "Failed to generate QR code. Please try again or use manual payment."
    });
  }
});

// ── POST /api/payments/gcash/submit-proof ──────────────────────────────────
// Allows customer to attach receipt screenshot & reference number after QR payment
app.post("/api/payments/gcash/submit-proof", async (req, res) => {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;

  const { sessionId, referenceNumber, proofOfPayment } = req.body;
  if (!sessionId) {
    return res.status(400).json({ success: false, message: "sessionId is required." });
  }

  const [rows] = await db.pool.execute(
    "SELECT * FROM gcash_qr_sessions WHERE id = ? LIMIT 1",
    [sessionId]
  ) as any;

  if (!rows || rows.length === 0) {
    return res.status(404).json({ success: false, message: "GCash session not found." });
  }

  const session = rows[0];

  if (session.print_order_id) {
    // Print orders are cash-only at pickup — GCash payment is not supported for print orders.
    return res.status(404).json({ success: false, message: "GCash payment is not available for print orders." });
  }

  let paymentId = session.payment_id;
  if (!paymentId) {
    paymentId = `PAY-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    await db.pool.execute(
      `INSERT INTO payments
        (id, gcash_session_id, booking_id, studio_id, customer_id, amount, payment_type,
         payment_method, payment_status, reference_number, proof_of_payment, gateway_transaction_id,
         payment_channel, payment_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'GCash', 'Pending Verification', ?, ?, ?, 'gcash_qr', NOW(), NOW())`,
      [
        paymentId, session.id, session.booking_id, session.studio_id,
        session.customer_id, session.amount, session.payment_type,
        referenceNumber || session.gateway_payment_intent_id,
        proofOfPayment || null,
        session.gateway_payment_intent_id
      ]
    );
    await db.pool.execute(
      "UPDATE gcash_qr_sessions SET payment_id = ? WHERE id = ?",
      [paymentId, session.id]
    );
  } else {
    await db.pool.execute(
      `UPDATE payments SET
         reference_number = COALESCE(?, reference_number),
         proof_of_payment = COALESCE(?, proof_of_payment),
         payment_status = 'Pending Verification'
       WHERE id = ?`,
      [referenceNumber || null, proofOfPayment || null, paymentId]
    );
  }

  // Update in-memory collections
  const existingPay = db.payments.find(p => p.id === paymentId);
  if (existingPay) {
    if (referenceNumber) existingPay.referenceNumber = referenceNumber;
    if (proofOfPayment) existingPay.proofOfPayment = proofOfPayment;
    existingPay.paymentStatus = "Pending Verification";
    (existingPay as any).status = "Pending";
  } else {
    db.payments.push({
      id: paymentId,
      bookingId: session.booking_id,
      studioId: session.studio_id,
      customerId: session.customer_id,
      amount: Number(session.amount),
      paymentMethod: "GCash",
      referenceNumber: referenceNumber || session.gateway_payment_intent_id,
      proofOfPayment: proofOfPayment || "",
      paymentStatus: "Pending Verification",
      paymentType: session.payment_type || "Downpayment",
      status: "Pending",
      paymentDate: new Date().toISOString(),
      createdAt: new Date().toISOString()
    } as any);
  }

  if (session.booking_id) {
    const b = db.bookings.find(x => x.id === session.booking_id);
    if (b) {
      // Track the pending amount for display; do NOT reset the booking status —
      // the booking may already be Confirmed (if the webhook already fired) or
      // in another post-Pending state. Overwriting it with "Pending" here was
      // causing confirmed bookings to revert after proof submission.
      (b as any).pendingPaymentAmount = Number(session.amount);
      // Only update paymentStatus if it isn't already Paid/Confirmed
      if (!["Paid", "Partially Paid"].includes(b.paymentStatus)) {
        b.paymentStatus = "Pending Verification";
      }
    }
  }

  return res.json({
    success: true,
    message: "Payment receipt submitted successfully for studio review.",
    paymentId
  });
});

// ── GET /api/payments/gcash/session/:sessionId ───────────────────────────────
// Polling fallback — frontend polls this every 4 s while the QR modal is open.
// When the session is still 'pending' AND the PayMongo API shows the intent is
// already 'succeeded', we process the payment right here so the status update
// reaches the frontend even if the webhook was never delivered (e.g. the
// PAYMONGO_WEBHOOK_SECRET env var is not yet configured, or the webhook URL
// hasn't been registered in the PayMongo dashboard).
app.get("/api/payments/gcash/session/:sessionId", async (req, res) => {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;

  const { sessionId } = req.params;

  const [rows] = await db.pool.execute(
    "SELECT * FROM gcash_qr_sessions WHERE id = ? LIMIT 1",
    [sessionId]
  ) as any;

  if (!rows || (rows as any[]).length === 0) {
    return res.status(404).json({ success: false, message: "Session not found." });
  }

  let session = (rows as any[])[0];

  // Customer must own this session
  if (user.role === "CUSTOMER" && session.customer_id !== user.id) {
    return res.status(403).json({ success: false, message: "Access denied." });
  }

  // ── Active gateway check when session is still pending ───────────────────
  // Query PayMongo directly so we confirm the payment even when the webhook
  // was never received (unconfigured secret, unregistered URL, network drop).
  if (session.status === "pending" && session.gateway_payment_intent_id && PAYMONGO_SECRET) {
    try {
      const intentData = await callPayMongo("GET", `/payment_intents/${session.gateway_payment_intent_id}`);
      const intentStatus = intentData?.data?.attributes?.status; // 'succeeded' | 'awaiting_payment_method' | etc.
      const intentPayments: any[] = intentData?.data?.attributes?.payments || [];

      if (intentStatus === "succeeded" && intentPayments.length > 0) {
        // Payment confirmed on gateway side — process it now (same logic as webhook handler)
        const gatewayPayment = intentPayments[0];
        const gatewayAmountCentavos = gatewayPayment?.attributes?.amount || intentData?.data?.attributes?.amount || 0;
        const gatewayAmountPHP = gatewayAmountCentavos / 100;

        // Amount integrity check — refuse to credit if gateway amount differs
        if (Math.abs(gatewayAmountPHP - Number(session.amount)) <= 0.01) {
          const paidAt = new Date().toISOString();
          const gatewayTransactionId = gatewayPayment?.id || session.gateway_payment_intent_id;
          const fraudScore = gatewayPayment?.attributes?.risk_score ?? null;
          const pollEventId = `poll_${sessionId}_${Date.now()}`;

          // Idempotency — skip if already processed via another poll tick
          const [existingEvt] = await db.pool.execute(
            "SELECT event_id FROM webhook_events WHERE session_id = ? AND event_type = 'poll.confirmed' LIMIT 1",
            [session.id]
          ) as any;

          if ((existingEvt as any[]).length === 0) {
            // 1. Mark session paid
            await db.pool.execute(
              "UPDATE gcash_qr_sessions SET status = 'paid', paid_at = ?, webhook_event_id = ? WHERE id = ?",
              [paidAt, pollEventId, session.id]
            );
            session.status = "paid";
            session.paid_at = paidAt;

            // 2. Create or update payment record
            let paymentId = session.payment_id;
            if (session.booking_id && !paymentId) {
              paymentId = `PAY-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
              await db.pool.execute(
                `INSERT INTO payments
                  (id, gcash_session_id, booking_id, studio_id, customer_id, amount, payment_type,
                   payment_method, payment_status, reference_number, gateway_transaction_id,
                   fraud_score, payment_channel, payment_date, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'GCash', 'Paid', ?, ?, ?, 'gcash_qr', NOW(), NOW())`,
                [
                  paymentId, session.id, session.booking_id, session.studio_id,
                  session.customer_id, session.amount, session.payment_type,
                  gatewayTransactionId, gatewayTransactionId, fraudScore
                ]
              );
              await db.pool.execute(
                "UPDATE gcash_qr_sessions SET payment_id = ? WHERE id = ?",
                [paymentId, session.id]
              );
              session.payment_id = paymentId;
              db.payments.push({
                id: paymentId,
                bookingId: session.booking_id,
                studioId: session.studio_id,
                customerId: session.customer_id,
                amount: Number(session.amount),
                paymentType: (session.payment_type as any) || "Downpayment",
                paymentMethod: "GCash",
                paymentStatus: "Paid",
                referenceNumber: gatewayTransactionId,
                paymentDate: paidAt,
                createdAt: paidAt,
                gcashSessionId: session.id,
                gatewayTransactionId,
                fraudScore,
                paymentChannel: "gcash_qr"
              } as any);
            } else if (session.booking_id && paymentId) {
              await db.pool.execute(
                `UPDATE payments SET payment_status = 'Paid', gateway_transaction_id = ?,
                  fraud_score = ?, payment_channel = 'gcash_qr' WHERE id = ?`,
                [gatewayTransactionId, fraudScore, paymentId]
              );
              const existingPayIdx = db.payments.findIndex(p => p.id === paymentId);
              if (existingPayIdx !== -1) {
                db.payments[existingPayIdx] = {
                  ...db.payments[existingPayIdx],
                  paymentStatus: "Paid",
                  gatewayTransactionId,
                  fraudScore,
                  paymentChannel: "gcash_qr"
                } as any;
              }
            } else if (session.print_order_id) {
              // Print orders are cash-only at pickup — GCash QR sessions should never
              // reference a print_order_id. Log and skip to avoid writing a defunct status.
              console.warn(`[GCash Webhook] Unexpected print_order_id on QR session ${session.id} — print orders are cash-only. Skipping.`);
            }

            // 3. Sync booking totals
            if (session.booking_id) {
              const bookingRow = db.bookings.find(b => b.id === session.booking_id);
              if (bookingRow) {
                const [pmtRows] = await db.pool.execute(
                  "SELECT * FROM payments WHERE booking_id = ?",
                  [session.booking_id]
                );
                const allPayments = pmtRows as any[];
                const verifiedTotal = allPayments
                  .filter(p => p.payment_status === "Paid")
                  .reduce((s, p) => s + Number(p.amount), 0);

                const newAmountPaid = Math.min(bookingRow.totalAmount, verifiedTotal);
                const newBalance = Math.max(0, bookingRow.totalAmount - newAmountPaid);
                const newPaymentStatus = newBalance === 0 ? "Paid" :
                  newAmountPaid >= bookingRow.downPaymentAmount ? "Partially Paid" : "Unpaid";
                const newBookingStatus =
                  newBalance === 0 || newAmountPaid >= bookingRow.downPaymentAmount ? "Confirmed" : bookingRow.status;

                await db.pool.execute(
                  `UPDATE bookings SET amount_paid = ?, remaining_balance = ?, payment_status = ?,
                    final_payment_status = ?, status = ? WHERE id = ?`,
                  [
                    newAmountPaid, newBalance, newPaymentStatus,
                    newBalance === 0 ? "Paid" : "Pending",
                    newBookingStatus, session.booking_id
                  ]
                );

                const idx = db.bookings.findIndex(b => b.id === session.booking_id);
                if (idx !== -1) {
                  db.bookings[idx] = {
                    ...db.bookings[idx],
                    amountPaid: newAmountPaid,
                    remainingBalance: newBalance,
                    paymentStatus: newPaymentStatus as any,
                    finalPaymentStatus: newBalance === 0 ? "Paid" : "Pending",
                    status: newBookingStatus as any,
                  };
                }

                // 4. Notify customer + studio
                const studio = db.studios.find(s => s.id === session.studio_id);
                const studioName = studio?.name || "Studio";
                const typeLabel = session.payment_type === "Downpayment" ? "Downpayment" : "Final Payment";

                notifyUser(
                  session.customer_id,
                  `GCash Payment Confirmed — ${typeLabel}`,
                  `Your GCash payment of ₱${Number(session.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })} for ${studioName} has been confirmed via QR Ph. Booking: ${session.booking_id}.`,
                  "success",
                  session.studio_id
                );
                notifyUser(
                  db.users.find(u => u.studioId === session.studio_id)?.id || "",
                  `GCash Payment Received — ${typeLabel}`,
                  `₱${Number(session.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })} GCash QR payment received for Booking ${session.booking_id}.`,
                  "success",
                  session.studio_id
                );

                const customer = db.customers.find(c => c.id === session.customer_id);
                if (customer?.email) {
                  sendEmailNotification(
                    customer.email,
                    `GCash Payment Confirmed — ${typeLabel}`,
                    `Your GCash QR payment of ₱${Number(session.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })} for your booking at ${studioName} has been confirmed automatically. No receipt upload needed!\n\nBooking ID: ${session.booking_id}\nPayment ID: ${paymentId}\nGateway Ref: ${gatewayTransactionId}`,
                    "success"
                  );
                }
              }
            }

            // 5. Log so duplicate poll ticks are no-ops
            await db.pool.execute(
              "INSERT INTO webhook_events (event_id, gateway, event_type, payment_id, session_id, raw_payload) VALUES (?, 'paymongo', 'poll.confirmed', ?, ?, ?)",
              [pollEventId, paymentId || null, session.id, JSON.stringify({ source: "poll", intentId: session.gateway_payment_intent_id }).substring(0, 65535)]
            );

            // 6. Broadcast SSE so the modal also closes immediately if it's still open
            broadcastSSE(session.customer_id, {
              type: "GCASH_PAYMENT_CONFIRMED",
              sessionId: session.id,
              paymentId: paymentId || "",
              bookingId: session.booking_id,
              amount: session.amount,
              paidAt
            });

            console.log(`[GCash Poll] ✅ Payment confirmed via gateway poll: session ${session.id}`);
          }
        } else {
          console.warn(`[GCash Poll] Amount mismatch — gateway: ₱${gatewayAmountPHP}, session: ₱${session.amount}. Session ${session.id} not credited.`);
        }
      }
    } catch (pollErr: any) {
      // Non-fatal — just return the current DB status; next poll tick will retry
      console.warn("[GCash Poll] Gateway check failed (will retry):", pollErr?.message);
    }
  }

  // Auto-expire check (only if still pending after gateway check above)
  if (session.status === "pending" && new Date(session.expires_at) < new Date()) {
    await db.pool.execute(
      "UPDATE gcash_qr_sessions SET status = 'expired' WHERE id = ?",
      [sessionId]
    );
    session.status = "expired";
  }

  return res.json({
    success: true,
    session: {
      id: session.id,
      paymentId: session.payment_id,
      bookingId: session.booking_id,
      printOrderId: session.print_order_id,
      studioId: session.studio_id,
      customerId: session.customer_id,
      gateway: session.gateway,
      gatewayPaymentIntentId: session.gateway_payment_intent_id,
      qrCodeData: session.qr_code_data,
      amount: Number(session.amount),
      paymentType: session.payment_type,
      status: session.status,
      expiresAt: session.expires_at,
      paidAt: session.paid_at,
      createdAt: session.created_at,
    }
  });
});

// ── GET /api/payments/gcash/status/:intentId ─────────────────────────────────
// Direct gateway check — safety net if webhook fails entirely
app.get("/api/payments/gcash/status/:intentId", async (req, res) => {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;

  if (!PAYMONGO_SECRET) {
    return res.status(503).json({ success: false, message: "Payment gateway not configured." });
  }

  try {
    const intentData = await callPayMongo("GET", `/payment_intents/${req.params.intentId}`);
    const attrs = intentData?.data?.attributes;
    return res.json({
      success: true,
      status: attrs?.status,
      amount: (attrs?.amount || 0) / 100,
      currency: attrs?.currency,
      payments: attrs?.payments || []
    });
  } catch (err: any) {
    return res.status(502).json({ success: false, message: err.message });
  }
});

// ── POST /api/payments/gcash/verify-intent ───────────────────────────────────
// On-demand manual sync — called by the frontend "Check Payment Status" button
// and also used when the customer submits proof while a QR session is still
// open. Queries PayMongo for the intent status and, if succeeded, runs the full
// payment-processing pipeline (same logic as the polling fallback above).
app.post("/api/payments/gcash/verify-intent", async (req, res) => {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;

  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ success: false, message: "sessionId is required." });
  }

  if (!PAYMONGO_SECRET) {
    return res.status(503).json({ success: false, message: "Payment gateway not configured." });
  }

  const [rows] = await db.pool.execute(
    "SELECT * FROM gcash_qr_sessions WHERE id = ? LIMIT 1",
    [sessionId]
  ) as any;

  if (!rows || (rows as any[]).length === 0) {
    return res.status(404).json({ success: false, message: "Session not found." });
  }

  const session = (rows as any[])[0];

  // Only the session owner (or studio staff / admins) may force a sync
  if (user.role === "CUSTOMER" && session.customer_id !== user.id) {
    return res.status(403).json({ success: false, message: "Access denied." });
  }

  // If already confirmed in our DB, just return the current state
  if (session.status === "paid") {
    return res.json({
      success: true,
      alreadyPaid: true,
      message: "Payment is already confirmed.",
      session: {
        id: session.id,
        paymentId: session.payment_id,
        status: "paid",
        paidAt: session.paid_at,
        amount: Number(session.amount),
      }
    });
  }

  if (!session.gateway_payment_intent_id) {
    return res.status(422).json({ success: false, message: "No payment intent ID on this session." });
  }

  try {
    const intentData = await callPayMongo("GET", `/payment_intents/${session.gateway_payment_intent_id}`);
    const intentStatus = intentData?.data?.attributes?.status;
    const intentPayments: any[] = intentData?.data?.attributes?.payments || [];

    if (intentStatus !== "succeeded" || intentPayments.length === 0) {
      return res.json({
        success: true,
        alreadyPaid: false,
        gatewayStatus: intentStatus || "unknown",
        message: "Payment has not been completed on the gateway yet."
      });
    }

    const gatewayPayment = intentPayments[0];
    const gatewayAmountCentavos = gatewayPayment?.attributes?.amount || intentData?.data?.attributes?.amount || 0;
    const gatewayAmountPHP = gatewayAmountCentavos / 100;

    // Amount integrity check
    if (Math.abs(gatewayAmountPHP - Number(session.amount)) > 0.01) {
      console.error(`[GCash Verify] Amount mismatch — gateway: ₱${gatewayAmountPHP}, session: ₱${session.amount}. Session ${session.id}`);
      return res.status(409).json({
        success: false,
        message: `Payment amount mismatch. Expected ₱${session.amount}, gateway reports ₱${gatewayAmountPHP}.`
      });
    }

    // Idempotency — skip if already processed by a concurrent poll tick
    const [existingEvt] = await db.pool.execute(
      "SELECT event_id FROM webhook_events WHERE session_id = ? AND event_type IN ('poll.confirmed', 'verify.confirmed') LIMIT 1",
      [session.id]
    ) as any;

    if ((existingEvt as any[]).length > 0) {
      // Another path already processed this — reload session and return paid
      const [refreshed] = await db.pool.execute(
        "SELECT * FROM gcash_qr_sessions WHERE id = ? LIMIT 1",
        [sessionId]
      ) as any;
      const s = (refreshed as any[])[0] || session;
      return res.json({
        success: true,
        alreadyPaid: true,
        message: "Payment was already confirmed by a concurrent process.",
        session: { id: s.id, paymentId: s.payment_id, status: s.status, paidAt: s.paid_at, amount: Number(s.amount) }
      });
    }

    const paidAt = new Date().toISOString();
    const gatewayTransactionId = gatewayPayment?.id || session.gateway_payment_intent_id;
    const fraudScore = gatewayPayment?.attributes?.risk_score ?? null;
    const verifyEventId = `verify_${sessionId}_${Date.now()}`;

    // 1. Mark session paid
    await db.pool.execute(
      "UPDATE gcash_qr_sessions SET status = 'paid', paid_at = ?, webhook_event_id = ? WHERE id = ?",
      [paidAt, verifyEventId, session.id]
    );

    // 2. Create or update payment record
    let paymentId = session.payment_id;
    if (session.booking_id && !paymentId) {
      paymentId = `PAY-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      await db.pool.execute(
        `INSERT INTO payments
          (id, gcash_session_id, booking_id, studio_id, customer_id, amount, payment_type,
           payment_method, payment_status, reference_number, gateway_transaction_id,
           fraud_score, payment_channel, payment_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'GCash', 'Paid', ?, ?, ?, 'gcash_qr', NOW(), NOW())`,
        [
          paymentId, session.id, session.booking_id, session.studio_id,
          session.customer_id, session.amount, session.payment_type,
          gatewayTransactionId, gatewayTransactionId, fraudScore
        ]
      );
      await db.pool.execute(
        "UPDATE gcash_qr_sessions SET payment_id = ? WHERE id = ?",
        [paymentId, session.id]
      );
      db.payments.push({
        id: paymentId,
        bookingId: session.booking_id,
        studioId: session.studio_id,
        customerId: session.customer_id,
        amount: Number(session.amount),
        paymentType: (session.payment_type as any) || "Downpayment",
        paymentMethod: "GCash",
        paymentStatus: "Paid",
        referenceNumber: gatewayTransactionId,
        paymentDate: paidAt,
        createdAt: paidAt,
        gcashSessionId: session.id,
        gatewayTransactionId,
        fraudScore,
        paymentChannel: "gcash_qr"
      } as any);
    } else if (session.booking_id && paymentId) {
      await db.pool.execute(
        `UPDATE payments SET payment_status = 'Paid', gateway_transaction_id = ?,
          fraud_score = ?, payment_channel = 'gcash_qr' WHERE id = ?`,
        [gatewayTransactionId, fraudScore, paymentId]
      );
      const existingPayIdx = db.payments.findIndex(p => p.id === paymentId);
      if (existingPayIdx !== -1) {
        db.payments[existingPayIdx] = {
          ...db.payments[existingPayIdx],
          paymentStatus: "Paid",
          gatewayTransactionId,
          fraudScore,
          paymentChannel: "gcash_qr"
        } as any;
      }
    } else if (session.print_order_id) {
      // Print orders are cash-only at pickup — GCash QR sessions should never
      // reference a print_order_id. Log and skip to avoid writing a defunct status.
      console.warn(`[GCash Webhook] Unexpected print_order_id on QR session ${session.id} — print orders are cash-only. Skipping.`);
    }

    // 3. Sync booking totals
    if (session.booking_id) {
      const bookingRow = db.bookings.find(b => b.id === session.booking_id);
      if (bookingRow) {
        const [pmtRows] = await db.pool.execute(
          "SELECT * FROM payments WHERE booking_id = ?",
          [session.booking_id]
        );
        const allPayments = pmtRows as any[];
        const verifiedTotal = allPayments
          .filter(p => p.payment_status === "Paid")
          .reduce((s, p) => s + Number(p.amount), 0);

        const newAmountPaid = Math.min(bookingRow.totalAmount, verifiedTotal);
        const newBalance = Math.max(0, bookingRow.totalAmount - newAmountPaid);
        const newPaymentStatus = newBalance === 0 ? "Paid" :
          newAmountPaid >= bookingRow.downPaymentAmount ? "Partially Paid" : "Unpaid";
        const newBookingStatus =
          newBalance === 0 || newAmountPaid >= bookingRow.downPaymentAmount ? "Confirmed" : bookingRow.status;

        await db.pool.execute(
          `UPDATE bookings SET amount_paid = ?, remaining_balance = ?, payment_status = ?,
            final_payment_status = ?, status = ? WHERE id = ?`,
          [
            newAmountPaid, newBalance, newPaymentStatus,
            newBalance === 0 ? "Paid" : "Pending",
            newBookingStatus, session.booking_id
          ]
        );

        const idx = db.bookings.findIndex(b => b.id === session.booking_id);
        if (idx !== -1) {
          db.bookings[idx] = {
            ...db.bookings[idx],
            amountPaid: newAmountPaid,
            remainingBalance: newBalance,
            paymentStatus: newPaymentStatus as any,
            finalPaymentStatus: newBalance === 0 ? "Paid" : "Pending",
            status: newBookingStatus as any,
          };
        }

        // 4. Notify
        const studio = db.studios.find(s => s.id === session.studio_id);
        const studioName = studio?.name || "Studio";
        const typeLabel = session.payment_type === "Downpayment" ? "Downpayment" : "Final Payment";

        notifyUser(
          session.customer_id,
          `GCash Payment Confirmed — ${typeLabel}`,
          `Your GCash payment of ₱${Number(session.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })} for ${studioName} has been confirmed via QR Ph. Booking: ${session.booking_id}.`,
          "success",
          session.studio_id
        );
        notifyUser(
          db.users.find(u => u.studioId === session.studio_id)?.id || "",
          `GCash Payment Received — ${typeLabel}`,
          `₱${Number(session.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })} GCash QR payment received for Booking ${session.booking_id}.`,
          "success",
          session.studio_id
        );

        const customer = db.customers.find(c => c.id === session.customer_id);
        if (customer?.email) {
          sendEmailNotification(
            customer.email,
            `GCash Payment Confirmed — ${typeLabel}`,
            `Your GCash QR payment of ₱${Number(session.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })} for your booking at ${studioName} has been confirmed automatically. No receipt upload needed!\n\nBooking ID: ${session.booking_id}\nPayment ID: ${paymentId}\nGateway Ref: ${gatewayTransactionId}`,
            "success"
          );
        }
      }
    }

    // 5. Idempotency log
    await db.pool.execute(
      "INSERT INTO webhook_events (event_id, gateway, event_type, payment_id, session_id, raw_payload) VALUES (?, 'paymongo', 'verify.confirmed', ?, ?, ?)",
      [verifyEventId, paymentId || null, session.id, JSON.stringify({ source: "verify-intent", intentId: session.gateway_payment_intent_id }).substring(0, 65535)]
    );

    // 6. SSE broadcast so any open QR modal also closes
    broadcastSSE(session.customer_id, {
      type: "GCASH_PAYMENT_CONFIRMED",
      sessionId: session.id,
      paymentId: paymentId || "",
      bookingId: session.booking_id,
      amount: session.amount,
      paidAt
    });

    console.log(`[GCash Verify] ✅ Payment confirmed via verify-intent: session ${session.id}`);

    return res.json({
      success: true,
      alreadyPaid: false,
      confirmed: true,
      message: "Payment confirmed successfully.",
      session: {
        id: session.id,
        paymentId,
        status: "paid",
        paidAt,
        amount: Number(session.amount),
        bookingId: session.booking_id,
      }
    });
  } catch (err: any) {
    console.error("[GCash Verify] Error:", err?.message || err);
    return res.status(502).json({ success: false, message: err?.message || "Failed to verify payment with gateway." });
  }
});

// ── POST /api/studios/:studioId/payment-credentials ─────────────────────────
// Studio admin saves their GCash display info
app.post("/api/studios/:studioId/payment-credentials", async (req, res) => {
  const user = requireStudioAccess(req, res, req.params.studioId);
  if (!user) return;

  const { gcashMerchantName, gcashNumber } = req.body;
  const { studioId } = req.params;

  const credId = generateId("CRED");

  try {
    // Upsert: update if exists, insert if not
    await db.pool.execute(
      `INSERT INTO studio_payment_credentials
         (id, studio_id, gateway, gcash_merchant_name, gcash_number)
       VALUES (?, ?, 'paymongo', ?, ?)
       ON DUPLICATE KEY UPDATE
         gcash_merchant_name = VALUES(gcash_merchant_name),
         gcash_number = VALUES(gcash_number),
         updated_at = NOW()`,
      [credId, studioId, gcashMerchantName || null, gcashNumber || null]
    );

    return res.json({ success: true, message: "GCash settings saved successfully." });
  } catch (err: any) {
    console.error("[GCash Creds]", err?.message);
    return res.status(500).json({ success: false, message: "Failed to save payment credentials." });
  }
});

// ── GET /api/studios/:studioId/payment-credentials ──────────────────────────
app.get("/api/studios/:studioId/payment-credentials", async (req, res) => {
  const user = requireStudioAccess(req, res, req.params.studioId);
  if (!user) return;

  const [rows] = await db.pool.execute(
    "SELECT id, studio_id, gateway, gcash_merchant_name, gcash_number, is_live_mode, is_enabled, created_at FROM studio_payment_credentials WHERE studio_id = ? LIMIT 1",
    [req.params.studioId]
  ) as any;

  const creds = (rows as any[])[0] || null;
  return res.json({ success: true, credentials: creds });
});

// ── GET /api/payments/gcash/gateway-status ───────────────────────────────────
// Returns whether PayMongo is configured and in sandbox or live mode
app.get("/api/payments/gcash/gateway-status", (req, res) => {
  const user = requireAuthenticatedUser(req, res);
  if (!user) return;
  res.json({
    success: true,
    configured: !!PAYMONGO_SECRET,
    mode: PAYMONGO_IS_LIVE ? "live" : "sandbox",
    publicKey: process.env.PAYMONGO_PUBLIC_KEY || null,
    gatewayName: "PayMongo"
  });
});

// LAN Network Information endpoint
app.get("/api/system/network-info", (req, res) => {
  if (!requireRole(req, res, UserRole.SUPER_ADMIN)) return;
  const lanIp = getLocalNetworkIp();
  res.json({
    success: true,
    port: PORT,
    localUrl: `http://localhost:${PORT}`,
    networkUrl: `http://${lanIp}:${PORT}`,
    ipAddress: lanIp
  });
});

// ----------------------------------------------------
// VITE MIDDLEWARE SETUP & STATIC RUN
// ----------------------------------------------------

async function startServer() {
  try {
    await db.waitUntilReady();
  } catch (dbErr) {
    console.warn("[Server] DB ready wait notice:", dbErr);
  }
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const lanIp = getLocalNetworkIp();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n======================================================`);
    console.log(`📸 CAINTA PHOTOGRAPHY STUDIO MIS (LAN Access Ready)`);
    console.log(`➜ Local:   http://localhost:${PORT}`);
    console.log(`➜ Network: http://${lanIp}:${PORT}`);
    console.log(`  (Connect any smartphone, tablet, or PC on your Wi-Fi)`);
    console.log(`======================================================\n`);
  });
}

export { app };

const isServerlessEnvironment = !!(
  process.env.VERCEL === "1" ||
  process.env.FIREBASE_CONFIG ||
  process.env.FUNCTION_TARGET ||
  process.env.K_SERVICE
);

if (!isServerlessEnvironment) {
  startServer();
}

