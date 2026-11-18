import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import {
    appendLocalActivityLog,
    getLocalAdminEntry,
    getSavedStudentSession,
    isLocalAdminValid,
    isLocalOwnerAdminValid,
} from './accessService';
import type { ForumQuestion, ForumReply } from '../types';

const FORUM_LOCAL_KEY = 'territorio_canva_6ta_forum_v1';

const SEED_QUESTIONS: ForumQuestion[] = [
    {
        id: 'seed-q-1',
        workshopId: 'clase-9',
        workshopTitle: 'Taller 9: Diseños para sublimar franelas familiares con motivo navideño',
        authorName: 'María Fernanda R.',
        title: '¿En qué formato debo descargar los diseños de Canva para sublimar?',
        body: 'Quiero saber si conviene exportarlos en PNG con fondo transparente o en PDF para impresión en la estampadora.',
        status: 'answered',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
        replies: [
            {
                id: 'seed-r-1',
                questionId: 'seed-q-1',
                authorName: 'Lisbeth Mora · Colaboradora',
                authorRole: 'teacher',
                body: 'Lo ideal es exportar en PNG de alta resolución (o PDF para impresión en CMYK/RGB según tu impresora) y activar el modo espejo al imprimir en papel de sublimación. En el taller veremos el paso a paso completo.',
                isOfficial: true,
                createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
            },
        ],
    },
    {
        id: 'seed-q-2',
        workshopId: 'clase-7',
        workshopTitle: 'Taller 7: Calendario de adviento',
        authorName: 'Carolina Díaz',
        title: '¿Las plantillas del calendario de adviento funcionan con Canva gratuito?',
        body: 'Aún no tengo Canva Pro y quiero saber si podré editar todos los elementos incluidos en el bono.',
        status: 'pending',
        createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
        replies: [],
    },
];

function readLocalQuestions(): ForumQuestion[] {
    try {
        const raw = localStorage.getItem(FORUM_LOCAL_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as ForumQuestion[];
            if (Array.isArray(parsed)) return parsed;
        }
    } catch {
        // Fallback a ejemplos iniciales
    }
    writeLocalQuestions(SEED_QUESTIONS);
    return SEED_QUESTIONS;
}

function writeLocalQuestions(questions: ForumQuestion[]): void {
    try {
        localStorage.setItem(FORUM_LOCAL_KEY, JSON.stringify(questions));
    } catch {
        // Ignorar errores de cuota
    }
}

