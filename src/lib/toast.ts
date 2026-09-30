import { useSyncExternalStore } from 'react';

export type ToastTone = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

let toasts: readonly Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function showToast(message: string, tone: ToastTone = 'info', durationMs = 3600): void {
  const toast: Toast = { id: nextId++, message, tone };
  // 같은 문구가 연달아 뜨지 않게 최근 3개만 유지
  toasts = [...toasts.filter((t) => t.message !== message), toast].slice(-3);
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== toast.id);
    emit();
  }, durationMs);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => toasts;

export function useToasts(): readonly Toast[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
