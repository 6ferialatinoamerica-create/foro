import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import type {
    AccessVerificationResult,
    ActivityEventType,
    ActivityLogEntry,
    AdminApprovalStatus,
    AdminRole,
    AdminStudentRecord,
    AdminUserSummary,
    DeviceAccessAlert,
    RecordingStatusMap,
    SavedAdminCredentials,
    StudentEmailCheckResult,
    VerifiedStudentSession,
} from '../types';

const DEVICE_ID_KEY = 'territorio_canva_6ta_device_id_v1';
const STUDENT_VAULT_KEY = 'territorio_canva_6ta_student_vault_v1';
const ADMIN_VAULT_KEY = 'territorio_canva_6ta_admin_vault_v1';
const LOCAL_DB_KEY = 'territorio_canva_6ta_local_db_v1';

interface LocalDeviceEntry {
    deviceId: string;
    deviceLabel: string;
    ipAddress: string;
    countryCode: string;
    isAuthorized: boolean;
    lastSeenAt: string;
}

interface LocalStudentEntry extends AdminStudentRecord {
    devices: LocalDeviceEntry[];
}

interface LocalAdminEntry {
    id: string;
    adminEmail: string;
    accessKey: string;
    displayName: string;
    role: AdminRole;
    approvalStatus: AdminApprovalStatus;
    mustChangePassword: boolean;
    isActive: boolean;
    createdAt: string;
}

interface LocalDbState {
    admin?: { email: string; accessKey: string; displayName: string } | null;
    admins?: LocalAdminEntry[];
    defaultOwnersSeeded?: boolean;
    testOwnerSeeded?: boolean;
    testStudentSeeded?: boolean;
    students: LocalStudentEntry[];
    alerts: DeviceAccessAlert[];
    recordings?: RecordingStatusMap;
    activityLogs?: ActivityLogEntry[];
}

export const getOrCreateDeviceId = (): string => {
    try {
        const existing = localStorage.getItem(DEVICE_ID_KEY);
        if (existing) return existing;
        const generated =
            typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(DEVICE_ID_KEY, generated);
        return generated;
    } catch {
        return `dev_${Date.now()}`;
    }
};

export const getDeviceLabel = (): string => {
    if (typeof navigator === 'undefined') return 'Dispositivo Web';
    const ua = navigator.userAgent;

    let browser = 'Navegador';
    if (ua.includes('Edg/')) browser = 'Edge';
    else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browser = 'Chrome';
    else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';
    else if (ua.includes('Firefox/')) browser = 'Firefox';

    let os = 'Equipo';
    if (ua.includes('iPhone')) os = 'iPhone';
    else if (ua.includes('iPad')) os = 'iPad';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac OS X')) os = 'Mac';
    else if (ua.includes('Linux')) os = 'Linux';

    return `${browser} · ${os}`;
};

