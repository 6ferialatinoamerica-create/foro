import React, { useMemo } from 'react';
import type { Clase, RecordingStatusMap } from '../types';
import { GLOBAL_CONFIG } from '../constants';
import { resolvePincelinPosition } from '../utils/pincelinSchedule';

interface PincelinPathProps {
    classes: Clase[];
    selectedClassId: string;
    onSelectClass: (id: string) => void;
    currentTime: Date;
    completedClassIds: string[];
    recordingStatuses: RecordingStatusMap;
}

const PATH_POINTS = [
    { x: 50, y: 86 },
    { x: 150, y: 46 },
    { x: 250, y: 86 },
    { x: 350, y: 46 },
    { x: 450, y: 86 },
    { x: 550, y: 46 },
    { x: 650, y: 86 },
    { x: 750, y: 46 },
    { x: 850, y: 86 },
];

function buildSmoothSvgPath(points: { x: number; y: number }[]): string {
    if (points.length === 0) return '';
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i];
        const p1 = points[i + 1];
        const cx = (p0.x + p1.x) / 2;
        d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
    }
    return d;
}

const PineTreeDecor: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
        <path d="M12 2L6.5 10h3L5 17h5v4h4v-4h5l-4.5-7h3L12 2z" />
    </svg>
);

const StarDecor: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
        <path d="M12 2l2.6 5.6 6.2.8-4.5 4.3 1.1 6.1L12 15.9l-5.4 2.9 1.1-6.1L3.2 8.4l6.2-.8L12 2z" />
    </svg>
);

const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
    </svg>
);

const ChevronLeftIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
        <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
    </svg>
);

const ChevronRightIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
    </svg>
);

interface SantaBootprintProps {
    fill: string;
    stroke: string;
    isRightFoot?: boolean;
    className?: string;
    children: React.ReactNode;
}

const SantaBootprint: React.FC<SantaBootprintProps> = ({
    fill,
    stroke,
    isRightFoot = false,
    className = '',
    children,
}) => (
    <div
        className={`relative inline-flex items-center justify-center select-none ${
            isRightFoot ? 'rotate-[7deg]' : '-rotate-[7deg]'
        } ${className}`}
    >
        <svg
            viewBox="0 0 40 54"
            className="w-full h-full overflow-visible drop-shadow-[0_3px_6px_rgba(43,43,43,0.20)]"
            aria-hidden="true"
        >
            {/* Suela delantera de la bota de Santa */}
            <path
                d={
                    isRightFoot
                        ? 'M20 3 C29 3 34 10 33 19 C32 25 29 29 27 32 L13 32 C10 28 8 23 8 17 C8 9 13 3 20 3 Z'
                        : 'M20 3 C27 3 32 9 32 17 C32 23 30 28 27 32 L13 32 C11 29 8 25 7 19 C6 10 11 3 20 3 Z'
                }
                fill={fill}
                stroke={stroke}
                strokeWidth="2.4"
                strokeLinejoin="round"
            />
            {/* Tacón característico de la bota navideña */}
            <rect
                x="11"
                y="35.5"
                width="18"
                height="13.5"
                rx="5"
                fill={fill}
                stroke={stroke}
                strokeWidth="2.4"
            />
        </svg>
        <span
            className="absolute inset-x-0 top-[21%] flex items-center justify-center leading-none"
            style={{ transform: isRightFoot ? 'rotate(-7deg)' : 'rotate(7deg)' }}
        >
            {children}
        </span>
    </div>
);

