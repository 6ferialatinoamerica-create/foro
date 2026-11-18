import React, { useMemo, useState } from 'react';
import type { Clase, VerifiedStudentSession } from '../types';
import { GLOBAL_CONFIG } from '../constants';

interface ClassCardProps {
    clase: Clase;
    currentTime: Date;
    onGoToClass: (classId: string) => void;
    onValidatePassBackground?: (classId: string) => void;
    isCompleted: boolean;
    onToggleComplete: (classId: string) => void;
    studentSession: VerifiedStudentSession | null;
    isBlocked: boolean;
    onOpenClassForum?: (classId: string) => void;
    isRecordingReady?: boolean;
}

function displayLocalClassTime(startTime: Date): string {
    const day = startTime.getDate().toString().padStart(2, '0');
    const month = (startTime.getMonth() + 1).toString().padStart(2, '0');

    const weekday = startTime.toLocaleDateString(navigator.language, { weekday: 'long' });
    const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);

    const timeOptions: Intl.DateTimeFormatOptions = {
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
    };
    const timeStr = startTime.toLocaleTimeString(navigator.language, timeOptions);

    return `${day}/${month} (${capitalizedWeekday}) - ${timeStr}`;
}

const CheckSquareIcon = ({ checked }: { checked: boolean }) => (
    <span
        className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors shrink-0 ${
            checked
                ? 'bg-[#3F6B45] border-[#2E4F35] text-white'
                : 'bg-[#FFFDF7] border-[#3F6B45]/50 text-transparent'
        }`}
    >
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
        </svg>
    </span>
);

async function copyToClipboard(text: string): Promise<boolean> {
    if (!text || typeof navigator === 'undefined') return false;
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // Fallback abajo si el navegador bloquea navigator.clipboard
    }
    try {
        if (typeof document !== 'undefined') {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            const copied = document.execCommand('copy');
            document.body.removeChild(textarea);
            return copied;
        }
    } catch {
        return false;
    }
    return false;
}

const ClassCard: React.FC<ClassCardProps> = ({
    clase,
    currentTime,
    onGoToClass,
    onValidatePassBackground,
    isCompleted,
    onToggleComplete,
    studentSession,
    isBlocked,
    onOpenClassForum,
    isRecordingReady = false,
}) => {
    const [copiedField, setCopiedField] = useState<'email' | 'password' | null>(null);
    const classroomTargetUrl =
        studentSession?.classroomUrl?.trim() || GLOBAL_CONFIG.URL_ACCESO_PLATAFORMA;

    const handleQuickCopy = async (value: string, field: 'email' | 'password') => {
        if (!value) return;
        const ok = await copyToClipboard(value);
        if (ok) {
            setCopiedField(field);
            setTimeout(() => setCopiedField((prev) => (prev === field ? null : prev)), 2000);
        }
    };

    const { isLive, statusType, statusNote } = useMemo(() => {
        const hasSchedule = Boolean(clase.horarioConfirmado && clase.startTime && clase.endTime);
        const live =
            hasSchedule &&
            clase.startTime &&
            clase.endTime &&
            currentTime >= clase.startTime &&
            currentTime <= clase.endTime;

        if (live) {
            return {
                isLive: true,
                statusType: 'live' as const,
                statusNote: null,
            };
        }

        if (isRecordingReady) {
            return {
                isLive: false,
                statusType: 'recording_ready' as const,
                statusNote:
                    '¡Ya puedes ver la grabación de este taller en la plataforma de clases (acceso para siempre)!',
            };
        }

        if (!hasSchedule || !clase.startTime || !clase.endTime) {
            return {
                isLive: false,
                statusType: 'unconfirmed' as const,
                statusNote: 'El horario exacto de este taller se publicará próximamente en el programa oficial.',
            };
        }

        const timeAfterEnd = currentTime.getTime() - clase.endTime.getTime();
        const past = timeAfterEnd > 0;

        if (past) {
            return {
                isLive: false,
                statusType: 'recording_soon' as const,
                statusNote: 'Clase finalizada · Pronto la grabación estará disponible en la plataforma.',
            };
        }

        return {
            isLive: false,
            statusType: 'upcoming' as const,
            statusNote: null,
        };
    }, [clase, currentTime, isRecordingReady]);

    return (
        <div
            className={`w-full bg-[#FFFDF7] rounded-[22px] shadow-card-warm border ${
                isLive ? 'border-[#A3363D] ring-2 ring-[#A3363D]/30' : 'border-[#E5DAC0]'
            } p-6 md:p-8 relative overflow-hidden transition-colors duration-300 h-full flex flex-col justify-between`}
        >
            <div>
                {/* Cabecera de la tarjeta: Edición + Check Listo */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <span className="text-xs uppercase tracking-[0.12em] font-bold text-[#3F6B45]">
                        {GLOBAL_CONFIG.EVENT_EDITION}
                    </span>

                    <div className="flex items-center gap-2">
                        {/* Casilla Check Listo / Clase vista */}
                        <button
                            type="button"
                            onClick={() => onToggleComplete(clase.id)}
                            aria-pressed={isCompleted}
                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold transition-colors ${
                                isCompleted
                                    ? 'bg-[#3F6B45]/15 border-[#3F6B45] text-[#2E4F35]'
                                    : 'bg-[#FBF5E6] border-[#E5DAC0] text-[#2B2B2B] hover:border-[#3F6B45]'
                            }`}
                        >
                            <CheckSquareIcon checked={isCompleted} />
                            <span>{isCompleted ? 'Clase vista ✓' : 'Marcar vista'}</span>
                        </button>

                        {isLive ? (
                            <div className="flex items-center gap-2 bg-[#A3363D] text-white px-3 py-1.5 rounded-full animate-pulse">
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
                                </span>
                                <span className="font-bold text-[10px] md:text-xs tracking-widest whitespace-nowrap">EN VIVO</span>
                            </div>
                        ) : statusType === 'recording_ready' ? (
                            <div className="flex items-center gap-1.5 bg-[#3F6B45]/15 border border-[#3F6B45]/40 text-[#2E4F35] px-3 py-1.5 rounded-full">
                                <span className="font-bold text-[10px] md:text-xs whitespace-nowrap">
                                    🎬 Grabación disponible
                                </span>
                            </div>
                        ) : statusType === 'recording_soon' ? (
                            <div className="flex items-center gap-1.5 bg-[#FFF4C7] border border-[#E5C158] text-[#8A5A00] px-3 py-1.5 rounded-full">
                                <span className="font-bold text-[10px] md:text-xs whitespace-nowrap">
                                    ⏳ Clase finalizada · Pronto grabación
                                </span>
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* Título del taller + Colaborador arriba a la derecha */}
                <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="min-w-0 flex-1">
                        <h2 className="font-title text-2xl md:text-3xl font-bold text-[#A3363D] leading-snug">
                            {clase.titulo}
                        </h2>
                        <p className="text-[#2B2B2B] mt-3 text-base leading-relaxed">
                            {clase.descripcion}
                        </p>
                    </div>

                    {clase.ponentes.length > 0 && (
                        <div className="shrink-0 flex flex-col items-end text-right gap-1.5">
                            {clase.ponentes.map((ponente) => (
                                <div key={ponente.nombre} className="flex flex-col items-end">
                                    <div className="relative">
                                        <img
                                            src={ponente.foto}
                                            alt={ponente.nombre}
                                            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover object-top border-2 border-[#FFFDF7] ring-2 ring-[#A3363D] shadow-md"
                                        />
                                    </div>
                                    <span className="text-xs sm:text-sm font-bold text-[#2B2B2B] mt-1.5 leading-tight whitespace-nowrap">
                                        {ponente.nombre}
                                    </span>
                                    {ponente.datos.usuario && ponente.datos.instagram ? (
                                        <a
                                            href={ponente.datos.instagram}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[11px] font-semibold text-[#A3363D] hover:underline whitespace-nowrap"
                                        >
                                            {ponente.datos.usuario}
                                        </a>
                                    ) : (
                                        <span className="text-[11px] font-medium text-[#3F6B45] whitespace-nowrap">
                                            {ponente.nombre.includes('Yussef') ? 'Colaborador' : 'Colaboradora'}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {clase.bono && (
                    <div className="mb-5 relative p-4 pt-5 rounded-2xl bg-[#FFF4C7] border border-[#E5C158] shadow-[0_6px_16px_rgba(43,43,43,0.08)]">
                        <span
                            aria-hidden="true"
                            className="absolute -top-2 left-6 w-12 h-3.5 rounded-xs bg-[#A3363D]/85 -rotate-2 shadow-xs"
                        />
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#A3363D]">
                                🎁 Recordatorio · Bonos de la clase en ClassOnLive
                            </span>
                        </div>
                        <p className="text-sm md:text-base text-[#2B2B2B] font-bold leading-snug">
                            {clase.bono}
                        </p>
                        <p className="text-xs text-[#2B2B2B]/80 mt-1">
                            Recuerda descargar los bonos de la clase dentro de este taller en la plataforma <strong>ClassOnLive</strong>.
                        </p>
                    </div>
                )}

                <div className="text-[#2B2B2B] mb-6 space-y-1.5 text-sm md:text-base bg-[#FBF5E6] p-4 rounded-2xl border border-[#E5DAC0]">
                    {clase.horarioConfirmado && clase.startTime ? (
                        <>
                            <p>
                                <span className="text-[#2B2B2B]/70">Fecha del taller:</span>{' '}
                                <strong className="text-[#2B2B2B]">{clase.date}</strong>
                            </p>
                            <p>
                                <span className="text-[#2B2B2B]/70">Hora Original:</span> {clase.time} (VET)
                            </p>
                            <p className="text-[#3F6B45] font-bold">
                                Tu Hora Local: {displayLocalClassTime(clase.startTime)}
                            </p>
                        </>
                    ) : (
                        <>
                            <p>
                                <span className="text-[#2B2B2B]/70">Día asignado:</span>{' '}
                                <span className="text-[#A3363D] font-bold">Por confirmar</span>
                            </p>
                            <p>
                                <span className="text-[#2B2B2B]/70">Horario oficial:</span>{' '}
                                <span className="text-[#A3363D] font-bold">{clase.time}</span>
                            </p>
                        </>
                    )}
                </div>
            </div>

            <div className="space-y-3">
                {studentSession && !isBlocked ? (
                    <div className="rounded-2xl bg-[#FBF5E6] border border-[#E5DAC0] p-3 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] font-semibold text-[#3F6B45]">
                            <span className="truncate">
                                Pase activo · {studentSession.email}
                            </span>
                            <span className="tabular-nums shrink-0">
                                {studentSession.activeDevicesCount}/{studentSession.maxDevices} equipos en misma IP
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => void handleQuickCopy(studentSession.email, 'email')}
                                className="py-2 px-3 rounded-xl bg-[#FFFDF7] border border-[#E5DAC0] hover:border-[#3F6B45] text-xs font-bold text-[#2B2B2B] transition-colors text-center"
                            >
                                {copiedField === 'email' ? '✓ Correo copiado' : 'Copiar correo'}
                            </button>
                            {studentSession.classroomPassword ? (
                                <button
                                    type="button"
                                    onClick={() => void handleQuickCopy(studentSession.classroomPassword, 'password')}
                                    className="py-2 px-3 rounded-xl bg-[#FFFDF7] border border-[#E5DAC0] hover:border-[#3F6B45] text-xs font-bold text-[#2B2B2B] transition-colors text-center"
                                >
                                    {copiedField === 'password' ? '✓ Clave copiada' : 'Copiar clave'}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => onGoToClass(clase.id)}
                                    className="py-2 px-3 rounded-xl bg-[#FFFDF7] border border-[#A3363D]/50 hover:border-[#A3363D] text-xs font-bold text-[#A3363D] transition-colors text-center"
                                >
                                    Guardar clave
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <p className="text-center text-xs font-medium text-[#2B2B2B]/75">
                        {isBlocked
                            ? 'Acceso restringido por seguridad hasta verificar dispositivo e IP autorizada.'
                            : 'Acceso exclusivo para alumnas inscritas · Valida tu correo para activar o entrar a ClassOnLive.'}
                    </p>
                )}

                {/* Botón principal de acceso a ClassOnLive: directo en 1 paso si el pase ya está activo */}
                {studentSession && !isBlocked ? (
                    <a
                        href={classroomTargetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => onValidatePassBackground?.(clase.id)}
                        className={`block w-full text-center py-4 px-5 text-base md:text-lg font-bold rounded-full transition-all transform hover:scale-[1.02] duration-200 bg-[#A3363D] hover:bg-[#862B31] text-white shadow-[0_6px_16px_rgba(163,54,61,0.30)] ${
                            isLive ? 'animate-pulse' : ''
                        }`}
                    >
                        {isLive
                            ? '¡EN VIVO! - Ir a ClassOnLive (Aula Virtual) →'
                            : 'Ir a ClassOnLive (Aula Virtual) →'}
                    </a>
                ) : (
                    <button
                        type="button"
                        onClick={() => onGoToClass(clase.id)}
                        className={`w-full py-4 px-5 text-base md:text-lg font-bold rounded-full transition-all transform hover:scale-[1.02] duration-200 bg-[#A3363D] hover:bg-[#862B31] text-white shadow-[0_6px_16px_rgba(163,54,61,0.30)] ${
                            isLive ? 'animate-pulse' : ''
                        }`}
                    >
                        {isBlocked
                            ? 'Ver alerta de seguridad de acceso'
                            : 'Validar inscripción y entrar a ClassOnLive'}
                    </button>
                )}

                {onOpenClassForum && (
                    <button
                        type="button"
                        onClick={() => onOpenClassForum(clase.id)}
                        className="w-full py-2.5 px-4 rounded-full bg-[#FBF5E6] hover:bg-[#FFF4C7] border border-[#E5DAC0] hover:border-[#3F6B45] text-xs md:text-sm font-bold text-[#2E4F35] transition-colors flex items-center justify-center gap-2"
                    >
                        <span>💬 ¿Tienes dudas de este taller? Ver o preguntar en el Foro</span>
                    </button>
                )}

                {statusNote && (
                    <p
                        className={`text-center text-xs md:text-sm font-medium border p-3 rounded-2xl ${
                            statusType === 'recording_ready'
                                ? 'bg-[#3F6B45]/10 border-[#3F6B45]/40 text-[#2E4F35]'
                                : statusType === 'recording_soon'
                                  ? 'bg-[#FFF4C7]/60 border-[#E5C158] text-[#6E4700]'
                                  : 'bg-[#FBF5E6] border-[#E5DAC0] text-[#2B2B2B]/85'
                        }`}
                    >
                        {statusNote}{' '}
                        <a
                            href={GLOBAL_CONFIG.URL_INSCRIPCION_CTA}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline font-bold text-[#A3363D] hover:text-[#862B31] ml-1"
                        >
                            ¿Aún no estás inscrito/a? Inscríbete aquí
                        </a>
                    </p>
                )}
            </div>
        </div>
    );
};

export default ClassCard;