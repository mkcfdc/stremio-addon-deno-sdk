import type { AddonInterface } from "./builder.ts";
import { landingTemplate } from "./landingTemplate.ts";
import { createAddonHandler } from "./getRouter.ts";
import { dirname, fromFileUrl, join } from "jsr:@std/path@^1.0.8";
import * as jose from "@panva/jose";

function setCorsHeaders(response: Response): Response {
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    return new Response(response.body, {
        status: response.status,
        headers
    });
}

interface ServeHTTPOptions {
  port?: number;
  cacheMaxAge?: number;
  static?: string;
}

export async function serveHTTP(
  addonInterface: AddonInterface,
  opts: ServeHTTPOptions = {},
): Promise<{ url: string; close: () => void }> {
  if (addonInterface.constructor.name !== "AddonInterface") {
    throw new Error("first argument must be an instance of AddonInterface");
  }

  const cacheMaxAge = opts.cacheMaxAge;
  if (cacheMaxAge && cacheMaxAge > 365 * 24 * 60 * 60) {
    console.warn(
      "cacheMaxAge set to more than 1 year, be advised that cache times are in seconds, not milliseconds.",
    );
  }

  // Main HTTP handler
  const handler = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const path = url.pathname;

    const headers = new Headers();
    if (cacheMaxAge) {
      headers.set("Cache-Control", `max-age=${cacheMaxAge}, public`);
    }
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    // Compute dynamic manifest for landing pages and router
    const baseManifest = addonInterface.getManifest({ type: '', id: '', extra: {}, config: {} });
    const hasConfig = Array.isArray(baseManifest.config) && baseManifest.config.length > 0;
    const landingHTML = landingTemplate(baseManifest);

    if (path === "/api/encode-config" && req.method === "POST") {
      try {
        const configJson = await req.json();
        const configJsonString = JSON.stringify(configJson);
        let encodedSegment: string;
          
        if (addonInterface.encryptionSecret) {
            const plaintext = new TextEncoder().encode(configJsonString);
            const keyMaterial = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(addonInterface.encryptionSecret));
            const cryptoKey = await crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, ['encrypt']);
            const jwe = await new jose.CompactEncrypt(plaintext).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).encrypt(cryptoKey);
            encodedSegment = jwe; 
        } else {
            encodedSegment = btoa(configJsonString); 
        }
          
        headers.set('Content-Type', 'text/plain');
        return new Response(encodedSegment, { status: 200, headers });
      } catch {
        headers.set('Content-Type', 'text/plain');
        return new Response("Error encoding configuration", { status: 500, headers });
      }
    }

    if (opts.static && path.startsWith(`/${opts.static}/`)) {
      try {
        const moduleDir = dirname(fromFileUrl(import.meta.url));
        const staticDir = join(moduleDir, opts.static);
        const requestedFile = decodeURIComponent(path.substring(opts.static.length + 1));
        const filePath = join(staticDir, requestedFile);
        if (!filePath.startsWith(staticDir)) throw new Error("Path traversal attempt");
        const file = await Deno.readFile(filePath);
        headers.set("Content-Type", getContentType(filePath));
        return new Response(file, { headers });
      } catch (err) {
        console.error(`Static file error: ${err}`);
        return new Response("Not Found", { status: 404, headers });
      }
    }

    if (path === "/" || path.endsWith("/configure")) {
      if (path === "/" && hasConfig) {
        return Response.redirect(`${url.origin}/configure`, 302);
      }
      headers.set("Content-Type", "text/html");
      return new Response(landingHTML, { headers });
    }

    // Use dynamic manifest callback for router
    const addonHandler = createAddonHandler({
      manifest: (params) => addonInterface.getManifest(params),
      get: addonInterface.get.bind(addonInterface),
      encryptionSecret: addonInterface.encryptionSecret,
    });
    return addonHandler(req);
  };

  const port = opts.port ?? 0;
  const server = Deno.serve({ port }, async (req) => {
    try {
      return await handler(req);
    } catch (err) {
      console.error("Raw error caught in serveHTTP:", err);
      const errorHeaders = new Headers({ 'Content-Type': 'application/json' });
      const corsErrorResponse = setCorsHeaders(new Response(null, { headers: errorHeaders }));
      return new Response(JSON.stringify({ err: "Internal Server Error" }), { status: 500, headers: corsErrorResponse.headers });
    }
  });

  const addr = server.addr as Deno.NetAddr;
  const hostname = addr.hostname === "0.0.0.0" ? "127.0.0.1" : addr.hostname;
  const serverUrl = `http://${hostname}:${addr.port}`;
  const manifestUrl = `${serverUrl}/manifest.json`;
  console.log(`HTTP addon accessible at: ${manifestUrl}`);

  if (Deno.args.includes("--launch")) {
    openUrl(`https://staging.strem.io#?addonOpen=${encodeURIComponent(manifestUrl)}`);
  }
  if (Deno.args.includes("--install")) {
    openUrl(manifestUrl.replace(/^http:/, "stremio:"));
  }

  return {
    url: manifestUrl,
    close: () => server.shutdown(),
  };
}

function getContentType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
  };
  return map[ext] ?? "application/octet-stream";
}

async function openUrl(url: string) {
  const cmds: Record<string, string[]> = {
    darwin: ["open"],
    win32: ["cmd", "/c", "start"],
    linux: ["xdg-open"],
  };
  const parts = cmds[Deno.build.os] ?? cmds.linux;
  try {
    const proc = new Deno.Command(parts[0], { args: [...parts.slice(1), url] }).spawn();
    const [status] = await Promise.all([proc.status]);
    if (!status.success) console.error(`Failed to open URL ${url}: code ${status.code}`);
  } catch (error) {
    console.error(`Error opening URL ${url}:`, error);
  }
}
