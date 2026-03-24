import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  Wrench,
  Server,
  Settings2,
  Sparkles
} from 'lucide-react';

import Discovery from './views/Discovery';
import SkillBuilder from './views/SkillBuilder';
import MCPBuilder from './views/MCPBuilder';
import Connections from './views/Connections';
import { ToastProvider } from './ToastContext';
import { api } from './api';

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState('discovery');
  const [navContext, setNavContext] = useState<any>(null);
  const [isHealthy, setIsHealthy] = useState(false);

  useEffect(() => {
    api.health()
      .then(res => setIsHealthy(res?.ok ?? false))
      .catch(() => setIsHealthy(false));
  }, []);

  const handleNavigate = (tab: string, context?: any) => {
    setActiveTab(tab);
    setNavContext(context || null);
  };

  const navItems = [
    { id: 'discovery', label: 'Discovery', icon: LayoutDashboard },
    { id: 'skill-builder', label: 'Skill Builder', icon: Wrench },
    { id: 'mcp-builder', label: 'MCP Builder', icon: Server },
    { id: 'connections', label: 'Connections', icon: Settings2 },
  ];

  return (
    <div className="flex h-screen font-sans overflow-hidden" style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}>
      {/* Sidebar */}
      <aside className="w-64 flex flex-col" style={{ background: 'var(--color-surface)', borderRight: '1px solid var(--color-border)' }}>
        <div className="h-14 flex items-center px-5" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-2.5 font-semibold tracking-tight" style={{ color: '#fff' }}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-accent-soft)', border: '1px solid rgba(108, 92, 231, 0.4)' }}>
              <Sparkles className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
            </div>
            Skill Builder
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
                style={{
                  background: isActive ? 'var(--color-accent-soft)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--color-text-muted)',
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <Icon className="w-4 h-4" style={{ color: isActive ? 'var(--color-accent)' : 'var(--color-text-muted)' }} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4" style={{ borderTop: '1px solid var(--color-border)' }}>
          <div className="rounded-lg p-3 flex items-center gap-3" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
            <div className={`w-2 h-2 rounded-full ${isHealthy ? 'animate-pulse' : ''}`} style={{ background: isHealthy ? 'var(--color-success)' : 'var(--color-danger)' }} />
            <div className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
              {isHealthy ? 'Local Engine Active' : 'Backend Unreachable'}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 relative overflow-hidden" style={{ background: 'var(--color-bg)' }}>
        <div className="h-full overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="min-h-full p-8 lg:p-12 max-w-6xl mx-auto"
            >
              {activeTab === 'discovery' && <Discovery onNavigate={handleNavigate} />}
              {activeTab === 'skill-builder' && <SkillBuilder />}
              {activeTab === 'mcp-builder' && <MCPBuilder context={navContext} />}
              {activeTab === 'connections' && <Connections onNavigate={handleNavigate} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
