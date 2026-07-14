import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getRegionConfig } from "../config";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OTTR_SECRET = new TextEncoder().encode(
  process.env.GTFS_OTTR_SECRET || "default-ottr-secret-key-change-in-prod-12345"
);

function ensureFirebaseAdmin() {
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

/**
 * Parses a GCS CDN URL (e.g., https://storage.googleapis.com/multi-transit-gtfs/cairo_gtfs.db or gs://...)
 * and generates a V4 Signed URL on the fly with a 5-second expiration.
 */
async function getSignedCdnUrl(urlStr: string): Promise<string> {
  ensureFirebaseAdmin();

  let bucketName = "";
  let fileName = "";

  if (urlStr.startsWith("gs://")) {
    const parts = urlStr.slice(5).split("/");
    bucketName = parts[0];
    fileName = parts.slice(1).join("/");
  } else {
    const parsed = new URL(urlStr);
    if (parsed.hostname === "storage.googleapis.com") {
      const pathParts = parsed.pathname.replace(/^\/+/, "").split("/");
      bucketName = pathParts[0];
      fileName = pathParts.slice(1).join("/");
    } else if (parsed.hostname.endsWith(".storage.googleapis.com")) {
      bucketName = parsed.hostname.split(".")[0];
      fileName = parsed.pathname.replace(/^\/+/, "");
    } else {
      throw new Error(`Target URL '${urlStr}' is not a recognized Google Cloud Storage URL`);
    }
  }

  if (!bucketName || !fileName) {
    throw new Error(`Could not parse bucket and file path from target URL '${urlStr}'`);
  }

  const bucket = getStorage().bucket(bucketName);
  const file = bucket.file(fileName);

  const [signedUrl] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + 5 * 1000, // exactly 5 seconds expiration
  });

  return signedUrl;
}

// Global in-memory fallback Set for consumed single-use token JTIs across edge/Node invocations
declare global {
  var _ottrConsumedTokens: Set<string> | undefined;
}
globalThis._ottrConsumedTokens = globalThis._ottrConsumedTokens || new Set<string>();

/**
 * GTFS Single-Use Download API (Phase 2 OTTR Architecture)
 * Verifies single-use token issuance (`?token=...`) without checking AppCheck headers,
 * enforces single-use consumption (via Upstash Redis or memory), and issues a JIT 307 redirect
 * to the short-lived CDN / S3 pre-signed URL (`15s TTL`) defined in GTFS_CATALOG.
 */
async function handleDownloadRequest(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Missing required download token parameter '?token='" },
        { status: 401 }
      );
    }

    // 1. Verify token signature and 60s expiration time (`exp`)
    let payload: any;
    try {
      const result = await jwtVerify(token, OTTR_SECRET, {
        algorithms: ["HS256"],
      });
      payload = result.payload;
    } catch (jwtErr: any) {
      return NextResponse.json(
        { error: "Invalid or expired download token", details: jwtErr?.message },
        { status: 403 }
      );
    }

    const { jti, country, region, version } = payload;
    if (!jti || !country || !region) {
      return NextResponse.json(
        { error: "Token payload missing required claims ('jti', 'country', 'region')" },
        { status: 403 }
      );
    }

    // 2. Enforce Single-Use (`OTTR`) Check
    let isConsumed = false;

    // First attempt Upstash Redis atomic check if configured
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (redisUrl && redisToken) {
      try {
        const res = await fetch(`${redisUrl}/set/ottr:${jti}/1?NX=true&EX=60`, {
          method: "POST",
          headers: { Authorization: `Bearer ${redisToken}` },
        });
        const data = await res.json().catch(() => ({}));
        // If result is NOT "OK", NX failed because the key ottr:jti already exists
        if (data?.result !== "OK") {
          isConsumed = true;
        }
      } catch (redisErr) {
        console.warn("Upstash Redis connection error during OTTR check, falling back to memory:", redisErr);
        if (globalThis._ottrConsumedTokens?.has(jti)) {
          isConsumed = true;
        } else {
          globalThis._ottrConsumedTokens?.add(jti);
        }
      }
    } else {
      // Memory fallback for local development or when Redis is not configured
      if (globalThis._ottrConsumedTokens?.has(jti)) {
        isConsumed = true;
      } else {
        globalThis._ottrConsumedTokens?.add(jti);
        // Auto-cleanup memory set after 60s to prevent memory leaks
        setTimeout(() => globalThis._ottrConsumedTokens?.delete(jti), 65000);
      }
    }

    if (isConsumed) {
      return NextResponse.json(
        { error: "Download token has already been consumed (single-use restriction enforced)" },
        { status: 403 }
      );
    }

    // 3. Resolve target CDN URL strictly from GTFS_CATALOG Map
    const config = getRegionConfig(country, region, version);
    const targetUrl = config?.cdnUrl;
    if (!targetUrl) {
      return NextResponse.json(
        { error: `No CDN URL configured in GTFS_CATALOG for country '${country}', region '${region}', version '${version}'` },
        { status: 404 }
      );
    }

    // 4. Generate on-the-fly Google Cloud Storage Signed V4 URL with 5-second expiration
    let signedRedirectUrl = targetUrl;
    try {
      signedRedirectUrl = await getSignedCdnUrl(targetUrl);
    } catch (signErr: any) {
      console.error("Failed to generate GCS Signed URL on the fly:", signErr);
      return NextResponse.json(
        { error: "Failed to generate short-lived signed URL for private GCS dataset", details: signErr?.message || String(signErr) },
        { status: 500 }
      );
    }

    return NextResponse.redirect(signedRedirectUrl, { status: 307 });
  } catch (err: any) {
    console.error("Download API error:", err);
    return NextResponse.json(
      {
        error: "Failed to process download request",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return handleDownloadRequest(request);
}
