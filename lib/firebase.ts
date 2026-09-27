import { getApps, initializeApp, cert } from "firebase-admin/app";

/**
 * Ensures Firebase Admin SDK is initialized exactly once.
 *
 * Safe to call multiple times — the `getApps()` guard makes it idempotent.
 * Uses FIREBASE_SERVICE_ACCOUNT_KEY env var when available (Vercel/production),
 * otherwise falls back to Application Default Credentials (local dev / GCP).
 */
export function ensureFirebaseAdmin() {
  if (getApps().length === 0) {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccountKey) {
      try {
        const serviceAccount = JSON.parse(serviceAccountKey);
        initializeApp({
          credential: cert(serviceAccount),
        });
      } catch (err) {
        console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:", err);
        initializeApp();
      }
    } else {
      initializeApp();
    }
  }
}