export const getSavedStudentSession = (): VerifiedStudentSession | null => {
    try {
        const raw = localStorage.getItem(STUDENT_VAULT_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<VerifiedStudentSession>;
        if (!parsed.email) return null;
        return {
            studentId: parsed.studentId || '',
            email: parsed.email,
            fullName: parsed.fullName || '',
            purchaseCode: parsed.purchaseCode || '',
            classroomPassword: parsed.classroomPassword || '',
            classroomUrl: parsed.classroomUrl || '',
            primaryCountry: parsed.primaryCountry || '',
            primaryIp: parsed.primaryIp || '',
            activeDevicesCount: parsed.activeDevicesCount ?? 1,
            maxDevices: parsed.maxDevices ?? 2,
            completedClassIds: Array.isArray(parsed.completedClassIds) ? parsed.completedClassIds : [],
            verifiedAt: parsed.verifiedAt || new Date().toISOString(),
        };
    } catch {
        return null;
    }
};

export const saveStudentSessionLocally = (session: VerifiedStudentSession): void => {
    try {
        localStorage.setItem(STUDENT_VAULT_KEY, JSON.stringify(session));
    } catch {
        // Ignore storage quota issues
    }
};

export const clearStudentSessionLocally = (): void => {
    try {
        localStorage.removeItem(STUDENT_VAULT_KEY);
    } catch {
        // Ignore
    }
};

export const getSavedAdminCredentials = (): SavedAdminCredentials | null => {
    try {
        const raw = localStorage.getItem(ADMIN_VAULT_KEY);
        return raw ? (JSON.parse(raw) as SavedAdminCredentials) : null;
    } catch {
        return null;
    }
};

export const saveAdminCredentialsLocally = (creds: SavedAdminCredentials): void => {
    try {
        localStorage.setItem(ADMIN_VAULT_KEY, JSON.stringify(creds));
    } catch {
        // Ignore
    }
};

export const clearAdminCredentialsLocally = (): void => {
    try {
        localStorage.removeItem(ADMIN_VAULT_KEY);
    } catch {
        // Ignore
    }
};

const DEFAULT_OWNER_SEEDS: Array<{ email: string; displayName: string; tempKey: string }> = [
    { email: 'profeyussef@gmail.com', displayName: 'Yussef Álvarez', tempKey: '1234' },
    { email: 'marketingm.digital20@gmail.com', displayName: 'Lisbeth Mora', tempKey: '1234' },
];

const TEST_OWNER_SEED = {
    email: 'alizon9263@gmail.com',
    displayName: 'Yill Nieto',
    tempKey: '1234',
};

const TEST_STUDENT_SEED = {
    email: 'yill.nieto@gmail.com',
    fullName: 'Yill Nieto',
};

const normalizeLocalDb = (raw: LocalDbState): {
    admin: LocalDbState['admin'];
    admins: LocalAdminEntry[];
    defaultOwnersSeeded: boolean;
    testOwnerSeeded: boolean;
    testStudentSeeded: boolean;
    students: LocalStudentEntry[];
    alerts: DeviceAccessAlert[];
    recordings: RecordingStatusMap;
    activityLogs: ActivityLogEntry[];
} => {
    const admins: LocalAdminEntry[] = Array.isArray(raw.admins)
        ? raw.admins.map((a) => ({
              ...a,
              role: a.role === 'teacher' ? 'teacher' : a.role === 'support' ? 'support' : 'owner',
              approvalStatus: a.approvalStatus === 'pending' ? 'pending' : 'approved',
              mustChangePassword: Boolean(a.mustChangePassword),
          }))
        : [];

    if (admins.length === 0 && raw.admin && raw.admin.email) {
        const legacyEmail = raw.admin.email.trim().toLowerCase();
        admins.push({
            id: `adm_legacy_${legacyEmail}`,
            adminEmail: legacyEmail,
            accessKey: raw.admin.accessKey,
            displayName: raw.admin.displayName || 'Administrador',
            role: 'owner',
            approvalStatus: 'approved',
            mustChangePassword: false,
            isActive: true,
            createdAt: new Date().toISOString(),
        });
    }

    if (!raw.defaultOwnersSeeded) {
        DEFAULT_OWNER_SEEDS.forEach((seed) => {
            if (!admins.some((a) => a.adminEmail.toLowerCase() === seed.email)) {
                admins.push({
                    id: `adm_owner_${seed.email}`,
                    adminEmail: seed.email,
                    accessKey: seed.tempKey,
                    displayName: seed.displayName,
                    role: 'owner',
                    approvalStatus: 'approved',
                    mustChangePassword: true,
                    isActive: true,
                    createdAt: new Date().toISOString(),
                });
            }
        });
    }

    if (!raw.testOwnerSeeded) {
        if (!admins.some((a) => a.adminEmail.toLowerCase() === TEST_OWNER_SEED.email)) {
            admins.push({
                id: `adm_owner_${TEST_OWNER_SEED.email}`,
                adminEmail: TEST_OWNER_SEED.email,
                accessKey: TEST_OWNER_SEED.tempKey,
                displayName: TEST_OWNER_SEED.displayName,
                role: 'owner',
                approvalStatus: 'approved',
                mustChangePassword: true,
                isActive: true,
                createdAt: new Date().toISOString(),
            });
        }
    }

    const students: LocalStudentEntry[] = Array.isArray(raw.students)
        ? raw.students.map((s) => ({
              ...s,
              primaryIp: s.primaryIp ?? null,
              needsPasswordSetup: Boolean(s.needsPasswordSetup),
              completedClassIds: Array.isArray(s.completedClassIds) ? s.completedClassIds : [],
              devices: Array.isArray(s.devices) ? s.devices : [],
          }))
        : [];

    if (!raw.testStudentSeeded) {
        if (!students.some((s) => s.email.toLowerCase() === TEST_STUDENT_SEED.email)) {
            students.push({
                id: `stu_seed_${TEST_STUDENT_SEED.email}`,
                email: TEST_STUDENT_SEED.email,
                fullName: TEST_STUDENT_SEED.fullName,
                purchaseCode: '',
                classroomPassword: '',
                classroomUrl: '',
                primaryCountry: null,
                primaryIp: null,
                maxDevices: 2,
                isActive: true,
                needsPasswordSetup: true,
                completedClassIds: [],
                authorizedDevicesCount: 0,
                totalDevicesCount: 0,
                createdAt: new Date().toISOString(),
                devices: [],
            });
        }
    }

    const alerts: DeviceAccessAlert[] = Array.isArray(raw.alerts) ? raw.alerts : [];
    const recordings: RecordingStatusMap =
        raw.recordings && typeof raw.recordings === 'object' ? { ...raw.recordings } : {};
    const activityLogs: ActivityLogEntry[] = Array.isArray(raw.activityLogs) ? raw.activityLogs : [];
    return {
        admin: raw.admin ?? null,
        admins,
        defaultOwnersSeeded: true,
        testOwnerSeeded: true,
        testStudentSeeded: true,
        students,
        alerts,
        recordings,
        activityLogs,
    };
};

const readLocalDb = () => {
    try {
        const raw = localStorage.getItem(LOCAL_DB_KEY);
        if (raw) {
            return normalizeLocalDb(JSON.parse(raw) as LocalDbState);
        }
    } catch {
        // Fallback below
    }
    return normalizeLocalDb({
        admin: null,
        admins: [],
        defaultOwnersSeeded: false,
        testOwnerSeeded: false,
        testStudentSeeded: false,
        students: [],
        alerts: [],
        recordings: {},
        activityLogs: [],
    });
};

const writeLocalDb = (db: ReturnType<typeof normalizeLocalDb>): void => {
    try {
        localStorage.setItem(
            LOCAL_DB_KEY,
            JSON.stringify({
                ...db,
                defaultOwnersSeeded: true,
                testOwnerSeeded: true,
                testStudentSeeded: true,
            })
        );
    } catch {
        // Ignore
    }
};

export const appendLocalActivityLog = (params: {
    eventType: ActivityEventType;
    actorEmail?: string;
    actorName?: string;
    workshopId?: string;
    countryCode?: string;
    createdAt?: string;
}): void => {
    const db = readLocalDb();
    db.activityLogs.unshift({
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        eventType: params.eventType,
        actorEmail: params.actorEmail?.trim().toLowerCase() || undefined,
        actorName: params.actorName?.trim() || undefined,
        workshopId: params.workshopId?.trim() || undefined,
        countryCode: params.countryCode?.trim().toUpperCase() || undefined,
        createdAt: params.createdAt || new Date().toISOString(),
    });
    if (db.activityLogs.length > 500) {
        db.activityLogs = db.activityLogs.slice(0, 500);
    }
    writeLocalDb(db);
};

export async function logStudentActivity(params: {
    email: string;
    actorName?: string;
    eventType: ActivityEventType;
    workshopId?: string;
    countryOverride?: string;
}): Promise<void> {
    const cleanEmail = params.email.trim().toLowerCase();
    if (!cleanEmail) return;

    if (isSupabaseConfigured) {
        try {
            await postJson('/api/verify-access', {
                action: 'log_activity',
                email: cleanEmail,
                actorName: (params.actorName || '').trim(),
                eventType: params.eventType,
                workshopId: params.workshopId || '',
            });
        } catch {
            // Registro silencioso para no interrumpir la navegación
        }
        return;
    }

    const db = readLocalDb();
    const matchedStudent = db.students.find((s) => s.email.toLowerCase() === cleanEmail);
    appendLocalActivityLog({
        eventType: params.eventType,
        actorEmail: cleanEmail,
        actorName: params.actorName || matchedStudent?.fullName || '',
        workshopId: params.workshopId || '',
        countryCode: params.countryOverride || matchedStudent?.primaryCountry || '',
    });
}

export const hasLocalAdminConfigured = (): boolean => {
    return readLocalDb().admins.some((a) => a.isActive && a.approvalStatus === 'approved');
};

async function detectClientIp(): Promise<string> {
    if (typeof window === 'undefined' || typeof fetch !== 'function') {
        return '127.0.0.1';
    }
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1400);
        const res = await fetch('/api/client-ip', { signal: controller.signal, cache: 'no-store' });
        clearTimeout(timer);
        if (res.ok) {
            const data = (await res.json()) as { ip?: string };
            if (data.ip) return data.ip.trim();
        }
    } catch {
        // Fallback below
    }
    return '127.0.0.1';
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return (await response.json()) as T;
}

const findValidLocalAdmin = (
    db: ReturnType<typeof normalizeLocalDb>,
    email: string,
    accessKey: string,
    options?: {
        allowPendingPasswordChange?: boolean;
        allowPendingApproval?: boolean;
        requireOwner?: boolean;
        requireSupportOrOwner?: boolean;
    }
): LocalAdminEntry | undefined => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanKey = accessKey.trim();
    return db.admins.find((a) => {
        if (!a.isActive) return false;
        if (a.adminEmail.toLowerCase() !== cleanEmail || a.accessKey !== cleanKey) return false;
        if (!options?.allowPendingApproval && a.approvalStatus !== 'approved') return false;
        if (!options?.allowPendingPasswordChange && a.mustChangePassword) return false;
        if (options?.requireOwner && a.role !== 'owner') return false;
        if (options?.requireSupportOrOwner && a.role !== 'owner' && a.role !== 'support') return false;
        return true;
    });
};

export const getLocalAdminEntry = (email: string, accessKey: string): LocalAdminEntry | undefined => {
    const db = readLocalDb();
    return findValidLocalAdmin(db, email, accessKey);
};

export const isLocalAdminValid = (email: string, accessKey: string): boolean => {
    const db = readLocalDb();
    return Boolean(findValidLocalAdmin(db, email, accessKey));
};

