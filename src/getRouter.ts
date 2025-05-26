import * as jose from "@panva/jose";
import type { Args, ShortManifestResource, ContentType, Manifest } from "./types.d.ts";

interface AddonGet {
    (args: { resource: ShortManifestResource } & Args): Promise<unknown>;
}

interface CacheHeaders {
    cacheMaxAge?: number;
    staleRevalidate?: number;
    staleError?: number;
}

interface StreamResponse {
    streams?: Array<{
        url?: string;
        behaviorHints?: { filename?: string };
    }>;
    redirect?: string;
}

const warned = new Set<string>();

function parseUrlParams(url: string): Record<string, string> {
    const params: Record<string, string> = {};
    const urlObj = new URL(url);
    urlObj.searchParams.forEach((value, key) => {
        params[key] = value;
    });
    return params;
}

function setCorsHeaders(response: Response): Response {
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    return new Response(response.body, {
        status: response.status,
        headers
    });
}

export function createAddonHandler({
    manifest,
    get,
    encryptionSecret,
}: {
    // allow either a static manifest or a dynamic manifest generator
    manifest: Manifest | ((params: Args) => Manifest);
    get: AddonGet;
    encryptionSecret?: string;
}) {
    // Helper to uniformly invoke manifest
    const manifestFn =
        typeof manifest === 'function'
            ? (params: Args) => (manifest as (params: Args) => Manifest)(params)
            : () => manifest as Manifest;

    return async (request: Request): Promise<Response> => {
        const url = new URL(request.url);
        const rawPathname = url.pathname;
        const pathSegments = rawPathname.slice(1).split('/').filter(Boolean);

        if (request.method === 'OPTIONS') {
            return setCorsHeaders(new Response(null, { status: 204 }));
        }

        if (rawPathname === '/favicon.ico') {
            return setCorsHeaders(new Response(null, { status: 404 }));
        }

        // Parse config (JWE or base64)
        let config: unknown = null;
        let configFound = false;
        let resourceSegments = pathSegments; // Initialize resourceSegments with full path

        if (pathSegments.length > 0) {
            const segment = pathSegments[0];
            try {
                if (encryptionSecret) {
                    const keyMaterial = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(encryptionSecret));
                    const cryptoKey = await crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, ['decrypt']);
                    const { plaintext } = await jose.compactDecrypt(segment, cryptoKey);
                    config = JSON.parse(new TextDecoder().decode(plaintext));
                } else {
                    config = JSON.parse(atob(segment));
                }
                configFound = true; // Set to true only on successful parsing
            } catch (e) {
                // If parsing fails (e.g., invalid JWE, malformed base64, or not valid JSON),
                // assume the segment is not a config and treat it as part of the resource path.
                // console.warn('Failed to parse config segment:', e); // Optional: for debugging
                config = null; // Ensure config is null if parsing fails
                configFound = false; // Confirm config was not found
                // resourceSegments remains pathSegments if parsing failed
            }
        }

        // If config was successfully parsed, update resourceSegments to exclude the config segment
        if (configFound) {
            resourceSegments = pathSegments.slice(1);
        }

        // Handle manifest.json dynamically
        // Use resourceSegments here, as it's the remaining path after optional config
        if (
            resourceSegments.length > 0 &&
            resourceSegments[resourceSegments.length - 1] === 'manifest.json'
        ) {
            // configFound will now correctly reflect if a config was present and parsed
            const dynamicManifest = manifestFn({ type: '', id: '', extra: {}, config: configFound && typeof config === 'object' ? config as Record<string, unknown> : {} });
            return setCorsHeaders(
                new Response(JSON.stringify(dynamicManifest), {
                    headers: { 'Content-Type': 'application/json; charset=utf-8' },
                }),
            );
        }

        // Parse resource/type/id/extra
        // Now uses the correctly adjusted resourceSegments
        const len = resourceSegments.length;
        let resource: string | undefined;
        let type: string | undefined;
        let id: string | undefined;
        let extra: Record<string, unknown> = {};
        let valid = false;

        if (len === 3 && resourceSegments[2].endsWith('.json')) {
            [resource, type] = resourceSegments;
            id = resourceSegments[2].replace('.json', '');
            valid = true;
        } else if (len === 4 && resourceSegments[3].endsWith('.json')) {
            resource = resourceSegments[0];
            type = resourceSegments[1];
            id = resourceSegments[2];
            try {
                extra = JSON.parse(resourceSegments[3].replace('.json', ''));
            } catch (e) { // Added error variable for better debugging
                // console.warn('Failed to parse extra segment as JSON:', e); // Optional: for debugging
                extra = {};
            }
            valid = true;
        }

        if (valid && resource && type && id) {
            const query = parseUrlParams(request.url);
            const combinedExtra = { ...extra, ...query };
            try {
                // cfg now correctly reflects parsed config or an empty object
                const cfg = configFound && typeof config === 'object' ? config as Record<string, unknown> : {};
                const args = { resource: resource as ShortManifestResource, type: type as ContentType, id, extra: combinedExtra, config: cfg };
                const resp = (await get(args)) as StreamResponse & CacheHeaders;

                // Build cache header
                const ch: string[] = [];
                if (typeof resp.cacheMaxAge === 'number') ch.push(`max-age=${resp.cacheMaxAge}`);
                if (typeof resp.staleRevalidate === 'number') ch.push(`stale-while-revalidate=${resp.staleRevalidate}`);
                if (typeof resp.staleError === 'number') ch.push(`stale-if-error=${resp.staleError}`);

                const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8' });
                if (ch.length) headers.set('Cache-Control', `${ch.join(', ')}, public`);

                if (resp.redirect) {
                    headers.set('Location', resp.redirect);
                    return setCorsHeaders(new Response(null, { status: 307, headers }));
                }

                // Warn missing filename once
                if (resource === 'stream' && Array.isArray(resp.streams)) {
                    const missing = resp.streams.some(s => s.url && !s.behaviorHints?.filename);
                    if (missing && !warned.has('filename')) {
                        warned.add('filename');
                        console.warn('streams include url but no behaviorHints.filename');
                    }
                }

                return setCorsHeaders(new Response(JSON.stringify(resp), { headers }));
            } catch (err) {
                if ((err as any).noHandler) {
                    return setCorsHeaders(new Response(JSON.stringify({ err: 'not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
                }
                console.error('Handler error:', err);
                return setCorsHeaders(new Response(JSON.stringify({ err: 'handler error' }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
            }
        }

        // Fallback
        return setCorsHeaders(
            new Response(JSON.stringify({ err: 'not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            })
        );
    };
}
