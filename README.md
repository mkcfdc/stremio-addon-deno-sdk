# Stremio Addon SDK for Deno 🧙

This SDK provides the tools necessary to build [Stremio](https://www.stremio.com/) addons using [Deno](https://deno.land/). It leverages Deno's standard library and includes `@panva/jose` for secure handling of user configuration data.

## Features

*   **Type Safety:** Built with TypeScript for robust development.
*   **Manifest Validation:** Includes a linter to validate your addon manifest against the Stremio specification.
*   **Simplified Handler Definition:** Use the `AddonBuilder` to easily define handlers for different resource types (catalog, meta, stream, subtitles).
*   **Built-in HTTP Server:** Quickly serve your addon using the `serveHTTP` function.
*   **Publishing Utility:** Helper function (`publishToCentral`) to publish your addon to the Stremio Addon Catalog.
*   **Configuration Support:** Supports user-configurable settings with built-in encryption using `encryptionSecret`.

## Quick Start

### 1. Import the SDK

In your Deno project (e.g., `addon.ts`):

```typescript
import { AddonBuilder, serveHTTP } from "jsr:@mkcfdc/stremio-addon-sdk/mod.ts";
import type { Manifest, Stream, Args } from "jsr:@mkcfdc/stremio-addon-sdk/mod.ts";

```

### 2. Define Your Addon Manifest

The manifest describes your addon's capabilities.

```typescript
const manifest: Manifest = {
    id: "org.myorg.myaddon",
    version: "1.0.0",
    name: "My Deno Addon",
    description: "Provides streams for testing.",
    resources: ["stream"], // This addon will provide streams
    types: ["movie"],      // For movies
    catalogs: [],          // No catalogs in this simple example
    // Optional: Add configuration fields
    config: [
        {
            key: "apiKey",
            type: "text",
            title: "Your API Key",
            required: false
        }
    ],
    // Required if 'config' is defined
    encryptionSecret: Deno.env.get('JWT_SECRET'),
};
```

### 3. Create the Addon Builder

Instantiate the `AddonBuilder` with your manifest.

```typescript
const builder = new AddonBuilder(manifest);
```

### 4. Define Handlers

Implement functions to handle requests for the resources defined in your manifest.

```typescript
// Example: Stream Handler
builder.defineStreamHandler(async (args: Args): Promise<{ streams: Stream[] }> => {
    console.log("Request for streams received:", args);

    // Access user config if needed (will be empty object if not set)
    const userConfig = args.config || {};
    console.log("User config:", userConfig);

    if (args.type === 'movie' && args.id === 'tt123456') { // Example IMDb ID
        const streams: Stream[] = [{
            title: "Example Stream",
            url: "http://example.com/stream.mp4"
        }];
        return { streams }; // Use object shorthand
    } else {
        // No streams for other requests
        return { streams: [] };
    }
});
```

### 5. Start the Server

Use `serveHTTP` to make your addon accessible.

```typescript
const port = parseInt(Deno.env.get("PORT") || "7000");

console.log(`Addon server starting on http://localhost:${port}`);

serveHTTP(builder.getInterface(), { port })
    .then(({ url }) => {
        console.log(`Addon accessible at: ${url}/manifest.json`);
        console.log(`Install command: stremio://install?url=${encodeURIComponent(url + '/manifest.json')}`);
    })
    .catch(err => {
        console.error("Failed to start server:", err);
        Deno.exit(1);
    });

```

### 6. Run Your Addon

```bash
deno run --allow-net --allow-env addon.ts
```

You should see output indicating the server has started and the URL for your manifest.

## API Overview

*   **`AddonBuilder`**: The primary class for constructing your addon. Takes a `Manifest` object and provides methods like `defineCatalogHandler`, `defineMetaHandler`, `defineStreamHandler`, `defineSubtitlesHandler` to attach logic for different request types.
*   **`serveHTTP`**: Starts a Deno standard library HTTP server to serve your addon based on the interface provided by `AddonBuilder.getInterface()`.
*   **`publishToCentral`**: A utility function to help publish your addon's manifest URL to the official Stremio addon catalog.
*   **Types**: The SDK exports various TypeScript types (e.g., `Manifest`, `Stream`, `MetaDetail`, `Args`) corresponding to the Stremio addon protocol.

## Documentation

*   **[API Reference](./docs/api/README.md)**: Detailed information on exported functions, classes, and types.
*   **[Manifest Definition](./docs/api/responses/manifest.md)**: Structure of the `manifest.json` file.
*   **[Request Handlers](./docs/api/requests/)**: Details on defining handlers for different resource types.
*   **[Deployment Guides](./docs/deploying/README.md)**: Examples for deploying your addon.
*   **[Examples](./examples/)**: Working addon examples.
*   **[Stremio Addon Protocol](./docs/protocol.md)**: The underlying protocol specification.

## Contributing

Contributions are welcome! Please refer to the main Stremio repository guidelines if applicable, or open an issue/pull request here.