import React, { useEffect } from 'react';

export type LegalDocumentType = 'terms' | 'privacy';

interface LegalModalProps {
    isOpen: boolean;
    activeDoc: LegalDocumentType;
    onSelectDoc: (doc: LegalDocumentType) => void;
    onClose: () => void;
}

const LegalModal: React.FC<LegalModalProps> = ({ isOpen, activeDoc, onSelectDoc, onClose }) => {
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="legal-modal-title"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            className="fixed inset-0 z-[65] bg-[#2B2B2B]/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        >
            <div className="bg-[#FFFDF7] rounded-[26px] shadow-2xl p-6 md:p-8 max-w-2xl w-full border-2 border-[#3F6B45] relative my-auto max-h-[88vh] flex flex-col">
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Cerrar documento legal"
                    className="absolute top-4 right-4 w-9 h-9 rounded-full bg-[#FBF5E6] border border-[#E5DAC0] text-[#2B2B2B] hover:border-[#A3363D] hover:text-[#A3363D] font-bold flex items-center justify-center transition-colors"
                >
                    ✕
                </button>

                <div className="pr-10 space-y-3 shrink-0">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#3F6B45]">
                        Información legal y de uso
                    </p>
                    <h2 id="legal-modal-title" className="font-title italic text-xl md:text-2xl font-bold text-[#A3363D] leading-snug">
                        {activeDoc === 'terms'
                            ? 'Términos y Condiciones de Uso · App Oficial 6ta Feria Canva Navideña'
                            : 'Política de Privacidad y Protección de Datos · App 6ta Feria Canva Navideña'}
                    </h2>

                    <div className="inline-flex p-1 rounded-full bg-[#FBF5E6] border border-[#E5DAC0]">
                        <button
                            type="button"
                            onClick={() => onSelectDoc('terms')}
                            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
                                activeDoc === 'terms'
                                    ? 'bg-[#3F6B45] text-white shadow-xs'
                                    : 'text-[#2B2B2B]/80 hover:text-[#2B2B2B]'
                            }`}
                        >
                            Términos y Condiciones
                        </button>
                        <button
                            type="button"
                            onClick={() => onSelectDoc('privacy')}
                            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
                                activeDoc === 'privacy'
                                    ? 'bg-[#3F6B45] text-white shadow-xs'
                                    : 'text-[#2B2B2B]/80 hover:text-[#2B2B2B]'
                            }`}
                        >
                            Política de Privacidad
                        </button>
                    </div>
                </div>

                <div className="mt-5 overflow-y-auto pr-1 space-y-4 text-xs sm:text-sm text-[#2B2B2B]/90 leading-relaxed">
                    {activeDoc === 'terms' ? (
                        <>
                            <section className="p-4 rounded-2xl bg-[#FBF5E6] border border-[#E5DAC0] space-y-1.5">
                                <h3 className="font-bold text-[#A3363D] uppercase text-xs tracking-wider">
                                    1. Aceptación y Uso Exclusivo
                                </h3>
                                <p>
                                    Al ingresar y utilizar esta aplicación web (PWA), aceptas cumplir con los presentes Términos y Condiciones. Esta aplicación ha sido desarrollada exclusivamente para el uso de los participantes inscritos en el Aula Virtual Premium de la 6ta Feria Latinoamérica Territorio Canva (Edición Navideña). El acceso a los enlaces de clase, credenciales y funciones de alumna está restringido únicamente a usuarios autorizados.
                                </p>
                            </section>

                            <section className="p-4 rounded-2xl bg-[#FBF5E6] border border-[#E5DAC0] space-y-2">
                                <h3 className="font-bold text-[#A3363D] uppercase text-xs tracking-wider">
                                    2. Propiedad Intelectual y Derechos de Autor
                                </h3>
                                <ul className="space-y-1.5 list-disc list-inside">
                                    <li>
                                        <strong>Marcas y Contenidos del Evento:</strong> Todos los derechos sobre las marcas, logotipos, materiales didácticos, elementos visuales de la campaña y, de manera exclusiva, el personaje y marca &ldquo;Pincelín&rdquo; pertenecen de forma única y reservada a los organizadores del evento.
                                    </li>
                                    <li>
                                        <strong>Plataforma e Interfaz:</strong> El código fuente, la arquitectura tecnológica, la estructura de la aplicación y el diseño de la interfaz (UI/UX) son de la autoría y propiedad exclusiva del desarrollador de la app.
                                    </li>
                                    <li>
                                        <strong>Uso Prohibido:</strong> Queda estrictamente prohibida la extracción, reproducción, duplicación, ingeniería inversa, distribución o comercialización no autorizada de cualquier elemento técnico, gráfico o de contenido de esta aplicación.
                                    </li>
                                </ul>
                            </section>

                            <section className="p-4 rounded-2xl bg-[#FBF5E6] border border-[#E5DAC0] space-y-2">
                                <h3 className="font-bold text-[#A3363D] uppercase text-xs tracking-wider">
                                    3. Control de Acceso y Seguridad (Antipiratería)
                                </h3>
                                <ul className="space-y-1.5 list-disc list-inside">
                                    <li>
                                        El acceso a la plataforma es personal e intransferible, validado a través del correo electrónico registrado al momento de la compra y su clave de acceso.
                                    </li>
                                    <li>
                                        Por motivos de seguridad y protección de contenidos (al tratarse de una aplicación web directa y no descargada de tiendas oficiales), cada pase permite mantener activos un máximo de <strong>dos (2) equipos personales simultáneos</strong> dentro del mismo país, pudiendo conectarse desde distintas redes (Wi-Fi del hogar, datos móviles o trabajo). En caso de requerir usar otro equipo, la aplicación permite realizar un reemplazo controlado (hasta 2 cambios por semana).
                                    </li>
                                    <li>
                                        El sistema cuenta con mecanismos automáticos de monitoreo antipiratería que registran fecha, hora, país aproximado y dispositivos vinculados para detectar intentos de acceso desde otros países, duplicación de credenciales o uso indebido de la cuenta, reservándose el derecho de suspender o bloquear el acceso en caso de irregularidades.
                                    </li>
                                </ul>
                            </section>

                            <section className="p-4 rounded-2xl bg-[#FBF5E6] border border-[#E5DAC0] space-y-1.5">
                                <h3 className="font-bold text-[#A3363D] uppercase text-xs tracking-wider">
                                    4. Almacenamiento de Progreso y Credenciales
                                </h3>
                                <p>
                                    La app permite guardar tus accesos rápidos y el marcado de &ldquo;clases vistas&rdquo; tanto en la memoria local de tu navegador o dispositivo como de forma sincronizada con tu cuenta en la plataforma para facilitarte el control de tu avance. Es responsabilidad de la usuaria mantener la seguridad física y privada de sus dispositivos.
                                </p>
                            </section>

                            <section className="p-4 rounded-2xl bg-[#FBF5E6] border border-[#E5DAC0] space-y-1.5">
                                <h3 className="font-bold text-[#A3363D] uppercase text-xs tracking-wider">
                                    5. Normas del Foro de Dudas y Comunidad
                                </h3>
                                <p>
                                    El Foro de Dudas es un espacio de soporte académico exclusivo para consultas relacionadas con los talleres de la feria. Los organizadores se reservan el derecho de moderar, editar, ocultar o eliminar comentarios que resulten ofensivos, ajenos a la temática de las clases o que incumplan las normas de respeto de la comunidad.
                                </p>
                            </section>
                        </>
                    ) : (
                        <>
                            <section className="p-4 rounded-2xl bg-[#FBF5E6] border border-[#E5DAC0] space-y-1.5">
                                <h3 className="font-bold text-[#3F6B45] uppercase text-xs tracking-wider">
                                    1. Responsable y Finalidad del Tratamiento de Datos
                                </h3>
                                <p>
                                    Los datos recopilados (nombre, correo electrónico de registro, país aproximado, identificadores técnicos de dispositivo/conexión y registros de fecha y hora de actividad) son procesados únicamente con el fin de validar tu inscripción al Aula Virtual Premium, verificar tu identidad al ingresar, darte soporte en los talleres, obtener métricas internas de participación y garantizar la seguridad del evento.
                                </p>
                            </section>

                            <section className="p-4 rounded-2xl bg-[#FBF5E6] border border-[#E5DAC0] space-y-1.5">
                                <h3 className="font-bold text-[#3F6B45] uppercase text-xs tracking-wider">
                                    2. Almacenamiento Local en tu Dispositivo
                                </h3>
                                <p>
                                    Esta aplicación utiliza almacenamiento local en tu navegador (Local Storage / Session Storage / Cache PWA) para guardar tus preferencias, credenciales de acceso rápido y el marcador de clases vistas (sincronizados también con tu cuenta en nuestra plataforma). Estos datos permanecen en tu propio dispositivo para darte una experiencia fluida sin necesidad de pedirte clave en cada sesión.
                                </p>
                            </section>

                            <section className="p-4 rounded-2xl bg-[#FBF5E6] border border-[#E5DAC0] space-y-2">
                                <h3 className="font-bold text-[#3F6B45] uppercase text-xs tracking-wider">
                                    3. Protección y Seguridad de la Información
                                </h3>
                                <p>Nos tomamos muy en serio la seguridad de tu información:</p>
                                <ul className="space-y-1.5 list-disc list-inside">
                                    <li>No vendemos, alquilamos ni compartimos tus datos personales con terceros.</li>
                                    <li>
                                        Implementamos controles técnicos de verificación por país, auditoría de conexión e identificación de hasta dos (2) equipos personales activos para proteger tu cuenta y evitar accesos no autorizados por parte de terceros.
                                    </li>
                                </ul>
                            </section>

                            <section className="p-4 rounded-2xl bg-[#FBF5E6] border border-[#E5DAC0] space-y-1.5">
                                <h3 className="font-bold text-[#3F6B45] uppercase text-xs tracking-wider">
                                    4. Datos en el Foro de Dudas
                                </h3>
                                <p>
                                    Ten en cuenta que el nombre o alias que elijas mostrar, la bandera de tu país y las preguntas o comentarios que publiques en el Foro de Dudas por taller serán visibles para el equipo docente y las demás alumnas validadas del Aula Virtual Premium con el fin de enriquecer el aprendizaje grupal (pudiendo mostrarse una consulta de muestra como vista previa de la comunidad).
                                </p>
                            </section>

                            <section className="p-4 rounded-2xl bg-[#FBF5E6] border border-[#E5DAC0] space-y-1.5">
                                <h3 className="font-bold text-[#3F6B45] uppercase text-xs tracking-wider">
                                    5. Contacto y Derechos
                                </h3>
                                <p>
                                    Si deseas actualizar tus datos de registro o tienes alguna duda sobre tu acceso, puedes comunicarte directamente con el equipo de soporte oficial de la 6ta Feria Latinoamérica Territorio Canva.
                                </p>
                            </section>
                        </>
                    )}
                </div>

                <div className="pt-4 mt-2 border-t border-[#E5DAC0] shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-full py-2.5 px-6 rounded-full bg-[#3F6B45] hover:bg-[#2E4F35] text-white text-sm font-bold transition-colors"
                    >
                        Entendido · Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LegalModal;
