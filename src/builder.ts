import { stremioAddonLinter } from "./linter.ts";
import type { Manifest, Args, ShortManifestResource } from "./types.d.ts";

interface AddonHandler {
  (params: Args): Promise<unknown>;
}

// A manifest handler now accepts standard Args so you can access config/extra if needed
interface ManifestHandler {
  (params: Args): Manifest;
}

export class AddonBuilder {
  private staticManifest: Manifest;
  private manifestHandler?: ManifestHandler;
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
    if (!linterRes.valid) throw linterRes.errors[0];
    linterRes.warnings.forEach(w => console.log('WARNING:', w.message));

    this.staticManifest = Object.freeze(JSON.parse(JSON.stringify(manifestForValidation)));
    if (JSON.stringify(this.staticManifest).length > 8192) {
      throw new Error('manifest size exceeds 8kb, incompatible with addonCollection API');
    }
  }

  /**
   * Define a dynamic manifest generator that receives Args (e.g. config, extra).
   */
  defineManifestHandler(handler: ManifestHandler): this {
    if (this.manifestHandler) throw new Error('Manifest handler already defined');
    this.manifestHandler = handler;
    return this;
  }

  private getManifest(params: Args): Manifest {
    return this.manifestHandler
      ? this.manifestHandler(params)
      : this.staticManifest;
  }

private validateHandlers(): Error[] {
    const errors: Error[] = [];
    const resList: string[] = [];
    const manifest = this.getManifest({ type: '', id: '', extra: {}, config: {} });
    if (manifest.catalogs?.length) resList.push('catalog');
    manifest.resources?.forEach(r => resList.push(typeof r === 'string' ? r : r.name));

    const defined = Object.keys(this.handlers);

    resList.forEach(key => {
      if (!defined.includes(key)) {
        const cap = key[0].toUpperCase() + key.slice(1);
        errors.push(new Error(`manifest definition requires handler for ${key}, but it is not provided (use .define${cap}Handler())`));
      }
    });
    return errors;
  }

  /**
   * Common resource handler setter
   */
  defineResourceHandler(resource: string, handler: AddonHandler): this {
    if (this.handlers[resource]) throw new Error(`Handler for ${resource} already defined`);
    this.handlers[resource] = handler;
    return this;
  }

  defineStreamHandler    = (h: AddonHandler): this => this.defineResourceHandler('stream',    h);
  defineMetaHandler      = (h: AddonHandler): this => this.defineResourceHandler('meta',      h);
  defineCatalogHandler   = (h: AddonHandler): this => this.defineResourceHandler('catalog',   h);
  defineSubtitlesHandler = (h: AddonHandler): this => this.defineResourceHandler('subtitles', h);

  /**
   * Build the interface, ensuring handlers match the manifest (using empty params for validation)
   */
  getInterface(): AddonInterface {
    const errors = this.validateHandlers();
    if (errors.length) throw errors[0];
    return new AddonInterface(
      this.staticManifest,
      this.manifestHandler,
      this.handlers,
      this.encryptionSecret
    );
  }
}

export class AddonInterface {
  private staticManifest: Manifest;
  private manifestHandler?: ManifestHandler;
  private handlers: Record<string, AddonHandler>;
  readonly encryptionSecret?: string;

  constructor(
    staticManifest: Manifest,
    manifestHandler: ManifestHandler | undefined,
    handlers: Record<string, AddonHandler>,
    encryptionSecret?: string
  ) {
    this.staticManifest = staticManifest;
    this.manifestHandler = manifestHandler;
    this.handlers = handlers;
    this.encryptionSecret = encryptionSecret;
  }

  /**
   * Return manifest for incoming request (you can access config via params.config)
   */
  getManifest(params: Args): Manifest {
    return this.manifestHandler
      ? this.manifestHandler(params)
      : this.staticManifest;
  }

  /**
   * Dispatch resource requests
   */
  get(args: { resource: ShortManifestResource } & Args): Promise<unknown> {
    const { resource, type, id, extra, config } = args;
    const handler = this.handlers[resource];
    if (!handler) {
      const err = new Error(`No handler for resource: ${resource}`);
      (err as any).noHandler = true;
      throw err;
    }
    return handler({ type, id, extra: extra || {}, config: config || {} });
  }
}