export async function fetchForumQuestions(): Promise<ForumQuestion[]> {
    if (isSupabaseConfigured && supabase) {
        const primaryQ = await supabase
            .from('forum_questions')
            .select('id, workshop_id, workshop_title, author_name, country_code, title, body, status, created_at')
            .order('created_at', { ascending: false })
            .limit(100);

        let qRows: Array<Record<string, unknown>> | null = primaryQ.data as Array<Record<string, unknown>> | null;
        let qError = primaryQ.error;

        if (qError && String(qError.message || '').includes('country_code')) {
            const fallbackQ = await supabase
                .from('forum_questions')
                .select('id, workshop_id, workshop_title, author_name, title, body, status, created_at')
                .order('created_at', { ascending: false })
                .limit(100);
            qRows = fallbackQ.data as Array<Record<string, unknown>> | null;
            qError = fallbackQ.error;
        }

        if (qError || !qRows) {
            return readLocalQuestions();
        }

        const questionIds = qRows.map((q) => q.id);
        let repliesByQuestion: Record<string, ForumReply[]> = {};

        if (questionIds.length > 0) {
            const primaryR = await supabase
                .from('forum_replies')
                .select('id, question_id, author_name, author_role, author_admin_id, country_code, body, is_official, created_at')
                .in('question_id', questionIds)
                .order('created_at', { ascending: true });

            let rRows: Array<Record<string, unknown>> | null = primaryR.data as Array<Record<string, unknown>> | null;
            if (primaryR.error && String(primaryR.error.message || '').includes('country_code')) {
                const fallbackR = await supabase
                    .from('forum_replies')
                    .select('id, question_id, author_name, author_role, author_admin_id, body, is_official, created_at')
                    .in('question_id', questionIds)
                    .order('created_at', { ascending: true });
                rRows = fallbackR.data as Array<Record<string, unknown>> | null;
            }
            if (rRows) {
                repliesByQuestion = rRows.reduce<Record<string, ForumReply[]>>((acc, r) => {
                    const qId = String(r.question_id);
                    if (!acc[qId]) acc[qId] = [];
                    acc[qId].push({
                        id: String(r.id),
                        questionId: qId,
                        authorName: String(r.author_name || ''),
                        authorRole: r.author_role === 'teacher' ? 'teacher' : 'student',
                        authorAdminId: r.author_admin_id ? String(r.author_admin_id) : undefined,
                        countryCode: r.country_code ? String(r.country_code).toUpperCase() : undefined,
                        body: String(r.body || ''),
                        isOfficial: Boolean(r.is_official),
                        createdAt: String(r.created_at || ''),
                    });
                    return acc;
                }, {});
            }
        }

        return qRows.map((q) => ({
            id: String(q.id),
            workshopId: String(q.workshop_id || ''),
            workshopTitle: String(q.workshop_title || ''),
            authorName: String(q.author_name || ''),
            countryCode: q.country_code ? String(q.country_code).toUpperCase() : undefined,
            title: String(q.title || ''),
            body: String(q.body || ''),
            status: q.status === 'answered' ? 'answered' : 'pending',
            createdAt: String(q.created_at || ''),
            replies: repliesByQuestion[String(q.id)] || [],
        }));
    }

    return readLocalQuestions();
}

export async function createForumQuestion(params: {
    workshopId: string;
    workshopTitle: string;
    authorName: string;
    authorEmail?: string;
    title: string;
    body: string;
    countryOverride?: string;
}): Promise<{ ok: boolean; question?: ForumQuestion; message?: string }> {
    const cleanAuthor = params.authorName.trim();
    const cleanTitle = params.title.trim();
    const cleanBody = params.body.trim();

    if (!cleanAuthor || !cleanTitle) {
        return { ok: false, message: 'Escribe tu nombre y el título de tu duda.' };
    }

    if (isSupabaseConfigured) {
        try {
            const apiRes = await fetch('/api/verify-access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'create_forum_question',
                    workshopId: params.workshopId || 'general',
                    workshopTitle: params.workshopTitle || 'Consulta general',
                    authorName: cleanAuthor,
                    authorEmail: (params.authorEmail || '').trim().toLowerCase(),
                    title: cleanTitle,
                    body: cleanBody,
                }),
            });
            const data = (await apiRes.json()) as {
                ok?: boolean;
                needsSchemaUpdate?: boolean;
                question?: ForumQuestion;
                message?: string;
            };

            if (!data.needsSchemaUpdate) {
                if (data.ok && data.question) {
                    return { ok: true, question: data.question };
                }
                return {
                    ok: false,
                    message: data.message || 'No pudimos publicar tu duda en este momento. Inténtalo de nuevo.',
                };
            }
        } catch {
            // Si falla la ruta API, intenta respaldo directo abajo si supabase existe
        }

        if (supabase) {
            const { data, error } = await supabase
                .from('forum_questions')
                .insert({
                    workshop_id: params.workshopId || 'general',
                    workshop_title: params.workshopTitle || 'Consulta general',
                    author_name: cleanAuthor,
                    author_email: (params.authorEmail || '').trim().toLowerCase(),
                    title: cleanTitle,
                    body: cleanBody,
                    status: 'pending',
                })
                .select('id, workshop_id, workshop_title, author_name, title, body, status, created_at')
                .single();

            if (!error && data) {
                return {
                    ok: true,
                    question: {
                        id: String(data.id),
                        workshopId: data.workshop_id,
                        workshopTitle: data.workshop_title,
                        authorName: data.author_name,
                        title: data.title,
                        body: data.body || '',
                        status: 'pending',
                        createdAt: data.created_at,
                        replies: [],
                    },
                };
            }
        }

        return { ok: false, message: 'No pudimos publicar tu duda en este momento. Inténtalo de nuevo.' };
    }

    const sessionCountry = getSavedStudentSession()?.primaryCountry || '';
    const countryCode = (params.countryOverride || sessionCountry).trim().toUpperCase() || undefined;
    const nowIso = new Date().toISOString();

    const newQuestion: ForumQuestion = {
        id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        workshopId: params.workshopId || 'general',
        workshopTitle: params.workshopTitle || 'Consulta general',
        authorName: cleanAuthor,
        countryCode,
        title: cleanTitle,
        body: cleanBody,
        status: 'pending',
        createdAt: nowIso,
        replies: [],
    };

    const current = readLocalQuestions();
    writeLocalQuestions([newQuestion, ...current]);
    appendLocalActivityLog({
        eventType: 'forum_question',
        actorEmail: params.authorEmail || getSavedStudentSession()?.email || '',
        actorName: cleanAuthor,
        workshopId: newQuestion.workshopId,
        countryCode,
        createdAt: nowIso,
    });
    return { ok: true, question: newQuestion };
}

