import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import crypto from "node:crypto";
import { getRegionConfig } from "../config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OTTR_SECRET = new TextEncoder().encode(
  process.env.GTFS_OTTR_SECRET || "default-ottr-secret-key-change-in-prod-12345"
);

/**
 * GTFS Download Manifest API (Phase 2 OTTR Architecture)
 * Enforces App Check verification (via proxy.ts) and issues a single-use token URL
 * for downloading encrypted offline GTFS SQLite databases.
 * Uses centralized GTFS_CATALOG Map configuration resolver.
 */
async function handleManifestRequest(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const countryCode = searchParams.get("country")?.toUpperCase();
    const region = searchParams.get("region")?.toLowerCase();
    const version = searchParams.get("version")?.toLowerCase();

    if (!countryCode || !region || version === null || version === "") {
      return NextResponse.json(
        { error: "Missing required parameters: country, region, version" },
        { status: 400 }
      );
    }

    // Resolve exact configuration from GTFS_CATALOG Map
    const config = getRegionConfig(countryCode, region, version);
    if (!config) {
      return NextResponse.json(
        { error: `No configuration found in GTFS_CATALOG for country '${countryCode}', region '${region}', and version '${version}'` },
        { status: 404 }
      );
    }

    // Generate unique JTI for single-use token tracking
    const jti = crypto.randomUUID();

    // Sign a 60-second JWT containing the JTI, country, region, and version claims
    const token = await new SignJWT({
      jti,
      country: countryCode,
      region: region,
      version: version,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("60s")
      .sign(OTTR_SECRET);

    // Resolve base origin for the download URL
    const origin = new URL(request.url).origin;
    const downloadUrl = `${origin}/api/gtfs/download?token=${token}`;

    return NextResponse.json({
      country: countryCode,
      region: region,
      version: version,
      downloadUrl,
      sizeBytes: config.sizeBytes,
      sha256: config.sha256,
      expiresInSeconds: 60,
    });
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
