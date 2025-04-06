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
        behaviorHints?: {
            filename?: string;
        };
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

export function createAddonHandler({ manifest, get, encryptionSecret }: { manifest: Manifest; get: AddonGet; encryptionSecret?: string }) {
    const manifestBuf = JSON.stringify(manifest); 

    const hasConfig = (manifest.config || []).length > 0;
    if (hasConfig && !(manifest.behaviorHints || {}).configurable) {
        console.warn("manifest.config is set but manifest.behaviorHints.configurable is disabled");
    }

    return async (request: Request): Promise<Response> => {
        const url = new URL(request.url);
        const rawPathname = url.pathname;
        const pathSegments = rawPathname.slice(1).split('/').filter(Boolean);

        if (request.method === 'OPTIONS') {
            return setCorsHeaders(new Response(null, { status: 204 }));
        }

        // Handle favicon.ico requests explicitly
        if (rawPathname === '/favicon.ico') {
            //console.log("[Router] Ignoring favicon.ico request");
            return setCorsHeaders(new Response(null, { status: 404 }));
        }

        if (pathSegments.length > 0 && decodeURIComponent(pathSegments[pathSegments.length - 1]) === 'manifest.json') {
            return setCorsHeaders(
                new Response(manifestBuf, {
                    headers: { 'Content-Type': 'application/json; charset=utf-8' }
                })
            );
        }

        let config: unknown = null;
        let configFound = false;
        let resourceSegments = pathSegments; 

        if (pathSegments.length > 0) {
            const potentialConfigSegment = pathSegments[0];
            if (encryptionSecret) {
                // --- Attempt JWE Decryption ---
                try {
                    const keyMaterial = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(encryptionSecret));
                    const key = new Uint8Array(keyMaterial);
                    const jwe = atob(potentialConfigSegment); // Base64 decode first
                    const { plaintext } = await jose.compactDecrypt(jwe, key);
                    const decodedConfigStr = new TextDecoder().decode(plaintext);
                    config = JSON.parse(decodedConfigStr);
                    configFound = true; // Mark config as successfully found and parsed
                    console.log("[Router] Successfully decrypted JWE config:", config);
                } catch (jweError) {
                    const message = jweError instanceof Error ? jweError.message : String(jweError);
                    console.warn(`[Router] Failed to decrypt JWE config segment (${potentialConfigSegment}): ${message}`);
                    configFound = false; // Decryption failed
                }
            } else {
                // --- Attempt Plain Base64 + JSON Parsing (No Secret) ---
                try {
                    const decodedConfigStr = new TextDecoder().decode(Uint8Array.from(atob(potentialConfigSegment), c => c.charCodeAt(0)));
                    config = JSON.parse(decodedConfigStr);
                    configFound = true; 
                    console.log("[Router] Successfully parsed plain base64 config:", config);
                } catch (_e) {
                    configFound = false; 
                }
            }
        }

        if (configFound) {
            resourceSegments = pathSegments.slice(1);
        } else {
            config = null; // Ensure config is null if not found/parsed
            resourceSegments = pathSegments;
        }


        // Now parse the CORRECT resourceSegments for resource/type/id/extra
        const resPathLen = resourceSegments.length;
        let resource: string | undefined;
        let type: string | undefined;
        let id: string | undefined;
        let extra: Record<string, unknown> = {};
        let isValidRequest = false;

        if (resPathLen >= 3) {
            const lastSegmentRaw = resourceSegments[resPathLen - 1];
            const secondLastSegmentRaw = resourceSegments[resPathLen - 2];

            if (lastSegmentRaw.endsWith('.json') && resPathLen === 3) {
                // Case: /<resource>/<type>/<id>.json
                resource = decodeURIComponent(resourceSegments[0]);
                type = decodeURIComponent(resourceSegments[1]);
                id = decodeURIComponent(lastSegmentRaw.replace('.json', ''));
                isValidRequest = true;
            } else if (lastSegmentRaw.endsWith('.json') && resPathLen === 4) {
                // Case: /<resource>/<type>/<id>/<extra>.json
                resource = decodeURIComponent(resourceSegments[0]);
                type = decodeURIComponent(resourceSegments[1]);
                id = decodeURIComponent(secondLastSegmentRaw);
                const extraStr = decodeURIComponent(lastSegmentRaw.replace('.json', ''));
                try {
                    extra = JSON.parse(extraStr);
                } catch (e) {
                    console.warn(`[Router] Failed to parse extra path segment as JSON: ${extraStr}`, e);
                    extra = {};
                }
                isValidRequest = true;
            }
        }

        // If valid, process the request
        if (isValidRequest && resource && type && id) {
            const queryParams = parseUrlParams(request.url);
            const combinedExtra = { ...extra, ...queryParams };

            console.log(`[Router] Request matched: resource=${resource}, type=${type}, id=${id}, extra=${JSON.stringify(combinedExtra)}, config=${JSON.stringify(config)}`);

            try {
                const validatedConfig = typeof config === 'object' && config !== null ? config as Record<string, unknown> : {};
                const getArgs = { resource: resource as ShortManifestResource, type: type as ContentType, id, extra: combinedExtra, config: validatedConfig };
                const resp = (await get(getArgs)) as StreamResponse & CacheHeaders;

                // --- Response Handling ---
                const cacheHeaders = [];
                if (typeof resp.cacheMaxAge === 'number') {
                    if (resp.cacheMaxAge > 31536000) console.warn('cacheMaxAge > 1 year');
                    cacheHeaders.push(`max-age=${resp.cacheMaxAge}`);
                }
                if (typeof resp.staleRevalidate === 'number') cacheHeaders.push(`stale-while-revalidate=${resp.staleRevalidate}`);
                if (typeof resp.staleError === 'number') cacheHeaders.push(`stale-if-error=${resp.staleError}`);

                const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8' });
                if (cacheHeaders.length > 0) headers.set('Cache-Control', `${cacheHeaders.join(', ')}, public`);

                if (resp.redirect) {
                    headers.set('Location', resp.redirect);
                    return setCorsHeaders(new Response(null, { status: 307, headers }));
                }

                if (resource === "stream" && resp.streams?.length && !warned.has("filename")) {
                    const hasMissingFilename = resp.streams.some(s => s?.url && !s?.behaviorHints?.filename);
                    if (hasMissingFilename) {
                        warned.add("filename");
                        console.warn("streams include stream.url but no behaviorHints.filename");
                    }
                }

                return setCorsHeaders(new Response(JSON.stringify(resp), { headers }));
            } catch (err) {
                if ((err as any).noHandler) {
                    console.log(`[Router] Handler not found for resource: ${resource}`);
                    return setCorsHeaders(new Response(JSON.stringify({ err: "not found" }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
                } else {
                    console.error("[Router] Error during handler execution:", err);
                    return setCorsHeaders(new Response(JSON.stringify({ err: "handler error" }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
                }
            }
        }

        // 4. Fallback to Not Found
        console.log("[Router] Path did not match expected resource structure:", rawPathname);
        return setCorsHeaders(
            new Response(JSON.stringify({ err: "not found" }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            })
        );
    };
}