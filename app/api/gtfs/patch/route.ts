import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getStorage } from "firebase-admin/storage";
import { ensureFirebaseAdmin } from "@/lib/firebase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OTTR_SECRET = new TextEncoder().encode(
  process.env.GTFS_OTTR_SECRET || "default-ottr-secret-key-change-in-prod-12345"
);

/**
 * Generate a GCS V4 Signed URL for a given gs:// or https://storage.googleapis.com/ URL.
 * Reuses the same logic as the main download route.
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
      throw new Error(`Unrecognized GCS URL: '${urlStr}'`);
    }
  }

  if (!bucketName || !fileName) {
    throw new Error(`Could not parse bucket/file from '${urlStr}'`);
  }

  const bucket = getStorage().bucket(bucketName);
  const file = bucket.file(fileName);

  const [signedUrl] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + 5 * 1000, // 5-second expiry
  });

  return signedUrl;
}

// Global in-memory single-use token tracking (Redis preferred via UPSTASH)
declare global {
  var _ottrConsumedTokens: Set<string> | undefined;
}
globalThis._ottrConsumedTokens = globalThis._ottrConsumedTokens || new Set<string>();

/**
 * GTFS Patch Download API (OTTR Architecture)
 *
 * Verifies a single-use JWT issued by the manifest endpoint,
 * enforces single-use via Upstash Redis (or in-memory fallback),
 * and redirects to a short-lived GCS signed URL for the .sql patch file.
 *
 * The JWT must contain resourceType="patch" to be accepted here.
 *
 * GET /api/gtfs/patch?token=<jwt>
 */
async function handlePatchRequest(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Missing required parameter: token" },
        { status: 401 }
      );
    }

    // 1. Verify JWT signature and expiry
    let payload: any;
    try {
      const result = await jwtVerify(token, OTTR_SECRET, {
        algorithms: ["HS256"],
      });
      payload = result.payload;
    } catch (jwtErr: any) {
      return NextResponse.json(
        { error: "Invalid or expired patch token", details: jwtErr?.message },
        { status: 403 }
      );
    }

    const { jti, country, region, version, resourceType, patchFrom } = payload;

    // Ensure this token was issued for a patch (not a full download)
    if (resourceType !== "patch") {
      return NextResponse.json(
        { error: "Token is not valid for patch downloads" },
        { status: 403 }
      );
    }

    if (!jti || !country || !region || !version) {
      return NextResponse.json(
        { error: "Token payload missing required claims" },
        { status: 403 }
      );
    }

    // 2. Enforce single-use (OTTR) via Upstash Redis or memory fallback
    let isConsumed = false;
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (redisUrl && redisToken) {
      try {
        const res = await fetch(`${redisUrl}/set/ottr-patch:${jti}/1/EX/60/NX`, {
          method: "POST",
          headers: { Authorization: `Bearer ${redisToken}` },
        });
        const data = await res.json().catch(() => ({}));
        if (data?.result !== "OK") {
          isConsumed = true;
        }
      } catch {
        if (globalThis._ottrConsumedTokens?.has(jti)) {
          isConsumed = true;
        } else {
          globalThis._ottrConsumedTokens?.add(jti);
        }
      }
    } else {
      if (globalThis._ottrConsumedTokens?.has(jti)) {
        isConsumed = true;
      } else {
        globalThis._ottrConsumedTokens?.add(jti);
        setTimeout(() => globalThis._ottrConsumedTokens?.delete(jti), 65000);
      }
    }

    if (isConsumed) {
      return NextResponse.json(
        { error: "Patch token has already been consumed (single-use restriction)" },
        { status: 403 }
      );
    }

    // 3. Resolve the patch CDN URL from GTFS_CATALOG
    //    The patch URL follows the convention: patches/{patchFrom}_to_{version}.sql
    const catalogRaw = process.env.GTFS_CATALOG || "";
    if (!catalogRaw) {
      return NextResponse.json(
        { error: "GTFS_CATALOG not configured" },
        { status: 500 }
      );
    }

    let catalog: any;
    try {
      let jsonStr = catalogRaw.trim();
      if (jsonStr.startsWith("ey") || jsonStr.startsWith("ew")) {
        jsonStr = Buffer.from(jsonStr, "base64").toString("utf-8");
      }
      catalog = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse GTFS_CATALOG" },
        { status: 500 }
      );
    }

    const regionVersions = catalog[country.toUpperCase()]?.regions?.[region.toLowerCase()];
    if (!regionVersions) {
      return NextResponse.json(
        { error: `Region '${region}' not found in GTFS_CATALOG` },
        { status: 404 }
      );
    }

    // Find the patch entry matching patchFrom → version
    let patchCdnUrl: string | null = null;
    for (const versionData of Object.values(regionVersions)) {
      const vData = versionData as any;
      if (vData.patches) {
        const match = vData.patches.find(
          (p: any) =>
            p.fromVersion?.toString() === patchFrom?.toString() &&
            p.toVersion?.toString() === version?.toString()
        );
        if (match?.cdnUrl) {
          patchCdnUrl = match.cdnUrl;
          break;
        }
      }
    }

    if (!patchCdnUrl) {
      return NextResponse.json(
        {
          error: `No patch found in GTFS_CATALOG for v${patchFrom} → v${version} of region '${region}'`,
        },
        { status: 404 }
      );
    }

    // 4. Generate a short-lived GCS signed URL and redirect
    let signedUrl = patchCdnUrl;
    try {
      signedUrl = await getSignedCdnUrl(patchCdnUrl);
    } catch (signErr: any) {
      console.error("Failed to generate GCS Signed URL for patch:", signErr);
      return NextResponse.json(
        { error: "Failed to generate signed URL for patch file", details: signErr?.message },
        { status: 500 }
      );
    }

    return NextResponse.redirect(signedUrl, { status: 307 });
  } catch (err: any) {
    console.error("Patch download API error:", err);
    return NextResponse.json(
      { error: "Failed to process patch download", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return handlePatchRequest(request);
}