export const isLocalOwnerAdminValid = (email: string, accessKey: string): boolean => {
    const db = readLocalDb();
    return Boolean(findValidLocalAdmin(db, email, accessKey, { requireOwner: true }));
};

export const isLocalSupportOrOwnerValid = (email: string, accessKey: string): boolean => {
    const db = readLocalDb();
    return Boolean(findValidLocalAdmin(db, email, accessKey, { requireSupportOrOwner: true }));
};

export async function checkStudentEmail(email: string): Promise<StudentEmailCheckResult> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
        return {
            ok: false,
            status: 'NOT_FOUND',
            message: 'Ingresa un correo electrónico válido.',
        };
    }

    if (isSupabaseConfigured) {
        return postJson<StudentEmailCheckResult>('/api/verify-access', {
            action: 'check_email',
            email: cleanEmail,
        });
    }

    const db = readLocalDb();
    const student = db.students.find((s) => s.email.toLowerCase() === cleanEmail);
    if (!student) {
        return {
            ok: false,
            status: 'NOT_FOUND',
            message:
                'No encontramos ese correo en la lista de alumnas inscritas. Verifica que sea el mismo correo de tu compra o pide a coordinación que registre tu inscripción.',
        };
    }

    if (!student.isActive) {
        return {
            ok: false,
            status: 'INACTIVE',
            message: 'Tu pase se encuentra suspendido temporalmente. Contacta al equipo de soporte.',
        };
    }

    const needsActivation =
        Boolean(student.needsPasswordSetup) ||
        (!student.classroomPassword?.trim() && !student.purchaseCode?.trim());

    return {
        ok: true,
        status: needsActivation ? 'NEEDS_ACTIVATION' : 'NEEDS_PASSWORD',
        email: student.email,
        fullName: student.fullName,
    };
}

export async function activateStudentAccess(params: {
    email: string;
    newPassword: string;
    fullName?: string;
    deviceIdOverride?: string;
    countryOverride?: string;
    ipOverride?: string;
}): Promise<AccessVerificationResult> {
    const cleanEmail = params.email.trim().toLowerCase();
    const cleanPassword = params.newPassword.trim();
    const cleanFullName = (params.fullName || '').trim();
    const deviceId = params.deviceIdOverride || getOrCreateDeviceId();
    const deviceLabel = getDeviceLabel();

    if (!cleanEmail || cleanPassword.length < 4) {
        return {
            ok: false,
            status: 'INVALID_CREDENTIALS',
            message: 'Ingresa una clave válida de al menos 4 caracteres para activar tu acceso.',
        };
    }

    if (isSupabaseConfigured) {
        const result = await postJson<AccessVerificationResult>('/api/verify-access', {
            action: 'activate',
            email: cleanEmail,
            newPassword: cleanPassword,
            fullName: cleanFullName,
            deviceId,
            deviceLabel,
        });

        if (result.ok && result.student) {
            const mergedStudent: VerifiedStudentSession = {
                ...result.student,
                classroomPassword: result.student.classroomPassword || cleanPassword,
                primaryIp: result.student.primaryIp || '',
                completedClassIds: Array.isArray(result.student.completedClassIds)
                    ? result.student.completedClassIds
                    : [],
                verifiedAt: new Date().toISOString(),
            };
            saveStudentSessionLocally(mergedStudent);
            return { ...result, student: mergedStudent };
        }

        return result;
    }

    const db = readLocalDb();
    const student = db.students.find((s) => s.email.toLowerCase() === cleanEmail);
    if (!student) {
        return {
            ok: false,
            status: 'INVALID_CREDENTIALS',
            message: 'No encontramos ese correo en la lista de alumnas inscritas.',
        };
    }

    if (!student.isActive) {
        return {
            ok: false,
            status: 'INACTIVE',
            message: 'Tu pase se encuentra suspendido temporalmente. Contacta al equipo de soporte.',
        };
    }

    const canActivate =
        Boolean(student.needsPasswordSetup) ||
        (!student.classroomPassword?.trim() && !student.purchaseCode?.trim());

    if (!canActivate) {
        return {
            ok: false,
            status: 'INVALID_CREDENTIALS',
            message: 'Este correo ya tiene una clave configurada. Ingresa tu clave actual para acceder.',
        };
    }

    student.classroomPassword = cleanPassword;
    if (!student.purchaseCode) {
        student.purchaseCode = cleanPassword.toUpperCase();
    }
    if (!student.fullName && cleanFullName) {
        student.fullName = cleanFullName;
    }
    student.needsPasswordSetup = false;
    writeLocalDb(db);

    return verifyStudentAccess({
        email: cleanEmail,
        purchaseCode: cleanPassword,
        classroomPasswordDraft: cleanPassword,
        deviceIdOverride: params.deviceIdOverride,
        countryOverride: params.countryOverride,
        ipOverride: params.ipOverride,
    });
}

