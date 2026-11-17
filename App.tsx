import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { classData, EVENT_DAYS, EVENT_INCLUDES, GLOBAL_CONFIG } from './constants';
import { useCurrentTime } from './hooks/useCurrentTime';
import {
    clearStudentSessionLocally,
    getSavedStudentSession,
    saveStudentProgress,
    verifyStudentAccess,
} from './services/accessService';
import type { AccessVerificationResult, VerifiedStudentSession } from './types';

import Header from './components/Header';
import Footer from './components/Footer';
import ClassSelector from './components/ClassSelector';
import ClassCard from './components/ClassCard';
import ChristmasLights from './components/ChristmasLights';
import Confetti from './components/Confetti';
import Snowfall from './components/Snowfall';
import DoubtForum from './components/DoubtForum';
import StudentAccessModal from './components/StudentAccessModal';
import AdminPortalModal from './components/AdminPortalModal';
import PincelinIntro from './components/PincelinIntro';

const COMPLETED_STORAGE_KEY = 'territorio_canva_6ta_completed_v1';

const readGuestCompleted = (): string[] => {
    try {
        const saved = localStorage.getItem(COMPLETED_STORAGE_KEY);
        return saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
        return [];
    }
};

const App: React.FC = () => {
    const [selectedClassId, setSelectedClassId] = useState<string>(classData[0].id);
    const currentTime = useCurrentTime(5000);

    const [studentSession, setStudentSession] = useState<VerifiedStudentSession | null>(() =>
        getSavedStudentSession()
    );

    const [completedClassIds, setCompletedClassIds] = useState<string[]>(() => {
        const savedSession = getSavedStudentSession();
        if (savedSession && Array.isArray(savedSession.completedClassIds)) {
            return savedSession.completedClassIds;
        }
        return readGuestCompleted();
    });

    const [blockAlert, setBlockAlert] = useState<AccessVerificationResult | null>(null);
    const [accessModalOpen, setAccessModalOpen] = useState(false);
    const [targetClassTitle, setTargetClassTitle] = useState<string | undefined>(undefined);
    const [adminModalOpen, setAdminModalOpen] = useState(false);
    const [adminInitialTab, setAdminInitialTab] = useState<'students' | 'alerts' | 'forum'>('students');
    const [forumRefreshTrigger, setForumRefreshTrigger] = useState(0);
    const [programTab, setProgramTab] = useState<'talleres' | 'foro'>('talleres');
    const [forumWorkshopFilter, setForumWorkshopFilter] = useState<string>('all');
    const [openAgendaDay, setOpenAgendaDay] = useState<string | null>(null);
    const [showIntro, setShowIntro] = useState(true);
    const [confettiBurst, setConfettiBurst] = useState<number>(0);

    const handleFinishIntro = useCallback(() => {
        setShowIntro(false);
    }, []);

    const handleOpenClassForum = useCallback((classId: string) => {
        setForumWorkshopFilter(classId);
        setProgramTab('foro');
        document.getElementById('talleres-navidenos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    // Revalidación silenciosa al abrir la app: comprueba misma IP y límite de 2 dispositivos
    useEffect(() => {
        const saved = getSavedStudentSession();
        if (!saved) return;

        let active = true;
        verifyStudentAccess({
            email: saved.email,
            purchaseCode: saved.classroomPassword || saved.purchaseCode,
        })
            .then((res) => {
                if (!active) return;
                if (res.ok && res.student) {
                    setStudentSession(res.student);
                    setCompletedClassIds(res.student.completedClassIds || []);
                    setBlockAlert(null);
                } else if (res.status === 'BLOCKED_MAX_DEVICES' || res.status === 'BLOCKED_GEO') {
                    clearStudentSessionLocally();
                    setStudentSession(null);
                    setBlockAlert(res);
                } else if (res.status === 'INVALID_CREDENTIALS' || res.status === 'INACTIVE') {
                    clearStudentSessionLocally();
                    setStudentSession(null);
                }
            })
            .catch(() => {
                // Mantiene sesión local si hay falla temporal de red
            });

        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (!studentSession) {
            localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify(completedClassIds));
        }
    }, [completedClassIds, studentSession]);

    useEffect(() => {
        if (confettiBurst === 0) return;

        const timer = setTimeout(() => {
            setConfettiBurst(0);
        }, 4200);

        return () => clearTimeout(timer);
    }, [confettiBurst]);

    const selectedClass = useMemo(
        () => classData.find((c) => c.id === selectedClassId) || classData[0],
        [selectedClassId]
    );

    const toggleCompleteClass = (classId: string) => {
        const isMarkingComplete = !completedClassIds.includes(classId);
        const nextIds = isMarkingComplete
            ? [...completedClassIds, classId]
            : completedClassIds.filter((id) => id !== classId);

        setCompletedClassIds(nextIds);

        if (studentSession) {
            setStudentSession((prev) => (prev ? { ...prev, completedClassIds: nextIds } : prev));
            void saveStudentProgress({
                email: studentSession.email,
                purchaseCode: studentSession.classroomPassword || studentSession.purchaseCode,
                completedClassIds: nextIds,
            });
        }

        if (isMarkingComplete) {
            setConfettiBurst((prev) => prev + 1);
        }
    };

    const handleGoToClass = async (classId: string) => {
        const clase = classData.find((c) => c.id === classId);
        if (!clase) return;

        setTargetClassTitle(clase.titulo);

        if (studentSession) {
            const freshCheck = await verifyStudentAccess({
                email: studentSession.email,
                purchaseCode: studentSession.classroomPassword || studentSession.purchaseCode,
            }).catch(() => null);

            if (freshCheck && (freshCheck.status === 'BLOCKED_MAX_DEVICES' || freshCheck.status === 'BLOCKED_GEO')) {
                clearStudentSessionLocally();
                setStudentSession(null);
                setBlockAlert(freshCheck);
                setAccessModalOpen(true);
                return;
            }

            if (freshCheck?.ok && freshCheck.student) {
                setStudentSession(freshCheck.student);
                setCompletedClassIds(freshCheck.student.completedClassIds || []);
            }
        }

        setAccessModalOpen(true);
    };

    const handleOpenStudentAccessFromHeader = () => {
        setTargetClassTitle(undefined);
        setAccessModalOpen(true);
    };

    const handleStudentVerified = (session: VerifiedStudentSession) => {
        setStudentSession(session);
        setCompletedClassIds(session.completedClassIds || []);
        setBlockAlert(null);
    };

    const handleStudentBlocked = (alertResult: AccessVerificationResult) => {
        clearStudentSessionLocally();
        setStudentSession(null);
        setBlockAlert(alertResult);
    };

    const handleStudentLogout = () => {
        clearStudentSessionLocally();
        setStudentSession(null);
        setCompletedClassIds(readGuestCompleted());
        setBlockAlert(null);
    };

    return (
        <div
            className="min-h-screen text-[#2B2B2B] relative"
            style={{ backgroundColor: GLOBAL_CONFIG.FONDO_GRADIENTE }}
        >
            {showIntro && <PincelinIntro onFinish={handleFinishIntro} />}
            <Snowfall aboveIntro={showIntro} />
            {confettiBurst > 0 && <Confetti key={confettiBurst} />}

            {/* Cintillo superior fijo mientras se hace scroll */}
            <div className="sticky top-0 z-40 w-full bg-[#A3363D] text-white py-2.5 px-4 text-center text-xs md:text-sm font-semibold tracking-wide border-b border-[#FFE9B8]/35 shadow-[0_4px_14px_rgba(0,0,0,0.22)]">
                <strong className="text-[#FFE9B8]">{GLOBAL_CONFIG.EVENT_DATES_LABEL}</strong>
                <ChristmasLights />
            </div>

            <div className="relative z-10">
                <Header
                    classes={classData}
                    selectedClassId={selectedClassId}
                    onSelectClass={setSelectedClassId}
                    currentTime={currentTime}
                    completedClassIds={completedClassIds}
                    studentSession={studentSession}
                    isBlocked={Boolean(blockAlert)}
                    onOpenStudentAccess={handleOpenStudentAccessFromHeader}
                />

                <main className="container mx-auto px-4 py-8 md:py-12 space-y-12">
                    {/* Sección unificada: Talleres Navideños con pestañas Talleres y Foro de Dudas */}
                    <section id="talleres-navidenos" aria-label="Talleres Navideños" className="max-w-6xl mx-auto">
                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#FFE9B8]/85 mb-1">
                                    Programa y comunidad
                                </p>
                                <h2 className="font-title italic text-3xl md:text-4xl font-bold text-[#FFE9B8]">
                                    Talleres Navideños
                                </h2>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
                                <div
                                    role="tablist"
                                    aria-label="Cambiar entre Talleres y Foro de Dudas"
                                    className="inline-flex p-1.5 rounded-full bg-[#243E29] border border-[#CFE5D2]/30 shadow-md"
                                >
                                    <button
                                        type="button"
                                        role="tab"
                                        aria-selected={programTab === 'talleres'}
                                        onClick={() => setProgramTab('talleres')}
                                        className={`px-5 py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                                            programTab === 'talleres'
                                                ? 'bg-[#FFFDF7] text-[#A3363D] shadow-sm'
                                                : 'text-[#FFE9B8] hover:text-white'
                                        }`}
                                    >
                                        <span>🎨</span>
                                        <span>Talleres</span>
                                    </button>
                                    <button
                                        type="button"
                                        role="tab"
                                        aria-selected={programTab === 'foro'}
                                        onClick={() => setProgramTab('foro')}
                                        className={`px-5 py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                                            programTab === 'foro'
                                                ? 'bg-[#FFFDF7] text-[#3F6B45] shadow-sm'
                                                : 'text-[#FFE9B8] hover:text-white'
                                        }`}
                                    >
                                        <span>💬</span>
                                        <span>Foro de Dudas</span>
                                    </button>
                                </div>

                                <button
                                    type="button"
                                    onClick={() =>
                                        document
                                            .getElementById('agenda-por-dia')
                                            ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                                    }
                                    className="px-4 py-2.5 rounded-full bg-[#243E29] border border-[#FFE9B8]/40 text-[#FFE9B8] hover:bg-[#3F6B45] hover:text-white text-xs font-bold shadow-sm transition-colors"
                                >
                                    📁 Agenda por día
                                </button>
                            </div>
                        </div>

                        {programTab === 'talleres' ? (
                            <div role="tabpanel" aria-label="Lista y detalle de talleres">
                                <ClassSelector
                                    classes={classData}
                                    selectedClassId={selectedClassId}
                                    onSelectClass={setSelectedClassId}
                                    completedClassIds={completedClassIds}
                                    currentTime={currentTime}
                                />

                                <div className="max-w-4xl mx-auto">
                                    <ClassCard
                                        clase={selectedClass}
                                        currentTime={currentTime}
                                        onGoToClass={handleGoToClass}
                                        isCompleted={completedClassIds.includes(selectedClass.id)}
                                        onToggleComplete={toggleCompleteClass}
                                        studentSession={studentSession}
                                        isBlocked={Boolean(blockAlert)}
                                        onOpenClassForum={handleOpenClassForum}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div role="tabpanel" aria-label="Foro de dudas por clase">
                                <DoubtForum
                                    classes={classData}
                                    selectedClassId={selectedClassId}
                                    studentSession={studentSession}
                                    refreshTrigger={forumRefreshTrigger}
                                    externalWorkshopFilter={forumWorkshopFilter}
                                    onWorkshopFilterChange={setForumWorkshopFilter}
                                    onOpenTeacherReview={() => {
                                        setAdminInitialTab('forum');
                                        setAdminModalOpen(true);
                                    }}
                                />
                            </div>
                        )}
                    </section>

                    {/* Referencia rápida por días: carpetas físicas solapadas (23 NOV - 27 NOV) con colores alternados rojo/verde */}
                    <section
                        id="agenda-por-dia"
                        className="max-w-6xl mx-auto bg-[#FFFDF7] border border-[#E5DAC0] rounded-[22px] shadow-card-warm p-4 sm:p-6 md:p-8 scroll-mt-16"
                    >
                        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-6">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#3F6B45] mb-1">
                                    Referencia rápida
                                </p>
                                <h2 className="font-title italic text-2xl md:text-3xl font-bold text-[#A3363D]">
                                    Agenda de clases por día
                                </h2>
                            </div>
                            <p className="text-xs md:text-sm text-[#2B2B2B]/75">
                                Toca una pestaña para desplegar las clases del día (Hora Venezuela · VET)
                            </p>
                        </div>

                        {(() => {
                            const activeDayIndex = EVENT_DAYS.findIndex((d) => d.numero === openAgendaDay);
                            const activeDay = activeDayIndex >= 0 ? EVENT_DAYS[activeDayIndex] : null;
                            const activeIsRed = activeDayIndex >= 0 ? activeDayIndex % 2 === 0 : true;
                            const activeDayClasses = activeDay
                                ? classData.filter((c) =>
                                      c.date.toLowerCase().includes(activeDay.diaSemana.toLowerCase())
                                  )
                                : [];

                            const activeBorderClass = activeDay
                                ? activeIsRed
                                    ? 'border-[#A3363D]'
                                    : 'border-[#3F6B45]'
                                : 'border-[#D7C7A3]';
                            const activeAccentText = activeIsRed ? 'text-[#A3363D]' : 'text-[#3F6B45]';
                            const activeBadgeBg = activeIsRed
                                ? 'bg-[#A3363D]/15 text-[#A3363D]'
                                : 'bg-[#3F6B45]/15 text-[#2E4F35]';

                            return (
                                <div className="relative">
                                    {/* Fila de pestañas solapadas tipo archivador físico */}
                                    <div
                                        role="tablist"
                                        aria-label="Carpetas de agenda por día"
                                        className="flex items-end px-1 sm:px-2 overflow-x-auto no-scrollbar pt-2"
                                    >
                                        {EVENT_DAYS.map((day, dayIndex) => {
                                            const isRed = dayIndex % 2 === 0;
                                            const isOpen = openAgendaDay === day.numero;
                                            const overlapClass = dayIndex > 0 ? '-ml-2 sm:-ml-2.5' : '';
                                            const baseTabColors = isRed
                                                ? 'bg-[#A3363D] border-[#862B31] text-white'
                                                : 'bg-[#3F6B45] border-[#2E4F35] text-white';

                                            const zOrder = isOpen
                                                ? 'z-30 -translate-y-0.5 pb-3 pt-2.5 shadow-[0_-4px_12px_rgba(43,43,43,0.16)] ring-2 ring-[#FFE9B8]/70'
                                                : dayIndex === 0
                                                  ? 'z-20 pb-2 pt-2 opacity-95 hover:opacity-100 hover:-translate-y-0.5'
                                                  : dayIndex === 1
                                                    ? 'z-[18] pb-2 pt-2 opacity-95 hover:opacity-100 hover:-translate-y-0.5'
                                                    : dayIndex === 2
                                                      ? 'z-[16] pb-2 pt-2 opacity-95 hover:opacity-100 hover:-translate-y-0.5'
                                                      : dayIndex === 3
                                                        ? 'z-[14] pb-2 pt-2 opacity-95 hover:opacity-100 hover:-translate-y-0.5'
                                                        : 'z-[12] pb-2 pt-2 opacity-95 hover:opacity-100 hover:-translate-y-0.5';

                                            return (
                                                <button
                                                    key={day.numero}
                                                    type="button"
                                                    role="tab"
                                                    aria-selected={isOpen}
                                                    aria-controls="agenda-folder-sheet"
                                                    onClick={() =>
                                                        setOpenAgendaDay((prev) =>
                                                            prev === day.numero ? null : day.numero
                                                        )
                                                    }
                                                    className={`relative flex-1 min-w-[64px] px-2 sm:px-4 rounded-t-2xl border-t-2 border-x-2 font-extrabold text-[11px] sm:text-xs md:text-sm tracking-wide transition-all duration-150 flex items-center justify-center gap-1 whitespace-nowrap select-none cursor-pointer shadow-[-3px_0_8px_rgba(0,0,0,0.12)] ${overlapClass} ${baseTabColors} ${zOrder}`}
                                                >
                                                    <span>{day.numero} NOV</span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Cuerpo único del archivador físico con efecto de hojas apiladas */}
                                    <div className="relative z-20 -mt-[2px]">
                                        <div
                                            id="agenda-folder-sheet"
                                            role="tabpanel"
                                            className={`relative border-2 rounded-2xl bg-[#FBF5E6] overflow-hidden transition-colors shadow-[0_8px_22px_rgba(43,43,43,0.10)] ${activeBorderClass}`}
                                        >
                                            {!activeDay ? (
                                                <div className="px-4 py-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-gradient-to-b from-[#FFFDF7] to-[#FBF5E6]">
                                                    <div>
                                                        <p className="text-sm font-bold text-[#2B2B2B]">
                                                            Archivo de la 6ta Feria · Del 23 al 27 de noviembre
                                                        </p>
                                                        <p className="text-xs text-[#2B2B2B]/70 mt-0.5">
                                                            Presiona cualquier pestaña superior (<strong>23 NOV</strong> – <strong>27 NOV</strong>) para ver las clases de ese día.
                                                        </p>
                                                    </div>
                                                    <span className="text-xs font-bold text-[#3F6B45] shrink-0">
                                                        9 talleres · 5 días
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="p-4 sm:p-5 bg-[#FFFDF7] space-y-4">
                                                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E5DAC0]">
                                                        <div>
                                                            <p className={`text-xs font-extrabold uppercase tracking-wider ${activeAccentText}`}>
                                                                {activeDay.diaSemana} {activeDay.fechaCompleta}
                                                            </p>
                                                            <p className="text-xs text-[#2B2B2B]/75 mt-0.5">
                                                                {activeDayClasses.length}{' '}
                                                                {activeDayClasses.length === 1
                                                                    ? 'taller de cierre'
                                                                    : 'talleres programados'}{' '}
                                                                · {activeDay.estadoHorario}
                                                            </p>
                                                        </div>

                                                        <button
                                                            type="button"
                                                            onClick={() => setOpenAgendaDay(null)}
                                                            className="px-3 py-1 rounded-full bg-[#FBF5E6] border border-[#E5DAC0] hover:border-[#A3363D] text-[11px] font-bold text-[#2B2B2B]"
                                                        >
                                                            Cerrar
                                                        </button>
                                                    </div>

                                                    <div
                                                        className={`grid grid-cols-1 ${
                                                            activeDayClasses.length > 1 ? 'md:grid-cols-2' : ''
                                                        } gap-3`}
                                                    >
                                                        {activeDayClasses.map((clase) => {
                                                            const isSelected = clase.id === selectedClassId;
                                                            return (
                                                                <button
                                                                    key={clase.id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setSelectedClassId(clase.id);
                                                                        setProgramTab('talleres');
                                                                        document
                                                                            .getElementById('talleres-navidenos')
                                                                            ?.scrollIntoView({
                                                                                behavior: 'smooth',
                                                                                block: 'start',
                                                                            });
                                                                    }}
                                                                    className={`w-full text-left rounded-xl p-3.5 border transition-all flex items-start justify-between gap-3 ${
                                                                        isSelected
                                                                            ? `bg-[#FBF5E6] ${activeBorderClass} ring-1 ${
                                                                                  activeIsRed
                                                                                      ? 'ring-[#A3363D]/30'
                                                                                      : 'ring-[#3F6B45]/30'
                                                                              }`
                                                                            : 'bg-[#FBF5E6]/75 border-[#E5DAC0] hover:bg-[#FBF5E6] hover:border-[#2B2B2B]/30'
                                                                    }`}
                                                                >
                                                                    <div className="min-w-0 flex-1">
                                                                        <span
                                                                            className={`inline-block text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full mb-1.5 ${activeBadgeBg}`}
                                                                        >
                                                                            {clase.time} (VET)
                                                                        </span>
                                                                        <p className="text-sm font-bold text-[#2B2B2B] leading-snug">
                                                                            {clase.titulo.replace(/^Taller \d+:\s*/i, '')}
                                                                        </p>
                                                                        <p className={`text-xs font-semibold mt-1 ${activeAccentText}`}>
                                                                            Con {clase.ponentes.map((p) => p.nombre).join(', ')}
                                                                        </p>
                                                                    </div>
                                                                    <span
                                                                        aria-hidden="true"
                                                                        className={`text-xs font-bold shrink-0 self-center ${activeAccentText}`}
                                                                    >
                                                                        Ver →
                                                                    </span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        {/* Capas inferiores simulando carpetas físicas apiladas */}
                                        <div
                                            aria-hidden="true"
                                            className="mx-2 h-1.5 rounded-b-xl bg-[#F3E9D2] border-x border-b border-[#D7C7A3]"
                                        />
                                        <div
                                            aria-hidden="true"
                                            className="mx-4 h-1.5 rounded-b-xl bg-[#EADCB9] border-x border-b border-[#D7C7A3]"
                                        />
                                    </div>
                                </div>
                            );
                        })()}
                    </section>

                    {/* Qué incluye */}
                    <section className="max-w-6xl mx-auto">
                        <div className="bg-[#FFFDF7] border border-[#E5DAC0] rounded-[22px] shadow-card-warm p-6 md:p-8">
                            <div className="mb-5">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#3F6B45] mb-1">
                                    Qué incluye
                                </p>
                                <h2 className="font-title italic text-2xl md:text-3xl font-bold text-[#A3363D]">
                                    Con tu inscripción recibes
                                </h2>
                            </div>
                            <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {EVENT_INCLUDES.map((item, index) => (
                                    <li
                                        key={index}
                                        className="p-4 rounded-2xl bg-[#FBF5E6] border border-[#E5DAC0] flex items-start gap-3.5"
                                    >
                                        <span className="font-title text-2xl font-bold text-[#A3363D] min-w-[2rem] text-center leading-tight">
                                            {item.highlight}
                                        </span>
                                        <span className="text-[#2B2B2B] text-sm">{item.text}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </section>
                </main>

                <Footer
                    onOpenAdmin={() => {
                        setAdminInitialTab('students');
                        setAdminModalOpen(true);
                    }}
                />
            </div>

            <StudentAccessModal
                isOpen={accessModalOpen}
                onClose={() => setAccessModalOpen(false)}
                studentSession={studentSession}
                blockAlert={blockAlert}
                targetClassTitle={targetClassTitle}
                onVerified={handleStudentVerified}
                onBlocked={handleStudentBlocked}
                onClearBlock={() => setBlockAlert(null)}
                onLogout={handleStudentLogout}
            />

            <AdminPortalModal
                isOpen={adminModalOpen}
                onClose={() => setAdminModalOpen(false)}
                initialTab={adminInitialTab}
                onForumUpdated={() => setForumRefreshTrigger((prev) => prev + 1)}
            />
        </div>
    );
};

export default App;