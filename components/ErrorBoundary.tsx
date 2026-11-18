import React from 'react';

interface ErrorBoundaryProps {
    children: React.ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    declare readonly props: ErrorBoundaryProps;
    state: ErrorBoundaryState = { hasError: false };

    static getDerivedStateFromError(): ErrorBoundaryState {
        return { hasError: true };
    }

    componentDidCatch(error: Error): void {
        console.error('Error de renderizado en Territorio Canva:', error);
    }

    private handleClearCacheAndReload = async (): Promise<void> => {
        try {
            if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map((r) => r.unregister()));
            }
            if ('caches' in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map((k) => caches.delete(k)));
            }
        } catch {
            // Ignorar errores al limpiar caché
        }
        window.location.reload();
    };

    render(): React.ReactNode {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-[#2E4F35] flex items-center justify-center p-4">
                    <div className="max-w-md w-full bg-[#FFFDF7] rounded-[26px] border-2 border-[#E5DAC0] shadow-2xl p-6 text-center space-y-4">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#3F6B45]">
                            6ta Feria Territorio Canva
                        </p>
                        <h1 className="font-title italic text-2xl font-bold text-[#A3363D]">
                            Actualización disponible
                        </h1>
                        <p className="text-sm text-[#2B2B2B]/85 leading-relaxed">
                            Detectamos una versión anterior en caché o un error temporal al cargar la pantalla. Limpia la caché rápida para mostrar la versión más reciente.
                        </p>
                        <div className="flex flex-col gap-2.5 pt-1">
                            <button
                                type="button"
                                onClick={() => void this.handleClearCacheAndReload()}
                                className="w-full py-3 px-5 rounded-full bg-[#A3363D] hover:bg-[#8B2B31] text-white font-bold text-sm shadow transition-colors"
                            >
                                Limpiar caché y recargar
                            </button>
                            <button
                                type="button"
                                onClick={() => window.location.reload()}
                                className="w-full py-2.5 px-5 rounded-full bg-[#FBF5E6] hover:bg-[#F3E9D2] border border-[#E5DAC0] text-[#2B2B2B] font-semibold text-xs transition-colors"
                            >
                                Solo recargar página
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