export async function verifyStudentAccess(params: {
    email: string;
    purchaseCode: string;
    classroomPasswordDraft?: string;
    deviceIdOverride?: string;
    countryOverride?: string;
    ipOverride?: string;
    skipLog?: boolean;
}): Promise<AccessVerificationResult> {
    const deviceId = params.deviceIdOverride || getOrCreateDeviceId();
    const deviceLabel = getDeviceLabel();
    const cleanEmail = params.email.trim().toLowerCase();
    const rawCredential = params.purchaseCode.trim();
    const upperCredential = rawCredential.toUpperCase();

    if (isSupabaseConfigured) {
        const result = await postJson<AccessVerificationResult & { notConfigured?: boolean }>(
            '/api/verify-access',
            {
                action: 'verify',
                email: cleanEmail,
                purchaseCode: rawCredential,
                deviceId,
                deviceLabel,
                skipLog: params.skipLog === true,
            }
        );

        if (result.ok && result.student) {
            const existingLocal = getSavedStudentSession();
            const mergedPassword =
                params.classroomPasswordDraft?.trim() ||
                result.student.classroomPassword ||
                (existingLocal?.email === result.student.email ? existingLocal.classroomPassword : '') ||
                rawCredential;

            const mergedStudent: VerifiedStudentSession = {
                ...result.student,
                classroomPassword: mergedPassword,
                primaryIp: result.student.primaryIp || '',
                completedClassIds: Array.isArray(result.student.completedClassIds)
                    ? result.student.completedClassIds
                    : [],
                verifiedAt: new Date().toISOString(),
            };

            saveStudentSessionLocally(mergedStudent);

            if (params.classroomPasswordDraft?.trim() && !result.student.classroomPassword) {
                await saveStudentClassroomCredentials({
                    email: cleanEmail,
                    purchaseCode: rawCredential,
                    classroomPassword: params.classroomPasswordDraft.trim(),
                });
            }

            return { ...result, student: mergedStudent };
        }

        return result;
    }

    // Respaldo local funcional cuando Supabase aún no está conectado
    const db = readLocalDb();
    const student = db.students.find((s) => {
        if (s.email.toLowerCase() !== cleanEmail) return false;
        const matchesCode = Boolean(s.purchaseCode) && s.purchaseCode.toUpperCase() === upperCredential;
        const matchesPass = Boolean(s.classroomPassword) && s.classroomPassword.trim() === rawCredential;
        return matchesCode || matchesPass;
    });

    if (!student) {
        return {
            ok: false,
            status: 'INVALID_CREDENTIALS',
            message:
                'No encontramos ese correo o clave en la lista de alumnas registradas. Verifica tus datos o pide a coordinación que registre tu inscripción en el Panel de Administración.',
        };
    }

    if (!student.isActive) {
        return {
            ok: false,
            status: 'INACTIVE',
            message: 'Tu pase se encuentra suspendido temporalmente. Contacta al equipo de soporte.',
        };
    }

    const detectedIp = (params.ipOverride || (await detectClientIp()) || '127.0.0.1')
        .trim()
        .replace(/^::ffff:/, '')
        .replace(/^::1$/, '127.0.0.1');

    if (!student.primaryIp && detectedIp) {
        student.primaryIp = detectedIp;
    }

    const simulatedCountry = (params.countryOverride || student.primaryCountry || '').toUpperCase();
    if (!student.primaryCountry && simulatedCountry) {
        student.primaryCountry = simulatedCountry;
    }

    // 1. Bloqueo estricto si la IP detectada es diferente a la IP autorizada de la alumna
    if (student.primaryIp && detectedIp && student.primaryIp !== detectedIp) {
        const existingDev = student.devices.find((d) => d.deviceId === deviceId);
        if (existingDev) {
            existingDev.isAuthorized = false;
            existingDev.ipAddress = detectedIp;
            existingDev.countryCode = simulatedCountry;
            existingDev.lastSeenAt = new Date().toISOString();
        } else {
            student.devices.push({
                deviceId,
                deviceLabel,
                ipAddress: detectedIp,
                countryCode: simulatedCountry,
                isAuthorized: false,
                lastSeenAt: new Date().toISOString(),
            });
        }

        const totalDevices = student.devices.length;
        student.totalDevicesCount = totalDevices;

        const ipsSeen = Array.from(
            new Set([student.primaryIp, ...student.devices.map((d) => d.ipAddress).filter(Boolean)])
        );
        const countriesSeen = Array.from(
            new Set(
                [student.primaryCountry || '', ...student.devices.map((d) => d.countryCode)].filter(
                    Boolean
                )
            )
        );

        db.alerts.unshift({
            id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            studentId: student.id,
            email: student.email,
            fullName: student.fullName,
            detectedDevicesCount: totalDevices,
            countriesSeen,
            ipsSeen,
            attemptedDeviceLabel: deviceLabel,
            attemptedIp: detectedIp,
            attemptedCountry: simulatedCountry,
            reason: 'IP_MISMATCH',
            resolved: false,
            createdAt: new Date().toISOString(),
        });
        writeLocalDb(db);

        return {
            ok: false,
            status: 'BLOCKED_GEO',
            reason: 'IP_MISMATCH',
            detectedDevicesCount: totalDevices,
            maxDevices: student.maxDevices,
            primaryCountry: student.primaryCountry || '',
            attemptedCountry: simulatedCountry,
            countriesSeen,
            primaryIp: student.primaryIp,
            attemptedIp: detectedIp,
            ipsSeen,
            message: `Alerta de seguridad: este acceso solo está permitido hasta en ${student.maxDevices} dispositivos conectados desde la misma IP (${student.primaryIp}). Se bloqueó el intento desde otra IP (${detectedIp}).`,
        };
    }

    // 2. Bloqueo geográfico de respaldo si cambian países explícitos
    if (student.primaryCountry && simulatedCountry && student.primaryCountry !== simulatedCountry) {
        const existingDev = student.devices.find((d) => d.deviceId === deviceId);
        if (existingDev) {
            existingDev.isAuthorized = false;
            existingDev.countryCode = simulatedCountry;
            existingDev.lastSeenAt = new Date().toISOString();
        } else {
            student.devices.push({
                deviceId,
                deviceLabel,
                ipAddress: detectedIp,
                countryCode: simulatedCountry,
                isAuthorized: false,
                lastSeenAt: new Date().toISOString(),
            });
        }

        const countriesSeen = Array.from(
            new Set([student.primaryCountry, ...student.devices.map((d) => d.countryCode).filter(Boolean)])
        );
        const ipsSeen = Array.from(
            new Set([student.primaryIp || '', ...student.devices.map((d) => d.ipAddress)].filter(Boolean))
        );
        const totalDevices = student.devices.length;
        student.totalDevicesCount = totalDevices;

        db.alerts.unshift({
            id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            studentId: student.id,
            email: student.email,
            fullName: student.fullName,
            detectedDevicesCount: totalDevices,
            countriesSeen,
            ipsSeen,
            attemptedDeviceLabel: deviceLabel,
            attemptedIp: detectedIp,
            attemptedCountry: simulatedCountry,
            reason: 'COUNTRY_MISMATCH',
            resolved: false,
            createdAt: new Date().toISOString(),
        });
        writeLocalDb(db);

        return {
            ok: false,
            status: 'BLOCKED_GEO',
            reason: 'COUNTRY_MISMATCH',
            detectedDevicesCount: totalDevices,
            maxDevices: student.maxDevices,
            primaryCountry: student.primaryCountry,
            attemptedCountry: simulatedCountry,
            countriesSeen,
            primaryIp: student.primaryIp || detectedIp,
            attemptedIp: detectedIp,
            ipsSeen,
            message: `Alerta de seguridad: esta alumna ha ingresado en ${totalDevices} dispositivos y se detectó un intento desde un país distinto (${student.primaryCountry} vs ${simulatedCountry}).`,
        };
    }

    const existingAuthorized = student.devices.find((d) => d.deviceId === deviceId && d.isAuthorized);
    const authorizedCount = student.devices.filter((d) => d.isAuthorized).length;

    if (existingAuthorized || authorizedCount < student.maxDevices) {
        if (existingAuthorized) {
            existingAuthorized.ipAddress = detectedIp;
            existingAuthorized.lastSeenAt = new Date().toISOString();
        } else {
            student.devices.push({
                deviceId,
                deviceLabel,
                ipAddress: detectedIp,
                countryCode: simulatedCountry,
                isAuthorized: true,
                lastSeenAt: new Date().toISOString(),
            });
        }

        if (params.classroomPasswordDraft?.trim()) {
            student.classroomPassword = params.classroomPasswordDraft.trim();
        } else if (!student.classroomPassword) {
            student.classroomPassword = rawCredential;
        }

        student.authorizedDevicesCount = student.devices.filter((d) => d.isAuthorized).length;
        student.totalDevicesCount = student.devices.length;
        if (!params.skipLog) {
            db.activityLogs.unshift({
                id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                eventType: 'student_login',
                actorEmail: student.email,
                actorName: student.fullName || undefined,
                countryCode: (student.primaryCountry || simulatedCountry || '').toUpperCase() || undefined,
                createdAt: new Date().toISOString(),
            });
            if (db.activityLogs.length > 500) {
                db.activityLogs = db.activityLogs.slice(0, 500);
            }
        }
        writeLocalDb(db);

        const session: VerifiedStudentSession = {
            studentId: student.id,
            email: student.email,
            fullName: student.fullName,
            purchaseCode: student.purchaseCode,
            classroomPassword: student.classroomPassword || rawCredential,
            classroomUrl: student.classroomUrl,
            primaryCountry: student.primaryCountry || simulatedCountry,
            primaryIp: student.primaryIp || detectedIp,
            activeDevicesCount: student.authorizedDevicesCount,
            maxDevices: student.maxDevices,
            completedClassIds: [...(student.completedClassIds || [])],
            verifiedAt: new Date().toISOString(),
        };
        saveStudentSessionLocally(session);

        return {
            ok: true,
            status: 'VERIFIED',
            message: 'Dispositivo autorizado en tu IP. Tus datos quedan guardados para copiar y entrar a ClassOnLive.',
            student: session,
        };
    }

    // 3. Excedió el límite de 2 dispositivos: bloquear y registrar alerta para el admin
    const alreadyRecorded = student.devices.find((d) => d.deviceId === deviceId);
    if (alreadyRecorded) {
        alreadyRecorded.ipAddress = detectedIp;
        alreadyRecorded.isAuthorized = false;
        alreadyRecorded.lastSeenAt = new Date().toISOString();
    } else {
        student.devices.push({
            deviceId,
            deviceLabel,
            ipAddress: detectedIp,
            countryCode: simulatedCountry,
            isAuthorized: false,
            lastSeenAt: new Date().toISOString(),
        });
    }

    const totalDevices = student.devices.length;
    student.totalDevicesCount = totalDevices;
    const countriesSeen = Array.from(
        new Set(student.devices.map((d) => d.countryCode).filter(Boolean))
    );
    const ipsSeen = Array.from(
        new Set([student.primaryIp || '', ...student.devices.map((d) => d.ipAddress)].filter(Boolean))
    );

    db.alerts.unshift({
        id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        studentId: student.id,
        email: student.email,
        fullName: student.fullName,
        detectedDevicesCount: totalDevices,
        countriesSeen,
        ipsSeen,
        attemptedDeviceLabel: deviceLabel,
        attemptedIp: detectedIp,
        attemptedCountry: simulatedCountry,
        reason: 'MAX_DEVICES',
        resolved: false,
        createdAt: new Date().toISOString(),
    });
    writeLocalDb(db);

    return {
        ok: false,
        status: 'BLOCKED_MAX_DEVICES',
        reason: 'MAX_DEVICES',
        detectedDevicesCount: totalDevices,
        maxDevices: student.maxDevices,
        primaryCountry: student.primaryCountry || simulatedCountry,
        attemptedCountry: simulatedCountry,
        countriesSeen,
        primaryIp: student.primaryIp || detectedIp,
        attemptedIp: detectedIp,
        ipsSeen,
        message: `Alerta de seguridad: se detectaron ${totalDevices} dispositivos intentando usar esta clave. El máximo permitido es ${student.maxDevices} dispositivos en la misma IP.`,
    };
}

