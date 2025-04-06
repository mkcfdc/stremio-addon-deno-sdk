import { stremioAddonLinter } from "./linter.ts";
import type { Manifest, Args, ShortManifestResource } from "./types.d.ts";


interface AddonHandler {
    (params: Args): Promise<unknown>;
}


export class AddonBuilder {
    private servedManifest: Manifest;
    private handlers: Record<string, AddonHandler> = {};
    private encryptionSecret?: string;

    constructor(manifestInput: Manifest) {
        if (manifestInput.config && manifestInput.config.length > 0 && !manifestInput.encryptionSecret) {
            throw new Error("Manifest defines 'config' but is missing the required 'encryptionSecret' property.");
        }

        this.encryptionSecret = manifestInput.encryptionSecret;

        const manifestForValidation = { ...manifestInput };
        delete manifestForValidation.encryptionSecret; 

        const linterRes = stremioAddonLinter.lintManifest(manifestForValidation);
        if (!linterRes.valid) {
            throw linterRes.errors[0];
        }

        if (linterRes.warnings.length) {
            linterRes.warnings.forEach((warning) => {
                console.log('WARNING:', warning.message);
            });
        }

        this.servedManifest = Object.freeze(JSON.parse(JSON.stringify(manifestForValidation)));

        if (JSON.stringify(this.servedManifest).length > 8192) {
            throw new Error('manifest size exceeds 8kb, which is incompatible with addonCollection API');
        }
    }

    private validate(): Error[] {
        const errors: Error[] = [];
        const handlersInManifest: string[] = [];

        if (this.servedManifest.catalogs && this.servedManifest.catalogs.length > 0) {
            handlersInManifest.push('catalog');
        }

        this.servedManifest.resources?.forEach((r) => {
            handlersInManifest.push(typeof r === 'string' ? r : r.name);
        });

        const handlersDefined = Object.keys(this.handlers);

        handlersDefined.forEach((defined) => {
            if (!handlersInManifest.includes(defined)) {
                if (defined === 'catalog') {
                    errors.push(new Error('manifest.catalogs is empty, catalog handler will never be called'));
                } else {
                    errors.push(new Error(`manifest.resources does not contain: ${defined}`));
                }
            }
        });

        handlersInManifest.forEach((defined) => {
            if (!handlersDefined.includes(defined)) {
                const capitalized = defined[0].toUpperCase() + defined.slice(1);
                errors.push(new Error(
                    `manifest definition requires handler for ${defined},` +
                    ` but it is not provided (use .define${capitalized}Handler())`
                ));
            }
        });

        return errors;
    }

    private validOrExit(): void {
        const errors = this.validate();
        if (errors.length) {
            throw errors[0];
        }
    }

    defineResourceHandler(resource: string, handler: AddonHandler): this {
        if (this.handlers[resource]) {
            throw new Error(`handler for ${resource} already defined`);
        }
        this.handlers[resource] = handler;
        return this;
    }

    defineStreamHandler(handler: AddonHandler): this {
        return this.defineResourceHandler('stream', handler);
    }

    defineMetaHandler(handler: AddonHandler): this {
        return this.defineResourceHandler('meta', handler);
    }

    defineCatalogHandler(handler: AddonHandler): this {
        return this.defineResourceHandler('catalog', handler);
    }

    defineSubtitlesHandler(handler: AddonHandler): this {
        return this.defineResourceHandler('subtitles', handler);
    }

    getInterface(): AddonInterface {
        this.validOrExit();
        return new AddonInterface(this.servedManifest, this.handlers, this.encryptionSecret);
    }
} 

export class AddonInterface {
    readonly manifest: Manifest; 
    private handlers: Record<string, AddonHandler>;
    readonly encryptionSecret?: string;

    constructor(manifest: Manifest, handlers: Record<string, AddonHandler>, encryptionSecret?: string) {
        this.manifest = manifest;
        this.handlers = handlers;
        this.encryptionSecret = encryptionSecret; 
    }

    async get(args: { resource: ShortManifestResource } & Args): Promise<any> {
        const { resource, type, id, extra } = args;
        const config = (args as any).config || {};
        const handler = this.handlers[resource];

        if (handler) {
            //console.log(`[Builder.get] Handler found for resource: ${resource}. Preparing to call.`);
            // Pass destructured params to the specific handler
            // Ensure 'extra' and 'config' are passed as objects
            return handler({ type, id, extra: extra || {}, config: config || {} });
        } else {
            //console.error(`[Builder.get] Handler NOT found for resource: ${resource}`);
            // Throw an actual error object if handler is missing
            const error = new Error(`No handler for resource: ${resource}`);
            (error as any).noHandler = true; // Add custom property if needed
            throw error;
        }
    }
}