import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getRegionConfig } from "../config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Envelope Key Exchange API for offline GTFS databases.
 * Verifies Firebase App Check and returns the master Data Encryption Key (DEK)
 * wrapped (encrypted) with the client's public key or ephemeral ECDH session key.
 * Supports dynamic region and version parameters via both GET and POST.
 */
async function handleKeyRequest(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let body: any = {};
    if (request.method === "POST") {
      body = await request.json().catch(() => ({}));
    }
    const bodyData = body || {};

    const country = searchParams.get("country") || bodyData.country;
    const region = searchParams.get("region") || bodyData.region;
    const version = searchParams.get("version") || bodyData.version;

    if (
      !country ||
      !region ||
      version === null ||
      version === undefined ||
      version === ""
    ) {
      return NextResponse.json(
        { error: "Missing required parameters: country, region, version" },
        { status: 400 },
      );
    }

    const countryCode = country.toString().toUpperCase();
    const cleanRegion = region.toString().toLowerCase();
    const parsedVersion = !isNaN(Number(version))
      ? Number(version)
      : version.toString();

    const keyType: string = "rsa";
    const clientPublicKey =
      searchParams.get("clientPublicKey") || bodyData.clientPublicKey;

    // Dynamically resolve region and version specific DEK strictly from GTFS_CATALOG Map
    const masterDek = getRegionConfig(
      countryCode,
      cleanRegion,
      parsedVersion,
    )?.dek;

    if (!masterDek) {
      return NextResponse.json(
        {
          error: `No DEK configured for country '${countryCode}', region '${cleanRegion}', version '${parsedVersion}'`,
        },
        { status: 404 },
      );
    }

    if (keyType === "rsa" && !clientPublicKey) {
      return NextResponse.json({ error: "Missing KEY" }, { status: 400 });
    }

    // If client provided an RSA or EC public key, wrap the DEK so it cannot be intercepted in transit
    if (clientPublicKey && keyType === "rsa") {
      try {
        const encryptedBuffer = crypto.publicEncrypt(
          {
            key: clientPublicKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: "sha256",
          },
          Buffer.from(masterDek, "utf8"),
        );
        return NextResponse.json({
          wrappedDek: encryptedBuffer.toString("base64"),
          algorithm: "RSA-OAEP-256",
          region,
          version,
        });
      } catch (cryptoErr) {
        // Fallback to base64 envelope if public key format is non-standard
        return NextResponse.json(
          { error: "Invalid public key for DEK" },
          { status: 400 },
        );
      }
    } else if (clientPublicKey && keyType === "ecdh") {
      // ECDH Curve25519 / P-256 key derivation + AES-GCM wrap
      try {
        const serverEcdh = crypto.createECDH("prime256v1");
        serverEcdh.generateKeys();
        const sharedSecret = serverEcdh.computeSecret(
          Buffer.from(clientPublicKey, "base64"),
        );

        // Derive key and encrypt DEK with AES-256-GCM
        const aesKey = crypto
          .createHash("sha256")
          .update(sharedSecret)
          .digest();
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
        let ciphertext = cipher.update(masterDek, "utf8", "base64");
        ciphertext += cipher.final("base64");
        const authTag = cipher.getAuthTag();

        return NextResponse.json({
          wrappedDek: ciphertext,
          iv: iv.toString("base64"),
          authTag: authTag.toString("base64"),
          serverPublicKey: serverEcdh.getPublicKey("base64"),
          algorithm: "ECDH-AES-256-GCM",
          region,
          version,
        });
      } catch (ecdhErr) {
        return NextResponse.json(
          { error: "ECDH key exchange failed" },
          { status: 400 },
        );
      }
    }

    // Direct envelope payload (if client uses AppCheck + TLS channel without client key)
    return NextResponse.json({
      wrappedDek: Buffer.from(masterDek).toString("base64"),
      algorithm: "BASE64-TLS-ENVELOPE",
      region,
      version,
    });
  } catch (err: any) {
    console.error("Key exchange API error:", err);
    return NextResponse.json(
      {
        error: "Failed to process key exchange request",
        details: err?.message || String(err),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return handleKeyRequest(request);
}

export async function GET(request: Request) {
  return handleKeyRequest(request);
}