export async function saveStudentClassroomCredentials(params: {
    email: string;
    purchaseCode: string;
    classroomPassword: string;
    deviceIdOverride?: string;
}): Promise<{ ok: boolean; message?: string }> {
    const existing = getSavedStudentSession();
    if (existing && existing.email.toLowerCase() === params.email.trim().toLowerCase()) {
        saveStudentSessionLocally({
            ...existing,
            classroomPassword: params.classroomPassword,
        });
    }

    if (isSupabaseConfigured) {
        return postJson<{ ok: boolean; message?: string }>('/api/verify-access', {
            action: 'save_credentials',
            email: params.email,
            purchaseCode: params.purchaseCode,
            deviceId: params.deviceIdOverride || getOrCreateDeviceId(),
            classroomPassword: params.classroomPassword,
        });
    }

    const db = readLocalDb();
    const student = db.students.find((s) => s.email.toLowerCase() === params.email.trim().toLowerCase());
    if (student) {
        student.classroomPassword = params.classroomPassword;
        writeLocalDb(db);
    }
    return { ok: true };
}

export async function saveStudentProgress(params: {
    email: string;
    purchaseCode: string;
    completedClassIds: string[];
    deviceIdOverride?: string;
}): Promise<{ ok: boolean; completedClassIds?: string[]; message?: string }> {
    const cleanCompleted = Array.from(new Set(params.completedClassIds.filter(Boolean)));
    const existing = getSavedStudentSession();
    if (existing && existing.email.toLowerCase() === params.email.trim().toLowerCase()) {
        saveStudentSessionLocally({
            ...existing,
            completedClassIds: cleanCompleted,
        });
    }

    if (isSupabaseConfigured) {
        return postJson<{ ok: boolean; completedClassIds?: string[]; message?: string }>('/api/verify-access', {
            action: 'save_progress',
            email: params.email,
            purchaseCode: params.purchaseCode,
            deviceId: params.deviceIdOverride || getOrCreateDeviceId(),
            completedClassIds: cleanCompleted,
        });
    }

    const db = readLocalDb();
    const student = db.students.find((s) => s.email.toLowerCase() === params.email.trim().toLowerCase());
    if (student) {
        student.completedClassIds = cleanCompleted;
        writeLocalDb(db);
    }
    return { ok: true, completedClassIds: cleanCompleted };
}

export async function verifyAdminAccess(params: {
    adminEmail: string;
    accessKey: string;
    displayName?: string;
}): Promise<{
    ok: boolean;
    adminId?: string;
    displayName?: string;
    email?: string;
    role?: AdminRole;
    requiresPasswordChange?: boolean;
    pendingApproval?: boolean;
    message?: string;
}> {
    const cleanEmail = params.adminEmail.trim().toLowerCase();
    const cleanKey = params.accessKey.trim();

    if (!cleanEmail || !cleanKey) {
        return { ok: false, message: 'Ingresa tu correo y clave de administrador.' };
    }

    if (isSupabaseConfigured) {
        return postJson('/api/admin', {
            action: 'verify',
            adminEmail: cleanEmail,
            accessKey: cleanKey,
        });
    }

    const db = readLocalDb();
    const matched = findValidLocalAdmin(db, cleanEmail, cleanKey, {
        allowPendingPasswordChange: true,
        allowPendingApproval: true,
    });
    if (matched) {
        if (matched.approvalStatus === 'pending') {
            return {
                ok: false,
                pendingApproval: true,
                message: 'Tu solicitud de colaboradora aún está pendiente de aprobación por un organizador de la feria.',
            };
        }
        if (!matched.mustChangePassword) {
            db.admin = {
                email: matched.adminEmail,
                accessKey: matched.accessKey,
                displayName: matched.displayName,
            };
            writeLocalDb(db);
        }
        return {
            ok: true,
            adminId: matched.id,
            email: matched.adminEmail,
            displayName: matched.displayName,
            role: matched.role,
            requiresPasswordChange: matched.mustChangePassword,
        };
    }

    return {
        ok: false,
        message:
            'Correo o clave de acceso incorrectos. Si eres organizador/a con clave temporal (1234) o colaboradora aprobada, verifica tus datos.',
    };
}

