import React, { useState, useEffect } from 'react';
import { GLOBAL_CONFIG } from '../constants';
import {
    activateStudentAccess,
    checkStudentEmail,
    replaceStudentDevice,
    saveStudentClassroomCredentials,
    verifyStudentAccess,
} from '../services/accessService';
import type { AccessVerificationResult, VerifiedStudentSession } from '../types';
import { countryCodeToFlag, getCountryDisplayName } from '../utils/countryFlag';

interface StudentAccessModalProps {
    isOpen: boolean;
    onClose: () => void;
    studentSession: VerifiedStudentSession | null;
    blockAlert: AccessVerificationResult | null;
    blockedCredentials?: { email: string; password: string } | null;
    targetClassTitle?: string;
    onVerified: (session: VerifiedStudentSession) => void;
    onBlocked: (alertResult: AccessVerificationResult) => void;
    onClearBlock: () => void;
    onLogout: () => void;
}

const formatDeviceLastSeen = (iso: string): string => {
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return 'Uso reciente';
        return d.toLocaleDateString('es-VE', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return 'Uso reciente';
    }
};

const StudentAccessModal: React.FC<StudentAccessModalProps> = ({
    isOpen,
    onClose,
    studentSession,
    blockAlert,
    blockedCredentials,
    targetClassTitle,
    onVerified,
    onBlocked,
    onClearBlock,
    onLogout,
}) => {
    const [authStep, setAuthStep] = useState<'email' | 'activate' | 'password'>('email');
    const [email, setEmail] = useState('');
    const [checkedFullName, setCheckedFullName] = useState('');
    const [activationFullName, setActivationFullName] = useState('');
    const [accessPassword, setAccessPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showInputPassword, setShowInputPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isReplacingDevice, setIsReplacingDevice] = useState(false);
    const [swapPasswordInput, setSwapPasswordInput] = useState('');
    const [swapEmailInput, setSwapEmailInput] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [replaceError, setReplaceError] = useState<string | null>(null);

    const [showSavedPassword, setShowSavedPassword] = useState(false);
    const [isEditingPassword, setIsEditingPassword] = useState(false);
    const [editedPassword, setEditedPassword] = useState('');
    const [copiedField, setCopiedField] = useState<'email' | 'password' | null>(null);
    const [passwordSavedNotice, setPasswordSavedNotice] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setError(null);
        setReplaceError(null);
        setPasswordSavedNotice(false);
        if (studentSession) {
            setEditedPassword(studentSession.classroomPassword || '');
            setIsEditingPassword(!studentSession.classroomPassword);
        } else if (!blockAlert) {
            setAuthStep('email');
            setAccessPassword('');
            setConfirmPassword('');
            setActivationFullName('');
            setCheckedFullName('');
        }
        if (blockedCredentials) {
            setSwapEmailInput(blockedCredentials.email || '');
            setSwapPasswordInput(blockedCredentials.password || '');
        }
    }, [isOpen, studentSession, blockAlert, blockedCredentials]);

    if (!isOpen) return null;

    const handleCheckEmailSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !email.includes('@')) {
            setError('Ingresa el correo electrónico con el que te inscribiste.');
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const check = await checkStudentEmail(email);
            if (!check.ok) {
                setError(check.message || 'No encontramos ese correo en la lista de inscritas.');
                return;
            }
            setEmail(check.email || email.trim().toLowerCase());
            setCheckedFullName(check.fullName || '');
            setActivationFullName(check.fullName || '');
            setAccessPassword('');
            setConfirmPassword('');
            setAuthStep(check.status === 'NEEDS_ACTIVATION' ? 'activate' : 'password');
        } catch {
            setError('Error de conexión al comprobar tu correo. Intenta nuevamente.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleActivateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (accessPassword.trim().length < 4) {
            setError('Tu clave debe tener al menos 4 caracteres.');
            return;
        }
        if (accessPassword.trim() !== confirmPassword.trim()) {
            setError('Las dos contraseñas no coinciden.');
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const res = await activateStudentAccess({
                email,
                newPassword: accessPassword,
                fullName: activationFullName,
            });

            if (res.ok && res.student) {
                onVerified(res.student);
            } else if (res.status === 'BLOCKED_MAX_DEVICES' || res.status === 'BLOCKED_GEO') {
                onBlocked(res);
            } else {
                setError(res.message || 'No pudimos activar tu inscripción.');
            }
        } catch {
            setError('Error de conexión al activar tu pase. Intenta nuevamente.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !accessPassword.trim()) {
            setError('Ingresa tu correo electrónico de compra y tu clave de acceso.');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const res = await verifyStudentAccess({
                email,
                purchaseCode: accessPassword,
                classroomPasswordDraft: accessPassword,
            });

            if (res.ok && res.student) {
                onVerified(res.student);
            } else if (res.status === 'BLOCKED_MAX_DEVICES' || res.status === 'BLOCKED_GEO') {
                onBlocked(res);
            } else {
                setError(res.message || 'No pudimos validar tu inscripción.');
            }
        } catch {
            setError('Error de conexión al validar tu inscripción. Intenta nuevamente.');
        } finally {
            setIsLoading(false);
        }
    };

    const copyTextSafely = async (value: string): Promise<boolean> => {
        if (!value || typeof navigator === 'undefined') return false;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(value);
                return true;
            }
        } catch {
            // Fallback abajo
        }
        try {
            if (typeof document !== 'undefined') {
                const textarea = document.createElement('textarea');
                textarea.value = value;
                textarea.setAttribute('readonly', '');
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                const ok = document.execCommand('copy');
                document.body.removeChild(textarea);
                return ok;
            }
        } catch {
            return false;
        }
        return false;
    };

    const handleCopy = async (value: string, field: 'email' | 'password') => {
        if (!value) return;
        const ok = await copyTextSafely(value);
        if (ok) {
            setCopiedField(field);
            setTimeout(() => setCopiedField(null), 2000);
        }
    };

    const handleSaveEditedPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!studentSession) return;
        const cleanPass = editedPassword.trim();
        await saveStudentClassroomCredentials({
            email: studentSession.email,
            purchaseCode: studentSession.purchaseCode,
            classroomPassword: cleanPass,
        });
        onVerified({
            ...studentSession,
            classroomPassword: cleanPass,
        });
        setIsEditingPassword(false);
        setPasswordSavedNotice(true);
        setTimeout(() => setPasswordSavedNotice(false), 3000);
    };

    const classroomTargetUrl =
        studentSession?.classroomUrl?.trim() || GLOBAL_CONFIG.URL_ACCESO_PLATAFORMA;

    const handlePrepareClassroomClipboard = () => {
        const pass = studentSession?.classroomPassword?.trim();
        if (pass) {
            void copyTextSafely(pass).then((ok) => {
                if (ok) {
                    setCopiedField('password');
                    setTimeout(() => setCopiedField(null), 2500);
                }
            });
        }
    };

    const effectiveSwapEmail = (blockedCredentials?.email || email || swapEmailInput).trim().toLowerCase();
    const effectiveSwapPassword = (blockedCredentials?.password || accessPassword || swapPasswordInput).trim();
    const needsManualSwapCreds = !effectiveSwapEmail || !effectiveSwapPassword;

    const handleReplaceDevice = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!effectiveSwapEmail || !effectiveSwapPassword) {
            setReplaceError('Ingresa tu correo y tu clave de ClassOnLive para activar este equipo.');
            return;
        }
        setIsReplacingDevice(true);
        setReplaceError(null);
        try {
            const res = await replaceStudentDevice({
                email: effectiveSwapEmail,
                purchaseCode: effectiveSwapPassword,
            });
            if (res.ok && res.student) {
                onVerified(res.student);
            } else if (res.status === 'BLOCKED_MAX_DEVICES' || res.status === 'BLOCKED_GEO') {
                onBlocked(res);
                setReplaceError(res.message);
            } else {
                setReplaceError(res.message || 'No pudimos activar este equipo. Revisa tu correo y clave.');
            }
        } catch {
            setReplaceError('Error de conexión al activar este equipo. Intenta nuevamente.');
        } finally {
            setIsReplacingDevice(false);
        }
    };

    const isCountryMismatch = blockAlert?.reason === 'COUNTRY_MISMATCH';
    const isMaxDevicesBlock = !isCountryMismatch;
    const canSelfReplace = Boolean(blockAlert?.canSelfReplace) && isMaxDevicesBlock;
    const activeDevicesList = Array.isArray(blockAlert?.activeDevices) ? blockAlert.activeDevices : [];
    const remainingSwaps = typeof blockAlert?.remainingReplacements === 'number' ? blockAlert.remainingReplacements : 0;

    return (
        <div className="fixed inset-0 bg-[#2B2B2B]/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4 overflow-y-auto">
            <div className="bg-[#FFFDF7] rounded-[26px] shadow-2xl p-6 md:p-8 max-w-lg w-full border-2 border-[#3F6B45] relative my-auto">
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Cerrar ventana"
                    className="absolute top-4 right-4 w-9 h-9 rounded-full bg-[#FBF5E6] border border-[#E5DAC0] text-[#2B2B2B] hover:border-[#A3363D] hover:text-[#A3363D] font-bold flex items-center justify-center transition-colors"
                >
                    ✕
                </button>

                {blockAlert ? (
                    <div className="space-y-4">
                        <div className="flex items-start gap-3 p-4 pr-10 rounded-2xl bg-[#FFF4C7]/70 border border-[#E5C158]">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                className="w-7 h-7 text-[#A3363D] shrink-0 mt-0.5"
                                aria-hidden="true"
                            >
                                <path
                                    fillRule="evenodd"
                                    d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z"
                                    clipRule="evenodd"
                                />
                            </svg>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#A3363D]">
                                    {isCountryMismatch
                                        ? 'Verificación de seguridad por país'
                                        : 'Protección de tu cuenta'}
                                </p>
                                <h3 className="font-title text-xl font-bold text-[#2B2B2B] mt-1">
                                    {isCountryMismatch
                                        ? 'Acceso desde otro país detectado'
                                        : `Ya alcanzaste tus ${blockAlert.maxDevices ?? 2} equipos personales`}
                                </h3>
                            </div>
                        </div>

                        <div className="bg-[#FBF5E6] p-4 rounded-2xl border border-[#E5DAC0] space-y-2.5 text-sm text-[#2B2B2B] leading-relaxed">
                            {isCountryMismatch ? (
                                <>
                                    <p className="font-semibold">
                                        {blockAlert.message}
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs">
                                        {blockAlert.primaryCountry && (
                                            <div className="bg-[#FFFDF7] border border-[#E5DAC0] rounded-xl p-2.5">
                                                <span className="block text-[#2B2B2B]/65">País registrado</span>
                                                <strong className="text-[#2E4F35] inline-flex items-center gap-1.5 mt-0.5">
                                                    <span>{countryCodeToFlag(blockAlert.primaryCountry)}</span>
                                                    <span>{getCountryDisplayName(blockAlert.primaryCountry)}</span>
                                                </strong>
                                            </div>
                                        )}
                                        {blockAlert.attemptedCountry && (
                                            <div className="bg-[#FFFDF7] border border-[#E5DAC0] rounded-xl p-2.5">
                                                <span className="block text-[#2B2B2B]/65">País detectado ahora</span>
                                                <strong className="text-[#A3363D] inline-flex items-center gap-1.5 mt-0.5">
                                                    <span>{countryCodeToFlag(blockAlert.attemptedCountry)}</span>
                                                    <span>{getCountryDisplayName(blockAlert.attemptedCountry)}</span>
                                                </strong>
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <p className="font-semibold">
                                        Como esta aplicación web se abre directo desde tu navegador (sin descargarse desde una tienda de aplicaciones), incluye una medida de seguridad automática que permite tener tu pase activo en{' '}
                                        <strong>máximo {blockAlert.maxDevices ?? 2} equipos personales a la vez</strong> para proteger tu inscripción.
                                    </p>
                                    <p className="text-xs text-[#2B2B2B]/80">
                                        Con tus 2 equipos autorizados puedes usar el Wi-Fi de tu casa, tus datos móviles en el transporte o el Wi-Fi de tu trabajo sin ningún bloqueo. Este aviso solo aparece cuando intentas entrar desde un{' '}
                                        <strong>equipo nuevo adicional</strong>.
                                    </p>
                                </>
                            )}
                        </div>

                        {isMaxDevicesBlock && activeDevicesList.length > 0 && (
                            <div className="bg-[#FFFDF7] border border-[#E5DAC0] rounded-2xl p-3.5 space-y-2">
                                <p className="text-xs font-bold text-[#3F6B45]">
                                    Equipos donde ya tienes tu pase activo:
                                </p>
                                <ul className="space-y-1.5">
                                    {activeDevicesList.map((dev, idx) => (
                                        <li
                                            key={`${dev.deviceLabel}-${idx}`}
                                            className="flex items-center justify-between gap-2 text-xs bg-[#FBF5E6] px-3 py-2 rounded-xl border border-[#E5DAC0]"
                                        >
                                            <span className="font-semibold text-[#2B2B2B] truncate">
                                                {idx === 0 ? '1. ' : `${idx + 1}. `}
                                                {dev.deviceLabel}
                                            </span>
                                            <span className="text-[11px] text-[#2B2B2B]/65 shrink-0 tabular-nums">
                                                {formatDeviceLastSeen(dev.lastSeenAt)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {canSelfReplace ? (
                            <form onSubmit={handleReplaceDevice} className="bg-[#3F6B45]/10 border border-[#3F6B45]/40 rounded-2xl p-4 space-y-3">
                                <p className="text-xs sm:text-sm text-[#2B2B2B] leading-relaxed">
                                    <strong>¿Se fue la luz en casa, cambiaste de celular o estás en otra computadora?</strong>{' '}
                                    No te preocupes: toca el botón verde para activar <strong>este equipo ahora mismo</strong> (se desconectará automáticamente el más antiguo de la lista).
                                </p>

                                {needsManualSwapCreds && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {!effectiveSwapEmail && (
                                            <input
                                                type="email"
                                                required
                                                value={swapEmailInput}
                                                onChange={(e) => setSwapEmailInput(e.target.value)}
                                                placeholder="Tu correo de compra"
                                                className="px-3 py-2 rounded-xl bg-[#FFFDF7] border border-[#E5DAC0] text-xs text-[#2B2B2B]"
                                            />
                                        )}
                                        {!effectiveSwapPassword && (
                                            <input
                                                type="password"
                                                required
                                                value={swapPasswordInput}
                                                onChange={(e) => setSwapPasswordInput(e.target.value)}
                                                placeholder="Tu clave de ClassOnLive"
                                                className="px-3 py-2 rounded-xl bg-[#FFFDF7] border border-[#E5DAC0] text-xs text-[#2B2B2B]"
                                            />
                                        )}
                                    </div>
                                )}

                                {replaceError && (
                                    <p className="text-xs font-semibold text-[#A3363D] bg-[#A3363D]/10 p-2.5 rounded-xl border border-[#A3363D]/30" role="alert">
                                        {replaceError}
                                    </p>
                                )}

                                <button
                                    type="submit"
                                    disabled={isReplacingDevice}
                                    className="w-full py-3.5 px-5 rounded-full bg-[#3F6B45] hover:bg-[#2E4F35] disabled:opacity-60 text-white text-sm font-bold shadow-md transition-colors"
                                >
                                    {isReplacingDevice
                                        ? 'Activando este equipo...'
                                        : 'Usar este equipo ahora (reemplazar el más antiguo)'}
                                </button>

                                <p className="text-[11px] text-center font-semibold text-[#2E4F35] tabular-nums">
                                    {remainingSwaps === 1
                                        ? 'Te queda 1 cambio rápido disponible esta semana.'
                                        : `Te quedan ${remainingSwaps} cambios rápidos disponibles esta semana.`}
                                </p>
                            </form>
                        ) : (
                            <p className="text-xs text-[#2B2B2B]/85 leading-relaxed bg-[#FBF5E6] p-3.5 rounded-2xl border border-[#E5DAC0]">
                                {isCountryMismatch
                                    ? 'Si estás de viaje o usando una VPN, desactiva tu VPN o escríbenos al equipo de soporte para autorizar tu acceso temporalmente.'
                                    : 'Ya utilizaste tus 2 cambios automáticos de equipo de esta semana. Por seguridad, escribe a soporte o a tu coordinadora para liberar tus equipos en segundos.'}
                            </p>
                        )}

                        <div className="flex flex-col sm:flex-row gap-3 pt-1">
                            <button
                                type="button"
                                onClick={onClearBlock}
                                className="flex-1 py-2.5 px-4 rounded-full bg-[#FBF5E6] border border-[#E5DAC0] hover:border-[#3F6B45] text-[#2B2B2B] text-xs sm:text-sm font-bold transition-colors"
                            >
                                Probar con otro correo
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-2.5 px-4 rounded-full bg-[#FBF5E6] border border-[#E5DAC0] hover:border-[#A3363D] text-[#2B2B2B] text-xs sm:text-sm font-semibold transition-colors"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                ) : studentSession ? (
                    <div className="space-y-5">
                        <div className="pr-12">
                            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#3F6B45]">
                                Puerta de acceso verificada
                            </p>
                            <h3 className="font-title italic text-2xl font-bold text-[#A3363D] mt-1">
                                ¡Bienvenida{studentSession.fullName ? `, ${studentSession.fullName}` : ''}!
                            </h3>
                            <p className="text-xs text-[#2B2B2B]/75 mt-1 tabular-nums">
                                Equipos personales activos: {studentSession.activeDevicesCount} de {studentSession.maxDevices} · Funciona con Wi-Fi o datos móviles
                            </p>
                            {targetClassTitle && (
                                <p className="text-xs font-semibold text-[#2E4F35] mt-2">
                                    Lista para entrar a: {targetClassTitle}
                                </p>
                            )}
                        </div>

                        {/* Bóveda local con los datos de acceso ya guardados */}
                        <div className="bg-[#FBF5E6] border border-[#E5DAC0] rounded-2xl p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-[#3F6B45]">
                                    Tus datos guardados de acceso
                                </span>
                                <span className="text-[11px] font-semibold text-[#2E4F35]">
                                    Guardado en este equipo
                                </span>
                            </div>

                            <div className="flex items-center justify-between gap-2 bg-[#FFFDF7] border border-[#E5DAC0] rounded-xl px-3.5 py-2.5">
                                <div className="min-w-0">
                                    <span className="block text-[11px] text-[#2B2B2B]/65">Usuario (correo)</span>
                                    <span className="block text-sm font-bold text-[#2B2B2B] truncate">
                                        {studentSession.email}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleCopy(studentSession.email, 'email')}
                                    className="px-3 py-1.5 rounded-full bg-[#FBF5E6] border border-[#E5DAC0] hover:border-[#3F6B45] text-xs font-bold text-[#2B2B2B] shrink-0"
                                >
                                    {copiedField === 'email' ? '¡Copiado!' : 'Copiar'}
                                </button>
                            </div>

                            {isEditingPassword ? (
                                <form onSubmit={handleSaveEditedPassword} className="space-y-2">
                                    <label htmlFor="vault-pass" className="block text-xs font-bold text-[#2B2B2B]">
                                        Tu clave asignada para ClassOnLive (aulavirtual-premium.com)
                                    </label>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <input
                                            id="vault-pass"
                                            type="text"
                                            value={editedPassword}
                                            onChange={(e) => setEditedPassword(e.target.value)}
                                            placeholder="La clave asignada al comprar"
                                            className="flex-1 px-3.5 py-2 rounded-xl bg-[#FFFDF7] border border-[#E5DAC0] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#3F6B45]"
                                        />
                                        <button
                                            type="submit"
                                            className="px-4 py-2 rounded-full bg-[#3F6B45] hover:bg-[#2E4F35] text-white text-xs font-bold whitespace-nowrap"
                                        >
                                            Guardar clave
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-[#2B2B2B]/70">
                                        Guárdala una sola vez aquí para tener tu usuario y clave siempre a mano sin buscar correos.
                                    </p>
                                </form>
                            ) : (
                                <div className="flex items-center justify-between gap-2 bg-[#FFFDF7] border border-[#E5DAC0] rounded-xl px-3.5 py-2.5">
                                    <div className="min-w-0">
                                        <span className="block text-[11px] text-[#2B2B2B]/65">
                                            Clave asignada (plataforma de clases)
                                        </span>
                                        <span className="block text-sm font-bold text-[#2B2B2B] truncate font-mono">
                                            {studentSession.classroomPassword
                                                ? showSavedPassword
                                                    ? studentSession.classroomPassword
                                                    : '••••••••••••'
                                                : 'Sin clave guardada'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {studentSession.classroomPassword && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowSavedPassword((prev) => !prev)}
                                                    className="px-2.5 py-1.5 rounded-full bg-[#FBF5E6] border border-[#E5DAC0] text-xs font-semibold text-[#2B2B2B]"
                                                >
                                                    {showSavedPassword ? 'Ocultar' : 'Ver'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleCopy(studentSession.classroomPassword, 'password')}
                                                    className="px-3 py-1.5 rounded-full bg-[#FBF5E6] border border-[#E5DAC0] hover:border-[#3F6B45] text-xs font-bold text-[#2B2B2B]"
                                                >
                                                    {copiedField === 'password' ? '¡Copiada!' : 'Copiar'}
                                                </button>
                                            </>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setIsEditingPassword(true)}
                                            className="px-2.5 py-1.5 rounded-full bg-[#FFFDF7] border border-[#E5DAC0] hover:border-[#A3363D] text-xs font-semibold text-[#A3363D]"
                                        >
                                            Editar
                                        </button>
                                    </div>
                                </div>
                            )}

                            {passwordSavedNotice && (
                                <p className="text-xs font-bold text-[#3F6B45]">
                                    ✓ Clave guardada de forma segura para tus próximos ingresos.
                                </p>
                            )}
                        </div>

                        <div className="space-y-2.5">
                            <a
                                href={classroomTargetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={handlePrepareClassroomClipboard}
                                className="block w-full text-center py-3.5 px-6 rounded-full bg-[#A3363D] hover:bg-[#862B31] text-white font-bold text-base shadow-[0_6px_16px_rgba(163,54,61,0.30)] transition-colors"
                            >
                                Ir a ClassOnLive (Aula Virtual) →
                            </a>

                            <p className="text-[11px] text-[#2B2B2B]/75 leading-relaxed bg-[#FBF5E6] border border-[#E5DAC0] rounded-xl px-3 py-2">
                                Al abrir <strong>ClassOnLive</strong>, si aún no has iniciado sesión allí, pega tu{' '}
                                <strong>correo</strong> y tu <strong>clave asignada</strong> (al tocar el botón rojo copiamos tu clave automáticamente para facilitarte el ingreso).
                            </p>

                            <div className="flex items-center justify-between text-xs pt-1">
                                <span className="text-[#2B2B2B]/70 tabular-nums inline-flex items-center gap-1.5">
                                    {countryCodeToFlag(studentSession.primaryCountry) && (
                                        <span aria-hidden="true">{countryCodeToFlag(studentSession.primaryCountry)}</span>
                                    )}
                                    <span>Acceso personal protegido</span>
                                </span>
                                <button
                                    type="button"
                                    onClick={onLogout}
                                    className="text-[#A3363D] hover:underline font-semibold"
                                >
                                    Cerrar sesión en este equipo
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="pr-12">
                            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#3F6B45]">
                                Acceso exclusivo para inscritas
                            </p>
                            <h3 className="font-title italic text-2xl font-bold text-[#A3363D] mt-1">
                                {authStep === 'activate'
                                    ? 'Activa tu pase por primera vez'
                                    : 'Valida tu pase a la feria'}
                            </h3>
                            <p className="text-xs md:text-sm text-[#2B2B2B]/80 mt-1.5 leading-relaxed">
                                {authStep === 'email'
                                    ? 'Ingresa el correo con el que te inscribiste. Como esta aplicación web funciona directo desde tu navegador (sin descargarse de una tienda de aplicaciones), por seguridad protegemos tu pase hasta en 2 equipos personales (por ejemplo, tu celular y tu computadora). Puedes usarlos con Wi-Fi de casa, datos móviles o en tu trabajo.'
                                    : authStep === 'activate'
                                      ? '¡Estás inscrita! Pega aquí la contraseña que recibiste de ClassOnLive para guardarla en este equipo y copiarla rápido al entrar a tus clases.'
                                      : 'Ingresa tu contraseña de ClassOnLive registrada para desbloquear tu acceso.'}
                            </p>
                        </div>

                        {authStep === 'email' ? (
                            <form onSubmit={handleCheckEmailSubmit} className="space-y-3.5">
                                <div>
                                    <label htmlFor="student-access-email" className="block text-xs font-bold text-[#2B2B2B] mb-1">
                                        Correo electrónico de compra
                                    </label>
                                    <input
                                        id="student-access-email"
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="tu-correo@ejemplo.com"
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#3F6B45]"
                                    />
                                </div>

                                {error && (
                                    <p className="text-xs font-semibold text-[#A3363D] bg-[#A3363D]/10 p-3 rounded-xl border border-[#A3363D]/30" role="alert">
                                        {error}
                                    </p>
                                )}

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full py-3.5 px-6 rounded-full bg-[#A3363D] hover:bg-[#862B31] disabled:opacity-60 text-white font-bold text-sm md:text-base shadow-[0_6px_16px_rgba(163,54,61,0.30)] transition-colors"
                                >
                                    {isLoading ? 'Verificando correo...' : 'Continuar →'}
                                </button>
                            </form>
                        ) : authStep === 'activate' ? (
                            <form onSubmit={handleActivateSubmit} className="space-y-3.5">
                                <div className="flex items-center justify-between gap-2 bg-[#FBF5E6] border border-[#3F6B45]/40 rounded-xl px-3.5 py-2">
                                    <div className="min-w-0">
                                        <span className="block text-[11px] font-bold text-[#3F6B45]">
                                            Correo verificado{checkedFullName ? ` · ${checkedFullName}` : ''}
                                        </span>
                                        <span className="block text-xs font-semibold text-[#2B2B2B] truncate">
                                            {email}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setAuthStep('email');
                                            setError(null);
                                        }}
                                        className="text-xs font-bold text-[#A3363D] hover:underline shrink-0"
                                    >
                                        Cambiar
                                    </button>
                                </div>

                                {!checkedFullName && (
                                    <div>
                                        <label htmlFor="student-activate-name" className="block text-xs font-bold text-[#2B2B2B] mb-1">
                                            Tu nombre completo (opcional)
                                        </label>
                                        <input
                                            id="student-activate-name"
                                            type="text"
                                            value={activationFullName}
                                            onChange={(e) => setActivationFullName(e.target.value)}
                                            placeholder="Ej. María Pérez"
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#3F6B45]"
                                        />
                                    </div>
                                )}

                                <div>
                                    <label htmlFor="student-activate-password" className="block text-xs font-bold text-[#2B2B2B] mb-1">
                                        Contraseña asignada de ClassOnLive (mín. 4 caracteres) *
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            id="student-activate-password"
                                            type={showInputPassword ? 'text' : 'password'}
                                            required
                                            minLength={4}
                                            value={accessPassword}
                                            onChange={(e) => setAccessPassword(e.target.value)}
                                            placeholder="Pega tu clave de ClassOnLive"
                                            className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#3F6B45]"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowInputPassword((prev) => !prev)}
                                            className="px-3.5 py-2 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] text-xs font-semibold text-[#2B2B2B]"
                                        >
                                            {showInputPassword ? 'Ocultar' : 'Ver'}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="student-activate-confirm" className="block text-xs font-bold text-[#2B2B2B] mb-1">
                                        Confirmar clave de ClassOnLive *
                                    </label>
                                    <input
                                        id="student-activate-confirm"
                                        type={showInputPassword ? 'text' : 'password'}
                                        required
                                        minLength={4}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="Repite tu clave de ClassOnLive"
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#3F6B45]"
                                    />
                                </div>

                                {error && (
                                    <p className="text-xs font-semibold text-[#A3363D] bg-[#A3363D]/10 p-3 rounded-xl border border-[#A3363D]/30" role="alert">
                                        {error}
                                    </p>
                                )}

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full py-3.5 px-6 rounded-full bg-[#3F6B45] hover:bg-[#2E4F35] disabled:opacity-60 text-white font-bold text-sm md:text-base shadow-md transition-colors"
                                >
                                    {isLoading ? 'Activando tu pase...' : 'Guardar clave y entrar'}
                                </button>
                            </form>
                        ) : (
                            <form onSubmit={handleVerifySubmit} className="space-y-3.5">
                                <div className="flex items-center justify-between gap-2 bg-[#FBF5E6] border border-[#E5DAC0] rounded-xl px-3.5 py-2">
                                    <div className="min-w-0">
                                        <span className="block text-[11px] font-bold text-[#3F6B45]">
                                            Correo inscrito{checkedFullName ? ` · ${checkedFullName}` : ''}
                                        </span>
                                        <span className="block text-xs font-semibold text-[#2B2B2B] truncate">
                                            {email}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setAuthStep('email');
                                            setError(null);
                                        }}
                                        className="text-xs font-bold text-[#A3363D] hover:underline shrink-0"
                                    >
                                        Cambiar
                                    </button>
                                </div>

                                <div>
                                    <label htmlFor="student-access-password" className="block text-xs font-bold text-[#2B2B2B] mb-1">
                                        Tu clave de ClassOnLive
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            id="student-access-password"
                                            type={showInputPassword ? 'text' : 'password'}
                                            required
                                            value={accessPassword}
                                            onChange={(e) => setAccessPassword(e.target.value)}
                                            placeholder="Ingresa tu clave de ClassOnLive"
                                            className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#3F6B45]"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowInputPassword((prev) => !prev)}
                                            className="px-3.5 py-2 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] text-xs font-semibold text-[#2B2B2B]"
                                        >
                                            {showInputPassword ? 'Ocultar' : 'Ver'}
                                        </button>
                                    </div>
                                </div>

                                {error && (
                                    <p className="text-xs font-semibold text-[#A3363D] bg-[#A3363D]/10 p-3 rounded-xl border border-[#A3363D]/30" role="alert">
                                        {error}
                                    </p>
                                )}

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full py-3.5 px-6 rounded-full bg-[#A3363D] hover:bg-[#862B31] disabled:opacity-60 text-white font-bold text-sm md:text-base shadow-[0_6px_16px_rgba(163,54,61,0.30)] transition-colors"
                                >
                                    {isLoading ? 'Verificando inscripción...' : 'Validar y entrar'}
                                </button>
                            </form>
                        )}

                        <div className="pt-4 border-t border-[#E5DAC0] text-center">
                            <p className="text-xs text-[#2B2B2B]/75 mb-2">¿Todavía no estás inscrita en la 6ta Feria?</p>
                            <a
                                href={GLOBAL_CONFIG.URL_INSCRIPCION_CTA}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block w-full py-2.5 px-4 rounded-full bg-[#2E4F35] hover:bg-[#3F6B45] text-white text-xs sm:text-sm font-bold transition-colors"
                            >
                                Adquirir mi pase en la página oficial
                            </a>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StudentAccessModal;
