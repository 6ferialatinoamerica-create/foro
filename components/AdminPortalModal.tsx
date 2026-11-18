import React, { useState, useEffect, useCallback } from 'react';
import { classData } from '../constants';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import {
    bulkUpsertAdminStudents,
    changeAdminPassword,
    clearAdminCredentialsLocally,
    deleteAdminAccount,
    deleteAdminStudent,
    fetchAdminDashboard,
    getSavedAdminCredentials,
    registerAdminAccount,
    requestCollaboratorAccess,
    resetAdminStudentDevices,
    reviewCollaboratorRequest,
    saveAdminCredentialsLocally,
    toggleWorkshopRecording,
    updateAdminRole,
    upsertAdminStudent,
    verifyAdminAccess,
} from '../services/accessService';
import {
    downloadStudentsTemplate,
    parseStudentsSpreadsheet,
    type ParsedStudentImportRow,
} from '../utils/spreadsheetImport';
import {
    adminDeleteForumQuestion,
    adminDeleteForumReply,
    adminReplyForumQuestion,
    adminUpdateForumQuestion,
    adminUpdateForumReply,
    fetchForumQuestions,
} from '../services/forumService';
import type {
    AdminRole,
    AdminStudentRecord,
    AdminUserSummary,
    DeviceAccessAlert,
    ForumQuestion,
    RecordingStatusMap,
    SavedAdminCredentials,
} from '../types';

interface AdminPortalModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialTab?: 'students' | 'alerts' | 'forum' | 'recordings';
    onForumUpdated?: () => void;
    onRecordingsUpdated?: () => void;
    onAdminSessionChange?: (session: SavedAdminCredentials | null) => void;
}

const normalizeAdminRole = (role: unknown): AdminRole =>
    role === 'teacher' ? 'teacher' : role === 'support' ? 'support' : 'owner';

const getRoleHeaderLabel = (role: AdminRole): string => {
    if (role === 'owner') return 'Dueño/a (Acceso total)';
    if (role === 'support') return 'Soporte (Apoyo logístico)';
    return 'Profesor/a (Solo Foro)';
};

const generateRandomPassword = () => {
    const num = Math.floor(1000 + Math.random() * 9000);
    return `Canva${num}`;
};

