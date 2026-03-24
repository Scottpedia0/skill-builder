import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, XCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';
type Toast = { id: number; message: string; type: ToastType };

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  const getToastStyle = (type: ToastType) => {
    switch (type) {
      case 'success':
        return { background: 'var(--color-badge-working-bg)', borderColor: 'rgba(0, 184, 148, 0.2)', color: 'var(--color-success)' };
      case 'error':
        return { background: 'rgba(214, 48, 49, 0.1)', borderColor: 'rgba(214, 48, 49, 0.2)', color: 'var(--color-danger)' };
      default:
        return { background: 'var(--color-accent-soft)', borderColor: 'rgba(108, 92, 231, 0.2)', color: 'var(--color-accent)' };
    }
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg"
              style={{ ...getToastStyle(t.type), borderWidth: '1px', borderStyle: 'solid' }}
            >
              {t.type === 'success' && <CheckCircle2 className="w-4 h-4" />}
              {t.type === 'error' && <XCircle className="w-4 h-4" />}
              {t.type === 'info' && <Info className="w-4 h-4" />}
              <span className="text-sm font-medium">{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
};
