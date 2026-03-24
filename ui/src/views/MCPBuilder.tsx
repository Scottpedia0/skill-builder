import { useState, useEffect, useRef } from 'react';
import { Server, Plus, Trash2, Save, Check, Box, Loader2 } from 'lucide-react';
import { api } from '../api';
import { useToast } from '../ToastContext';

type McpPreview = { name: string; files: Record<string, string> };

export default function MCPBuilder({ context }: { context?: any }) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingToConfig, setAddingToConfig] = useState(false);
  const { showToast } = useToast();

  const [formState, setFormState] = useState({
    name: context?.name || 'my-mcp-server',
    apiUrl: 'https://api.example.com',
    authType: 'apikey',
    envVar: 'API_KEY',
    tools: [{ name: 'get_data', desc: 'Fetch data from API' }]
  });

  const [preview, setPreview] = useState<McpPreview | null>(null);
  const [activeTab, setActiveTab] = useState<string>('server.mjs');
  const [generating, setGenerating] = useState(false);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    setGenerating(true);
    timeoutRef.current = setTimeout(async () => {
      try {
        const res = await api.generateMcp(formState);
        setPreview(res);
        // Ensure activeTab is valid for the new preview
        if (res && res.files && !res.files[activeTab]) {
          const firstFile = Object.keys(res.files)[0];
          if (firstFile) setActiveTab(firstFile);
        }
      } catch (err) {
        console.error("Failed to generate preview", err);
      } finally {
        setGenerating(false);
      }
    }, 300);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [formState]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.saveMcp(formState);
      setSaved(true);
      showToast('MCP Server saved successfully', 'success');
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      showToast('Failed to save MCP Server', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddToConfig = async () => {
    setAddingToConfig(true);
    try {
      await api.addMcpConfig(formState.name);
      showToast('Added to Claude Code config', 'success');
    } catch (err) {
      showToast('Failed to add to config', 'error');
    } finally {
      setAddingToConfig(false);
    }
  };

  const updateForm = (updates: Partial<typeof formState>) => {
    setFormState(prev => ({ ...prev, ...updates }));
  };

  return (
    <div className="space-y-8 max-w-5xl">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight" style={{ color: '#fff' }}>MCP Server Builder</h1>
        <p className="text-sm max-w-3xl" style={{ color: 'var(--color-text-muted)' }}>
          Build a Model Context Protocol server to expose external APIs, tools, and resources to your AI agents.
          Generates a complete Node.js project ready to be added to your agent's config.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form Column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl p-6 space-y-6" style={{ background: 'var(--color-card)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)', boxShadow: '0 8px 40px rgba(0, 0, 0, 0.4)' }}>
            <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: '#fff' }}>
              <Server className="w-5 h-5" style={{ color: 'var(--color-accent)' }} /> Server Configuration
            </h2>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>Service Name</label>
                <input
                  type="text"
                  value={formState.name}
                  onChange={e => updateForm({ name: e.target.value })}
                  className="w-full rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 transition-all"
                  style={{ background: 'var(--color-bg)', color: '#fff', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)' }}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>Base API URL</label>
                <input
                  type="text"
                  value={formState.apiUrl}
                  onChange={e => updateForm({ apiUrl: e.target.value })}
                  className="w-full rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 transition-all"
                  style={{ background: 'var(--color-bg)', color: '#fff', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)' }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>Authentication</label>
                <select
                  value={formState.authType}
                  onChange={e => updateForm({ authType: e.target.value })}
                  className="w-full rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 transition-all appearance-none"
                  style={{ background: 'var(--color-bg)', color: '#fff', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)' }}
                >
                  <option value="apikey">API Key (Bearer)</option>
                  <option value="oauth">OAuth 2.0</option>
                  <option value="none">None</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>Env Var Name</label>
                <input
                  type="text"
                  value={formState.envVar}
                  onChange={e => updateForm({ envVar: e.target.value })}
                  className="w-full rounded-lg px-4 py-2 text-sm font-mono focus:outline-none focus:ring-1 transition-all"
                  style={{ background: 'var(--color-bg)', color: '#fff', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)' }}
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl p-6 space-y-6" style={{ background: 'var(--color-card)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)', boxShadow: '0 8px 40px rgba(0, 0, 0, 0.4)' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: '#fff' }}>
                <Box className="w-5 h-5" style={{ color: 'var(--color-success)' }} /> Exposed Tools
              </h2>
              <button
                onClick={() => updateForm({ tools: [...formState.tools, { name: '', desc: '' }] })}
                className="text-xs bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-md flex items-center gap-1 transition-colors"
                style={{ color: '#fff' }}
              >
                <Plus className="w-3 h-3" /> Add Tool
              </button>
            </div>

            <div className="space-y-3">
              {formState.tools.map((tool, i) => (
                <div key={i} className="flex items-start gap-3">
                  <input
                    type="text"
                    value={tool.name}
                    onChange={(e) => {
                      const newTools = [...formState.tools];
                      newTools[i].name = e.target.value;
                      updateForm({ tools: newTools });
                    }}
                    placeholder="Tool Name"
                    className="w-1/3 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1"
                    style={{ background: 'var(--color-bg)', color: '#fff', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)' }}
                  />
                  <input
                    type="text"
                    value={tool.desc}
                    onChange={(e) => {
                      const newTools = [...formState.tools];
                      newTools[i].desc = e.target.value;
                      updateForm({ tools: newTools });
                    }}
                    placeholder="Description"
                    className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1"
                    style={{ background: 'var(--color-bg)', color: '#fff', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)' }}
                  />
                  <button
                    onClick={() => updateForm({ tools: formState.tools.filter((_, idx) => idx !== i) })}
                    className="p-2 hover:bg-red-500/10 rounded-lg transition-colors mt-0.5"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {formState.tools.length === 0 && (
                <div className="text-sm text-center py-4 border border-dashed rounded-lg" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border)' }}>
                  No tools defined. Add a tool to expose functionality.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Preview Column */}
        <div className="lg:col-span-1">
          <div className="sticky top-8 rounded-xl overflow-hidden flex flex-col h-[calc(100vh-8rem)]" style={{ background: 'var(--color-card)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)', boxShadow: '0 8px 40px rgba(0, 0, 0, 0.4)' }}>
            <div className="px-4 py-3 bg-white/5 flex items-center justify-between" style={{ borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'var(--color-border)' }}>
              <span className="text-sm font-medium flex items-center gap-2" style={{ color: '#fff' }}>
                Generated Project
                {generating && <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--color-text-muted)' }} />}
              </span>
            </div>

            <div className="flex overflow-x-auto hide-scrollbar" style={{ background: 'var(--color-bg)', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'var(--color-border)' }}>
              {preview && Object.keys(preview.files).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="px-4 py-2 text-xs font-mono whitespace-nowrap"
                  style={
                    activeTab === tab
                      ? { color: '#fff', borderBottom: '2px solid var(--color-accent)', background: 'rgba(255,255,255,0.05)' }
                      : { color: 'var(--color-text-muted)' }
                  }
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="flex-1 p-4 overflow-y-auto" style={{ background: 'var(--color-bg)' }}>
              <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text)' }}>
                {preview && preview.files[activeTab] ? preview.files[activeTab] : 'Generating preview...'}
              </pre>
            </div>

            <div className="p-4 bg-white/5 space-y-3" style={{ borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'var(--color-border)' }}>
              <button
                onClick={handleSave}
                disabled={saving || !preview}
                className="w-full text-sm py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                style={
                  saved
                    ? { background: 'var(--color-success)', color: '#fff' }
                    : { background: 'var(--color-accent)', color: '#fff' }
                }
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {saved ? `Saved to ~/mcps/${formState.name}` : 'Generate & Save Project'}
              </button>
              <button
                onClick={handleAddToConfig}
                disabled={addingToConfig || !preview}
                className="w-full text-sm py-2.5 rounded-lg font-medium bg-white/5 hover:bg-white/10 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ color: 'var(--color-text)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)' }}
              >
                {addingToConfig && <Loader2 className="w-4 h-4 animate-spin" />}
                Add to Claude Code Config
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
