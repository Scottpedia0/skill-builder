import { useState, useEffect } from 'react';
import { Code2, Play, Save, Check, Loader2, Trash2, Eye, Copy } from 'lucide-react';
import { api } from '../api';
import { Suggestion, InstalledSkill } from '../types';
import { useToast } from '../ToastContext';
import { motion, AnimatePresence } from 'motion/react';

export default function SkillBuilder() {
  const [available, setAvailable] = useState<Suggestion[]>([]);
  const [installed, setInstalled] = useState<InstalledSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [implementing, setImplementing] = useState(false);
  const [currentImplementation, setCurrentImplementation] = useState<{ id: string, content: string, path?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const loadData = async () => {
    try {
      const [suggs, inst] = await Promise.all([
        api.getSuggestions(7),
        api.getInstalled()
      ]);
      setAvailable((suggs || []).filter((s: Suggestion) => s.type === 'skill' && s.canImplement));
      setInstalled(inst || []);
    } catch (err) {
      showToast('Failed to load skills data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handlePreview = async (suggestion: Suggestion) => {
    setImplementing(true);
    setModalOpen(true);
    try {
      const res = await api.implement(suggestion.id);
      setCurrentImplementation({ id: suggestion.id, content: res.content, path: res.path });
    } catch (err) {
      showToast('Failed to generate implementation', 'error');
      setModalOpen(false);
    } finally {
      setImplementing(false);
    }
  };

  const handleViewInstalled = (skill: InstalledSkill) => {
    setCurrentImplementation({ id: skill.id, content: skill.code || 'No code available', path: skill.path });
    setModalOpen(true);
  };

  const handleInstall = async () => {
    if (!currentImplementation) return;
    try {
      await api.saveSkill(currentImplementation.id, currentImplementation.content);
      showToast('Skill installed successfully', 'success');
      setModalOpen(false);
      loadData();
    } catch (err) {
      showToast('Failed to install skill', 'error');
    }
  };

  const handleUninstall = async (id: string) => {
    try {
      await api.uninstall(id);
      showToast('Skill uninstalled', 'success');
      loadData();
    } catch (err) {
      showToast('Failed to uninstall skill', 'error');
    }
  };

  const handleCopy = () => {
    if (!currentImplementation) return;
    navigator.clipboard.writeText(currentImplementation.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" style={{ color: 'var(--color-text-muted)' }}>
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading skills...
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight" style={{ color: '#fff' }}>Skill Builder</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Manage lightweight, single-purpose scripts or prompts that your AI agents can execute directly.
        </p>
      </header>

      <div className="space-y-6">
        <h2 className="text-xl font-medium pb-2" style={{ color: '#fff', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'var(--color-border)' }}>Available to Install</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {available.map(skill => (
            <div key={skill.id} className="rounded-xl p-5 flex flex-col" style={{ background: 'var(--color-card)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded bg-blue-500/10 text-blue-400 flex items-center justify-center">
                  <Code2 className="w-4 h-4" />
                </div>
                <h3 className="font-medium" style={{ color: '#fff' }}>{skill.name}</h3>
              </div>
              <p className="text-sm mb-4 flex-1" style={{ color: 'var(--color-text-muted)' }}>{skill.description}</p>
              <div className="flex gap-2 mt-auto">
                <button
                  onClick={() => handlePreview(skill)}
                  className="flex-1 text-sm bg-white/5 hover:bg-white/10 py-2 rounded-lg font-medium transition-colors"
                  style={{ color: '#fff', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)' }}
                >
                  Preview
                </button>
                <button
                  onClick={() => handlePreview(skill)}
                  className="flex-1 text-sm py-2 rounded-lg font-medium transition-colors"
                  style={{ background: 'var(--color-accent)', color: '#fff' }}
                >
                  Install
                </button>
              </div>
            </div>
          ))}
          {available.length === 0 && (
            <div className="col-span-full py-8 text-center border border-dashed rounded-xl" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border)' }}>
              No new skills available to implement.
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6 pt-6">
        <h2 className="text-xl font-medium pb-2" style={{ color: '#fff', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'var(--color-border)' }}>Installed Skills</h2>
        <div className="space-y-3">
          {installed.map(skill => (
            <div key={skill.id} className="rounded-xl p-4 flex items-center justify-between" style={{ background: 'var(--color-card)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-badge-working-bg)', color: 'var(--color-success)' }}>
                  <Check className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-medium" style={{ color: '#fff' }}>{skill.name}</h3>
                  <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{skill.path}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleViewInstalled(skill)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  style={{ color: 'var(--color-text-muted)' }}
                  title="View Source"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleUninstall(skill.id)}
                  className="p-2 hover:bg-red-500/10 rounded-lg transition-colors"
                  style={{ color: 'var(--color-text-muted)' }}
                  title="Uninstall"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {installed.length === 0 && (
            <div className="py-8 text-center border border-dashed rounded-xl" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border)' }}>
              No skills installed yet.
            </div>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="rounded-xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden"
              style={{ background: 'var(--color-card)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)', boxShadow: '0 8px 40px rgba(0, 0, 0, 0.4)' }}
            >
              <div className="px-6 py-4 flex items-center justify-between bg-white/5" style={{ borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'var(--color-border)' }}>
                <h3 className="text-lg font-medium" style={{ color: '#fff' }}>Skill Source</h3>
                <button onClick={() => setModalOpen(false)} style={{ color: 'var(--color-text-muted)' }}>
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6" style={{ background: 'var(--color-bg)' }}>
                {implementing ? (
                  <div className="flex flex-col items-center justify-center h-64 gap-4" style={{ color: 'var(--color-text-muted)' }}>
                    <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--color-accent)' }} />
                    <p>Generating implementation via LLM...</p>
                  </div>
                ) : currentImplementation ? (
                  <pre className="text-sm font-mono whitespace-pre-wrap" style={{ color: 'var(--color-text)' }}>
                    {currentImplementation.content}
                  </pre>
                ) : null}
              </div>

              <div className="px-6 py-4 bg-white/5 flex items-center justify-end gap-3" style={{ borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'var(--color-border)' }}>
                <button
                  onClick={handleCopy}
                  disabled={implementing || !currentImplementation}
                  className="text-sm px-4 py-2 rounded-lg font-medium bg-white/5 hover:bg-white/10 transition-all flex items-center gap-2 disabled:opacity-50"
                  style={{ color: 'var(--color-text)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)' }}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  onClick={handleInstall}
                  disabled={implementing || !currentImplementation}
                  className="text-sm px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                  style={{ background: 'var(--color-accent)', color: '#fff' }}
                >
                  Install Skill
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
