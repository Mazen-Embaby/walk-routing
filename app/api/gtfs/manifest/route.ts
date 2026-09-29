import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import crypto from "node:crypto";
import { getRegionConfig, getLatestVersion, getPatchChain, compareSemVer, type PatchInfo } from "../config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OTTR_SECRET = new TextEncoder().encode(
  process.env.GTFS_OTTR_SECRET || "default-ottr-secret-key-change-in-prod-12345"
);

/**
 * Generate a single-use OTTR download token for a given resource.
 */
async function generateDownloadToken(
  request: Request,
  country: string,
  region: string,
  version: string,
  resourceType: "full" | "patch" = "full",
  patchFrom?: string,
): Promise<string> {
  const jti = crypto.randomUUID();

  const token = await new SignJWT({
    jti,
    country,
    region,
    version,
    resourceType,
    ...(patchFrom !== undefined && { patchFrom }),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(OTTR_SECRET);

  return token;
}

/**
 * GTFS Download Manifest API (Phase 2 OTTR Architecture + Delta Patches)
 *
 * Query params:
 *   - country: Two-letter country code (required)
 *   - region: Region identifier (required)
 *   - version: Target version, or "latest" (required)
 *   - current_version: User's currently installed version number (optional).
 *     If provided and patches are available, the response includes a patchChain.
 */
async function handleManifestRequest(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const countryCode = searchParams.get("country")?.toUpperCase();
    const region = searchParams.get("region")?.toLowerCase();
    const version = searchParams.get("version")?.toLowerCase();
    const currentVersionStr = searchParams.get("current_version");
    const checkOnly = searchParams.get("check_only") === "true";

    if (!countryCode || !region || version === null || version === "") {
      return NextResponse.json(
        { error: "Missing required parameters: country, region, version" },
        { status: 400 }
      );
    }

    // Resolve the target version
    const latestVersion = getLatestVersion(countryCode, region);

    // Resolve exact configuration from GTFS_CATALOG Map
    const config = getRegionConfig(countryCode, region, version === "latest" ? null : version);
    if (!config) {
      return NextResponse.json(
        { error: `No configuration found in GTFS_CATALOG for country '${countryCode}', region '${region}', and version '${version}'` },
        { status: 404 }
      );
    }

    const resolvedVersion = version === "latest" && latestVersion !== null
      ? latestVersion.toString()
      : version;

    // Use the actual request origin instead of hardcoded APP_URL so that mobile clients (10.0.2.2) get the correct host
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") || "http";
    const origin = host ? `${proto}://${host}` : new URL(request.url).origin;

    // Generate OTTR token for full database download if not check_only
    let fullDownloadUrl = "";
    if (!checkOnly) {
      const fullDownloadToken = await generateDownloadToken(
        request, countryCode, region, resolvedVersion, "full"
      );
      fullDownloadUrl = `${origin}/api/gtfs/download?token=${fullDownloadToken}`;
    }

    // Build base response
    const response: Record<string, unknown> = {
      country: countryCode,
      region: region,
      version: resolvedVersion,
      latestVersion: latestVersion,
      fullDownloadUrl: fullDownloadUrl,
      fullSizeBytes: config.sizeBytes,
      fullDbSha256: config.sha256,
      updateStatus: "full_download_required",
      expiresInSeconds: 60,
    };

    // If the user provided their current version, compute the patch chain
    if (currentVersionStr !== null && currentVersionStr !== undefined) {
      const currentVersion = currentVersionStr;

      if (latestVersion !== null) {
        if (compareSemVer(currentVersion, latestVersion) >= 0) {
          // Already up to date
          response.updateStatus = "up_to_date";
          response.patchChain = [];
        } else {
          const patchChain = getPatchChain(countryCode, region, currentVersion);

          if (patchChain !== null && patchChain.length > 0) {
            // Patches available — generate OTTR tokens for each patch if not check_only
            const patchChainWithUrls = await Promise.all(
              patchChain.map(async (patch: PatchInfo) => {
                let downloadUrl = "";
                if (!checkOnly) {
                  const patchToken = await generateDownloadToken(
                    request,
                    countryCode,
                    region,
                    patch.toVersion.toString(),
                    "patch",
                    patch.fromVersion,
                  );
                  downloadUrl = `${origin}/api/gtfs/patch?token=${patchToken}`;
                }
                
                return {
                  fromVersion: patch.fromVersion,
                  toVersion: patch.toVersion,
                  downloadUrl: downloadUrl,
                  sizeBytes: patch.sizeBytes,
                  sha256: patch.sha256,
                  hmac: patch.hmac,
                  targetDbSha256: patch.targetDbSha256,
                };
              })
            );
            response.updateStatus = "patches_available";
            response.patchChain = patchChainWithUrls;
            response.totalPatchSizeBytes = patchChainWithUrls.reduce(
              (sum, p) => sum + p.sizeBytes, 0
            );
          } else {
            // No patch chain available — user must full re-download
            response.updateStatus = "full_download_required";
            response.patchChain = null;
          }
        }
      }
    }

    return NextResponse.json(response);
  } catch (err: any) {
    console.error("Manifest API error:", err);
    return NextResponse.json(
      {
        error: "Failed to generate GTFS download manifest",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return handleManifestRequest(request);
}

export async function POST(request: Request) {
  return handleManifestRequest(request);
}


