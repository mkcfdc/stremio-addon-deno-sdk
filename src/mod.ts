/**
 * Stremio Addon SDK for Deno - Main Module
 *
 * This module provides the core functionalities for building Stremio addons using Deno.
 * It re-exports the main builder, server function, publishing utility, and core types.
 */

export { AddonBuilder, AddonInterface } from "./builder.ts";
export { serveHTTP } from "./serveHTTP.ts";
export { publishToCentral } from "./publishToCentral.ts";

export type {
    Manifest,
    // AddonInterface is already exported as a class, use a type alias if needed elsewhere
    // AddonInterface as AddonInterfaceType,
    Args,
    ContentType,
    ShortManifestResource,
    Cache,
    MetaPreview,
    MetaDetail,
    MetaLink,
    MetaVideo,
    Stream,
    Subtitle,
    ManifestCatalog,
    ManifestExtra,
    ManifestConfig,
    ManifestConfigType,
    FullManifestResource,
    AddonCatalog
} from "./types.d.ts";