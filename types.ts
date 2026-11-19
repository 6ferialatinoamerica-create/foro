export interface PonenteDatos {
    usuario?: string;
    instagram?: string;
    website?: string;
    websiteLabel?: string;
    pais?: string;
}

export interface Ponente {
    nombre: string;
    foto: string;
    datos: PonenteDatos;
}

export interface BotonAcceso {
    habilitado: boolean;
    texto: string;
    animacion: string;
}

export interface Clase {
    id: string;
    titulo: string;
    shortTitle?: string;
    descripcion: string;
    bono?: string;
    date: string;
    time: string;
    horarioConfirmado: boolean;
    startTime?: Date;
    endTime?: Date;
    ponentes: Ponente[];
    botonAcceso: BotonAcceso;
    whatsappMessage?: string;
}

export interface DiaEvento {
    diaSemana: string;
    numero: string;
    fechaCompleta: string;
    estadoHorario: string;
}

export type StudentAccessStatus =
    | 'UNVERIFIED'
    | 'VERIFIED'
    | 'INVALID_CREDENTIALS'
    | 'INACTIVE'
    | 'BLOCKED_MAX_DEVICES'
    | 'BLOCKED_GEO';

export interface StudentEmailCheckResult {
    ok: boolean;
    status: 'NOT_FOUND' | 'INACTIVE' | 'NEEDS_ACTIVATION' | 'NEEDS_PASSWORD';
    email?: string;
    fullName?: string;
    message?: string;
}

export interface VerifiedStudentSession {
    studentId: string;
    email: string;
    fullName: string;
    purchaseCode: string;
    classroomPassword: string;
    classroomUrl: string;
    primaryCountry: string;
    primaryIp: string;
    activeDevicesCount: number;
    maxDevices: number;
    completedClassIds: string[];
    needsPasswordSetup?: boolean;
    verifiedAt: string;
}

export interface ActiveDeviceSummary {
    deviceLabel: string;
    lastSeenAt: string;
}

export interface AccessVerificationResult {
    ok: boolean;
    status: StudentAccessStatus;
    message: string;
    reason?: 'MAX_DEVICES' | 'IP_MISMATCH' | 'COUNTRY_MISMATCH';
    student?: VerifiedStudentSession;
    detectedDevicesCount?: number;
    maxDevices?: number;
    canSelfReplace?: boolean;
    remainingReplacements?: number;
    activeDevices?: ActiveDeviceSummary[];
    primaryCountry?: string;
    attemptedCountry?: string;
    countriesSeen?: string[];
    primaryIp?: string;
    attemptedIp?: string;
    ipsSeen?: string[];
}

export interface AdminStudentRecord {
    id: string;
    email: string;
    fullName: string;
    purchaseCode: string;
    classroomPassword: string;
    classroomUrl: string;
    primaryCountry: string | null;
    primaryIp: string | null;
    maxDevices: number;
    isActive: boolean;
    needsPasswordSetup?: boolean;
    completedClassIds: string[];
    authorizedDevicesCount: number;
    totalDevicesCount: number;
    createdAt: string;
}

export interface DeviceAccessAlert {
    id: string;
    studentId: string;
    email: string;
    fullName: string;
    detectedDevicesCount: number;
    countriesSeen: string[];
    ipsSeen?: string[];
    attemptedDeviceLabel: string;
    attemptedIp: string;
    attemptedCountry: string;
    reason: 'MAX_DEVICES' | 'IP_MISMATCH' | 'COUNTRY_MISMATCH';
    resolved: boolean;
    createdAt: string;
}

export type AdminRole = 'owner' | 'support' | 'teacher';
export type AdminApprovalStatus = 'approved' | 'pending';
export type RecordingStatusMap = Record<string, boolean>;

export interface AdminUserSummary {
    id: string;
    adminEmail: string;
    displayName: string;
    role: AdminRole;
    approvalStatus: AdminApprovalStatus;
    mustChangePassword: boolean;
    isActive: boolean;
    createdAt: string;
}

export interface SavedAdminCredentials {
    adminId?: string;
    email: string;
    accessKey: string;
    displayName: string;
    role?: AdminRole;
    remember: boolean;
}

export type ActivityEventType =
    | 'student_login'
    | 'classroom_click'
    | 'forum_question'
    | 'forum_reply';

export interface ActivityLogEntry {
    id: string;
    eventType: ActivityEventType;
    actorEmail?: string;
    actorName?: string;
    workshopId?: string;
    countryCode?: string;
    createdAt: string;
}

export type ForumQuestionStatus = 'pending' | 'answered';

export interface ForumReply {
    id: string;
    questionId: string;
    authorName: string;
    authorRole: 'student' | 'teacher';
    authorAdminId?: string;
    authorEmail?: string;
    countryCode?: string;
    body: string;
    isOfficial: boolean;
    createdAt: string;
}

export interface ForumQuestion {
    id: string;
    workshopId: string;
    workshopTitle: string;
    authorName: string;
    countryCode?: string;
    title: string;
    body: string;
    status: ForumQuestionStatus;
    createdAt: string;
    replies: ForumReply[];
}