export async function addStudentForumReply(params: {
    questionId: string;
    authorName: string;
    body: string;
    countryOverride?: string;
}): Promise<{ ok: boolean; reply?: ForumReply; message?: string }> {
    const cleanAuthor = params.authorName.trim();
    const cleanBody = params.body.trim();

    if (!cleanAuthor || !cleanBody) {
        return { ok: false, message: 'Escribe tu nombre y tu comentario.' };
    }

    if (isSupabaseConfigured) {
        try {
            const apiRes = await fetch('/api/verify-access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'add_student_forum_reply',
                    questionId: params.questionId,
                    authorName: cleanAuthor,
                    body: cleanBody,
                }),
            });
            const data = (await apiRes.json()) as {
                ok?: boolean;
                needsSchemaUpdate?: boolean;
                reply?: ForumReply;
                message?: string;
            };

            if (!data.needsSchemaUpdate) {
                if (data.ok && data.reply) {
                    return { ok: true, reply: data.reply };
                }
                return {
                    ok: false,
                    message: data.message || 'No pudimos guardar tu comentario en el hilo.',
                };
            }
        } catch {
            // Intenta respaldo directo abajo
        }

        if (supabase) {
            const { data, error } = await supabase
                .from('forum_replies')
                .insert({
                    question_id: params.questionId,
                    author_name: cleanAuthor,
                    author_role: 'student',
                    body: cleanBody,
                    is_official: false,
                })
                .select('id, question_id, author_name, author_role, body, is_official, created_at')
                .single();

            if (!error && data) {
                return {
                    ok: true,
                    reply: {
                        id: String(data.id),
                        questionId: String(data.question_id),
                        authorName: data.author_name,
                        authorRole: 'student',
                        body: data.body,
                        isOfficial: false,
                        createdAt: data.created_at,
                    },
                };
            }
        }

        return { ok: false, message: 'No pudimos guardar tu comentario en el hilo.' };
    }

    const savedStudent = getSavedStudentSession();
    const countryCode = (params.countryOverride || savedStudent?.primaryCountry || '').trim().toUpperCase() || undefined;
    const nowIso = new Date().toISOString();

    const newReply: ForumReply = {
        id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        questionId: params.questionId,
        authorName: cleanAuthor,
        authorRole: 'student',
        countryCode,
        body: cleanBody,
        isOfficial: false,
        createdAt: nowIso,
    };

    const current = readLocalQuestions();
    const targetQ = current.find((q) => q.id === params.questionId);
    const updated = current.map((q) =>
        q.id === params.questionId ? { ...q, replies: [...q.replies, newReply] } : q
    );
    writeLocalQuestions(updated);
    appendLocalActivityLog({
        eventType: 'forum_reply',
        actorEmail: savedStudent?.email || '',
        actorName: cleanAuthor,
        workshopId: targetQ?.workshopId || '',
        countryCode,
        createdAt: nowIso,
    });
    return { ok: true, reply: newReply };
}

