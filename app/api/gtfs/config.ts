/**
 * GTFS Regional Configuration Resolver
 * Strictly parses the centralized `GTFS_CATALOG` Map JSON from `.env`.
 * Enforces explicit `country`, `region`, and `version` lookup (`json[country][regions][region][version]`).
 * Zero default values are used.
 */

export interface PatchInfo {
  fromVersion: string;
  toVersion: string;
  cdnUrl: string;
  sizeBytes: number;
  sha256: string;
  hmac: string;
  targetDbSha256: string;
}

export interface RegionVersionConfig {
  sizeBytes: number;
  sha256: string;
  DEK?: string;
  cdnUrl: string;
  contentHash?: string;
  patches?: PatchInfo[];
}

export interface RegionVersionsMap {
  [version: string]: RegionVersionConfig;
}

export interface CountryConfig {
  name?: string;
  regions?: {
    [regionName: string]: RegionVersionsMap;
  };
}

export interface GtfsCatalogMap {
  [countryCode: string]: CountryConfig;
}

let cachedCatalog: GtfsCatalogMap | null = null;
let lastCatalogString: string | undefined = undefined;

/**
 * Parses `process.env.GTFS_CATALOG` safely with in-memory caching.
 */
export function getCatalogMap(): GtfsCatalogMap {
  const currentEnvString = process.env.GTFS_CATALOG;
  if (!currentEnvString || currentEnvString.trim() === "") {
    return {};
  }

  if (cachedCatalog !== null && lastCatalogString === currentEnvString) {
    return cachedCatalog;
  }

  let jsonToParse = currentEnvString.trim();

  // Strip outer quotes if Vercel retained them literally
  if ((jsonToParse.startsWith('"') && jsonToParse.endsWith('"')) || 
      (jsonToParse.startsWith("'") && jsonToParse.endsWith("'"))) {
    jsonToParse = jsonToParse.slice(1, -1);
  }
  
  // 1. The bulletproof way: Base64 encoding. 
  // Base64 encoded JSON objects always start with "ey" (Base64 for '{"') or "ew" (for '{ ')
  if (jsonToParse.startsWith("ey") || jsonToParse.startsWith("ew")) {
    try {
      jsonToParse = Buffer.from(jsonToParse, 'base64').toString('utf-8');
    } catch (e) {
      // Fallback if base64 decoding fails
    }
  } else {
    // 2. Fallback for raw JSON strings
    // If dotenv didn't unescape double quotes and backslashes, handle it manually.
    if (jsonToParse.startsWith('{\\"')) {
      jsonToParse = jsonToParse.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
  }

  try {
    const parsed = JSON.parse(jsonToParse);
    if (typeof parsed === "object" && parsed !== null) {
      cachedCatalog = parsed as GtfsCatalogMap;
      lastCatalogString = currentEnvString;
      return cachedCatalog;
    }
  } catch (err) {
    console.warn("Failed to parse process.env.GTFS_CATALOG as JSON Map:", err);
  }

  return {};
}

export function getRegionConfig(
  countryCode: string,
  region: string,
  version: string | null,
): RegionVersionConfig | null {
  const catalog = getCatalogMap();
  const regionConfig = catalog[countryCode]?.regions?.[region];
  if (!regionConfig) {
    return null;
  }

  if (version !== null) {
    return regionConfig[version.toString()];
  }

  // Fallback to the latest available version
  const latestVersion = Object.keys(regionConfig)
    .sort((a, b) => b.localeCompare(a))[0];

  return latestVersion !== undefined
    ? regionConfig[latestVersion.toString()]
    : null;
}

export function compareSemVer(v1: string, v2: string): number {
  const p1 = v1.split('.').map(Number);
  const p2 = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

/**
 * Get the latest version number for a region.
 */
export function getLatestVersion(
  countryCode: string,
  region: string,
): string | null {
  const catalog = getCatalogMap();
  const regionConfig = catalog[countryCode]?.regions?.[region];
  if (!regionConfig) return null;

  const versions = Object.keys(regionConfig)
    .sort((a, b) => compareSemVer(b, a));

  return versions.length > 0 ? versions[0] : null;
}

/**
 * Compute the patch chain from a user's current version to the latest.
 *
 * Returns null if no patch chain is available (user must full re-download).
 * Returns an empty array if the user is already on the latest version.
 */
export function getPatchChain(
  countryCode: string,
  region: string,
  currentVersion: string,
): PatchInfo[] | null {
  const catalog = getCatalogMap();
  const regionConfig = catalog[countryCode]?.regions?.[region];
  if (!regionConfig) return null;

  const latestVersion = getLatestVersion(countryCode, region);
  if (latestVersion === null) return null;

  // Already on latest
  if (compareSemVer(currentVersion, latestVersion) >= 0) return [];

  // Check if major or minor versions differ
  const [currMajor = "0", currMinor = "0"] = currentVersion.split(".");
  const [latMajor = "0", latMinor = "0"] = latestVersion.split(".");
  if (currMajor !== latMajor || currMinor !== latMinor) {
    return null; // Force full download for major/minor jumps
  }

  // Collect all available patches across all version entries
  const allPatches: PatchInfo[] = [];
  for (const versionData of Object.values(regionConfig)) {
    if (typeof versionData === "object" && versionData !== null && "patches" in versionData) {
      const patches = (versionData as RegionVersionConfig).patches;
      if (patches) {
        allPatches.push(...patches);
      }
    }
  }

  // Build the chain: currentVersion → ... → latestVersion
  const chain: PatchInfo[] = [];
  let version = currentVersion;

  while (compareSemVer(version, latestVersion) < 0) {
    const nextPatch = allPatches.find((p) => p.fromVersion === version);
    if (!nextPatch) {
      // Gap in the chain — user must full re-download
      return null;
    }
    chain.push(nextPatch);
    version = nextPatch.toVersion;
  }

  if (chain.length > 4) {
    return null;
  }

  return chain;
}
