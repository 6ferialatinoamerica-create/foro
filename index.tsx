import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

try {
    registerSW({
        immediate: false,
        onRegisteredSW(_swUrl, registration) {
            if (!registration) return;
            const checkUpdate = () => {
                void registration.update().catch(() => {
                    // Ignorar errores de red al comprobar actualización
                });
            };
            window.addEventListener('focus', checkUpdate);
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
