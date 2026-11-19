import React, { useCallback, useEffect, useRef, useState } from 'react';

interface PincelinIntroProps {
    onFinish: () => void;
}

const SPLASH_VISIBLE_MS = 1600;
const SPLASH_FADE_MS = 400;
const SPLASH_IMAGE_SRC = '/images/pincelin-intro.jpg';

const BODY_CLIP_PATH =
    'polygon(0% 0%, 100% 0%, 100% 42%, 68.5% 42%, 67% 45.5%, 61.5% 51.5%, 56.5% 55%, 54.5% 60.5%, 48.5% 65.5%, 44% 68.5%, 44% 76%, 100% 76%, 100% 100%, 0% 100%)';
const WING_CLIP_PATH =
    'polygon(68.5% 42%, 100% 42%, 100% 76%, 44% 76%, 44% 68.5%, 48.5% 65.5%, 54.5% 60.5%, 56.5% 55%, 61.5% 51.5%, 67% 45.5%)';

const PincelinIntro: React.FC<PincelinIntroProps> = ({ onFinish }) => {
    const [isFading, setIsFading] = useState(false);
    const isFinishingRef = useRef(false);
    const completedRef = useRef(false);
    const fadeTimeoutRef = useRef<number | null>(null);

    const completeOnce = useCallback(() => {
        if (completedRef.current) return;
        completedRef.current = true;
        onFinish();
    }, [onFinish]);

    const finishSplash = useCallback(
        (immediate = false) => {
            if (immediate) {
                isFinishingRef.current = true;
                if (fadeTimeoutRef.current !== null) {
                    window.clearTimeout(fadeTimeoutRef.current);
                    fadeTimeoutRef.current = null;
                }
                completeOnce();
                return;
            }

            if (isFinishingRef.current) return;
            isFinishingRef.current = true;
            setIsFading(true);
            fadeTimeoutRef.current = window.setTimeout(() => {
                completeOnce();
            }, SPLASH_FADE_MS);
        },
        [completeOnce]
    );

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) {
            finishSplash(true);
            return;
        }

        const visibleTimer = window.setTimeout(() => {
            finishSplash(false);
        }, SPLASH_VISIBLE_MS);

        const hardFallbackTimer = window.setTimeout(() => {
            finishSplash(true);
        }, SPLASH_VISIBLE_MS + SPLASH_FADE_MS + 300);

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                finishSplash(true);
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.clearTimeout(visibleTimer);
            window.clearTimeout(hardFallbackTimer);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [finishSplash]);

    useEffect(() => {
        return () => {
            if (fadeTimeoutRef.current !== null) {
                window.clearTimeout(fadeTimeoutRef.current);
            }
        };
    }, []);

    return (
        <div
            role="status"
            aria-label="Bienvenidos a la 6ta Feria Latinoamérica Territorio Canva"
            onClick={() => finishSplash(false)}
            className={`fixed inset-0 z-[70] bg-white flex flex-col items-center justify-center px-6 select-none transition-opacity duration-[400ms] ${
                isFading ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
        >
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    finishSplash(true);
                }}
                className="absolute top-5 right-5 px-4 py-1.5 rounded-full bg-[#FBF5E6] hover:bg-[#F3E9D2] border border-[#E5DAC0] text-xs font-bold text-[#2B2B2B]/80 transition-colors"
            >
                Saltar intro
            </button>

            <div className="flex flex-col items-center justify-center max-w-xs w-full">
                {/* Ilustración limpia con capa independiente para el saludo del ala */}
                <div className="relative w-[220px] sm:w-[250px] md:w-[270px] aspect-[768/1376] animate-splash-image-in">
                    <img
                        src={SPLASH_IMAGE_SRC}
                        alt="Pincelín saludando"
                        draggable={false}
                        style={{ clipPath: BODY_CLIP_PATH }}
                        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    />
                    <img
                        src={SPLASH_IMAGE_SRC}
                        alt=""
                        aria-hidden="true"
                        draggable={false}
                        style={{
                            clipPath: WING_CLIP_PATH,
                            transformOrigin: '56% 57%',
                        }}
                        className="absolute inset-0 w-full h-full object-contain pointer-events-none animate-wing-wave"
                    />
                </div>

                {/* Palabra BIENVENIDOS justo debajo con fade-in + leve ascenso en el primer segundo */}
                <p className="-mt-4 sm:-mt-5 font-sans font-bold uppercase tracking-[0.28em] text-[#2B2B2B] text-lg sm:text-xl md:text-2xl text-center animate-splash-text-in">
                    BIENVENIDOS
                </p>
            </div>
        </div>
    );
};

export default PincelinIntro;
