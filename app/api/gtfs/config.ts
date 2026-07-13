/**
 * GTFS Regional Configuration Resolver
 * Strictly parses the centralized `GTFS_CATALOG` Map JSON from `.env`.
 * Enforces explicit `country`, `region`, and `version` lookup (`json[country][regions][region][version]`).
 * Zero default values are used.
 */

export interface RegionVersionConfig {
  sizeBytes: number;
  sha256: string;
  dek?: string;
  cdnUrl: string;
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

  try {
    const parsed = JSON.parse(currentEnvString);
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
  version: number | string | null,
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
    .map(Number)
    .sort((a, b) => b - a)[0];

  return latestVersion !== undefined
    ? regionConfig[latestVersion.toString()]
    : null;
}