const AdminPortalModal: React.FC<AdminPortalModalProps> = ({
    isOpen,
    onClose,
    initialTab = 'students',
    onForumUpdated,
    onRecordingsUpdated,
    onAdminSessionChange,
}) => {
    const [authMode, setAuthMode] = useState<'login' | 'collaborator' | 'register'>('login');
    const [adminId, setAdminId] = useState('');
    const [adminEmail, setAdminEmail] = useState('');
    const [accessKey, setAccessKey] = useState('');
    const [confirmAccessKey, setConfirmAccessKey] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [requesterEmail, setRequesterEmail] = useState('');
    const [requesterKey, setRequesterKey] = useState('');
    const [rememberCredentials, setRememberCredentials] = useState(true);
    const [showKey, setShowKey] = useState(false);

    // Solicitud de colaboradora / profesora
    const [collabName, setCollabName] = useState('');
    const [collabEmail, setCollabEmail] = useState('');
    const [collabKeyMode, setCollabKeyMode] = useState<'classonlive' | 'custom'>('classonlive');
    const [collabKey, setCollabKey] = useState('');
    const [collabConfirmKey, setCollabConfirmKey] = useState('');
    const [collabNotice, setCollabNotice] = useState<string | null>(null);

    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [pendingPasswordChange, setPendingPasswordChange] = useState(false);
    const [newPersonalPassword, setNewPersonalPassword] = useState('');
    const [confirmPersonalPassword, setConfirmPersonalPassword] = useState('');
    const [adminRole, setAdminRole] = useState<AdminRole>('owner');
    const [authLoading, setAuthLoading] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);
    const [authSuccessNotice, setAuthSuccessNotice] = useState<string | null>(null);
    const [hasSavedCreds, setHasSavedCreds] = useState(false);

    const [activeTab, setActiveTab] = useState<'students' | 'alerts' | 'forum' | 'recordings' | 'admins'>(
        initialTab
    );
    const [students, setStudents] = useState<AdminStudentRecord[]>([]);
    const [alerts, setAlerts] = useState<DeviceAccessAlert[]>([]);
    const [admins, setAdmins] = useState<AdminUserSummary[]>([]);
    const [recordingsMap, setRecordingsMap] = useState<RecordingStatusMap>({});
    const [togglingWorkshopId, setTogglingWorkshopId] = useState<string | null>(null);
    const [updatingRoleAdminId, setUpdatingRoleAdminId] = useState<string | null>(null);
    const [forumQuestions, setForumQuestions] = useState<ForumQuestion[]>([]);
    const [forumFilter, setForumFilter] = useState<'pending' | 'all'>('pending');
    const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
    const [teacherReplyName, setTeacherReplyName] = useState('');
    const [sendingReplyId, setSendingReplyId] = useState<string | null>(null);
    const [dashboardLoading, setDashboardLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

    // Alta / edición de alumna
    const [stuFullName, setStuFullName] = useState('');
    const [stuEmail, setStuEmail] = useState('');
    const [stuPassword, setStuPassword] = useState('');
    const [stuUrl, setStuUrl] = useState('');
    const [stuMaxDevices, setStuMaxDevices] = useState(2);
    const [stuActive, setStuActive] = useState(true);
    const [bulkText, setBulkText] = useState('');
    const [showBulkImport, setShowBulkImport] = useState(false);
    const [importFileName, setImportFileName] = useState('');
    const [parsedImportRows, setParsedImportRows] = useState<ParsedStudentImportRow[]>([]);
    const [importSkippedCount, setImportSkippedCount] = useState(0);
    const [importPendingCount, setImportPendingCount] = useState(0);
    const [isImportingFile, setIsImportingFile] = useState(false);

    // Registro de nuevo administrador o profesor desde el panel autenticado
    const [newAdminName, setNewAdminName] = useState('');
    const [newAdminEmail, setNewAdminEmail] = useState('');
    const [newAdminKey, setNewAdminKey] = useState('');
    const [newAdminRole, setNewAdminRole] = useState<AdminRole>('owner');
    const [newAdminMustChange, setNewAdminMustChange] = useState(true);

    // Confirmaciones inline para eliminar alumnas o administradores
    const [confirmDeleteStudentId, setConfirmDeleteStudentId] = useState<string | null>(null);
    const [confirmDeleteAdminId, setConfirmDeleteAdminId] = useState<string | null>(null);

    // Edición inline de dudas y comentarios de alumnos en el foro
    const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
    const [editQuestionAuthor, setEditQuestionAuthor] = useState('');
    const [editQuestionTitle, setEditQuestionTitle] = useState('');
    const [editQuestionBody, setEditQuestionBody] = useState('');
    const [savingQuestionEdit, setSavingQuestionEdit] = useState(false);

    const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
    const [editReplyBody, setEditReplyBody] = useState('');
    const [savingReplyEdit, setSavingReplyEdit] = useState(false);

    const loadDashboard = useCallback(async (email: string, key: string) => {
        setDashboardLoading(true);
        const [res, forumList] = await Promise.all([
            fetchAdminDashboard({ adminEmail: email, accessKey: key }),
            fetchForumQuestions(),
        ]);
        setDashboardLoading(false);
        setForumQuestions(forumList);
        if (res.ok) {
            if (res.adminId) setAdminId(res.adminId);
            const resolvedRole = normalizeAdminRole(res.role);
            setAdminRole(resolvedRole);
            if (resolvedRole === 'teacher') {
                setActiveTab('forum');
            }
            setStudents(res.students || []);
            setAlerts(res.alerts || []);
            setAdmins(res.admins || []);
            setRecordingsMap(res.recordings || {});
        } else {
            setFeedbackMsg(res.message || 'No se pudo cargar la información.');
        }
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        setActiveTab(initialTab);
        const saved = getSavedAdminCredentials();
        if (saved && saved.remember) {
            if (saved.adminId) setAdminId(saved.adminId);
            setAdminEmail(saved.email);
            setAccessKey(saved.accessKey);
            setDisplayName(saved.displayName);
            setAdminRole(normalizeAdminRole(saved.role));
            setTeacherReplyName((prev) => prev || saved.displayName);
            setRememberCredentials(true);
            setHasSavedCreds(true);
            setAuthMode('login');
        } else {
            setHasSavedCreds(false);
        }
        setPendingPasswordChange(false);
        setNewPersonalPassword('');
        setConfirmPersonalPassword('');
        setAuthError(null);
        setAuthSuccessNotice(null);
        setCollabNotice(null);
        setFeedbackMsg(null);
    }, [isOpen, initialTab]);

    if (!isOpen) return null;

    const handleAdminLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthLoading(true);
        setAuthError(null);
        setAuthSuccessNotice(null);

        const res = await verifyAdminAccess({
            adminEmail,
            accessKey,
            displayName: displayName || 'Administrador',
        });

        setAuthLoading(false);

        if (!res.ok) {
            setAuthError(res.message || 'Credenciales de administrador inválidas.');
            return;
        }

        const resolvedDisplay = res.displayName || displayName || 'Administrador';
        const cleanEmail = (res.email || adminEmail).trim().toLowerCase();
        const resolvedRole = normalizeAdminRole(res.role);
        const resolvedId = res.adminId || '';
        if (resolvedId) setAdminId(resolvedId);
        setDisplayName(resolvedDisplay);
        setAdminEmail(cleanEmail);
        setAdminRole(resolvedRole);
        setTeacherReplyName((prev) => prev || resolvedDisplay);

        if (res.requiresPasswordChange) {
            setPendingPasswordChange(true);
            setNewPersonalPassword('');
            setConfirmPersonalPassword('');
            return;
        }

        const sessionObj: SavedAdminCredentials = {
            adminId: resolvedId || undefined,
            email: cleanEmail,
            accessKey: accessKey.trim(),
            displayName: resolvedDisplay,
            role: resolvedRole,
            remember: rememberCredentials,
        };

        if (rememberCredentials) {
            saveAdminCredentialsLocally(sessionObj);
            setHasSavedCreds(true);
        } else {
            clearAdminCredentialsLocally();
            setHasSavedCreds(false);
        }

        onAdminSessionChange?.(sessionObj);
        setActiveTab(resolvedRole === 'teacher' ? 'forum' : initialTab);
        setIsAuthenticated(true);
        await loadDashboard(cleanEmail, accessKey.trim());
    };

    const handleMandatoryPasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError(null);

        const nextPass = newPersonalPassword.trim();
        const confirmPass = confirmPersonalPassword.trim();
        if (nextPass.length < 4) {
            setAuthError('Tu nueva contraseña debe tener al menos 4 caracteres.');
            return;
        }
        if (nextPass === accessKey.trim() || nextPass === '1234') {
            setAuthError('Elige una contraseña personal distinta a la clave temporal (1234).');
            return;
        }
        if (nextPass !== confirmPass) {
            setAuthError('Las dos contraseñas no coinciden.');
            return;
        }

        setAuthLoading(true);
        const res = await changeAdminPassword({
            adminEmail,
            currentKey: accessKey,
            newKey: nextPass,
        });
        setAuthLoading(false);

        if (!res.ok) {
            setAuthError(res.message || 'No se pudo actualizar tu contraseña.');
            return;
        }

        const resolvedDisplay = res.displayName || displayName || 'Administrador';
        const cleanEmail = (res.email || adminEmail).trim().toLowerCase();
        const resolvedRole = res.role ? normalizeAdminRole(res.role) : adminRole;
        const resolvedId = res.adminId || adminId;
        if (resolvedId) setAdminId(resolvedId);
        setAccessKey(nextPass);
        setDisplayName(resolvedDisplay);
        setAdminEmail(cleanEmail);
        setAdminRole(resolvedRole);
        setPendingPasswordChange(false);
        setNewPersonalPassword('');
        setConfirmPersonalPassword('');

        const sessionObj: SavedAdminCredentials = {
            adminId: resolvedId || undefined,
            email: cleanEmail,
            accessKey: nextPass,
            displayName: resolvedDisplay,
            role: resolvedRole,
            remember: rememberCredentials,
        };

        if (rememberCredentials) {
            saveAdminCredentialsLocally(sessionObj);
            setHasSavedCreds(true);
        }

        onAdminSessionChange?.(sessionObj);
        setActiveTab(resolvedRole === 'teacher' ? 'forum' : initialTab);
        setIsAuthenticated(true);
        setFeedbackMsg('¡Contraseña personal guardada! Tu acceso completo ha quedado activado.');
        await loadDashboard(cleanEmail, nextPass);
    };

    const handleCollaboratorSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError(null);
        setCollabNotice(null);

        if (!collabName.trim()) {
            setAuthError('Ingresa tu nombre visible para tus respuestas en el foro.');
            return;
        }
        if (!collabEmail.trim() || !collabEmail.includes('@')) {
            setAuthError('Ingresa un correo electrónico válido.');
            return;
        }
        if (collabKey.trim().length < 4) {
            setAuthError('La clave debe tener al menos 4 caracteres.');
            return;
        }
        if (collabKey.trim() !== collabConfirmKey.trim()) {
            setAuthError('Las dos contraseñas no coinciden.');
            return;
        }

        setAuthLoading(true);
        const res = await requestCollaboratorAccess({
            email: collabEmail,
            accessKey: collabKey,
            displayName: collabName,
        });
        setAuthLoading(false);

        if (!res.ok) {
            setAuthError(res.message || 'No pudimos enviar tu solicitud.');
            return;
        }

        setCollabNotice(
            res.message ||
                '¡Solicitud enviada! Un dueño de la feria aprobará tu perfil para que puedas responder en el foro.'
        );
        setCollabKey('');
        setCollabConfirmKey('');
    };

    const handleAdminRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError(null);
        setAuthSuccessNotice(null);

        if (!adminEmail.trim() || !adminEmail.includes('@')) {
            setAuthError('Ingresa un correo electrónico válido.');
            return;
        }
        if (accessKey.trim().length < 4) {
            setAuthError('La clave debe tener al menos 4 caracteres.');
            return;
        }
        if (accessKey.trim() !== confirmAccessKey.trim()) {
            setAuthError('Las dos claves no coinciden.');
            return;
        }

        setAuthLoading(true);
        const res = await registerAdminAccount({
            adminEmail,
            accessKey,
            displayName: displayName.trim() || 'Administrador',
            requesterEmail,
            requesterKey,
        });
        setAuthLoading(false);

        if (!res.ok) {
            setAuthError(res.message || 'No se pudo registrar el administrador.');
            return;
        }

        const resolvedDisplay = res.displayName || displayName.trim() || 'Administrador';
        const cleanEmail = (res.email || adminEmail).trim().toLowerCase();
        const resolvedRole = normalizeAdminRole(res.role);
        const resolvedId = res.adminId || '';
        if (resolvedId) setAdminId(resolvedId);
        setDisplayName(resolvedDisplay);
        setAdminEmail(cleanEmail);
        setAdminRole(resolvedRole);
        setTeacherReplyName((prev) => prev || resolvedDisplay);
        setConfirmAccessKey('');

        const sessionObj: SavedAdminCredentials = {
            adminId: resolvedId || undefined,
            email: cleanEmail,
            accessKey: accessKey.trim(),
            displayName: resolvedDisplay,
            role: resolvedRole,
            remember: rememberCredentials,
        };

        if (rememberCredentials) {
            saveAdminCredentialsLocally(sessionObj);
            setHasSavedCreds(true);
        }

        onAdminSessionChange?.(sessionObj);
        setActiveTab(resolvedRole === 'teacher' ? 'forum' : initialTab);
        setIsAuthenticated(true);
        setFeedbackMsg(`Administrador ${cleanEmail} registrado y conectado correctamente.`);
        await loadDashboard(cleanEmail, accessKey.trim());
    };

    const handleRegisterAdditionalAdmin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newAdminEmail.trim() || !newAdminKey.trim()) return;

        const res = await registerAdminAccount({
            adminEmail: newAdminEmail,
            accessKey: newAdminKey,
            displayName: newAdminName.trim() || 'Administrador',
            requesterEmail: adminEmail,
            requesterKey: accessKey,
            role: newAdminRole,
            mustChangePassword: newAdminMustChange,
        });

        if (res.ok) {
            setFeedbackMsg(
                `Cuenta ${newAdminEmail.trim().toLowerCase()} (${getRoleHeaderLabel(newAdminRole)}) registrada.`
            );
            setNewAdminName('');
            setNewAdminEmail('');
            setNewAdminKey('');
            setNewAdminRole('owner');
            setNewAdminMustChange(true);
            await loadDashboard(adminEmail, accessKey);
        } else {
            setFeedbackMsg(res.message || 'No se pudo registrar al nuevo administrador.');
        }
    };

    const handleChangeAdminRole = async (adm: AdminUserSummary, nextRole: AdminRole) => {
        if (adm.role === nextRole) return;
        setUpdatingRoleAdminId(adm.id);
        const res = await updateAdminRole({
            adminEmail,
            accessKey,
            targetAdminId: adm.id,
            newRole: nextRole,
        });
        setUpdatingRoleAdminId(null);

        if (!res.ok) {
            setFeedbackMsg(res.message || 'No se pudo actualizar el rol.');
            return;
        }

        const isSelf = adm.adminEmail.toLowerCase() === adminEmail.trim().toLowerCase();
        if (isSelf) {
            setAdminRole(nextRole);
            const updatedSession: SavedAdminCredentials = {
                adminId: adminId || adm.id,
                email: adminEmail.trim().toLowerCase(),
                accessKey: accessKey.trim(),
                displayName,
                role: nextRole,
                remember: rememberCredentials,
            };
            if (rememberCredentials) {
                saveAdminCredentialsLocally(updatedSession);
            }
            onAdminSessionChange?.(updatedSession);
            if (nextRole === 'teacher') {
                setActiveTab('forum');
            } else if (nextRole === 'support' && activeTab === 'admins') {
                setActiveTab('students');
            }
        }

        setFeedbackMsg(
            `Rol de ${adm.adminEmail} actualizado a ${getRoleHeaderLabel(nextRole)}.`
        );
        await loadDashboard(adminEmail, accessKey);
    };

    const handleToggleRecording = async (workshopId: string, workshopTitle: string) => {
        const nextReady = !Boolean(recordingsMap[workshopId]);
        setTogglingWorkshopId(workshopId);
        const res = await toggleWorkshopRecording({
            adminEmail,
            accessKey,
            workshopId,
            isReady: nextReady,
        });
        setTogglingWorkshopId(null);

        if (res.ok) {
            setRecordingsMap((prev) => ({
                ...prev,
                [workshopId]: nextReady,
            }));
            setFeedbackMsg(
                nextReady
                    ? `Grabación activada para "${workshopTitle}": las alumnas ya ven el aviso de grabación disponible.`
                    : `Estado actualizado para "${workshopTitle}": muestra "Clase finalizada · Pronto la grabación".`
            );
            onRecordingsUpdated?.();
        } else {
            setFeedbackMsg(res.message || 'No se pudo actualizar el estado de la grabación.');
        }
    };

    const handleReviewCollaborator = async (targetAdminId: string, targetEmail: string, approve: boolean) => {
        const res = await reviewCollaboratorRequest({
            adminEmail,
            accessKey,
            targetAdminId,
            approve,
        });
        if (res.ok) {
            setFeedbackMsg(
                approve
                    ? `Se aprobó el acceso al foro para ${targetEmail}.`
                    : `Se rechazó la solicitud de ${targetEmail}.`
            );
            await loadDashboard(adminEmail, accessKey);
        } else {
            setFeedbackMsg(res.message || 'No se pudo procesar la solicitud.');
        }
    };

    const handleDeleteAdmin = async (targetAdminId: string, targetEmail: string) => {
        const res = await deleteAdminAccount({
            adminEmail,
            accessKey,
            targetAdminId,
        });
        setConfirmDeleteAdminId(null);
        if (res.ok) {
            if (res.selfDeleted) {
                clearAdminCredentialsLocally();
                onAdminSessionChange?.(null);
                setHasSavedCreds(false);
                setIsAuthenticated(false);
                setAdminId('');
                setAdminEmail('');
                setAccessKey('');
                setDisplayName('');
                setAuthMode('login');
                setAuthSuccessNotice(
                    `Tu perfil de administrador (${targetEmail}) fue eliminado correctamente.`
                );
                return;
            }
            setFeedbackMsg(`Se eliminó al administrador ${targetEmail}.`);
            await loadDashboard(adminEmail, accessKey);
        } else {
            setFeedbackMsg(res.message || 'No se pudo eliminar al administrador.');
        }
    };

    const handleSaveStudent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!stuEmail.trim()) return;

        const cleanPass = stuPassword.trim();
        const res = await upsertAdminStudent({
            adminEmail,
            accessKey,
            email: stuEmail,
            purchaseCode: cleanPass ? cleanPass.toUpperCase() : '',
            fullName: stuFullName,
            classroomPassword: cleanPass,
            classroomUrl: stuUrl,
            maxDevices: stuMaxDevices,
            isActive: stuActive,
        });

        if (res.ok) {
            setFeedbackMsg(
                cleanPass
                    ? `Alumna ${stuEmail.trim().toLowerCase()} guardada correctamente.`
                    : `Alumna ${stuEmail.trim().toLowerCase()} guardada (definirá su clave al entrar por primera vez).`
            );
            setStuFullName('');
            setStuEmail('');
            setStuPassword('');
            setStuUrl('');
            setStuMaxDevices(2);
            setStuActive(true);
            await loadDashboard(adminEmail, accessKey);
        } else {
            setFeedbackMsg(res.message || 'Error al guardar la alumna.');
        }
    };

    const handleSpreadsheetSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setFeedbackMsg(null);

        try {
            const parsed = await parseStudentsSpreadsheet(file);
            setImportFileName(file.name);
            setParsedImportRows(parsed.rows);
            setImportSkippedCount(parsed.skippedCount);
            setImportPendingCount(parsed.pendingActivationCount);

            if (parsed.rows.length === 0) {
                setFeedbackMsg(
                    `No se encontraron filas con correo válido en "${file.name}". Descarga la plantilla para verificar las columnas.`
                );
            }
        } catch {
            setFeedbackMsg('No pudimos leer el archivo. Asegúrate de que sea un .xlsx, .xls o .csv válido.');
            setParsedImportRows([]);
        } finally {
            e.target.value = '';
        }
    };

    const handleConfirmSpreadsheetImport = async () => {
        if (parsedImportRows.length === 0) return;
        setIsImportingFile(true);
        const res = await bulkUpsertAdminStudents({
            adminEmail,
            accessKey,
            students: parsedImportRows,
        });
        setIsImportingFile(false);

        if (res.ok) {
            setFeedbackMsg(
                `Se importaron ${res.importedCount ?? parsedImportRows.length} alumnas desde "${importFileName}".`
            );
            setParsedImportRows([]);
            setImportFileName('');
            setImportSkippedCount(0);
            setImportPendingCount(0);
            await loadDashboard(adminEmail, accessKey);
        } else {
            setFeedbackMsg(res.message || 'No se pudo completar la importación masiva.');
        }
    };

    const handleBulkImport = async (e: React.FormEvent) => {
        e.preventDefault();
        const lines = bulkText
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);

        if (lines.length === 0) return;

        const batch: ParsedStudentImportRow[] = [];
        for (const line of lines) {
            const parts = line.split(/[;,]/).map((p) => p.trim());
            const emailPart = (parts[0] || '').toLowerCase();
            const passPart = parts[1] || parts[3] || '';
            const namePart = parts[2] || '';
            if (!emailPart.includes('@')) continue;

            batch.push({
                email: emailPart,
                purchaseCode: passPart ? passPart.toUpperCase() : '',
                fullName: namePart,
                classroomPassword: passPart,
                classroomUrl: '',
                maxDevices: 2,
                isActive: true,
                needsPasswordSetup: !passPart,
            });
        }

        const res = await bulkUpsertAdminStudents({
            adminEmail,
            accessKey,
            students: batch,
        });

        if (res.ok) {
            setBulkText('');
            setShowBulkImport(false);
            setFeedbackMsg(`Se importaron ${res.importedCount ?? batch.length} alumnas correctamente.`);
            await loadDashboard(adminEmail, accessKey);
        } else {
            setFeedbackMsg(res.message || 'Error al importar la lista.');
        }
    };

    const handleEditStudent = (s: AdminStudentRecord) => {
        setStuFullName(s.fullName);
        setStuEmail(s.email);
        setStuPassword(s.classroomPassword || s.purchaseCode);
        setStuUrl(s.classroomUrl);
        setStuMaxDevices(s.maxDevices);
        setStuActive(s.isActive);
    };

    const handleResetDevices = async (studentId: string, email: string) => {
        const res = await resetAdminStudentDevices({ adminEmail, accessKey, studentId });
        if (res.ok) {
            setFeedbackMsg(`Dispositivos e IP autorizada restablecidos para ${email}.`);
            await loadDashboard(adminEmail, accessKey);
        }
    };

    const handleDeleteStudent = async (studentId: string, email: string) => {
        const res = await deleteAdminStudent({ adminEmail, accessKey, studentId });
        setConfirmDeleteStudentId(null);
        if (res.ok) {
            setFeedbackMsg(`Se eliminó el registro de ${email}.`);
            await loadDashboard(adminEmail, accessKey);
        } else {
            setFeedbackMsg(res.message || 'No se pudo eliminar la alumna.');
        }
    };

    const handleForgetSavedCredentials = () => {
        clearAdminCredentialsLocally();
        setHasSavedCreds(false);
        setRememberCredentials(false);
        setFeedbackMsg('Credenciales guardadas eliminadas de este navegador.');
    };

    const handleLogout = () => {
        clearAdminCredentialsLocally();
        onAdminSessionChange?.(null);
        setHasSavedCreds(false);
        setIsAuthenticated(false);
        if (!rememberCredentials) {
            setAccessKey('');
        }
    };

    const handleSendOfficialReply = async (questionId: string) => {
        const draft = (replyDrafts[questionId] || '').trim();
        if (!draft) return;

        setSendingReplyId(questionId);
        const res = await adminReplyForumQuestion({
            adminEmail,
            accessKey,
            questionId,
            teacherName: teacherReplyName.trim() || displayName || 'Profesor / Colaborador',
            replyBody: draft,
        });
        setSendingReplyId(null);

        if (res.ok && res.reply) {
            setForumQuestions((prev) =>
                prev.map((q) =>
                    q.id === questionId
                        ? { ...q, status: 'answered', replies: [...q.replies, res.reply!] }
                        : q
                )
            );
            setReplyDrafts((prev) => ({ ...prev, [questionId]: '' }));
            setFeedbackMsg('Respuesta oficial publicada en el foro de dudas.');
            onForumUpdated?.();
        } else {
            setFeedbackMsg(res.message || 'No se pudo publicar la respuesta.');
        }
    };

    const handleDeleteForumQuestion = async (questionId: string) => {
        const res = await adminDeleteForumQuestion({ adminEmail, accessKey, questionId });
        if (res.ok) {
            setForumQuestions((prev) => prev.filter((q) => q.id !== questionId));
            setFeedbackMsg('Comentario / duda eliminada del foro.');
            onForumUpdated?.();
        } else {
            setFeedbackMsg(res.message || 'No se pudo eliminar el comentario.');
        }
    };

    const handleStartEditQuestion = (q: ForumQuestion) => {
        setEditingQuestionId(q.id);
        setEditQuestionAuthor(q.authorName);
        setEditQuestionTitle(q.title);
        setEditQuestionBody(q.body || '');
    };

    const handleSaveQuestionEdit = async (questionId: string) => {
        if (!editQuestionTitle.trim()) return;
        setSavingQuestionEdit(true);
        const res = await adminUpdateForumQuestion({
            adminEmail,
            accessKey,
            questionId,
            title: editQuestionTitle,
            body: editQuestionBody,
            authorName: editQuestionAuthor,
        });
        setSavingQuestionEdit(false);

        if (res.ok) {
            setForumQuestions((prev) =>
                prev.map((q) =>
                    q.id === questionId
                        ? {
                              ...q,
                              title: editQuestionTitle.trim(),
                              body: editQuestionBody.trim(),
                              authorName: editQuestionAuthor.trim() || q.authorName,
                          }
                        : q
                )
            );
            setEditingQuestionId(null);
            setFeedbackMsg('Comentario actualizado correctamente.');
            onForumUpdated?.();
        } else {
            setFeedbackMsg(res.message || 'No se pudo actualizar el comentario.');
        }
    };

    const handleStartEditReply = (replyId: string, body: string) => {
        setEditingReplyId(replyId);
        setEditReplyBody(body);
    };

    const handleSaveReplyEdit = async (questionId: string, replyId: string) => {
        if (!editReplyBody.trim()) return;
        setSavingReplyEdit(true);
        const res = await adminUpdateForumReply({
            adminEmail,
            accessKey,
            questionId,
            replyId,
            body: editReplyBody,
        });
        setSavingReplyEdit(false);

        if (res.ok) {
            setForumQuestions((prev) =>
                prev.map((q) =>
                    q.id === questionId
                        ? {
                              ...q,
                              replies: q.replies.map((r) =>
                                  r.id === replyId ? { ...r, body: editReplyBody.trim() } : r
                              ),
                          }
                        : q
                )
            );
            setEditingReplyId(null);
            setFeedbackMsg('Respuesta en el hilo actualizada.');
            onForumUpdated?.();
        } else {
            setFeedbackMsg(res.message || 'No se pudo editar la respuesta.');
        }
    };

    const handleDeleteForumReply = async (questionId: string, replyId: string) => {
        const res = await adminDeleteForumReply({
            adminEmail,
            accessKey,
            questionId,
            replyId,
        });
        if (res.ok) {
            setForumQuestions((prev) =>
                prev.map((q) =>
                    q.id === questionId
                        ? { ...q, replies: q.replies.filter((r) => r.id !== replyId) }
                        : q
                )
            );
            setFeedbackMsg('Comentario del hilo eliminado.');
            onForumUpdated?.();
        } else {
            setFeedbackMsg(res.message || 'No se pudo eliminar el comentario del hilo.');
        }
    };

    const filteredStudents = students.filter((s) => {
        const q = searchTerm.trim().toLowerCase();
        if (!q) return true;
        return (
            s.email.toLowerCase().includes(q) ||
            s.fullName.toLowerCase().includes(q) ||
            s.classroomPassword.toLowerCase().includes(q) ||
            s.purchaseCode.toLowerCase().includes(q)
        );
    });

    const unresolvedAlertsCount = alerts.filter((a) => !a.resolved).length;
    const pendingForumCount = forumQuestions.filter((q) => q.status === 'pending').length;
    const pendingCollaborators = admins.filter((a) => a.approvalStatus === 'pending');
    const approvedAdmins = admins.filter((a) => a.approvalStatus !== 'pending');
    const approvedOwnersCount = approvedAdmins.filter(
        (a) => a.role === 'owner' && a.isActive
    ).length;
    const visibleForumQuestions =
        forumFilter === 'pending'
            ? forumQuestions.filter((q) => q.status === 'pending')
            : forumQuestions;

    const canManageStudentsAndRecordings = adminRole === 'owner' || adminRole === 'support';
    const readyRecordingsCount = classData.filter((c) => Boolean(recordingsMap[c.id])).length;

    const getAlertReasonLabel = (reason: DeviceAccessAlert['reason']) => {
        if (reason === 'IP_MISMATCH') return 'Bloqueo por IP distinta (posible enlace compartido)';
        if (reason === 'COUNTRY_MISMATCH') return 'Bloqueo por país distinto';
        return 'Bloqueo por exceso de dispositivos (>2 equipos)';
    };

    return (
        <div className="fixed inset-0 bg-[#2B2B2B]/75 backdrop-blur-sm flex items-center justify-center z-[60] p-4 overflow-y-auto">
            <div className="bg-[#FFFDF7] rounded-[26px] shadow-2xl p-6 md:p-8 max-w-4xl w-full border-2 border-[#3F6B45] relative my-auto max-h-[90vh] overflow-y-auto">
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Cerrar panel de administrador"
                    className="absolute top-4 right-4 w-9 h-9 rounded-full bg-[#FBF5E6] border border-[#E5DAC0] text-[#2B2B2B] hover:border-[#A3363D] hover:text-[#A3363D] font-bold flex items-center justify-center transition-colors"
                >
                    ✕
                </button>

                {!isAuthenticated && pendingPasswordChange ? (
                    <div className="max-w-md mx-auto py-3 space-y-4">
                        <div className="text-center">
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#3F6B45]">
                                Activación de cuenta · {getRoleHeaderLabel(adminRole)}
                            </p>
                            <h2 className="font-title italic text-2xl font-bold text-[#A3363D] mt-1">
                                Cambia tu contraseña temporal
                            </h2>
                            <p className="text-xs text-[#2B2B2B]/80 mt-1.5 leading-relaxed">
                                Hola <strong>{displayName}</strong> ({adminEmail}). Ingresaste con tu clave temporal. Crea tu nueva contraseña personal para desbloquear tu acceso completo.
                            </p>
                        </div>

                        <form onSubmit={handleMandatoryPasswordChange} className="space-y-3.5">
                            <div>
                                <label htmlFor="new-personal-key" className="block text-xs font-bold text-[#2B2B2B] mb-1">
                                    Nueva contraseña personal (mín. 4 caracteres, distinta a 1234) *
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        id="new-personal-key"
                                        type={showKey ? 'text' : 'password'}
                                        required
                                        minLength={4}
                                        value={newPersonalPassword}
                                        onChange={(e) => setNewPersonalPassword(e.target.value)}
                                        placeholder="Crea tu contraseña definitiva"
                                        className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#3F6B45]"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowKey((prev) => !prev)}
                                        className="px-3.5 py-2 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] text-xs font-semibold text-[#2B2B2B]"
                                    >
                                        {showKey ? 'Ocultar' : 'Ver'}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label htmlFor="confirm-personal-key" className="block text-xs font-bold text-[#2B2B2B] mb-1">
                                    Confirmar nueva contraseña *
                                </label>
                                <input
                                    id="confirm-personal-key"
                                    type={showKey ? 'text' : 'password'}
                                    required
                                    minLength={4}
                                    value={confirmPersonalPassword}
                                    onChange={(e) => setConfirmPersonalPassword(e.target.value)}
                                    placeholder="Repite tu contraseña definitiva"
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#3F6B45]"
                                />
                            </div>

                            <label className="flex items-center gap-2.5 text-xs text-[#2B2B2B] cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={rememberCredentials}
                                    onChange={(e) => setRememberCredentials(e.target.checked)}
                                    className="w-4 h-4 accent-[#3F6B45]"
                                />
                                <span>Guardar mi nueva contraseña en este dispositivo</span>
                            </label>

                            {authError && (
                                <p className="text-xs font-semibold text-[#A3363D] bg-[#A3363D]/10 p-3.5 rounded-xl border border-[#A3363D]/30 whitespace-pre-line leading-relaxed" role="alert">
                                    {authError}
                                </p>
                            )}

                            <div className="flex flex-col gap-2">
                                <button
                                    type="submit"
                                    disabled={authLoading}
                                    className="w-full py-3 px-6 rounded-full bg-[#3F6B45] hover:bg-[#2E4F35] disabled:opacity-60 text-white font-bold text-sm shadow-md transition-colors"
                                >
                                    {authLoading ? 'Guardando...' : 'Guardar contraseña y entrar al panel'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPendingPasswordChange(false);
                                        setAccessKey('');
                                        setAuthError(null);
                                    }}
                                    className="w-full py-2 text-xs font-semibold text-[#2B2B2B]/70 hover:text-[#A3363D]"
                                >
                                    Volver atrás
                                </button>
                            </div>
                        </form>
                    </div>
                ) : !isAuthenticated ? (
                    <div className="max-w-md mx-auto py-3 space-y-4">
                        <div className="text-center">
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#3F6B45]">
                                Equipo de la feria
                            </p>
                            <h2 className="font-title italic text-2xl md:text-3xl font-bold text-[#A3363D] mt-1">
                                Área de Administración y Profesores
                            </h2>
                            <p className="text-xs text-[#2B2B2B]/75 mt-1.5">
                                {authMode === 'collaborator'
                                    ? 'Solicita tu acceso como profesora / colaboradora para responder dudas en el foro.'
                                    : authMode === 'register'
                                      ? 'Registra una cuenta de administrador (requiere autorización de un dueño activo).'
                                      : 'Ingresa con tu correo y contraseña (o clave temporal 1234 si eres dueño/a).'}
                            </p>
                        </div>

                        {authSuccessNotice && (
                            <p className="text-xs font-semibold text-[#2E4F35] bg-[#3F6B45]/10 p-3.5 rounded-xl border border-[#3F6B45] leading-relaxed">
                                ✓ {authSuccessNotice}
                            </p>
                        )}

                        {/* Selector Ingresar / Soy colaboradora / Registrar admin */}
                        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-[#FBF5E6] border border-[#E5DAC0]">
                            <button
                                type="button"
                                onClick={() => {
                                    setAuthMode('login');
                                    setAuthError(null);
                                }}
                                className={`py-2 px-2 rounded-xl text-[11px] sm:text-xs font-bold transition-colors ${
                                    authMode === 'login'
                                        ? 'bg-[#3F6B45] text-white shadow-xs'
                                        : 'text-[#2B2B2B] hover:text-[#A3363D]'
                                }`}
                            >
                                Iniciar sesión
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setAuthMode('collaborator');
                                    setAuthError(null);
                                    setCollabNotice(null);
                                }}
                                className={`py-2 px-2 rounded-xl text-[11px] sm:text-xs font-bold transition-colors ${
                                    authMode === 'collaborator'
                                        ? 'bg-[#2E4F35] text-white shadow-xs'
                                        : 'text-[#2B2B2B] hover:text-[#3F6B45]'
                                }`}
                            >
                                Soy colaboradora
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setAuthMode('register');
                                    setAuthError(null);
                                }}
                                className={`py-2 px-2 rounded-xl text-[11px] sm:text-xs font-bold transition-colors ${
                                    authMode === 'register'
                                        ? 'bg-[#A3363D] text-white shadow-xs'
                                        : 'text-[#2B2B2B] hover:text-[#3F6B45]'
                                }`}
                            >
                                Registrar admin
                            </button>
                        </div>

                        {authMode === 'login' ? (
                            <form onSubmit={handleAdminLogin} className="space-y-3.5">
                                <div className="p-2.5 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] text-[11px] text-[#2B2B2B]/80 leading-relaxed">
                                    <strong>¿Primera vez?</strong> Los dueños entran con la clave temporal asignada y la cambian al instante; las colaboradoras aprobadas ingresan aquí con su clave.
                                </div>
                                <div>
                                    <label htmlFor="admin-email" className="block text-xs font-bold text-[#2B2B2B] mb-1">
                                        Correo electrónico
                                    </label>
                                    <input
                                        id="admin-email"
                                        type="email"
                                        required
                                        value={adminEmail}
                                        onChange={(e) => setAdminEmail(e.target.value)}
                                        placeholder="tu-correo@ejemplo.com"
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#3F6B45]"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="admin-key" className="block text-xs font-bold text-[#2B2B2B] mb-1">
                                        Clave de acceso
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            id="admin-key"
                                            type={showKey ? 'text' : 'password'}
                                            required
                                            value={accessKey}
                                            onChange={(e) => setAccessKey(e.target.value)}
                                            placeholder="Tu clave de acceso"
                                            className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#3F6B45]"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowKey((prev) => !prev)}
                                            className="px-3.5 py-2 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] text-xs font-semibold text-[#2B2B2B]"
                                        >
                                            {showKey ? 'Ocultar' : 'Ver'}
                                        </button>
                                    </div>
                                </div>

                                <label className="flex items-center gap-2.5 text-xs text-[#2B2B2B] cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={rememberCredentials}
                                        onChange={(e) => setRememberCredentials(e.target.checked)}
                                        className="w-4 h-4 accent-[#3F6B45]"
                                    />
                                    <span>Guardar mis credenciales en este dispositivo</span>
                                </label>

                                {authError && (
                                    <p className="text-xs font-semibold text-[#A3363D] bg-[#A3363D]/10 p-3.5 rounded-xl border border-[#A3363D]/30 whitespace-pre-line leading-relaxed" role="alert">
                                        {authError}
                                    </p>
                                )}

                                <button
                                    type="submit"
                                    disabled={authLoading}
                                    className="w-full py-3 px-6 rounded-full bg-[#A3363D] hover:bg-[#862B31] disabled:opacity-60 text-white font-bold text-sm shadow-md transition-colors"
                                >
                                    {authLoading ? 'Verificando...' : 'Entrar al panel'}
                                </button>

                                {hasSavedCreds && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            handleForgetSavedCredentials();
                                            setAdminEmail('');
                                            setAccessKey('');
                                        }}
                                        className="w-full text-xs text-[#A3363D] hover:underline font-semibold pt-1"
                                    >
                                        Olvidar credenciales guardadas en este navegador
                                    </button>
                                )}
                            </form>
                        ) : authMode === 'collaborator' ? (
                            <form onSubmit={handleCollaboratorSubmit} className="space-y-3.5">
                                <div className="p-3 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] text-[11px] text-[#2B2B2B]/85 leading-relaxed">
                                    <strong>Acceso exclusivo para el Foro de Dudas:</strong> esta clave es solo para identificarte en esta app, responder preguntas y editar tus propias respuestas. Un dueño de la feria aprobará tu solicitud antes de activarla.
                                </div>

                                <div>
                                    <label htmlFor="collab-name" className="block text-xs font-bold text-[#2B2B2B] mb-1">
                                        Tu nombre visible al responder *
                                    </label>
                                    <input
                                        id="collab-name"
                                        type="text"
                                        required
                                        value={collabName}
                                        onChange={(e) => setCollabName(e.target.value)}
                                        placeholder="Ej. Prof. Andrea Gómez"
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#3F6B45]"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="collab-email" className="block text-xs font-bold text-[#2B2B2B] mb-1">
                                        Tu correo de acceso *
                                    </label>
                                    <input
                                        id="collab-email"
                                        type="email"
                                        required
                                        value={collabEmail}
                                        onChange={(e) => setCollabEmail(e.target.value)}
                                        placeholder="tu-correo@ejemplo.com"
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#3F6B45]"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <span className="block text-xs font-bold text-[#2B2B2B]">
                                        Elige cómo quieres configurar tu clave para la app:
                                    </span>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setCollabKeyMode('classonlive')}
                                            className={`p-2.5 rounded-xl border text-left transition-colors ${
                                                collabKeyMode === 'classonlive'
                                                    ? 'bg-[#3F6B45]/10 border-[#3F6B45] text-[#2E4F35]'
                                                    : 'bg-[#FBF5E6] border-[#E5DAC0] text-[#2B2B2B]/80'
                                            }`}
                                        >
                                            <span className="block text-xs font-bold">
                                                Usar mi clave de ClassOnLive
                                            </span>
                                            <span className="block text-[10px] mt-0.5 opacity-80">
                                                Recomendado para no recordar dos claves
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setCollabKeyMode('custom')}
                                            className={`p-2.5 rounded-xl border text-left transition-colors ${
                                                collabKeyMode === 'custom'
                                                    ? 'bg-[#3F6B45]/10 border-[#3F6B45] text-[#2E4F35]'
                                                    : 'bg-[#FBF5E6] border-[#E5DAC0] text-[#2B2B2B]/80'
                                            }`}
                                        >
                                            <span className="block text-xs font-bold">
                                                Crear otra clave para la app
                                            </span>
                                            <span className="block text-[10px] mt-0.5 opacity-80">
                                                Independiente solo para el Foro
                                            </span>
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="collab-key" className="block text-xs font-bold text-[#2B2B2B] mb-1">
                                        {collabKeyMode === 'classonlive'
                                            ? 'Escribe tu clave de ClassOnLive (mín. 4 caracteres) *'
                                            : 'Crea tu nueva clave para la app (mín. 4 caracteres) *'}
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            id="collab-key"
                                            type={showKey ? 'text' : 'password'}
                                            required
                                            minLength={4}
                                            value={collabKey}
                                            onChange={(e) => setCollabKey(e.target.value)}
                                            placeholder={
                                                collabKeyMode === 'classonlive'
                                                    ? 'Tu misma clave de ClassOnLive'
                                                    : 'Tu clave para responder en el foro'
                                            }
                                            className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#3F6B45]"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowKey((prev) => !prev)}
                                            className="px-3.5 py-2 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] text-xs font-semibold text-[#2B2B2B]"
                                        >
                                            {showKey ? 'Ocultar' : 'Ver'}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="collab-confirm" className="block text-xs font-bold text-[#2B2B2B] mb-1">
                                        Confirmar clave *
                                    </label>
                                    <input
                                        id="collab-confirm"
                                        type={showKey ? 'text' : 'password'}
                                        required
                                        minLength={4}
                                        value={collabConfirmKey}
                                        onChange={(e) => setCollabConfirmKey(e.target.value)}
                                        placeholder="Repite tu clave"
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#3F6B45]"
                                    />
                                </div>

                                {authError && (
                                    <p className="text-xs font-semibold text-[#A3363D] bg-[#A3363D]/10 p-3.5 rounded-xl border border-[#A3363D]/30 whitespace-pre-line leading-relaxed" role="alert">
                                        {authError}
                                    </p>
                                )}

                                {collabNotice && (
                                    <p className="text-xs font-semibold text-[#2E4F35] bg-[#3F6B45]/10 p-3.5 rounded-xl border border-[#3F6B45] leading-relaxed">
                                        ✓ {collabNotice}
                                    </p>
                                )}

                                <button
                                    type="submit"
                                    disabled={authLoading}
                                    className="w-full py-3 px-6 rounded-full bg-[#3F6B45] hover:bg-[#2E4F35] disabled:opacity-60 text-white font-bold text-sm shadow-md transition-colors"
                                >
                                    {authLoading ? 'Enviando solicitud...' : 'Enviar solicitud de colaboradora'}
                                </button>
                            </form>
                        ) : (
                            <form onSubmit={handleAdminRegister} className="space-y-3.5">
                                <div>
                                    <label htmlFor="reg-admin-name" className="block text-xs font-bold text-[#2B2B2B] mb-1">
                                        Nombre completo / Coordinador
                                    </label>
                                    <input
                                        id="reg-admin-name"
                                        type="text"
                                        required
                                        value={displayName}
                                        onChange={(e) => setDisplayName(e.target.value)}
                                        placeholder="Ej. Lisbeth Mora · Coordinación"
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#3F6B45]"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="reg-admin-email" className="block text-xs font-bold text-[#2B2B2B] mb-1">
                                        Correo de administrador *
                                    </label>
                                    <input
                                        id="reg-admin-email"
                                        type="email"
                                        required
                                        value={adminEmail}
                                        onChange={(e) => setAdminEmail(e.target.value)}
                                        placeholder="tu-correo@ejemplo.com"
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#3F6B45]"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="reg-admin-key" className="block text-xs font-bold text-[#2B2B2B] mb-1">
                                        Nueva clave de acceso (mín. 4 caracteres) *
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            id="reg-admin-key"
                                            type={showKey ? 'text' : 'password'}
                                            required
                                            minLength={4}
                                            value={accessKey}
                                            onChange={(e) => setAccessKey(e.target.value)}
                                            placeholder="Crea una clave segura"
                                            className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#3F6B45]"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowKey((prev) => !prev)}
                                            className="px-3.5 py-2 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] text-xs font-semibold text-[#2B2B2B]"
                                        >
                                            {showKey ? 'Ocultar' : 'Ver'}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="reg-admin-confirm" className="block text-xs font-bold text-[#2B2B2B] mb-1">
                                        Confirmar clave de acceso *
                                    </label>
                                    <input
                                        id="reg-admin-confirm"
                                        type={showKey ? 'text' : 'password'}
                                        required
                                        minLength={4}
                                        value={confirmAccessKey}
                                        onChange={(e) => setConfirmAccessKey(e.target.value)}
                                        placeholder="Repite la clave"
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#3F6B45]"
                                    />
                                </div>

                                {isSupabaseConfigured && (
                                    <div className="p-3 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] space-y-2">
                                        <p className="text-[11px] font-semibold text-[#2B2B2B]/80">
                                            Autorización (solo si ya existe otro administrador registrado en Supabase; déjalo vacío si es el primero):
                                        </p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <input
                                                type="email"
                                                value={requesterEmail}
                                                onChange={(e) => setRequesterEmail(e.target.value)}
                                                placeholder="Correo admin autorizador"
                                                className="px-3 py-2 rounded-lg bg-[#FFFDF7] border border-[#E5DAC0] text-xs text-[#2B2B2B]"
                                            />
                                            <input
                                                type="password"
                                                value={requesterKey}
                                                onChange={(e) => setRequesterKey(e.target.value)}
                                                placeholder="Clave admin autorizador"
                                                className="px-3 py-2 rounded-lg bg-[#FFFDF7] border border-[#E5DAC0] text-xs text-[#2B2B2B]"
                                            />
                                        </div>
                                    </div>
                                )}

                                <label className="flex items-center gap-2.5 text-xs text-[#2B2B2B] cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={rememberCredentials}
                                        onChange={(e) => setRememberCredentials(e.target.checked)}
                                        className="w-4 h-4 accent-[#3F6B45]"
                                    />
                                    <span>Guardar credenciales en este dispositivo</span>
                                </label>

                                {authError && (
                                    <p className="text-xs font-semibold text-[#A3363D] bg-[#A3363D]/10 p-3.5 rounded-xl border border-[#A3363D]/30 whitespace-pre-line leading-relaxed" role="alert">
                                        {authError}
                                    </p>
                                )}

                                <button
                                    type="submit"
                                    disabled={authLoading}
                                    className="w-full py-3 px-6 rounded-full bg-[#3F6B45] hover:bg-[#2E4F35] disabled:opacity-60 text-white font-bold text-sm shadow-md transition-colors"
                                >
                                    {authLoading ? 'Registrando...' : 'Registrar administrador y entrar'}
                                </button>
                            </form>
                        )}
                    </div>
                ) : (
                    <div className="space-y-6 pr-2">
                        {/* Cabecera del panel autenticado */}
                        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E5DAC0] pb-4 pr-8">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#3F6B45]">
                                    Panel de Administración · {displayName} · {getRoleHeaderLabel(adminRole)}
                                </p>
                                <h2 className="font-title italic text-2xl font-bold text-[#A3363D]">
                                    {adminRole === 'owner'
                                        ? 'Alumnas, Credenciales y Seguridad'
                                        : adminRole === 'support'
                                          ? 'Alumnas, Alertas, Grabaciones y Foro'
                                          : 'Foro de Dudas de Alumnas'}
                                </h2>
                                <p className="text-xs text-[#2B2B2B]/70 mt-0.5">
                                    {adminEmail} · {isSupabaseConfigured ? 'Conectado a Supabase' : 'Modo vista previa local'}
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                {hasSavedCreds && (
                                    <button
                                        type="button"
                                        onClick={handleForgetSavedCredentials}
                                        className="px-3.5 py-1.5 rounded-full bg-[#FBF5E6] border border-[#E5DAC0] text-xs font-semibold text-[#2B2B2B] hover:border-[#A3363D]"
                                    >
                                        Olvidar credenciales
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => loadDashboard(adminEmail, accessKey)}
                                    className="px-3.5 py-1.5 rounded-full bg-[#FBF5E6] border border-[#E5DAC0] text-xs font-bold text-[#3F6B45] hover:border-[#3F6B45]"
                                >
                                    {dashboardLoading ? 'Cargando...' : 'Actualizar'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    className="px-3.5 py-1.5 rounded-full bg-[#A3363D] text-white text-xs font-bold hover:bg-[#862B31]"
                                >
                                    Cerrar sesión
                                </button>
                            </div>
                        </div>

                        {feedbackMsg && (
                            <div className="p-3 rounded-xl bg-[#3F6B45]/10 border border-[#3F6B45] text-xs font-semibold text-[#2E4F35] flex items-center justify-between gap-2">
                                <span>{feedbackMsg}</span>
                                <button type="button" onClick={() => setFeedbackMsg(null)} className="font-bold">
                                    ✕
                                </button>
                            </div>
                        )}

                        {/* Pestañas según rol */}
                        <div className="flex flex-wrap items-center gap-2 p-1 bg-[#FBF5E6] border border-[#E5DAC0] rounded-2xl w-fit">
                            {canManageStudentsAndRecordings && (
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('students')}
                                    className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors ${
                                        activeTab === 'students'
                                            ? 'bg-[#3F6B45] text-white'
                                            : 'text-[#2B2B2B] hover:text-[#A3363D]'
                                    }`}
                                >
                                    Alumnas ({students.length})
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setActiveTab('forum')}
                                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors tabular-nums ${
                                    activeTab === 'forum'
                                        ? 'bg-[#2E4F35] text-white'
                                        : 'text-[#2B2B2B] hover:text-[#3F6B45]'
                                }`}
                            >
                                Dudas pendientes ({pendingForumCount})
                            </button>
                            {canManageStudentsAndRecordings && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('recordings')}
                                        className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors tabular-nums ${
                                            activeTab === 'recordings'
                                                ? 'bg-[#3F6B45] text-white'
                                                : 'text-[#2B2B2B] hover:text-[#3F6B45]'
                                        }`}
                                    >
                                        Grabaciones ({readyRecordingsCount}/9)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('alerts')}
                                        className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors tabular-nums ${
                                            activeTab === 'alerts'
                                                ? 'bg-[#A3363D] text-white'
                                                : 'text-[#2B2B2B] hover:text-[#A3363D]'
                                        }`}
                                    >
                                        Alertas ({unresolvedAlertsCount})
                                    </button>
                                </>
                            )}
                            {adminRole === 'owner' && (
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('admins')}
                                    className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors tabular-nums flex items-center gap-1.5 ${
                                        activeTab === 'admins'
                                            ? 'bg-[#2B2B2B] text-white'
                                            : 'text-[#2B2B2B] hover:text-[#3F6B45]'
                                    }`}
                                >
                                    <span>Administradores ({approvedAdmins.length})</span>
                                    {pendingCollaborators.length > 0 && (
                                        <span className="px-2 py-0.5 rounded-full bg-[#A3363D] text-white text-[10px] font-extrabold">
                                            {pendingCollaborators.length} por aprobar
                                        </span>
                                    )}
                                </button>
                            )}
                        </div>

                        {activeTab === 'students' && canManageStudentsAndRecordings ? (
                            <div className="space-y-6">
                                {/* Formulario agregar / editar alumna */}
                                <form
                                    onSubmit={handleSaveStudent}
                                    className="bg-[#FBF5E6] border border-[#E5DAC0] rounded-2xl p-4 md:p-5 space-y-3"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <h3 className="font-bold text-sm text-[#2B2B2B]">
                                            Registrar o actualizar alumna
                                        </h3>
                                        <button
                                            type="button"
                                            onClick={() => setShowBulkImport((prev) => !prev)}
                                            className="text-xs font-bold text-[#A3363D] hover:underline"
                                        >
                                            {showBulkImport
                                                ? 'Ocultar importación Excel / CSV'
                                                : '+ Importar Excel (.xlsx, .xls) o CSV'}
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        <input
                                            type="text"
                                            value={stuFullName}
                                            onChange={(e) => setStuFullName(e.target.value)}
                                            placeholder="Nombre de la alumna"
                                            className="px-3 py-2 rounded-xl bg-[#FFFDF7] border border-[#E5DAC0] text-xs sm:text-sm text-[#2B2B2B]"
                                        />
                                        <input
                                            type="email"
                                            required
                                            value={stuEmail}
                                            onChange={(e) => setStuEmail(e.target.value)}
                                            placeholder="Usuario (correo de compra) *"
                                            className="px-3 py-2 rounded-xl bg-[#FFFDF7] border border-[#E5DAC0] text-xs sm:text-sm text-[#2B2B2B]"
                                        />
                                        <div className="flex gap-1.5">
                                            <input
                                                type="text"
                                                value={stuPassword}
                                                onChange={(e) => setStuPassword(e.target.value)}
                                                placeholder="Clave (opcional; si queda vacía la crea la alumna)"
                                                className="flex-1 px-3 py-2 rounded-xl bg-[#FFFDF7] border border-[#E5DAC0] text-xs sm:text-sm text-[#2B2B2B]"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setStuPassword(generateRandomPassword())}
                                                className="px-2.5 py-2 rounded-xl bg-[#FFFDF7] border border-[#E5DAC0] text-xs font-bold text-[#3F6B45]"
                                            >
                                                Generar
                                            </button>
                                        </div>
                                        <input
                                            type="url"
                                            value={stuUrl}
                                            onChange={(e) => setStuUrl(e.target.value)}
                                            placeholder="URL directa aula (opcional)"
                                            className="px-3 py-2 rounded-xl bg-[#FFFDF7] border border-[#E5DAC0] text-xs sm:text-sm text-[#2B2B2B] sm:col-span-2"
                                        />
                                        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#FFFDF7] border border-[#E5DAC0] text-xs">
                                            <label className="flex items-center gap-1.5 font-semibold text-[#2B2B2B]">
                                                <span>Máx. equipos (misma IP):</span>
                                                <select
                                                    value={stuMaxDevices}
                                                    onChange={(e) => setStuMaxDevices(Number(e.target.value))}
                                                    className="bg-[#FBF5E6] border border-[#E5DAC0] rounded px-1.5 py-0.5 font-bold"
                                                >
                                                    <option value={1}>1</option>
                                                    <option value={2}>2</option>
                                                    <option value={3}>3</option>
                                                </select>
                                            </label>
                                            <label className="flex items-center gap-1.5 font-semibold text-[#2B2B2B] cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={stuActive}
                                                    onChange={(e) => setStuActive(e.target.checked)}
                                                    className="accent-[#3F6B45]"
                                                />
                                                <span>Activa</span>
                                            </label>
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        className="px-6 py-2.5 rounded-full bg-[#3F6B45] hover:bg-[#2E4F35] text-white text-xs sm:text-sm font-bold transition-colors"
                                    >
                                        Guardar alumna
                                    </button>
                                </form>

                                {showBulkImport && (
                                    <div className="bg-[#FBF5E6] border border-[#E5DAC0] rounded-2xl p-4 md:p-5 space-y-4">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                            <div>
                                                <h4 className="font-bold text-sm text-[#2B2B2B]">
                                                    Importar archivo Excel (.xlsx, .xls) o CSV
                                                </h4>
                                                <p className="text-xs text-[#2B2B2B]/75 mt-0.5">
                                                    Columnas admitidas: <strong>correo</strong>, <strong>clave_acceso</strong>,{' '}
                                                    <strong>nombre</strong>, <strong>url_aula</strong>,{' '}
                                                    <strong>max_dispositivos</strong>, <strong>activo</strong>
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => downloadStudentsTemplate('xlsx')}
                                                    className="px-3.5 py-1.5 rounded-full bg-[#FFFDF7] border border-[#3F6B45] text-[#2E4F35] hover:bg-[#3F6B45] hover:text-white text-xs font-bold transition-colors"
                                                >
                                                    Descargar plantilla .xlsx
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => downloadStudentsTemplate('csv')}
                                                    className="px-3.5 py-1.5 rounded-full bg-[#FFFDF7] border border-[#E5DAC0] hover:border-[#3F6B45] text-[#2B2B2B] text-xs font-bold transition-colors"
                                                >
                                                    Plantilla .csv
                                                </button>
                                            </div>
                                        </div>

                                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                            <label className="inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-[#A3363D] hover:bg-[#862B31] text-white text-xs sm:text-sm font-bold cursor-pointer transition-colors">
                                                <span>Seleccionar archivo (.xlsx, .xls, .csv)</span>
                                                <input
                                                    type="file"
                                                    accept=".xlsx,.xls,.csv"
                                                    onChange={handleSpreadsheetSelected}
                                                    className="sr-only"
                                                />
                                            </label>
                                            {importFileName && (
                                                <span className="text-xs font-semibold text-[#3F6B45]">
                                                    Archivo cargado: {importFileName}
                                                </span>
                                            )}
                                        </div>

                                        {parsedImportRows.length > 0 && (
                                            <div className="bg-[#FFFDF7] border border-[#E5DAC0] rounded-xl p-3.5 space-y-3">
                                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                                    <span className="font-bold text-[#2E4F35] tabular-nums">
                                                        Listas para importar: {parsedImportRows.length} alumnas
                                                        {importPendingCount > 0
                                                            ? ` (${importPendingCount} crearán su clave al entrar)`
                                                            : ''}
                                                        {importSkippedCount > 0
                                                            ? ` · ${importSkippedCount} filas omitidas sin correo`
                                                            : ''}
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setParsedImportRows([]);
                                                                setImportFileName('');
                                                            }}
                                                            className="text-xs text-[#2B2B2B]/70 hover:text-[#A3363D] font-semibold"
                                                        >
                                                            Cancelar
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={isImportingFile}
                                                            onClick={handleConfirmSpreadsheetImport}
                                                            className="px-4 py-2 rounded-full bg-[#3F6B45] hover:bg-[#2E4F35] disabled:opacity-60 text-white text-xs font-bold"
                                                        >
                                                            {isImportingFile
                                                                ? 'Importando...'
                                                                : `Confirmar e importar (${parsedImportRows.length})`}
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-left text-xs border-collapse">
                                                        <thead>
                                                            <tr className="border-b border-[#E5DAC0] text-[#2B2B2B]/70">
                                                                <th className="py-1.5 pr-3">Correo</th>
                                                                <th className="py-1.5 pr-3">Clave</th>
                                                                <th className="py-1.5 pr-3">Nombre</th>
                                                                <th className="py-1.5">Equipos</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-[#E5DAC0]/60 tabular-nums">
                                                            {parsedImportRows.slice(0, 5).map((row, idx) => (
                                                                <tr key={`${row.email}-${idx}`}>
                                                                    <td className="py-1.5 pr-3 font-medium">{row.email}</td>
                                                                    <td className="py-1.5 pr-3 font-mono font-bold text-[#A3363D]">
                                                                        {row.classroomPassword || row.purchaseCode || 'Alumna la crea al entrar'}
                                                                    </td>
                                                                    <td className="py-1.5 pr-3">{row.fullName || '—'}</td>
                                                                    <td className="py-1.5">{row.maxDevices}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                    {parsedImportRows.length > 5 && (
                                                        <p className="text-[11px] text-[#2B2B2B]/65 mt-1.5">
                                                            Mostrando las primeras 5 de {parsedImportRows.length} filas.
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        <form onSubmit={handleBulkImport} className="pt-3 border-t border-[#E5DAC0] space-y-2">
                                            <label className="block text-xs font-bold text-[#2B2B2B]">
                                                O pega texto directo (una por línea: correo, clave_opcional, nombre)
                                            </label>
                                            <textarea
                                                rows={3}
                                                value={bulkText}
                                                onChange={(e) => setBulkText(e.target.value)}
                                                placeholder={'maria@correo.com, , María Pérez\nana@correo.com, FeriaCanva456, Ana Gómez'}
                                                className="w-full px-3 py-2 rounded-xl bg-[#FFFDF7] border border-[#E5DAC0] text-xs font-mono text-[#2B2B2B]"
                                            />
                                            <button
                                                type="submit"
                                                className="px-5 py-2 rounded-full bg-[#3F6B45] hover:bg-[#2E4F35] text-white text-xs font-bold"
                                            >
                                                Importar texto
                                            </button>
                                        </form>
                                    </div>
                                )}

                                {/* Listado de alumnas */}
                                <div className="space-y-3">
                                    <input
                                        type="search"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Buscar por correo, nombre o clave..."
                                        className="w-full px-4 py-2.5 rounded-xl bg-[#FBF5E6] border border-[#E5DAC0] text-sm text-[#2B2B2B]"
                                    />

                                    {filteredStudents.length === 0 ? (
                                        <p className="text-center text-sm text-[#2B2B2B]/70 py-6 bg-[#FBF5E6] rounded-2xl border border-[#E5DAC0]">
                                            No hay alumnas registradas que coincidan.
                                        </p>
                                    ) : (
                                        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                                            {filteredStudents.map((s) => (
                                                <div
                                                    key={s.id}
                                                    className="p-3.5 rounded-2xl bg-[#FBF5E6] border border-[#E5DAC0] flex flex-col md:flex-row md:items-center justify-between gap-3"
                                                >
                                                    <div className="min-w-0 space-y-0.5">
                                                        <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#2B2B2B]">
                                                            <span>{s.fullName || s.email}</span>
                                                            {!s.isActive && (
                                                                <span className="text-xs text-[#A3363D]">· Suspendida</span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-[#2B2B2B]/80 truncate">
                                                            {s.email} · Clave:{' '}
                                                            <strong className="font-mono">
                                                                {s.classroomPassword || s.purchaseCode || 'Pendiente de activar por alumna'}
                                                            </strong>
                                                        </p>
                                                        <p className="text-xs text-[#3F6B45] font-semibold tabular-nums">
                                                            Equipos: {s.authorizedDevicesCount}/{s.maxDevices}
                                                            {s.primaryIp ? ` · IP: ${s.primaryIp}` : ' · IP pendiente'}
                                                            {` · Clases vistas: ${s.completedClassIds?.length ?? 0}/9`}
                                                        </p>
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleEditStudent(s)}
                                                            className="px-3 py-1.5 rounded-full bg-[#FFFDF7] border border-[#E5DAC0] hover:border-[#3F6B45] text-xs font-bold text-[#2B2B2B]"
                                                        >
                                                            Editar
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleResetDevices(s.id, s.email)}
                                                            className="px-3 py-1.5 rounded-full bg-[#FFFDF7] border border-[#E5DAC0] hover:border-[#3F6B45] text-xs font-bold text-[#3F6B45]"
                                                        >
                                                            Restablecer IP/equipos
                                                        </button>
                                                        {adminRole === 'owner' && (
                                                            confirmDeleteStudentId === s.id ? (
                                                                <div className="flex items-center gap-1">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteStudent(s.id, s.email)}
                                                                        className="px-3 py-1.5 rounded-full bg-[#A3363D] text-white text-xs font-bold"
                                                                    >
                                                                        Confirmar
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setConfirmDeleteStudentId(null)}
                                                                        className="px-2.5 py-1.5 rounded-full bg-[#FFFDF7] border border-[#E5DAC0] text-xs font-semibold text-[#2B2B2B]"
                                                                    >
                                                                        Cancelar
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setConfirmDeleteStudentId(s.id)}
                                                                    className="px-3 py-1.5 rounded-full bg-[#FFFDF7] border border-[#E5DAC0] hover:border-[#A3363D] text-xs font-bold text-[#A3363D]"
                                                                >
                                                                    Eliminar
                                                                </button>
                                                            )
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : activeTab === 'forum' || adminRole === 'teacher' ? (
                            <div className="space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FBF5E6] border border-[#E5DAC0] rounded-2xl p-4">
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setForumFilter('pending')}
                                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold ${
                                                forumFilter === 'pending'
                                                    ? 'bg-[#A3363D] text-white'
                                                    : 'bg-[#FFFDF7] border border-[#E5DAC0] text-[#2B2B2B]'
                                            }`}
                                        >
                                            Pendientes ({pendingForumCount})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setForumFilter('all')}
                                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold ${
                                                forumFilter === 'all'
                                                    ? 'bg-[#3F6B45] text-white'
                                                    : 'bg-[#FFFDF7] border border-[#E5DAC0] text-[#2B2B2B]'
                                            }`}
                                        >
                                            Todas ({forumQuestions.length})
                                        </button>
                                    </div>

                                    <input
                                        type="text"
                                        value={teacherReplyName}
                                        onChange={(e) => setTeacherReplyName(e.target.value)}
                                        placeholder="Tu nombre visible al responder (ej. Prof. Yussef)"
                                        className="px-3 py-1.5 rounded-xl bg-[#FFFDF7] border border-[#E5DAC0] text-xs text-[#2B2B2B] sm:w-64"
                                    />
                                </div>

                                {visibleForumQuestions.length === 0 ? (
                                    <p className="text-center text-sm text-[#2B2B2B]/75 py-8 bg-[#FBF5E6] rounded-2xl border border-[#E5DAC0]">
                                        {forumFilter === 'pending'
                                            ? '¡Excelente! No hay dudas pendientes por responder.'
                                            : 'Aún no hay preguntas publicadas en el foro.'}
                                    </p>
                                ) : (
                                    <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                                        {visibleForumQuestions.map((q) => (
                                            <div
                                                key={q.id}
                                                className="p-4 rounded-2xl bg-[#FBF5E6] border border-[#E5DAC0] space-y-2.5"
                                            >
                                                <div className="flex flex-wrap items-start justify-between gap-2">
                                                    <div>
                                                        <p className="text-xs font-bold text-[#3F6B45]">
                                                            {q.workshopTitle}
                                                        </p>
                                                        <p className="text-sm font-bold text-[#2B2B2B] mt-0.5">
                                                            {q.title}
                                                        </p>
                                                        <p className="text-xs text-[#2B2B2B]/70">
                                                            Por {q.authorName}
                                                        </p>
                                                    </div>

                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span
                                                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                                                                q.status === 'answered'
                                                                    ? 'bg-[#3F6B45]/15 text-[#2E4F35]'
                                                                    : 'bg-[#FFF4C7] border border-[#E5C158] text-[#8A5A00]'
                                                            }`}
                                                        >
                                                            {q.status === 'answered' ? 'Respondida' : 'Pendiente'}
                                                        </span>
                                                        {adminRole === 'owner' && (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleStartEditQuestion(q)}
                                                                    className="text-xs font-bold text-[#3F6B45] hover:underline"
                                                                >
                                                                    Editar
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeleteForumQuestion(q.id)}
                                                                    className="text-xs font-bold text-[#A3363D] hover:underline"
                                                                >
                                                                    Eliminar
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>

                                                {editingQuestionId === q.id ? (
                                                    <div className="bg-[#FFFDF7] border border-[#3F6B45] rounded-xl p-3 space-y-2">
                                                        <input
                                                            type="text"
                                                            value={editQuestionAuthor}
                                                            onChange={(e) => setEditQuestionAuthor(e.target.value)}
                                                            placeholder="Nombre del alumno/a"
                                                            className="w-full px-3 py-1.5 rounded-lg bg-[#FBF5E6] border border-[#E5DAC0] text-xs text-[#2B2B2B]"
                                                        />
                                                        <input
                                                            type="text"
                                                            value={editQuestionTitle}
                                                            onChange={(e) => setEditQuestionTitle(e.target.value)}
                                                            placeholder="Título de la consulta *"
                                                            className="w-full px-3 py-1.5 rounded-lg bg-[#FBF5E6] border border-[#E5DAC0] text-xs font-bold text-[#2B2B2B]"
                                                        />
                                                        <textarea
                                                            rows={2}
                                                            value={editQuestionBody}
                                                            onChange={(e) => setEditQuestionBody(e.target.value)}
                                                            placeholder="Detalle del comentario..."
                                                            className="w-full px-3 py-1.5 rounded-lg bg-[#FBF5E6] border border-[#E5DAC0] text-xs text-[#2B2B2B]"
                                                        />
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                disabled={savingQuestionEdit || !editQuestionTitle.trim()}
                                                                onClick={() => handleSaveQuestionEdit(q.id)}
                                                                className="px-3.5 py-1.5 rounded-full bg-[#3F6B45] text-white text-xs font-bold disabled:opacity-50"
                                                            >
                                                                {savingQuestionEdit ? 'Guardando...' : 'Guardar cambios'}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditingQuestionId(null)}
                                                                className="px-3 py-1.5 rounded-full bg-[#FBF5E6] border border-[#E5DAC0] text-xs font-semibold text-[#2B2B2B]"
                                                            >
                                                                Cancelar
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    q.body && (
                                                        <p className="text-xs text-[#2B2B2B]/90 bg-[#FFFDF7] p-2.5 rounded-xl border border-[#E5DAC0]">
                                                            {q.body}
                                                        </p>
                                                    )
                                                )}

                                                {q.replies.length > 0 && (
                                                    <div className="space-y-2 pl-3 border-l-2 border-[#3F6B45]">
                                                        {q.replies.map((r) => {
                                                            const isOwnReply =
                                                                (Boolean(r.authorAdminId) &&
                                                                    Boolean(adminId) &&
                                                                    r.authorAdminId === adminId) ||
                                                                (Boolean(r.authorEmail) &&
                                                                    r.authorEmail!.toLowerCase() ===
                                                                        adminEmail.trim().toLowerCase());
                                                            const canEditReply =
                                                                adminRole === 'owner' ||
                                                                ((adminRole === 'teacher' || adminRole === 'support') && isOwnReply);

                                                            return (
                                                            <div
                                                                key={r.id}
                                                                className="bg-[#FFFDF7]/85 rounded-lg p-2 border border-[#E5DAC0]/70 space-y-1.5"
                                                            >
                                                                <div className="flex flex-wrap items-start justify-between gap-2">
                                                                    <p className="text-xs text-[#2B2B2B]/90 flex-1">
                                                                        <strong className={r.isOfficial ? 'text-[#3F6B45]' : 'text-[#2B2B2B]'}>
                                                                            {r.authorName}:
                                                                        </strong>{' '}
                                                                        {r.body}
                                                                    </p>
                                                                    {(canEditReply || adminRole === 'owner') && (
                                                                        <div className="flex items-center gap-2 shrink-0">
                                                                            {canEditReply && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleStartEditReply(r.id, r.body)}
                                                                                    className="text-[11px] font-bold text-[#3F6B45] hover:underline"
                                                                                >
                                                                                    {adminRole === 'owner' ? 'Editar' : 'Editar mi respuesta'}
                                                                                </button>
                                                                            )}
                                                                            {adminRole === 'owner' && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleDeleteForumReply(q.id, r.id)}
                                                                                    className="text-[11px] font-bold text-[#A3363D] hover:underline"
                                                                                >
                                                                                    Eliminar
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {editingReplyId === r.id && (
                                                                    <div className="flex flex-col sm:flex-row gap-1.5 pt-1">
                                                                        <input
                                                                            type="text"
                                                                            value={editReplyBody}
                                                                            onChange={(e) => setEditReplyBody(e.target.value)}
                                                                            className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#FBF5E6] border border-[#3F6B45] text-xs text-[#2B2B2B]"
                                                                        />
                                                                        <div className="flex items-center gap-1.5">
                                                                            <button
                                                                                type="button"
                                                                                disabled={savingReplyEdit || !editReplyBody.trim()}
                                                                                onClick={() => handleSaveReplyEdit(q.id, r.id)}
                                                                                className="px-3 py-1.5 rounded-full bg-[#3F6B45] text-white text-[11px] font-bold disabled:opacity-50"
                                                                            >
                                                                                {savingReplyEdit ? 'Guardando...' : 'Guardar'}
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setEditingReplyId(null)}
                                                                                className="px-2.5 py-1.5 rounded-full bg-[#FBF5E6] border border-[#E5DAC0] text-[11px] font-semibold text-[#2B2B2B]"
                                                                            >
                                                                                Cancelar
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                                                    <input
                                                        type="text"
                                                        value={replyDrafts[q.id] || ''}
                                                        onChange={(e) =>
                                                            setReplyDrafts((prev) => ({
                                                                ...prev,
                                                                [q.id]: e.target.value,
                                                            }))
                                                        }
                                                        placeholder="Escribe la respuesta oficial del profesor/colaborador..."
                                                        className="flex-1 px-3 py-2 rounded-xl bg-[#FFFDF7] border border-[#E5DAC0] text-xs text-[#2B2B2B]"
                                                    />
                                                    <button
                                                        type="button"
                                                        disabled={sendingReplyId === q.id || !(replyDrafts[q.id] || '').trim()}
                                                        onClick={() => handleSendOfficialReply(q.id)}
                                                        className="px-4 py-2 rounded-full bg-[#3F6B45] hover:bg-[#2E4F35] disabled:opacity-50 text-white text-xs font-bold shrink-0"
                                                    >
                                                        {sendingReplyId === q.id
                                                            ? 'Publicando...'
                                                            : 'Responder oficialmente'}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : activeTab === 'recordings' && canManageStudentsAndRecordings ? (
                            <div className="space-y-4">
                                <div className="p-4 rounded-2xl bg-[#FBF5E6] border border-[#E5DAC0] space-y-1">
                                    <h3 className="font-bold text-sm text-[#2B2B2B]">
                                        Interruptor de Grabaciones por Taller
                                    </h3>
                                    <p className="text-xs text-[#2B2B2B]/80 leading-relaxed">
                                        Cuando una clase finaliza y el interruptor está apagado, la tarjeta muestra:{' '}
                                        <strong>&ldquo;Clase finalizada · Pronto la grabación estará disponible&rdquo;</strong>. Al
                                        activar el interruptor cuando subas el video a ClassOnLive, cambiará automáticamente a{' '}
                                        <strong>&ldquo;¡Ya puedes ver la grabación!&rdquo;</strong> para todas las alumnas.
                                    </p>
                                </div>

                                <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                                    {classData.map((clase) => {
                                        const isReady = Boolean(recordingsMap[clase.id]);
                                        const isBusy = togglingWorkshopId === clase.id;
                                        return (
                                            <div
                                                key={clase.id}
                                                className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                                                    isReady
                                                        ? 'bg-[#3F6B45]/10 border-[#3F6B45]/45'
                                                        : 'bg-[#FBF5E6] border-[#E5DAC0]'
                                                }`}
                                            >
                                                <div className="min-w-0 space-y-0.5">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="text-sm font-bold text-[#2B2B2B]">{clase.titulo}</p>
                                                        <span
                                                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                                                                isReady
                                                                    ? 'bg-[#3F6B45] text-white'
                                                                    : 'bg-[#FFF4C7] border border-[#E5C158] text-[#8A5A00]'
                                                            }`}
                                                        >
                                                            {isReady ? '🎬 Grabación lista' : '⏳ Pronto grabación'}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-[#2B2B2B]/75">
                                                        {clase.ponentes.map((p) => p.nombre).join(', ')} · {clase.date} · {clase.time}
                                                    </p>
                                                </div>

                                                <button
                                                    type="button"
                                                    role="switch"
                                                    aria-checked={isReady}
                                                    disabled={isBusy}
                                                    onClick={() => void handleToggleRecording(clase.id, clase.titulo)}
                                                    className={`inline-flex items-center gap-2.5 px-4 py-2 rounded-full text-xs font-bold transition-colors shrink-0 disabled:opacity-60 ${
                                                        isReady
                                                            ? 'bg-[#3F6B45] hover:bg-[#2E4F35] text-white'
                                                            : 'bg-[#FFFDF7] border border-[#E5DAC0] hover:border-[#3F6B45] text-[#2B2B2B]'
                                                    }`}
                                                >
                                                    <span
                                                        className={`w-8 h-4.5 rounded-full relative inline-flex items-center transition-colors ${
                                                            isReady ? 'bg-white/30' : 'bg-[#E5DAC0]'
                                                        }`}
                                                    >
                                                        <span
                                                            className={`w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${
                                                                isReady ? 'translate-x-4' : 'translate-x-0.5'
                                                            }`}
                                                        />
                                                    </span>
                                                    <span>
                                                        {isBusy
                                                            ? 'Guardando...'
                                                            : isReady
                                                              ? 'Grabación activada'
                                                              : 'Activar grabación'}
                                                    </span>
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : activeTab === 'alerts' && canManageStudentsAndRecordings ? (
                            <div className="space-y-3">
                                {alerts.length === 0 ? (
                                    <p className="text-center text-sm text-[#2B2B2B]/75 py-8 bg-[#FBF5E6] rounded-2xl border border-[#E5DAC0]">
                                        No hay alertas de uso compartido, cambios de IP o exceso de equipos registradas.
                                    </p>
                                ) : (
                                    <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                                        {alerts.map((alert) => (
                                            <div
                                                key={alert.id}
                                                className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                                    alert.resolved
                                                        ? 'bg-[#FBF5E6]/60 border-[#E5DAC0] opacity-75'
                                                        : 'bg-[#A3363D]/10 border-[#A3363D]'
                                                }`}
                                            >
                                                <div className="space-y-1">
                                                    <p className="text-xs font-bold uppercase tracking-wider text-[#A3363D]">
                                                        {getAlertReasonLabel(alert.reason)}
                                                        {alert.resolved ? ' · Resuelta' : ''}
                                                    </p>
                                                    <p className="text-sm font-bold text-[#2B2B2B] tabular-nums">
                                                        {alert.fullName ? `${alert.fullName} (${alert.email})` : alert.email} registra{' '}
                                                        {alert.detectedDevicesCount} dispositivos intentando conectarse
                                                    </p>
                                                    <p className="text-xs text-[#2B2B2B]/80 tabular-nums">
                                                        Equipo bloqueado: {alert.attemptedDeviceLabel}
                                                        {alert.attemptedIp ? ` · IP detectada: ${alert.attemptedIp}` : ''}
                                                        {alert.ipsSeen && alert.ipsSeen.length > 0
                                                            ? ` · IPs vistas: ${alert.ipsSeen.join(', ')}`
                                                            : ''}
                                                        {alert.countriesSeen.length > 0
                                                            ? ` · Países: ${alert.countriesSeen.join(', ')}`
                                                            : ''}
                                                    </p>
                                                </div>

                                                {!alert.resolved && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleResetDevices(alert.studentId, alert.email)}
                                                        className="px-4 py-2 rounded-full bg-[#3F6B45] hover:bg-[#2E4F35] text-white text-xs font-bold shrink-0"
                                                    >
                                                        Restablecer y desbloquear
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-5">
                                {pendingCollaborators.length > 0 && (
                                    <div className="bg-[#FFF4C7]/60 border-2 border-[#E5C158] rounded-2xl p-4 space-y-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                                <h3 className="font-bold text-sm text-[#8A5A00]">
                                                    Solicitudes de colaboradoras pendientes de aprobación ({pendingCollaborators.length})
                                                </h3>
                                                <p className="text-xs text-[#2B2B2B]/75">
                                                    Al aprobar, podrán entrar al Foro de Dudas para responder y editar sus propias respuestas.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            {pendingCollaborators.map((pending) => (
                                                <div
                                                    key={pending.id}
                                                    className="p-3 rounded-xl bg-[#FFFDF7] border border-[#E5C158] flex flex-wrap items-center justify-between gap-3"
                                                >
                                                    <div>
                                                        <p className="text-sm font-bold text-[#2B2B2B]">
                                                            {pending.displayName}
                                                        </p>
                                                        <p className="text-xs text-[#2B2B2B]/75">
                                                            {pending.adminEmail} · Rol: Profesora / Colaboradora (Solo Foro)
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                handleReviewCollaborator(
                                                                    pending.id,
                                                                    pending.adminEmail,
                                                                    true
                                                                )
                                                            }
                                                            className="px-3.5 py-1.5 rounded-full bg-[#3F6B45] hover:bg-[#2E4F35] text-white text-xs font-bold"
                                                        >
                                                            Aprobar acceso
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                handleReviewCollaborator(
                                                                    pending.id,
                                                                    pending.adminEmail,
                                                                    false
                                                                )
                                                            }
                                                            className="px-3 py-1.5 rounded-full bg-[#FFFDF7] border border-[#A3363D] text-[#A3363D] hover:bg-[#A3363D] hover:text-white text-xs font-bold transition-colors"
                                                        >
                                                            Rechazar
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <form
                                    onSubmit={handleRegisterAdditionalAdmin}
                                    className="bg-[#FBF5E6] border border-[#E5DAC0] rounded-2xl p-4 md:p-5 space-y-3"
                                >
                                    <h3 className="font-bold text-sm text-[#2B2B2B]">
                                        Registrar miembro del equipo (Dueño/a, Soporte o Profesor/a)
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                        <input
                                            type="text"
                                            required
                                            value={newAdminName}
                                            onChange={(e) => setNewAdminName(e.target.value)}
                                            placeholder="Nombre completo *"
                                            className="px-3 py-2 rounded-xl bg-[#FFFDF7] border border-[#E5DAC0] text-xs sm:text-sm text-[#2B2B2B]"
                                        />
                                        <input
                                            type="email"
                                            required
                                            value={newAdminEmail}
                                            onChange={(e) => setNewAdminEmail(e.target.value)}
                                            placeholder="Correo *"
                                            className="px-3 py-2 rounded-xl bg-[#FFFDF7] border border-[#E5DAC0] text-xs sm:text-sm text-[#2B2B2B]"
                                        />
                                        <input
                                            type="text"
                                            required
                                            minLength={4}
                                            value={newAdminKey}
                                            onChange={(e) => setNewAdminKey(e.target.value)}
                                            placeholder="Clave temporal / acceso (mín. 4) *"
                                            className="px-3 py-2 rounded-xl bg-[#FFFDF7] border border-[#E5DAC0] text-xs sm:text-sm text-[#2B2B2B]"
                                        />
                                        <select
                                            value={newAdminRole}
                                            onChange={(e) => setNewAdminRole(normalizeAdminRole(e.target.value))}
                                            className="px-3 py-2 rounded-xl bg-[#FFFDF7] border border-[#E5DAC0] text-xs sm:text-sm font-semibold text-[#2B2B2B]"
                                        >
                                            <option value="owner">Dueño/a · Acceso total</option>
                                            <option value="support">Soporte · Apoyo logístico</option>
                                            <option value="teacher">Profesor/a · Solo Foro</option>
                                        </select>
                                    </div>
                                    <label className="flex items-center gap-2 text-xs text-[#2B2B2B] cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={newAdminMustChange}
                                            onChange={(e) => setNewAdminMustChange(e.target.checked)}
                                            className="accent-[#3F6B45]"
                                        />
                                        <span>Pedir cambio obligatorio de clave temporal al ingresar por primera vez</span>
                                    </label>
                                    <button
                                        type="submit"
                                        className="px-6 py-2.5 rounded-full bg-[#3F6B45] hover:bg-[#2E4F35] text-white text-xs sm:text-sm font-bold transition-colors"
                                    >
                                        Registrar cuenta
                                    </button>
                                </form>

                                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                                    {approvedAdmins.length === 0 ? (
                                        <p className="text-center text-sm text-[#2B2B2B]/70 py-6 bg-[#FBF5E6] rounded-2xl border border-[#E5DAC0]">
                                            Solo tu sesión actual está activa.
                                        </p>
                                    ) : (
                                        approvedAdmins.map((adm) => {
                                            const isSelf =
                                                adm.adminEmail.toLowerCase() === adminEmail.trim().toLowerCase();
                                            const isLastActiveOwner =
                                                adm.role === 'owner' && approvedOwnersCount <= 1;
                                            const canDeleteEntry = !isSelf || !isLastActiveOwner;

                                            return (
                                                <div
                                                    key={adm.id}
                                                    className="p-3.5 rounded-2xl bg-[#FBF5E6] border border-[#E5DAC0] flex flex-wrap items-center justify-between gap-3"
                                                >
                                                    <div>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <p className="text-sm font-bold text-[#2B2B2B]">
                                                                {adm.displayName}
                                                            </p>
                                                            <span
                                                                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                                                    adm.role === 'owner'
                                                                        ? 'bg-[#3F6B45]/15 text-[#2E4F35]'
                                                                        : adm.role === 'support'
                                                                          ? 'bg-[#A3363D]/12 text-[#A3363D]'
                                                                          : 'bg-[#FFF4C7] text-[#8A5A00]'
                                                                }`}
                                                            >
                                                                {adm.role === 'owner'
                                                                    ? 'Dueño/a · Total'
                                                                    : adm.role === 'support'
                                                                      ? 'Soporte · Logístico'
                                                                      : 'Profesor/a · Foro'}
                                                            </span>
                                                            {adm.mustChangePassword && (
                                                                <span className="text-[11px] font-bold text-[#A3363D]">
                                                                    · Clave temporal pendiente
                                                                </span>
                                                            )}
                                                            {isSelf && (
                                                                <span className="text-xs font-bold text-[#3F6B45]">
                                                                    (Sesión actual)
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-[#2B2B2B]/75">{adm.adminEmail}</p>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <select
                                                            aria-label={`Cambiar rol de ${adm.adminEmail}`}
                                                            value={adm.role}
                                                            disabled={isLastActiveOwner || updatingRoleAdminId === adm.id}
                                                            onChange={(e) =>
                                                                void handleChangeAdminRole(
                                                                    adm,
                                                                    normalizeAdminRole(e.target.value)
                                                                )
                                                            }
                                                            className="px-2.5 py-1.5 rounded-full bg-[#FFFDF7] border border-[#E5DAC0] text-xs font-semibold text-[#2B2B2B] disabled:opacity-60"
                                                        >
                                                            <option value="owner">Dueño/a · Total</option>
                                                            <option value="support">Soporte · Logístico</option>
                                                            <option value="teacher">Profesor/a · Foro</option>
                                                        </select>

                                                        {canDeleteEntry ? (
                                                            confirmDeleteAdminId === adm.id ? (
                                                                <div className="flex items-center gap-1.5">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteAdmin(adm.id, adm.adminEmail)}
                                                                        className="px-3 py-1.5 rounded-full bg-[#A3363D] text-white text-xs font-bold"
                                                                    >
                                                                        {isSelf ? 'Confirmar auto-eliminación' : 'Confirmar'}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setConfirmDeleteAdminId(null)}
                                                                        className="px-2.5 py-1.5 rounded-full bg-[#FFFDF7] border border-[#E5DAC0] text-xs font-semibold text-[#2B2B2B]"
                                                                    >
                                                                        Cancelar
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setConfirmDeleteAdminId(adm.id)}
                                                                    className="px-3 py-1.5 rounded-full bg-[#FFFDF7] border border-[#E5DAC0] hover:border-[#A3363D] text-xs font-bold text-[#A3363D]"
                                                                >
                                                                    {isSelf ? 'Eliminar mi perfil' : 'Eliminar'}
                                                                </button>
                                                            )
                                                        ) : (
                                                            <span className="text-[11px] font-semibold text-[#2B2B2B]/60">
                                                                Único dueño activo
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminPortalModal;
