// deno-lint-ignore-file no-prototype-builtins

interface LintResult {
    valid: boolean;
    errors: Error[];
    warnings: Error[];
}

interface Catalog {
    id: string;
    type: string;
    extra?: unknown[];
    extraSupported?: unknown[];
    extraRequired?: unknown[];
}

interface Manifest {
    id?: unknown;
    name?: unknown;
    version?: unknown;
    resources?: unknown[] | Array<string | { name: string }>;
    types?: unknown[];
    catalogs?: unknown[];
    idPrefixes?: unknown[] | null;
    [key: string]: unknown;
}

interface CollectionItem {
    transportUrl: unknown;
    transportName: unknown;
    manifest: Manifest;
}

// Simple semver validation (replacement for the 'semver' package)
function isValidSemver(version: unknown): boolean {
    if (typeof version !== 'string') return false;
    
    const parts = version.split('.');
    if (parts.length !== 3) return false;
    
    return parts.every(part => {
        const num = parseInt(part, 10);
        return !isNaN(num) && num >= 0;
    });
}

export function lintManifest(manifest: unknown): LintResult {
    const errors: Error[] = [];
    const warnings: Error[] = [];

    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        return { 
            valid: false, 
            errors: [new Error('manifest must be an object')],
            warnings: []
        };
    }

    const m = manifest as Manifest;

    // Basic validations
    assertString(m.id, 'manifest.id', errors);
    assertString(m.name, 'manifest.name', errors);
    assertSemver(m.version, 'manifest.version', errors);

    // Resources validation
    assertArray(m.resources, 'manifest.resources', errors);
    if (Array.isArray(m.resources)) {
        const resourceNames = m.resources.map(r => {
            if (r && typeof r === 'object' && 'name' in r) return (r as { name: string }).name;
            return r;
        });
        warnIfNotAllInSet(resourceNames, ['catalog', 'meta', 'stream', 'subtitles'], 'manifest.resources', warnings);
    }

    // Types and catalogs validation
    assertArray(m.types, 'manifest.types', errors);
    assertArray(m.catalogs, 'manifest.catalogs', errors);

    // Optional idPrefixes validation
    if (m.hasOwnProperty('idPrefixes') && m.idPrefixes !== null) {
        assertArray(m.idPrefixes, 'manifest.idPrefixes', errors);
    }

    // Catalogs detailed validation
    if (Array.isArray(m.catalogs)) {
        m.catalogs.forEach((catalog, i) => {
            if (!catalog || typeof catalog !== 'object') {
                errors.push(new Error(`manifest.catalogs[${i}]: must be an object`));
                return;
            }

            const c = catalog as Catalog;
            
            // .type and .id are mandatory
            if (typeof c.id !== 'string' || typeof c.type !== 'string') {
                errors.push(new Error(`manifest.catalogs[${i}]: id and type must be string properties`));
            }

            // Validate extra properties
            if (c.hasOwnProperty('extra')) {
                assertArray(c.extra, `manifest.catalogs[${i}].extra`, errors);
            }
            if (c.hasOwnProperty('extraSupported')) {
                assertArray(c.extraSupported, `manifest.catalogs[${i}].extraSupported`, errors);
            }
            if (c.hasOwnProperty('extraRequired')) {
                assertArray(c.extraRequired, `manifest.catalogs[${i}].extraRequired`, errors);
            }
        });
    }

    return { valid: errors.length === 0, errors, warnings };
}

export function lintCollection(col: unknown): LintResult {
    const errors: Error[] = [];
    const warnings: Error[] = [];

    if (!Array.isArray(col)) {
        errors.push(new Error('col is not an array'));
    } else {
        (col as CollectionItem[]).forEach((item, i) => {
            if (!item || typeof item !== 'object') {
                errors.push(new Error(`${i}: item must be an object`));
                return;
            }

            // Transport URL validation
            if (typeof item.transportUrl !== 'string') {
                errors.push(new Error(`${i}: transportUrl must be a string`));
            } else if (!item.transportUrl.startsWith('http://') && !item.transportUrl.startsWith('https://')) {
                warnings.push(new Error(`${i}: transportUrl should be a valid URL`));
            }

            // Transport name validation
            if (typeof item.transportName !== 'string') {
                errors.push(new Error(`${i}: transportName must be a string`));
            }

            // Validate the manifest
            const manifestResult = lintManifest(item.manifest);
            errors.push(...manifestResult.errors);
            warnings.push(...manifestResult.warnings);
        });
    }

    return { valid: errors.length === 0, errors, warnings };
}

// Helper functions
function assertString(val: unknown, name: string, errors: Error[]): void {
    if (typeof val !== 'string') {
        errors.push(new Error(`${name} must be a string`));
    }
}

function assertSemver(val: unknown, name: string, errors: Error[]): void {
    if (typeof val !== 'string' || !isValidSemver(val)) {
        errors.push(new Error(`${name} must be a valid semver string (e.g., "1.0.0")`));
    }
}

function assertArray(val: unknown, name: string, errors: Error[]): void {
    if (!Array.isArray(val)) {
        errors.push(new Error(`${name} must be an array`));
    }
}

function warnIfNotAllInSet(val: unknown[], set: string[], name: string, warnings: Error[]): void {
    if (!Array.isArray(val)) return;

    val.forEach(m => {
        if (typeof m === 'string' && !set.includes(m)) {
            warnings.push(new Error(`${name}: unknown value ${m}`));
        }
    });
}
export const stremioAddonLinter = {
    lintManifest,
    lintCollection
};