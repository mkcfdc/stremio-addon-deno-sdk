/**
 * Example usage of the Deno Stremio Addon SDK - No Configuration
 *
 * This example demonstrates an addon that does *not* require configuration.
 */

// Import necessary components from the SDK module
import { AddonBuilder, serveHTTP } from "../src/mod.ts";
import type { Manifest, MetaPreview, MetaDetail, Stream, Args } from "../src/mod.ts";

// 1. Define the Addon Manifest (NO config or behaviorHints.configurable)
const manifest: Manifest = {
    id: "org.stremio.deno-example-no-config", // Unique ID
    version: "1.0.0",
    name: "Deno Example Addon (No Config)", // Unique Name
    description: "A simple example addon built with the Deno SDK (no config needed)",
    resources: ["catalog", "meta", "stream"],
    types: ["movie", "series"],
    catalogs: [
        {
            type: "movie",
            id: "deno-example-catalog-nc", // Unique catalog ID
            name: "Deno Movies (No Config)",
        },
        {
            type: "series",
            id: "deno-example-series-catalog-nc", // Unique catalog ID
            name: "Deno Series (No Config)",
        },
    ],
    // No 'config' array
    // No 'behaviorHints.configurable'
};

// 2. Create the AddonBuilder instance
const builder = new AddonBuilder(manifest);

// 3. Define Handlers
builder.defineCatalogHandler(async (args: Args) => {
    // Config will always be null here as none is defined in the manifest
    const { type, id, extra, config } = args;
    console.log("Catalog request received (No Config Addon):", { type, id, extra, config });

    // Use a fixed greeting since there's no config
    const greeting = "Default Greeting";
    console.log(`Using greeting: "${greeting}"`);

    let metas: MetaPreview[] = [];

    // Movie Catalog
    if (type === "movie" && id === "deno-example-catalog-nc") {
        metas = [
            { id: "tt0076759", type: "movie", name: `${greeting}: Star Wars`, poster: "https://m.media-amazon.com/images/M/MV5BOTA5NjhiOTAtZWM0ZC00MWNhLThiMzEtZDFkOTk2OTU1ZDJkXkEyXkFqcGdeQXVyMTA4NDI1NTQx._V1_SX300.jpg" },
            { id: "tt1285016", type: "movie", name: `${greeting}: Social Network`, poster: "https://m.media-amazon.com/images/M/MV5BOGUyZDUxZjEtMmIzMC00MzlmLTg4MGItZWJmMzBhZjE0Mjc1XkEyXkFqcGdeQXVyMTMxODk2OTU@._V1_SX300.jpg" },
        ];
    }

    // Series Catalog
    if (type === "series" && id === "deno-example-series-catalog-nc") {
        metas = [
            { id: "tt0944947", type: "series", name: `${greeting}: GoT`, poster: "https://m.media-amazon.com/images/M/MV5BN2IzYzBiOTQtNGZmMi00NDI5LTgxMzMtN2EzZjA1NjhlOGMxXkEyXkFqcGdeQXVyNjAwNDUxODI@._V1_SX300.jpg" },
        ];
    }

    return Promise.resolve({ metas });
});

builder.defineMetaHandler(async (args: Args) => {
    const { type, id, config } = args;
    console.log("Meta request received (No Config Addon):", { type, id, config });

    // Example for Game of Thrones
    if (type === "series" && id === "tt0944947") {
        const meta: MetaDetail = {
            id: "tt0944947", type: "series", name: "Game of Thrones",
            poster: "https://m.media-amazon.com/images/M/MV5BN2IzYzBiOTQtNGZmMi00NDI5LTgxMzMtN2EzZjA1NjhlOGMxXkEyXkFqcGdeQXVyNjAwNDUxODI@._V1_SX300.jpg",
            background: "https://m.media-amazon.com/images/M/MV5BNDJiZmE4NzMtZmNhOS00YjAwLThiZjktZWUzNWVkMjAxNzZmXkEyXkFqcGdeQXVyNjAwNDUxODI@._V1_Ratio0.6716_AL_.jpg",
            description: "Nine noble families fight for control over the lands of Westeros...",
            releaseInfo: "2011-",
            videos: [
                { id: "tt0944947:1:1", season: 1, episode: 1, title: "Winter Is Coming", released: "2011-04-17T04:00:00.000Z" },
                { id: "tt0944947:1:2", season: 1, episode: 2, title: "The Kingsroad", released: "2011-04-24T04:00:00.000Z" }
            ]
        };
        return Promise.resolve({ meta });
    }
    return Promise.resolve({ meta: undefined });
});

builder.defineStreamHandler(async (args: Args) => {
    const { type, id, config } = args;
    console.log("Stream request received (No Config Addon):", { type, id, config });

    // Example for Game of Thrones S01E01
    if (type === "series" && id === "tt0944947:1:1") {
        const streams: Stream[] = [
            { title: "Torrent (Default)", infoHash: "8A9BE77CBF9A589959F4A3D534B5156475D8409C", fileIdx: 0 },
            { title: "URL (Default)", url: "http://distribution.bbb3d.renderfarming.net/video/mp4/bbb_sunflower_1080p_30fps_normal.mp4" },
        ];
        return Promise.resolve({ streams });
    }
    return Promise.resolve({ streams: [] });
});

// 4. Start the HTTP server
const port = 7001; // Use a different port to avoid conflict
console.log(`Starting addon server (No Config) on http://localhost:${port}`);

serveHTTP(builder.getInterface(), { port })
    .then(({ url }) => {
        console.log(`Addon manifest (No Config) accessible at: ${url}`);
    })
    .catch(err => {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Failed to start server (No Config):", message);
    });

// To run this example:
// deno run --allow-net --allow-read examples/deno_example_no_config.ts [--launch | --install]