const PincelinPath: React.FC<PincelinPathProps> = ({
    classes,
    selectedClassId,
    onSelectClass,
    currentTime,
    completedClassIds,
    recordingStatuses,
}) => {
    const selectedIndex = Math.max(
        0,
        classes.findIndex((c) => c.id === selectedClassId)
    );
    const selectedClass = classes[selectedIndex] || classes[0];

    const pincelinState = useMemo(
        () => resolvePincelinPosition(classes, currentTime, recordingStatuses),
        [classes, currentTime, recordingStatuses]
    );

    const {
        phase,
        pincelinIndex,
        pincelinClass,
        isPincelinRecordingReady,
        statusBadgeText,
        scheduleHintText,
    } = pincelinState;

    const isViewingOtherClass = selectedIndex !== pincelinIndex;
    const isLiveNow = phase === 'live';

    const selectedClassStatus = useMemo(() => {
        const hasSchedule = Boolean(
            selectedClass.horarioConfirmado && selectedClass.startTime && selectedClass.endTime
        );
        const live =
            hasSchedule &&
            currentTime >= selectedClass.startTime! &&
            currentTime <= selectedClass.endTime!;
        const recordingReady = Boolean(recordingStatuses[selectedClass.id]);
        const past = hasSchedule && currentTime > selectedClass.endTime!;

        if (live) return { type: 'live' as const, label: 'CLASE EN VIVO' };
        if (recordingReady) return { type: 'recording' as const, label: 'Grabación disponible' };
        if (past) return { type: 'past' as const, label: 'Finalizada · Pronto grabación' };
        return {
            type: 'upcoming' as const,
            label: selectedClass.horarioConfirmado
                ? `${selectedClass.date} · ${selectedClass.time}`
                : 'Horario por confirmar',
        };
    }, [selectedClass, currentTime, recordingStatuses]);

    const fullPathD = buildSmoothSvgPath(PATH_POINTS);
    const activePathD = buildSmoothSvgPath(PATH_POINTS.slice(0, pincelinIndex + 1));

    const handlePrev = () => {
        if (selectedIndex > 0) {
            onSelectClass(classes[selectedIndex - 1].id);
        }
    };

    const handleNext = () => {
        if (selectedIndex < classes.length - 1) {
            onSelectClass(classes[selectedIndex + 1].id);
        }
    };

    const getStepStatus = (clase: Clase, index: number) => {
        const isLive =
            Boolean(clase.horarioConfirmado && clase.startTime && clase.endTime) &&
            currentTime >= clase.startTime! &&
            currentTime <= clase.endTime!;
        const isPast =
            Boolean(clase.horarioConfirmado && clase.endTime) &&
            currentTime > clase.endTime!;
        const isPincelinHere = index === pincelinIndex;
        const isSelected = index === selectedIndex;
        const isPassedOnRoute = index < pincelinIndex;
        const isCompleted = completedClassIds.includes(clase.id);

        return {
            isLive,
            isPast,
            isPincelinHere,
            isSelected,
            isPassedOnRoute,
            isCompleted,
        };
    };

    const getBootColors = (status: ReturnType<typeof getStepStatus>) => {
        if (status.isLive || status.isPincelinHere) {
            return { fill: '#A3363D', stroke: '#FFE9B8', textClass: 'text-white' };
        }
        if (status.isCompleted) {
            return { fill: '#3F6B45', stroke: '#2E4F35', textClass: 'text-white' };
        }
        if (status.isPassedOnRoute) {
            return { fill: '#4E7B54', stroke: '#3F6B45', textClass: 'text-white' };
        }
        if (status.isSelected) {
            return { fill: '#F3E5C2', stroke: '#A3363D', textClass: 'text-[#A3363D]' };
        }
        return { fill: '#FBF5E6', stroke: '#D5C7A6', textClass: 'text-[#2B2B2B]' };
    };

    return (
        <section
            aria-label="Ruta navideña de talleres con Pincelín"
            className="w-full rounded-[28px] bg-[#FFFDF7] border-2 border-[#3F6B45] shadow-[0_16px_38px_rgba(43,43,43,0.14)] p-5 md:p-7 relative overflow-hidden"
        >
            {/* Encabezado de la ruta */}
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div>
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#3F6B45]">
                        <PineTreeDecor className="w-4 h-4 text-[#3F6B45]" />
                        <span>Ruta Navideña de la Feria</span>
                    </div>
                    <h2 className="font-title italic text-xl md:text-2xl font-bold text-[#A3363D] mt-0.5">
                        Sigue el camino de Pincelín por los {classes.length} talleres
                    </h2>
                </div>

                {/* Controles Anterior / Siguiente para explorar las fichas de los talleres */}
                <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                        type="button"
                        onClick={handlePrev}
                        disabled={selectedIndex === 0}
                        className="inline-flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-full border border-[#E5DAC0] bg-[#FBF5E6] text-xs font-bold text-[#2B2B2B] hover:border-[#A3363D] hover:text-[#A3363D] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
                        aria-label="Taller anterior en el camino"
                    >
                        <ChevronLeftIcon className="w-4 h-4" />
                        <span>Anterior</span>
                    </button>
                    <span className="text-xs font-bold tabular-nums text-white px-3 py-2 rounded-full bg-[#2E4F35] whitespace-nowrap">
                        {selectedIndex + 1} / {classes.length}
                    </span>
                    <button
                        type="button"
                        onClick={handleNext}
                        disabled={selectedIndex === classes.length - 1}
                        className="inline-flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-full border border-[#E5DAC0] bg-[#FBF5E6] text-xs font-bold text-[#2B2B2B] hover:border-[#A3363D] hover:text-[#A3363D] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
                        aria-label="Siguiente taller en el camino"
                    >
                        <span>Siguiente</span>
                        <ChevronRightIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* DESKTOP (md+): Camino sinuoso navideño con pisadas de bota de Santa 1..9 */}
            <div className="hidden md:block relative z-10 pt-20 pb-2">
                <svg
                    viewBox="0 0 900 130"
                    preserveAspectRatio="none"
                    className="w-full h-32 block"
                    aria-hidden="true"
                >
                    <defs>
                        <linearGradient id="navidadTrailGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#3F6B45" />
                            <stop offset="100%" stopColor="#A3363D" />
                        </linearGradient>
                    </defs>

                    <path
                        d={fullPathD}
                        fill="none"
                        stroke="#E5DAC0"
                        strokeWidth="6"
                        strokeDasharray="8 8"
                        strokeLinecap="round"
                    />

                    {pincelinIndex > 0 && (
                        <path
                            d={activePathD}
                            fill="none"
                            stroke="url(#navidadTrailGrad)"
                            strokeWidth="6"
                            strokeLinecap="round"
                        />
                    )}
                </svg>

                {/* 9 Pisadas de bota numeradas sobre la ruta (sin etiquetas pequeñas encima de la bota) */}
                <div className="grid grid-cols-9 items-start -mt-32 relative">
                    {classes.map((clase, index) => {
                        const status = getStepStatus(clase, index);
                        const { isPincelinHere, isSelected, isCompleted } = status;
                        const colors = getBootColors(status);
                        const isTopRow = index % 2 === 1;

                        return (
                            <div
                                key={clase.id}
                                className={`flex flex-col items-center relative ${
                                    isTopRow ? 'pt-[18px]' : 'pt-[58px]'
                                }`}
                            >
                                <div className="relative flex flex-col items-center">
                                    {isPincelinHere && (
                                        <div className="absolute bottom-full mb-0.5 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                                            <img
                                                src={GLOBAL_CONFIG.URL_MASCOTA_PINCELIN}
                                                alt={`Pincelín en ${clase.titulo}`}
                                                className="w-20 h-20 object-contain drop-shadow-[0_6px_10px_rgba(43,43,43,0.28)] animate-levitate"
                                            />
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => onSelectClass(clase.id)}
                                        aria-current={isSelected ? 'step' : undefined}
                                        title={clase.titulo}
                                        className={`group relative flex items-center justify-center transition-transform duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3F6B45] rounded-xl p-0.5 ${
                                            isPincelinHere
                                                ? 'scale-115'
                                                : isSelected
                                                  ? 'scale-110 ring-2 ring-[#3F6B45] ring-offset-2 ring-offset-[#FFFDF7]'
                                                  : 'hover:scale-110'
                                        }`}
                                    >
                                        <SantaBootprint
                                            fill={colors.fill}
                                            stroke={colors.stroke}
                                            isRightFoot={index % 2 === 1}
                                            className="w-11 h-14"
                                        >
                                            <span
                                                className={`font-extrabold text-sm tabular-nums ${colors.textClass} flex items-center gap-0.5`}
                                            >
                                                {isCompleted && !isPincelinHere && !isSelected ? (
                                                    <CheckIcon className="w-4 h-4 text-white" />
                                                ) : (
                                                    index + 1
                                                )}
                                            </span>
                                        </SantaBootprint>
                                    </button>
                                </div>

                                <span
                                    className={`mt-1.5 text-[11px] font-bold tracking-wide text-center leading-tight ${
                                        isPincelinHere
                                            ? 'text-[#A3363D]'
                                            : isSelected
                                              ? 'text-[#2E4F35] underline decoration-[#A3363D] decoration-2 underline-offset-2'
                                              : isCompleted
                                                ? 'text-[#3F6B45]'
                                                : 'text-[#2B2B2B]/75'
                                    }`}
                                >
                                    Taller {index + 1}
                                    {isSelected && isViewingOtherClass ? ' · Viendo' : ''}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* MÓVIL (< md): Escenario con Pincelín en su parada real + pisadas numeradas 1..9 */}
            <div className="md:hidden relative z-10 space-y-4">
                <div className="flex items-center gap-3.5 bg-[#FBF5E6] border border-[#E5DAC0] rounded-2xl p-3.5">
                    <div className="relative shrink-0">
                        <img
                            src={GLOBAL_CONFIG.URL_MASCOTA_PINCELIN}
                            alt={`Pincelín en ${pincelinClass.titulo}`}
                            className="w-20 h-20 object-contain drop-shadow-[0_4px_10px_rgba(43,43,43,0.22)]"
                        />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span className="text-[11px] uppercase tracking-wider font-bold text-[#3F6B45]">
                                Parada {pincelinIndex + 1} de {classes.length}
                            </span>

                            {isLiveNow ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#A3363D] text-white text-[10px] font-extrabold uppercase tracking-wider animate-pulse">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                                    </span>
                                    <span>CLASE EN VIVO</span>
                                </span>
                            ) : isPincelinRecordingReady ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#3F6B45] text-white text-[10px] font-bold">
                                    <span>🎬 Grabación disponible</span>
                                </span>
                            ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#FFFDF7] border border-[#E5DAC0] text-[#2B2B2B] text-[10px] font-bold">
                                    {statusBadgeText}
                                </span>
                            )}
                        </div>

                        <p className="text-sm font-bold text-[#A3363D] leading-snug">
                            {pincelinClass.titulo}
                        </p>
                        <p className="text-xs text-[#2B2B2B]/80 mt-0.5 truncate">
                            Con {pincelinClass.ponentes.map((p) => p.nombre).join(', ')}
                        </p>
                        <p className="text-[11px] font-semibold text-[#3F6B45] mt-1">
                            {scheduleHintText}
                        </p>
                    </div>
                </div>

                {/* Pisadas de bota numeradas 1..9 (limpias, sin etiqueta encima de la bota) */}
                <div className="grid grid-cols-9 gap-1">
                    {classes.map((clase, index) => {
                        const status = getStepStatus(clase, index);
                        const { isPincelinHere, isSelected, isCompleted } = status;
                        const colors = getBootColors(status);
                        return (
                            <button
                                key={clase.id}
                                type="button"
                                onClick={() => onSelectClass(clase.id)}
                                aria-current={isSelected ? 'step' : undefined}
                                aria-label={clase.titulo}
                                className={`flex items-center justify-center py-0.5 rounded-lg transition-transform ${
                                    isPincelinHere
                                        ? 'scale-110'
                                        : isSelected
                                          ? 'scale-105 ring-2 ring-[#3F6B45]'
                                          : ''
                                }`}
                            >
                                <SantaBootprint
                                    fill={colors.fill}
                                    stroke={colors.stroke}
                                    isRightFoot={index % 2 === 1}
                                    className="w-8 h-11"
                                >
                                    <span className={`font-extrabold text-[11px] tabular-nums ${colors.textClass}`}>
                                        {isCompleted && !isPincelinHere && !isSelected ? (
                                            <CheckIcon className="w-3.5 h-3.5 text-white" />
                                        ) : (
                                            index + 1
                                        )}
                                    </span>
                                </SantaBootprint>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Franja inferior indicando dónde está Pincelín (por día/hora) y, si aplica, el taller que consulta la alumna */}
            <div className="relative z-10 mt-5 rounded-2xl border-2 px-4 py-3.5 bg-[#2E4F35] text-white animate-attention-glow space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-start sm:items-center gap-2.5 text-sm md:text-base min-w-0">
                        <span
                            className={`inline-flex items-center justify-center w-7 h-7 rounded-full border border-[#FFE9B8] shrink-0 mt-0.5 sm:mt-0 ${
                                isLiveNow ? 'bg-[#A3363D] animate-pulse' : 'bg-[#A3363D]'
                            }`}
                        >
                            <StarDecor className="w-4 h-4 text-[#FFE9B8]" />
                        </span>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                {isLiveNow && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#A3363D] border border-[#FFE9B8]/70 text-white text-[11px] font-extrabold uppercase tracking-wider animate-pulse">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                                        </span>
                                        <span>CLASE EN VIVO</span>
                                    </span>
                                )}

                                {!isLiveNow && isPincelinRecordingReady && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#3F6B45] border border-[#FFE9B8]/60 text-[#FFE9B8] text-[11px] font-bold">
                                        <span>🎬 Grabación disponible</span>
                                    </span>
                                )}

                                {!isLiveNow && !isPincelinRecordingReady && (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#243E29] border border-[#CFE5D2]/35 text-[#FFE9B8] text-[11px] font-bold">
                                        {statusBadgeText}
                                    </span>
                                )}
                            </div>

                            <p className="leading-snug mt-1">
                                <strong className="text-[#FFE9B8] uppercase tracking-wide text-xs md:text-sm mr-1.5">
                                    Pincelín está en:
                                </strong>
                                <strong className="text-white font-bold">
                                    {pincelinClass.titulo}
                                </strong>
                            </p>
                            <p className="text-xs sm:text-sm text-[#FFE9B8] font-semibold mt-0.5">
                                Con{' '}
                                {pincelinClass.ponentes.map((p, idx) => (
                                    <span key={p.nombre} className="whitespace-nowrap">
                                        {idx > 0 ? ', ' : ''}
                                        {p.nombre}
                                    </span>
                                ))}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col sm:items-end gap-1 pl-9 sm:pl-0 shrink-0">
                        <span className="text-xs font-bold text-[#FFE9B8] sm:text-right">
                            {scheduleHintText}
                        </span>
                        {isViewingOtherClass && (
                            <button
                                type="button"
                                onClick={() => onSelectClass(pincelinClass.id)}
                                className="self-start sm:self-end text-[11px] font-bold px-3 py-1 rounded-full bg-[#FFFDF7] text-[#A3363D] hover:bg-[#FFE9B8] transition-colors"
                            >
                                Ver taller donde está Pincelín →
                            </button>
                        )}
                    </div>
                </div>

                {/* Indicador claro cuando la alumna está consultando otro taller distinto al de Pincelín */}
                {isViewingOtherClass && (
                    <div className="pt-2.5 border-t border-white/15 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <span className="font-bold uppercase tracking-wider text-[#CFE5D2]">
                                Consultando ficha:
                            </span>
                            <span className="font-bold text-white truncate">
                                {selectedClass.titulo}
                            </span>
                        </div>
                        <span
                            className={`self-start sm:self-auto px-2.5 py-0.5 rounded-full font-bold text-[11px] whitespace-nowrap ${
                                selectedClassStatus.type === 'live'
                                    ? 'bg-[#A3363D] text-white'
                                    : selectedClassStatus.type === 'recording'
                                      ? 'bg-[#3F6B45] text-[#FFE9B8] border border-[#FFE9B8]/40'
                                      : 'bg-[#243E29] text-[#FFE9B8]'
                            }`}
                        >
                            {selectedClassStatus.type === 'recording'
                                ? '🎬 Grabación disponible'
                                : selectedClassStatus.type === 'live'
                                  ? '● CLASE EN VIVO'
                                  : selectedClassStatus.label}
                        </span>
                    </div>
                )}
            </div>
        </section>
    );
};

export default PincelinPath;
