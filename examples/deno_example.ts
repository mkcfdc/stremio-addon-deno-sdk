/**
 * Basic Deno Stremio Addon Example
 */

// Import necessary components from the SDK module
import { AddonBuilder, serveHTTP } from "../src/mod.ts";
import type { Manifest, Stream, Args } from "../src/mod.ts"; 

// 1. Define the Addon Manifest
const manifest: Manifest = {
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
            required: true
        }
    ],
    encryptionSecret: 'long-known-phrase-like-a-password'
};

// 2. Create the AddonBuilder instance
const builder = new AddonBuilder(manifest);

// 3. Define Stream Handler
// The handler function receives an 'args' object containing 'type', 'id', 'config', 'extra'.
builder.defineStreamHandler(async (args: Args) => {
    // Log the received arguments, including any config
    console.log("Stream request received with config:", args);
    // Destructure type and id from args for clarity
    // Destructure type, id, and config from args
    const { type, id, config } = args;

    if (type === 'movie' && id === 'tt1254207') {
        // Serve one stream for Big Buck Bunny
        const stream: Stream = {
            // Example: Use config to potentially select a different URL based on quality
            // For simplicity, we'll just log the selected quality for now
            url: 'http://distribution.bbb3d.renderfarming.net/video/mp4/bbb_sunflower_1080p_30fps_normal.mp4',
            title: `Big Buck Bunny - Quality: ${config?.quality || 'default'}`, // Use config value in title
        };
        console.log("Serving stream:", stream);
        return Promise.resolve({ streams: [stream] });
    } else {
        // Otherwise, return no streams
        console.log("No stream found for this ID.");
        return Promise.resolve({ streams: [] });
    }
});

// 4. Start the HTTP server
// Use environment variable for port or default to 7000
const portEnv = Deno.env.get("PORT");
const port = portEnv ? parseInt(portEnv, 10) : 7000;

if (isNaN(port)) {
    console.error("Invalid PORT environment variable. Using default port 7000.");
    // Fallback to default if parsing fails
    // Note: Deno.env.get returns string | undefined, parseInt can return NaN
}

console.log(`Starting addon server on http://localhost:${port || 7000}`); // Use the determined port

serveHTTP(builder.getInterface(), { port: port || 7000 })
    .then(({ url }) => {
        console.log(`Addon manifest accessible at: ${url}/manifest.json`);
        // Example command to run:
        // deno run --allow-net --allow-env --allow-read examples/deno_example.ts
    })
    .catch(err => {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Failed to start server:", message);
        // Deno specific exit code for errors
        Deno.exit(1);
    });

// To run this example:
// deno run --allow-net --allow-env --allow-read examples/deno_example.ts