export async function changeAdminPassword(params: {
    adminEmail: string;
    currentKey: string;
    newKey: string;
}): Promise<{
    ok: boolean;
    adminId?: string;
    displayName?: string;
    email?: string;
    role?: AdminRole;
    message?: string;
}> {
    const cleanEmail = params.adminEmail.trim().toLowerCase();
    const cleanCurrent = params.currentKey.trim();
    const cleanNew = params.newKey.trim();

    if (cleanNew.length < 4) {
        return { ok: false, message: 'La nueva contraseña debe tener al menos 4 caracteres.' };
    }
    if (cleanNew === cleanCurrent || cleanNew === '1234') {
        return {
            ok: false,
            message: 'Elige una contraseña personal distinta a la clave temporal (1234).',
        };
    }

    if (isSupabaseConfigured) {
        return postJson('/api/admin', {
            action: 'change_password',
            adminEmail: cleanEmail,
            accessKey: cleanCurrent,
            newKey: cleanNew,
        });
    }

    const db = readLocalDb();
    const matched = findValidLocalAdmin(db, cleanEmail, cleanCurrent, {
        allowPendingPasswordChange: true,
    });
    if (!matched) {
        return { ok: false, message: 'La clave temporal o contraseña actual es incorrecta.' };
    }

    matched.accessKey = cleanNew;
    matched.mustChangePassword = false;
    db.admin = {
        email: matched.adminEmail,
        accessKey: matched.accessKey,
        displayName: matched.displayName,
    };
    writeLocalDb(db);

    return {
        ok: true,
        adminId: matched.id,
        email: matched.adminEmail,
        displayName: matched.displayName,
        role: matched.role,
        message: 'Contraseña actualizada correctamente.',
    };
}

export async function registerAdminAccount(params: {
    adminEmail: string;
    accessKey: string;
    displayName: string;
    requesterEmail?: string;
    requesterKey?: string;
    role?: AdminRole;
    mustChangePassword?: boolean;
}): Promise<{
    ok: boolean;
    adminId?: string;
    displayName?: string;
    email?: string;
    role?: AdminRole;
    mustChangePassword?: boolean;
    message?: string;
}> {
    const cleanEmail = params.adminEmail.trim().toLowerCase();
    const cleanKey = params.accessKey.trim();
    const cleanName = params.displayName.trim() || 'Administrador';
    const targetRole: AdminRole =
        params.role === 'teacher' ? 'teacher' : params.role === 'support' ? 'support' : 'owner';
    const mustChange = Boolean(params.mustChangePassword);

    if (!cleanEmail || !cleanEmail.includes('@') || cleanKey.length < 4) {
        return {
            ok: false,
            message: 'Ingresa un correo válido y una clave de al menos 4 caracteres.',
        };
    }

    if (isSupabaseConfigured) {
        return postJson('/api/admin', {
            action: 'register_admin',
            adminEmail: cleanEmail,
            accessKey: cleanKey,
            displayName: cleanName,
            requesterEmail: params.requesterEmail?.trim().toLowerCase() || '',
            requesterKey: params.requesterKey?.trim() || '',
            role: targetRole,
            mustChangePassword: mustChange,
        });
    }

    const db = readLocalDb();
    const hasOwners = db.admins.some(
        (a) => a.isActive && a.approvalStatus === 'approved' && a.role === 'owner'
    );
    if (hasOwners) {
        const isAuthorizerOwner = findValidLocalAdmin(
            db,
            params.requesterEmail || '',
            params.requesterKey || '',
            { requireOwner: true }
        );
        if (!isAuthorizerOwner) {
            return {
                ok: false,
                message:
                    'Solo un organizador de la feria activo puede registrar nuevos administradores o profesores. Si ingresas con clave temporal (1234), usa "Iniciar sesión".',
            };
        }
    }

    const existingIdx = db.admins.findIndex((a) => a.adminEmail.toLowerCase() === cleanEmail);
    const entry: LocalAdminEntry = {
        id: existingIdx >= 0 ? db.admins[existingIdx].id : `adm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        adminEmail: cleanEmail,
        accessKey: cleanKey,
        displayName: cleanName,
        role: hasOwners ? targetRole : 'owner',
        approvalStatus: 'approved',
        mustChangePassword: mustChange,
        isActive: true,
        createdAt: existingIdx >= 0 ? db.admins[existingIdx].createdAt : new Date().toISOString(),
    };

    if (existingIdx >= 0) {
        db.admins[existingIdx] = entry;
    } else {
        db.admins.push(entry);
    }

    writeLocalDb(db);

    return {
        ok: true,
        adminId: entry.id,
        email: entry.adminEmail,
        displayName: entry.displayName,
        role: entry.role,
        mustChangePassword: entry.mustChangePassword,
        message: 'Cuenta registrada correctamente.',
    };
}

export async function requestCollaboratorAccess(params: {
    email: string;
    accessKey: string;
    displayName: string;
}): Promise<{ ok: boolean; pending?: boolean; message?: string }> {
    const cleanEmail = params.email.trim().toLowerCase();
    const cleanKey = params.accessKey.trim();
    const cleanName = params.displayName.trim();

    if (!cleanName || !cleanEmail || !cleanEmail.includes('@') || cleanKey.length < 4) {
        return {
            ok: false,
            message: 'Ingresa tu nombre visible, un correo válido y una clave de al menos 4 caracteres.',
        };
    }

    if (isSupabaseConfigured) {
        return postJson('/api/admin', {
            action: 'request_collaborator',
            adminEmail: cleanEmail,
            accessKey: cleanKey,
            displayName: cleanName,
        });
    }

    const db = readLocalDb();
    const existingIdx = db.admins.findIndex((a) => a.adminEmail.toLowerCase() === cleanEmail);
    if (existingIdx >= 0) {
        const existing = db.admins[existingIdx];
        if (existing.isActive && existing.approvalStatus === 'approved') {
            return {
                ok: false,
                message: 'Este correo ya tiene acceso aprobado en la app. Usa la pestaña "Iniciar sesión".',
            };
        }
        db.admins[existingIdx] = {
            ...existing,
            displayName: cleanName,
            accessKey: cleanKey,
            role: 'teacher',
            approvalStatus: 'pending',
            mustChangePassword: false,
            isActive: true,
        };
        writeLocalDb(db);
        return {
            ok: true,
            pending: true,
            message: 'Actualizamos tu solicitud de colaboradora. Queda pendiente de aprobación por un organizador de la feria.',
        };
    }

    db.admins.push({
        id: `adm_collab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        adminEmail: cleanEmail,
        accessKey: cleanKey,
        displayName: cleanName,
        role: 'teacher',
        approvalStatus: 'pending',
        mustChangePassword: false,
        isActive: true,
        createdAt: new Date().toISOString(),
    });
    writeLocalDb(db);

    return {
        ok: true,
        pending: true,
        message: '¡Solicitud enviada! Un organizador de la feria aprobará tu perfil para que puedas responder dudas en el foro.',
    };
}

export async function reviewCollaboratorRequest(params: {
    adminEmail: string;
    accessKey: string;
    targetAdminId: string;
    approve: boolean;
}): Promise<{ ok: boolean; approved?: boolean; message?: string }> {
    if (isSupabaseConfigured) {
        return postJson('/api/admin', {
            action: 'review_collaborator',
            adminEmail: params.adminEmail,
            accessKey: params.accessKey,
            targetAdminId: params.targetAdminId,
            approve: params.approve,
        });
    }

    const db = readLocalDb();
    if (!findValidLocalAdmin(db, params.adminEmail, params.accessKey, { requireOwner: true })) {
        return {
            ok: false,
            message: 'Solo los organizadores de la feria pueden aprobar o rechazar colaboradoras.',
        };
    }

    if (params.approve) {
        const target = db.admins.find((a) => a.id === params.targetAdminId);
        if (target) {
            target.approvalStatus = 'approved';
            target.isActive = true;
        }
        writeLocalDb(db);
        return { ok: true, approved: true };
    }

    db.admins = db.admins.filter(
        (a) => !(a.id === params.targetAdminId && a.approvalStatus === 'pending')
    );
    writeLocalDb(db);
    return { ok: true, approved: false };
}

