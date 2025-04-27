/**
 * Deno Stremio Addon Example with Dynamic Manifest
 */

import { AddonBuilder, serveHTTP } from "../src/mod.ts";
import type { Manifest, Stream, Args } from "../src/mod.ts";

// 1. Initial Manifest (static metadata + config schema)
const initialManifest: Manifest = {
  id: "org.stremio.deno-basic-example",
  version: "1.0.0",
  name: "Deno Basic Example",
  description: "A basic example addon providing a stream for Big Buck Bunny",
  resources: ["stream"],
  types: ["movie"],
  catalogs: [],
  config: [
    {
      key: "quality",
      type: "select",
      title: "Preferred Video Quality",
      options: ["1080p", "720p", "480p"],
      default: "1080p",
      required: true,
    },
  ],
  encryptionSecret: "long-known-phrase-like-a-password",
};

// 2. Create the AddonBuilder
const builder = new AddonBuilder(initialManifest);

// 3. Override the manifest using user-provided config
builder.defineManifestHandler(({ config }) => {
  // config.quality comes from the UI selection
  const quality = (config?.quality as string) || "1080p";

  return {
    id: initialManifest.id,
    version: initialManifest.version,
    name: `Deno Basic Example — ${quality}`,
    description: initialManifest.description,
    resources: initialManifest.resources,
    types: initialManifest.types,
    catalogs: initialManifest.catalogs,
    config: initialManifest.config,
  };
});

// 4. Define Stream Handler
builder.defineStreamHandler(async (args: Args) => {
  console.log("Stream request with config:", args.config);
  const { type, id, config } = args;

  if (type === "movie" && id === "tt1254207") {
    const quality = (config?.quality as string) || "1080p";
    // select URL based on quality if you have multiple sources
    const url1080 = "http://.../bbb_sunflower_1080p_30fps.mp4";
    const url720 = "http://.../bbb_sunflower_720p_30fps.mp4";
    const url480 = "http://.../bbb_sunflower_480p_30fps.mp4";
    const streamUrl = quality === "720p" ? url720 : quality === "480p" ? url480 : url1080;

    const stream: Stream = {
      url: streamUrl,
      title: `Big Buck Bunny (${quality})`, // reflect config in title
    };
    return { streams: [stream] };
  }

  return { streams: [] };
});

// 5. Serve over HTTP
const port = parseInt(Deno.env.get("PORT") || "7000");
console.log(`Starting on http://localhost:${port}`);

serveHTTP(builder.getInterface(), { port }).then(({ url }) => {
  console.log(`Manifest available at: ${url}`);
});


// To run this example:
// deno run --allow-net --allow-env --allow-read examples/deno_example.ts