export async function adminReplyForumQuestion(params: {
    adminEmail: string;
    accessKey: string;
    questionId: string;
    teacherName: string;
    replyBody: string;
    countryOverride?: string;
}): Promise<{ ok: boolean; reply?: ForumReply; message?: string }> {
    const cleanTeacher = params.teacherName.trim() || 'Profesor / Colaborador';
    const cleanBody = params.replyBody.trim();

    if (!cleanBody) {
        return { ok: false, message: 'Escribe la respuesta antes de enviarla.' };
    }

    if (isSupabaseConfigured) {
        const res = await fetch('/api/admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'reply_forum_question',
                adminEmail: params.adminEmail,
                accessKey: params.accessKey,
                questionId: params.questionId,
                teacherName: cleanTeacher,
                replyBody: cleanBody,
            }),
        });
        return (await res.json()) as { ok: boolean; reply?: ForumReply; message?: string };
    }

    if (!isLocalAdminValid(params.adminEmail, params.accessKey)) {
        return {
            ok: false,
            message: 'Solo administradores o profesores activos pueden publicar respuestas oficiales.',
        };
    }

    const adminEntry = getLocalAdminEntry(params.adminEmail, params.accessKey);
    const countryCode = (params.countryOverride || '').trim().toUpperCase() || undefined;
    const nowIso = new Date().toISOString();
    const newReply: ForumReply = {
        id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        questionId: params.questionId,
        authorName: cleanTeacher,
        authorRole: 'teacher',
        authorAdminId: adminEntry?.id,
        authorEmail: params.adminEmail.trim().toLowerCase(),
        countryCode,
        body: cleanBody,
        isOfficial: true,
        createdAt: nowIso,
    };

    const current = readLocalQuestions();
    const targetQ = current.find((q) => q.id === params.questionId);
    const updated = current.map((q) =>
        q.id === params.questionId
            ? { ...q, status: 'answered' as const, replies: [...q.replies, newReply] }
            : q
    );
    writeLocalQuestions(updated);
    appendLocalActivityLog({
        eventType: 'forum_reply',
        actorEmail: params.adminEmail.trim().toLowerCase(),
        actorName: cleanTeacher,
        workshopId: targetQ?.workshopId || '',
        countryCode,
        createdAt: nowIso,
    });
    return { ok: true, reply: newReply };
}

export async function adminDeleteForumQuestion(params: {
    adminEmail: string;
    accessKey: string;
    questionId: string;
}): Promise<{ ok: boolean; message?: string }> {
    if (isSupabaseConfigured) {
        const res = await fetch('/api/admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'delete_forum_question',
                adminEmail: params.adminEmail,
                accessKey: params.accessKey,
                questionId: params.questionId,
            }),
        });
        return (await res.json()) as { ok: boolean; message?: string };
    }

    if (!isLocalOwnerAdminValid(params.adminEmail, params.accessKey)) {
        return { ok: false, message: 'Solo los organizadores de la feria pueden eliminar preguntas del foro.' };
    }

    const current = readLocalQuestions();
    writeLocalQuestions(current.filter((q) => q.id !== params.questionId));
    return { ok: true };
}