export async function deleteAdminAccount(params: {
    adminEmail: string;
    accessKey: string;
    targetAdminId: string;
}): Promise<{ ok: boolean; selfDeleted?: boolean; message?: string }> {
    if (isSupabaseConfigured) {
        return postJson('/api/admin', {
            action: 'delete_admin',
            ...params,
        });
    }

    const db = readLocalDb();
    if (!findValidLocalAdmin(db, params.adminEmail, params.accessKey, { requireOwner: true })) {
        return { ok: false, message: 'Solo los organizadores de la feria pueden eliminar cuentas administrativas.' };
    }

    const target = db.admins.find((a) => a.id === params.targetAdminId);
    if (!target) {
        return { ok: false, message: 'No encontramos la cuenta indicada.' };
    }

    const isSelf = target.adminEmail.toLowerCase() === params.adminEmail.trim().toLowerCase();
    if (target.role === 'owner' && target.approvalStatus === 'approved') {
        const remainingOwners = db.admins.filter(
            (a) =>
                a.id !== params.targetAdminId &&
                a.isActive &&
                a.approvalStatus === 'approved' &&
                a.role === 'owner'
        ).length;

        if (remainingOwners < 1) {
            return {
                ok: false,
                message: 'Debe quedar al menos un organizador activo en la plataforma antes de eliminar este perfil.',
            };
        }
    }

    db.admins = db.admins.filter((a) => a.id !== params.targetAdminId);
    if (db.admin?.email?.toLowerCase() === target.adminEmail.toLowerCase()) {
        db.admin = null;
    }
    writeLocalDb(db);
    return { ok: true, selfDeleted: isSelf };
}

export async function fetchPublicRecordingStatuses(): Promise<RecordingStatusMap> {
    if (isSupabaseConfigured && supabase) {
        try {
            const { data, error } = await supabase
                .from('workshop_recordings')
                .select('workshop_id, is_recording_ready');

            if (!error && Array.isArray(data)) {
                const map: RecordingStatusMap = {};
                data.forEach((row: { workshop_id?: string; is_recording_ready?: boolean }) => {
                    if (row.workshop_id) {
                        map[row.workshop_id] = Boolean(row.is_recording_ready);
                    }
                });
                return map;
            }
        } catch {
            // Fallback to local state if table is not created yet or offline
        }
    }
    return readLocalDb().recordings;
}

export async function toggleWorkshopRecording(params: {
    adminEmail: string;
    accessKey: string;
    workshopId: string;
    isReady: boolean;
}): Promise<{ ok: boolean; workshopId?: string; isRecordingReady?: boolean; message?: string }> {
    const cleanId = params.workshopId.trim();
    if (!cleanId) {
        return { ok: false, message: 'Taller no válido.' };
    }

    if (isSupabaseConfigured) {
        return postJson('/api/admin', {
            action: 'toggle_recording',
            adminEmail: params.adminEmail,
            accessKey: params.accessKey,
            workshopId: cleanId,
            isReady: Boolean(params.isReady),
        });
    }

    const db = readLocalDb();
    if (!findValidLocalAdmin(db, params.adminEmail, params.accessKey, { requireSupportOrOwner: true })) {
        return { ok: false, message: 'Solo organizadores o soporte pueden actualizar el estado de grabaciones.' };
    }

    db.recordings[cleanId] = Boolean(params.isReady);
    writeLocalDb(db);
    return { ok: true, workshopId: cleanId, isRecordingReady: Boolean(params.isReady) };
}

export async function updateAdminRole(params: {
    adminEmail: string;
    accessKey: string;
    targetAdminId: string;
    newRole: AdminRole;
}): Promise<{ ok: boolean; role?: AdminRole; message?: string }> {
    const targetRole: AdminRole =
        params.newRole === 'teacher' ? 'teacher' : params.newRole === 'support' ? 'support' : 'owner';

    if (isSupabaseConfigured) {
        return postJson('/api/admin', {
            action: 'update_admin_role',
            adminEmail: params.adminEmail,
            accessKey: params.accessKey,
            targetAdminId: params.targetAdminId,
            newRole: targetRole,
        });
    }

    const db = readLocalDb();
    if (!findValidLocalAdmin(db, params.adminEmail, params.accessKey, { requireOwner: true })) {
        return { ok: false, message: 'Solo los organizadores de la feria pueden cambiar roles administrativos.' };
    }

    const target = db.admins.find((a) => a.id === params.targetAdminId);
    if (!target) {
        return { ok: false, message: 'No encontramos la cuenta indicada.' };
    }

    if (target.role === 'owner' && targetRole !== 'owner' && target.approvalStatus === 'approved') {
        const remainingOwners = db.admins.filter(
            (a) =>
                a.id !== params.targetAdminId &&
                a.isActive &&
                a.approvalStatus === 'approved' &&
                a.role === 'owner'
        ).length;

        if (remainingOwners < 1) {
            return {
                ok: false,
                message: 'Debe quedar al menos un organizador activo en la plataforma antes de cambiar este rol.',
            };
        }
    }

    target.role = targetRole;
    writeLocalDb(db);
    return { ok: true, role: targetRole };
}

export async function fetchAdminDashboard(params: {
    adminEmail: string;
    accessKey: string;
}): Promise<{
    ok: boolean;
    adminId?: string;
    role?: AdminRole;
    students?: AdminStudentRecord[];
    alerts?: DeviceAccessAlert[];
    admins?: AdminUserSummary[];
    recordings?: RecordingStatusMap;
    activityLogs?: ActivityLogEntry[];
    message?: string;
}> {
    if (isSupabaseConfigured) {
        return postJson('/api/admin', {
            action: 'dashboard',
            adminEmail: params.adminEmail,
            accessKey: params.accessKey,
        });
    }

    const db = readLocalDb();
    const matched = findValidLocalAdmin(db, params.adminEmail, params.accessKey);
    if (!matched) {
        return { ok: false, message: 'Acceso no autorizado o pendiente cambio de clave temporal.' };
    }

    if (matched.role === 'teacher') {
        return {
            ok: true,
            adminId: matched.id,
            role: 'teacher',
            students: [],
            alerts: [],
            admins: [],
            recordings: {},
            activityLogs: [],
        };
    }

    if (matched.role === 'support') {
        return {
            ok: true,
            adminId: matched.id,
            role: 'support',
            students: db.students,
            alerts: db.alerts,
            admins: [],
            recordings: db.recordings,
            activityLogs: [],
        };
    }

    const adminsSummary: AdminUserSummary[] = db.admins.map((a) => ({
        id: a.id,
        adminEmail: a.adminEmail,
        displayName: a.displayName,
        role: a.role,
        approvalStatus: a.approvalStatus,
        mustChangePassword: a.mustChangePassword,
        isActive: a.isActive,
        createdAt: a.createdAt,
    }));

    return {
        ok: true,
        adminId: matched.id,
        role: 'owner',
        students: db.students,
        alerts: db.alerts,
        admins: adminsSummary,
        recordings: db.recordings,
        activityLogs: db.activityLogs,
    };
}

