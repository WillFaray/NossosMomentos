"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

interface ModalProps {
    open: boolean;
    onClose: () => void;
    children: React.ReactNode;
    ariaLabel?: string;
}

// Pilha global para coordenar Escape e scroll-lock quando há modais aninhados
const openModalStack: symbol[] = [];

const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, children, ariaLabel }: ModalProps) {
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!open) return;

        const token = Symbol("modal");
        openModalStack.push(token);

        const previouslyFocused =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;

        if (openModalStack.length === 1) {
            document.body.style.overflow = "hidden";
        }

        // Move foco para dentro do diálogo assim que montar
        const focusTimer = window.requestAnimationFrame(() => {
            const root = dialogRef.current;
            if (!root) return;
            if (!root.contains(document.activeElement)) {
                root.focus();
            }
        });

        const handleKeyDown = (e: KeyboardEvent) => {
            // Apenas o modal do topo da pilha responde a Escape e Tab
            if (openModalStack[openModalStack.length - 1] !== token) return;

            if (e.key === "Escape") {
                e.stopPropagation();
                onCloseRef.current();
                return;
            }

            if (e.key === "Tab" && dialogRef.current) {
                const focusables = Array.from(
                    dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
                ).filter((el) => el.offsetParent !== null);

                if (focusables.length === 0) {
                    e.preventDefault();
                    dialogRef.current.focus();
                    return;
                }

                const first = focusables[0];
                const last = focusables[focusables.length - 1];

                if (e.shiftKey) {
                    if (
                        document.activeElement === first ||
                        document.activeElement === dialogRef.current
                    ) {
                        e.preventDefault();
                        last.focus();
                    }
                } else if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        document.addEventListener("keydown", handleKeyDown);

        return () => {
            window.cancelAnimationFrame(focusTimer);
            document.removeEventListener("keydown", handleKeyDown);

            const idx = openModalStack.lastIndexOf(token);
            if (idx !== -1) {
                openModalStack.splice(idx, 1);
            }
            if (openModalStack.length === 0) {
                document.body.style.overflow = "";
            }
            if (previouslyFocused && previouslyFocused.isConnected) {
                previouslyFocused.focus();
            }
        };
    }, [open]);

    return (
        <AnimatePresence>
            {open && (
                <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
                    {/* Overlay com blur */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className="absolute inset-0 bg-gray-950/70 backdrop-blur-md"
                        onClick={onClose}
                        aria-hidden="true"
                    />

                    {/* Conteúdo: fade + scale do centro */}
                    <motion.div
                        ref={dialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label={ariaLabel}
                        tabIndex={-1}
                        initial={{ opacity: 0, scale: 0.92, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ type: "spring", duration: 0.45, bounce: 0.15 }}
                        className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-white/95 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.5)] backdrop-blur-2xl focus:outline-none dark:bg-card-dark/95"
                    >
                        <button
                            type="button"
                            onClick={onClose}
                            className="absolute right-3 top-3 z-10 rounded-full border border-white/10 bg-black/20 p-1.5 text-gray-500 backdrop-blur-md transition-all hover:scale-110 hover:bg-black/30 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white"
                            aria-label="Fechar modal"
                        >
                            <X size={16} />
                        </button>
                        {children}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
