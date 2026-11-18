import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

const SW_RELOAD_GUARD_KEY = 'territorio_canva_sw_last_reload';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        try {
            const lastReload = Number(sessionStorage.getItem(SW_RELOAD_GUARD_KEY) || '0');
            if (Date.now() - lastReload < 15000) {
                return;
            }
            sessionStorage.setItem(SW_RELOAD_GUARD_KEY, String(Date.now()));
        } catch {
            // Ignorar si sessionStorage no está disponible
        }
        refreshing = true;
        window.location.reload();
    });
}

try {
    const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
            void updateSW(true);
        },
        onRegisteredSW(_swUrl, registration) {
            if (!registration) return;
            const checkUpdate = () => {
                void registration.update().catch(() => {
                    // Ignorar errores de red al comprobar actualización
                });
            };
            window.addEventListener('focus', checkUpdate);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    checkUpdate();
                }
            });
        },
        onRegisterError() {
            // Ignorar si el navegador o iframe restringe Service Workers
        },
    });
} catch {
    // Evitar bloqueo de arranque si registerSW falla en entorno embebido
}

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <React.StrictMode>
            <ErrorBoundary>
                <App />
            </ErrorBoundary>
        </React.StrictMode>
    );
} else {
    console.error('Failed to find the root element. The React app could not be mounted.');
}
