import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
    interface Window {
        __pwaDeferredPrompt?: BeforeInstallPromptEvent | null;
    }
}

export function usePWAInstall() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
        if (typeof window !== 'undefined' && window.__pwaDeferredPrompt) {
            return window.__pwaDeferredPrompt;
        }
        return null;
    });
    const [isInstalled, setIsInstalled] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [isInAppOrIframe, setIsInAppOrIframe] = useState(false);

    useEffect(() => {
        const isStandalone =
            window.matchMedia('(display-mode: standalone)').matches ||
            (window.navigator as unknown as { standalone?: boolean }).standalone === true;
        setIsInstalled(isStandalone);

        const userAgent = window.navigator.userAgent.toLowerCase();
        const isIOSDevice =
            /iphone|ipad|ipod/.test(userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        setIsIOS(isIOSDevice);

        const inIframe = (() => {
            try {
                return window.self !== window.top;
            } catch {
                return true;
            }
        })();
        const inAppBrowser = /fban|fbav|instagram|whatsapp|line\/|micromessenger|tiktok|wv\)/i.test(userAgent);
        setIsInAppOrIframe(inIframe || inAppBrowser);

        if (window.__pwaDeferredPrompt) {
            setDeferredPrompt(window.__pwaDeferredPrompt);
        }

        const handlePromptReady = () => {
            if (window.__pwaDeferredPrompt) {
                setDeferredPrompt(window.__pwaDeferredPrompt);
            }
        };

        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            const promptEvent = e as BeforeInstallPromptEvent;
            window.__pwaDeferredPrompt = promptEvent;
            setDeferredPrompt(promptEvent);
        };

        const handleAppInstalled = () => {
            setIsInstalled(true);
            window.__pwaDeferredPrompt = null;
            setDeferredPrompt(null);
        };

        window.addEventListener('pwa-prompt-ready', handlePromptReady);
        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            window.removeEventListener('pwa-prompt-ready', handlePromptReady);
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    const install = async (): Promise<boolean> => {
        const activePrompt = deferredPrompt || window.__pwaDeferredPrompt || null;
        if (!activePrompt) return false;
        try {
            await activePrompt.prompt();
            const { outcome } = await activePrompt.userChoice;
            if (outcome === 'accepted') {
                setIsInstalled(true);
                window.__pwaDeferredPrompt = null;
                setDeferredPrompt(null);
                return true;
            }
        } catch {
            // Si el navegador invalidó el prompt previo, limpiamos la referencia
            window.__pwaDeferredPrompt = null;
            setDeferredPrompt(null);
        }
        return false;
    };

    return {
        isInstallable: Boolean(deferredPrompt || (typeof window !== 'undefined' && window.__pwaDeferredPrompt)),
        isInstalled,
        isIOS,
        isInAppOrIframe,
        install,
    };
}