export async function adminUpdateForumQuestion(params: {
    adminEmail: string;
    accessKey: string;
    questionId: string;
    title: string;
    body: string;
    authorName?: string;
}): Promise<{ ok: boolean; message?: string }> {
    const cleanTitle = params.title.trim();
    const cleanBody = params.body.trim();
    const cleanAuthor = params.authorName?.trim();

    if (!cleanTitle) {
        return { ok: false, message: 'El título de la consulta no puede estar vacío.' };
    }

    if (isSupabaseConfigured) {
        const res = await fetch('/api/admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update_forum_question',
                adminEmail: params.adminEmail,
                accessKey: params.accessKey,
                questionId: params.questionId,
                title: cleanTitle,
                body: cleanBody,
                authorName: cleanAuthor || '',
            }),
        });
        return (await res.json()) as { ok: boolean; message?: string };
    }

    if (!isLocalOwnerAdminValid(params.adminEmail, params.accessKey)) {
        return { ok: false, message: 'Solo los organizadores de la feria pueden editar preguntas del foro.' };
    }

    const current = readLocalQuestions();
    writeLocalQuestions(
        current.map((q) =>
            q.id === params.questionId
                ? {
                      ...q,
                      title: cleanTitle,
                      body: cleanBody,
                      authorName: cleanAuthor || q.authorName,
                  }
                : q
        )
    );
    return { ok: true };
}

export async function adminUpdateForumReply(params: {
    adminEmail: string;
    accessKey: string;
    questionId: string;
    replyId: string;
    body: string;
}): Promise<{ ok: boolean; message?: string }> {
    const cleanBody = params.body.trim();
    if (!cleanBody) {
        return { ok: false, message: 'El comentario no puede quedar vacío.' };
    }

    if (isSupabaseConfigured) {
        const res = await fetch('/api/admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update_forum_reply',
                adminEmail: params.adminEmail,
                accessKey: params.accessKey,
                replyId: params.replyId,
                body: cleanBody,
            }),
        });
        return (await res.json()) as { ok: boolean; message?: string };
    }

    if (!isLocalAdminValid(params.adminEmail, params.accessKey)) {
        return { ok: false, message: 'Acceso no autorizado.' };
    }

    const isOwner = isLocalOwnerAdminValid(params.adminEmail, params.accessKey);
    const callerEntry = getLocalAdminEntry(params.adminEmail, params.accessKey);
    const cleanEmail = params.adminEmail.trim().toLowerCase();

    const current = readLocalQuestions();
    const targetQuestion = current.find((q) => q.id === params.questionId);
    const targetReply = targetQuestion?.replies.find((r) => r.id === params.replyId);

    if (!targetReply) {
        return { ok: false, message: 'No encontramos el comentario en el hilo.' };
    }

    if (!isOwner) {
        const ownsReply =
            (Boolean(targetReply.authorAdminId) &&
                Boolean(callerEntry?.id) &&
                targetReply.authorAdminId === callerEntry?.id) ||
            (Boolean(targetReply.authorEmail) &&
                targetReply.authorEmail!.toLowerCase() === cleanEmail);
        if (!ownsReply) {
            return {
                ok: false,
                message: 'Solo puedes editar tus propias respuestas oficiales.',
            };
        }
    }

    writeLocalQuestions(
        current.map((q) =>
            q.id === params.questionId
                ? {
                      ...q,
                      replies: q.replies.map((r) =>
                          r.id === params.replyId ? { ...r, body: cleanBody } : r
                      ),
                  }
                : q
        )
    );
    return { ok: true };
}

export async function adminDeleteForumReply(params: {
    adminEmail: string;
    accessKey: string;
    questionId: string;
    replyId: string;
}): Promise<{ ok: boolean; message?: string }> {
    if (isSupabaseConfigured) {
        const res = await fetch('/api/admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'delete_forum_reply',
                adminEmail: params.adminEmail,
                accessKey: params.accessKey,
                replyId: params.replyId,
            }),
        });
        return (await res.json()) as { ok: boolean; message?: string };
    }

    if (!isLocalOwnerAdminValid(params.adminEmail, params.accessKey)) {
        return { ok: false, message: 'Solo los organizadores de la feria pueden eliminar comentarios del hilo.' };
    }

    const current = readLocalQuestions();
    writeLocalQuestions(
        current.map((q) =>
            q.id === params.questionId
                ? { ...q, replies: q.replies.filter((r) => r.id !== params.replyId) }
                : q
        )
    );
    return { ok: true };
}

