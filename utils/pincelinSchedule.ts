import type { Clase, RecordingStatusMap } from '../types';

export type PincelinFairPhase =
    | 'live'
    | 'before_event'
    | 'between_classes'
    | 'finished';

export interface PincelinPositionInfo {
    phase: PincelinFairPhase;
    pincelinIndex: number;
    pincelinClass: Clase;
    liveClass: Clase | null;
    lastFinishedClass: Clase | null;
    nextUpcomingClass: Clase | null;
    isPincelinRecordingReady: boolean;
    readyRecordingsCount: number;
    statusBadgeText: string;
    scheduleHintText: string;
}

/**
 * Devuelve la fecha calendario YYYY-MM-DD en hora oficial de Venezuela (VET, UTC-4).
 */
export function getVenezuelaDateKey(date: Date): string {
    const vetMs = date.getTime() - 4 * 60 * 60 * 1000;
    return new Date(vetMs).toISOString().slice(0, 10);
}

/**
 * Determina la posición real de Pincelín en la Ruta Navideña verificando:
 * 1) Si alguna clase está transmitiéndose EN VIVO en este instante.
 * 2) Día y hora exactos (VET) respecto al calendario oficial de talleres.
 * 3) Estado de grabaciones disponibles sin mover falsamente a Pincelín a talleres futuros.
 */
export function resolvePincelinPosition(
    classes: Clase[],
    currentTime: Date,
    recordingStatuses: RecordingStatusMap = {}
): PincelinPositionInfo {
    const fallbackClass = classes[0];
    const readyRecordingsCount = classes.reduce(
        (acc, c) => acc + (recordingStatuses[c.id] ? 1 : 0),
        0
    );

    const liveIndex = classes.findIndex(
        (c) =>
            Boolean(c.horarioConfirmado && c.startTime && c.endTime) &&
            currentTime >= c.startTime! &&
            currentTime <= c.endTime!
    );

    if (liveIndex >= 0) {
        const liveClass = classes[liveIndex];
        return {
            phase: 'live',
            pincelinIndex: liveIndex,
            pincelinClass: liveClass,
            liveClass,
            lastFinishedClass: liveIndex > 0 ? classes[liveIndex - 1] : null,
            nextUpcomingClass: liveIndex < classes.length - 1 ? classes[liveIndex + 1] : null,
            isPincelinRecordingReady: Boolean(recordingStatuses[liveClass.id]),
            readyRecordingsCount,
            statusBadgeText: 'CLASE EN VIVO',
            scheduleHintText: `${liveClass.date} · ${liveClass.time} (VET) · Transmitiendo ahora`,
        };
    }

    const firstConfirmed = classes.find((c) => c.horarioConfirmado && c.startTime);
    const lastConfirmed = [...classes].reverse().find((c) => c.horarioConfirmado && c.endTime);

    if (firstConfirmed?.startTime && currentTime < firstConfirmed.startTime) {
        const firstIndex = Math.max(0, classes.findIndex((c) => c.id === firstConfirmed.id));
        const pincelinClass = classes[firstIndex] || fallbackClass;
        return {
            phase: 'before_event',
            pincelinIndex: firstIndex,
            pincelinClass,
            liveClass: null,
            lastFinishedClass: null,
            nextUpcomingClass: pincelinClass,
            isPincelinRecordingReady: Boolean(recordingStatuses[pincelinClass.id]),
            readyRecordingsCount,
            statusBadgeText: 'Próximo inicio',
            scheduleHintText: `Inicia el ${pincelinClass.date} · ${pincelinClass.time} (VET)`,
        };
    }

    if (lastConfirmed?.endTime && currentTime > lastConfirmed.endTime) {
        const lastIndex = classes.findIndex((c) => c.id === lastConfirmed.id);
        const pincelinIndex = lastIndex >= 0 ? lastIndex : classes.length - 1;
        const pincelinClass = classes[pincelinIndex] || fallbackClass;
        return {
            phase: 'finished',
            pincelinIndex,
            pincelinClass,
            liveClass: null,
            lastFinishedClass: pincelinClass,
            nextUpcomingClass: null,
            isPincelinRecordingReady: Boolean(recordingStatuses[pincelinClass.id]),
            readyRecordingsCount,
            statusBadgeText:
                readyRecordingsCount === classes.length
                    ? 'Grabaciones completas'
                    : 'Feria finalizada',
            scheduleHintText:
                readyRecordingsCount > 0
                    ? `${readyRecordingsCount} de ${classes.length} grabaciones disponibles para siempre`
                    : 'Todos los talleres concluyeron · Acceso a grabaciones en plataforma',
        };
    }

    let lastFinishedIndex = -1;
    let nextUpcomingIndex = -1;

    classes.forEach((c, idx) => {
        if (c.horarioConfirmado && c.endTime && currentTime > c.endTime) {
            lastFinishedIndex = idx;
        }
        if (
            nextUpcomingIndex === -1 &&
            c.horarioConfirmado &&
            c.startTime &&
            currentTime < c.startTime
        ) {
            nextUpcomingIndex = idx;
        }
    });

    const pincelinIndex =
        lastFinishedIndex >= 0
            ? lastFinishedIndex
            : nextUpcomingIndex >= 0
              ? nextUpcomingIndex
              : 0;
    const pincelinClass = classes[pincelinIndex] || fallbackClass;
    const lastFinishedClass = lastFinishedIndex >= 0 ? classes[lastFinishedIndex] : null;
    const nextUpcomingClass = nextUpcomingIndex >= 0 ? classes[nextUpcomingIndex] : null;
    const isPincelinRecordingReady = Boolean(recordingStatuses[pincelinClass.id]);

    let statusBadgeText = 'Próxima clase';
    if (isPincelinRecordingReady) {
        statusBadgeText = 'Grabación disponible';
    } else if (lastFinishedClass) {
        statusBadgeText = 'Clase finalizada · Pronto grabación';
    }

    let scheduleHintText = pincelinClass.horarioConfirmado
        ? `${pincelinClass.date} · ${pincelinClass.time} (VET)`
        : 'Horario oficial por confirmar';

    if (nextUpcomingClass?.startTime) {
        const nowVetDay = getVenezuelaDateKey(currentTime);
        const tomorrowVetDay = getVenezuelaDateKey(
            new Date(currentTime.getTime() + 24 * 60 * 60 * 1000)
        );
        const nextVetDay = getVenezuelaDateKey(nextUpcomingClass.startTime);

        if (nextVetDay === nowVetDay) {
            scheduleHintText = `Próxima clase hoy · ${nextUpcomingClass.time} (Taller ${nextUpcomingIndex + 1})`;
        } else if (nextVetDay === tomorrowVetDay) {
            scheduleHintText = `Próxima clase mañana · ${nextUpcomingClass.time} (Taller ${nextUpcomingIndex + 1})`;
        } else {
            scheduleHintText = `Próxima clase: ${nextUpcomingClass.date} · ${nextUpcomingClass.time}`;
        }
    }

    return {
        phase: 'between_classes',
        pincelinIndex,
        pincelinClass,
        liveClass: null,
        lastFinishedClass,
        nextUpcomingClass,
        isPincelinRecordingReady,
        readyRecordingsCount,
        statusBadgeText,
        scheduleHintText,
    };
}
