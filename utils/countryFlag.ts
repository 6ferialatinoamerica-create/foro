const FALLBACK_COUNTRY_NAMES: Record<string, string> = {
    AR: 'Argentina',
    BO: 'Bolivia',
    BR: 'Brasil',
    CL: 'Chile',
    CO: 'Colombia',
    CR: 'Costa Rica',
    CU: 'Cuba',
    DO: 'República Dominicana',
    EC: 'Ecuador',
    ES: 'España',
    GT: 'Guatemala',
    HN: 'Honduras',
    MX: 'México',
    NI: 'Nicaragua',
    PA: 'Panamá',
    PE: 'Perú',
    PR: 'Puerto Rico',
    PY: 'Paraguay',
    SV: 'El Salvador',
    US: 'Estados Unidos',
    UY: 'Uruguay',
    VE: 'Venezuela',
};

export function normalizeCountryCode(code?: string | null): string {
    const clean = (code || '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(clean) || clean === 'XX' || clean === 'ZZ' || clean === 'T1') {
        return '';
    }
    return clean;
}

export function countryCodeToFlag(code?: string | null): string {
    const clean = normalizeCountryCode(code);
    if (!clean) return '';
    const first = 0x1f1e6 + (clean.charCodeAt(0) - 65);
    const second = 0x1f1e6 + (clean.charCodeAt(1) - 65);
    return String.fromCodePoint(first, second);
}

export function getCountryDisplayName(code?: string | null): string {
    const clean = normalizeCountryCode(code);
    if (!clean) return 'Sin país detectado';
    if (FALLBACK_COUNTRY_NAMES[clean]) return FALLBACK_COUNTRY_NAMES[clean];

    try {
        if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
            const dn = new Intl.DisplayNames(['es'], { type: 'region' });
            return dn.of(clean) || clean;
        }
    } catch {
        // Fallback below
    }
    return clean;
}