export async function upsertAdminStudent(params: {
    adminEmail: string;
    accessKey: string;
    email: string;
    purchaseCode: string;
    fullName: string;
    classroomPassword: string;
    classroomUrl: string;
    maxDevices: number;
    isActive: boolean;
}): Promise<{ ok: boolean; message?: string }> {
    if (isSupabaseConfigured) {
        return postJson('/api/admin', {
            action: 'upsert_student',
            ...params,
        });
    }

    const db = readLocalDb();
    if (!findValidLocalAdmin(db, params.adminEmail, params.accessKey, { requireSupportOrOwner: true })) {
        return { ok: false, message: 'Solo organizadores o soporte pueden registrar o modificar alumnas.' };
    }

    const cleanEmail = params.email.trim().toLowerCase();
    const rawPass = params.classroomPassword.trim();
    const rawCode = params.purchaseCode.trim();
    const effectiveCode = (rawCode || rawPass).toUpperCase();
    const effectivePass = rawPass || rawCode;
    const needsPasswordSetup = !effectiveCode && !effectivePass;

    if (!cleanEmail || !cleanEmail.includes('@')) {
        return { ok: false, message: 'El correo electrónico de la alumna es obligatorio.' };
    }

    const existing = db.students.find((s) => s.email === cleanEmail);

    if (existing) {
        if (effectiveCode) existing.purchaseCode = effectiveCode;
        if (params.fullName.trim()) existing.fullName = params.fullName.trim();
        if (effectivePass) {
            existing.classroomPassword = effectivePass;
            existing.needsPasswordSetup = false;
        }
        if (params.classroomUrl.trim()) existing.classroomUrl = params.classroomUrl.trim();
        existing.maxDevices = params.maxDevices || 2;
        existing.isActive = params.isActive;
    } else {
        db.students.unshift({
            id: `stu_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            email: cleanEmail,
            fullName: params.fullName.trim(),
            purchaseCode: effectiveCode,
            classroomPassword: effectivePass,
            classroomUrl: params.classroomUrl.trim(),
            primaryCountry: null,
            primaryIp: null,
            maxDevices: params.maxDevices || 2,
            isActive: params.isActive,
            needsPasswordSetup,
            completedClassIds: [],
            authorizedDevicesCount: 0,
            totalDevicesCount: 0,
            createdAt: new Date().toISOString(),
            devices: [],
        });
    }

    writeLocalDb(db);
    return { ok: true };
}

export interface BulkStudentPayload {
    email: string;
    purchaseCode: string;
    fullName: string;
    classroomPassword: string;
    classroomUrl: string;
    maxDevices: number;
    isActive: boolean;
    needsPasswordSetup?: boolean;
}

export async function bulkUpsertAdminStudents(params: {
    adminEmail: string;
    accessKey: string;
    students: BulkStudentPayload[];
}): Promise<{ ok: boolean; importedCount?: number; message?: string }> {
    if (params.students.length === 0) {
        return { ok: false, message: 'No hay registros válidos para importar.' };
    }

    if (isSupabaseConfigured) {
        return postJson('/api/admin', {
            action: 'bulk_upsert_students',
            adminEmail: params.adminEmail,
            accessKey: params.accessKey,
            students: params.students,
        });
    }

    const db = readLocalDb();
    if (!findValidLocalAdmin(db, params.adminEmail, params.accessKey, { requireSupportOrOwner: true })) {
        return { ok: false, message: 'Solo organizadores o soporte pueden subir listados CSV / XLSX.' };
    }

    let count = 0;
    for (const item of params.students) {
        const cleanEmail = item.email.trim().toLowerCase();
        if (!cleanEmail || !cleanEmail.includes('@')) continue;

        const rawCode = item.purchaseCode.trim();
        const rawPass = item.classroomPassword.trim();
        const effectiveCode = (rawCode || rawPass).toUpperCase();
        const effectivePass = rawPass || rawCode;
        const needsPasswordSetup = !effectiveCode && !effectivePass;

        const existing = db.students.find((s) => s.email === cleanEmail);
        if (existing) {
            if (effectiveCode) existing.purchaseCode = effectiveCode;
            if (item.fullName.trim()) existing.fullName = item.fullName.trim();
            if (effectivePass) {
                existing.classroomPassword = effectivePass;
                existing.needsPasswordSetup = false;
            }
            if (item.classroomUrl.trim()) existing.classroomUrl = item.classroomUrl.trim();
            existing.maxDevices = item.maxDevices || 2;
            existing.isActive = item.isActive;
        } else {
            db.students.unshift({
                id: `stu_${Date.now()}_${count}_${Math.random().toString(36).slice(2, 6)}`,
                email: cleanEmail,
                fullName: item.fullName.trim(),
                purchaseCode: effectiveCode,
                classroomPassword: effectivePass,
                classroomUrl: item.classroomUrl.trim(),
                primaryCountry: null,
                primaryIp: null,
                maxDevices: item.maxDevices || 2,
                isActive: item.isActive,
                needsPasswordSetup,
                completedClassIds: [],
                authorizedDevicesCount: 0,
                totalDevicesCount: 0,
                createdAt: new Date().toISOString(),
                devices: [],
            });
        }
        count += 1;
    }

    writeLocalDb(db);
    return { ok: true, importedCount: count };
}

export async function resetAdminStudentDevices(params: {
    adminEmail: string;
    accessKey: string;
    studentId: string;
}): Promise<{ ok: boolean; message?: string }> {
    if (isSupabaseConfigured) {
        return postJson('/api/admin', {
            action: 'reset_devices',
            ...params,
        });
    }

    const db = readLocalDb();
    if (!findValidLocalAdmin(db, params.adminEmail, params.accessKey, { requireSupportOrOwner: true })) {
        return { ok: false, message: 'Solo organizadores o soporte pueden restablecer dispositivos.' };
    }

    const student = db.students.find((s) => s.id === params.studentId);
    if (student) {
        student.devices = [];
        student.primaryCountry = null;
        student.primaryIp = null;
        student.authorizedDevicesCount = 0;
        student.totalDevicesCount = 0;
    }
    db.alerts.forEach((a) => {
        if (a.studentId === params.studentId) a.resolved = true;
    });
    writeLocalDb(db);
    return { ok: true };
}

export async function deleteAdminStudent(params: {
    adminEmail: string;
    accessKey: string;
    studentId: string;
}): Promise<{ ok: boolean; message?: string }> {
    if (isSupabaseConfigured) {
        return postJson('/api/admin', {
            action: 'delete_student',
            ...params,
        });
    }

    const db = readLocalDb();
    if (!findValidLocalAdmin(db, params.adminEmail, params.accessKey, { requireOwner: true })) {
        return { ok: false, message: 'Solo los organizadores de la feria pueden eliminar alumnas.' };
    }

    db.students = db.students.filter((s) => s.id !== params.studentId);
    db.alerts = db.alerts.filter((a) => a.studentId !== params.studentId);
    writeLocalDb(db);
    return { ok: true };
}
