import { useState, useEffect } from 'react';
import { Key, Database, CheckCircle2, XCircle, Loader2, BrainCircuit } from 'lucide-react';
import { api } from '../api';
import { useToast } from '../ToastContext';

type Source = {
  id: string;
  name: string;
  desc: string;
  auto?: boolean;
  requiresKey?: string;
  configKey?: string;
  configPlaceholder?: string;
};

const AVAILABLE_SOURCES: Source[] = [
  // Auto-detected (no config needed)
  { id: 'shell', name: 'Shell History', desc: 'zsh, bash, fish — repeated commands and sequences', auto: true },
  { id: 'git', name: 'Git Repos', desc: 'Commit patterns, co-changed files, branch workflows', auto: true },

  // AI conversation logs
  { id: 'claude-threads', name: 'Claude Code Threads', desc: 'Conversation logs from ~/.claude/', auto: true },
  { id: 'codex-sessions', name: 'Codex Sessions', desc: 'Conversation logs from ~/.codex/', auto: true },
  { id: 'gemini-cli', name: 'Gemini CLI History', desc: 'Conversation logs from Gemini CLI sessions', auto: true },

  // Productivity telemetry
  { id: 'cowork', name: 'Cowork.ai', desc: 'App usage, URLs, context switches, keystrokes', auto: false, configKey: 'telemetryDb', configPlaceholder: 'Path to cowork.db' },

  // Google
  { id: 'google-workspace', name: 'Google Workspace', desc: 'Gmail, Drive, Calendar, Meet transcripts, Admin audit logs', requiresKey: 'google' },

  // Microsoft
  { id: 'microsoft-365', name: 'Microsoft 365', desc: 'Outlook, Teams, OneDrive, SharePoint, Word docs', requiresKey: 'microsoft' },

  // Communication
  { id: 'slack', name: 'Slack', desc: 'Channels, DMs, threads — repeated questions and patterns', requiresKey: 'slack' },

  // CRM & Sales
  { id: 'hubspot', name: 'HubSpot', desc: 'Contacts, deals, emails, meeting notes, activity logs', requiresKey: 'hubspot' },
  { id: 'salesforce', name: 'Salesforce', desc: 'Accounts, opportunities, cases, email templates', requiresKey: 'salesforce' },

  // Browser
  { id: 'browser', name: 'Browser History', desc: 'Chrome, Arc, Firefox — frequently visited URLs', auto: false, configKey: 'browserHistoryPath', configPlaceholder: 'Path to Chrome History DB' },

  // Voice
  { id: 'voice', name: 'Voice Transcripts', desc: 'superwhisper, Otter.ai, or other voice-to-text', auto: false, configKey: 'voiceTranscriptPath', configPlaceholder: 'Path to transcripts folder' },
];

export default function Connections({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const { showToast } = useToast();

  const [keys, setKeys] = useState({
    anthropic: '', openrouter: '', openai: '', google: '', slack: '', github: '', microsoft: '', hubspot: '', salesforce: ''
  });
  const [sources, setSources] = useState<Record<string, boolean>>({});
  const [sourceConfigs, setSourceConfigs] = useState<Record<string, string>>({});
  const [analysisModel, setAnalysisModel] = useState('gemini-flash');

  useEffect(() => {
    api.getConfig()
      .then(res => {
        setKeys({
          anthropic: res.keys?.anthropic || '',
          openrouter: res.keys?.openrouter || '',
          openai: res.keys?.openai || '',
          google: res.keys?.google || '',
          slack: res.keys?.slack || '',
          github: res.keys?.github || '',
          microsoft: res.keys?.microsoft || '',
          hubspot: res.keys?.hubspot || '',
          salesforce: res.keys?.salesforce || ''
        });
        setSources(res.sources || {});
        setSourceConfigs(res.sourceConfigs || {});
        setAnalysisModel(res.analysisModel || 'gemini-flash');
      })
      .catch(err => showToast('Failed to load config. Is the backend running?', 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  const handleSaveKeys = async () => {
    setSaving(true);
    try {
      await api.saveConfig({ keys });
      showToast('API keys saved successfully', 'success');
    } catch (err) {
      showToast('Failed to save API keys', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleModelChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = e.target.value;
    setAnalysisModel(newModel);
    try {
      await api.saveConfig({ analysisModel: newModel });
      showToast('Analysis model updated', 'success');
    } catch (err) {
      showToast('Failed to save model', 'error');
    }
  };

  const handleConfigBlur = async () => {
    try {
      await api.saveConfig({ sourceConfigs });
      showToast('Source configuration saved', 'success');
    } catch (err) {
      showToast('Failed to save source config', 'error');
    }
  };

  const toggleSource = async (id: string) => {
    const newSources = { ...sources, [id]: !sources[id] };
    setSources(newSources);
    try {
      await api.saveConfig({ sources: newSources });
      showToast(`Source ${newSources[id] ? 'enabled' : 'disabled'}`, 'success');
    } catch (err) {
      setSources(sources); // revert
      showToast('Failed to toggle source', 'error');
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      await api.scan();
      showToast('Scan complete! Found new patterns.', 'success');
      onNavigate('discovery');
    } catch (err) {
      showToast('Scan failed', 'error');
      setScanning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" style={{ color: 'var(--color-text-muted)' }}>
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading connections...
      </div>
    );
  }

  return (
    <div className="space-y-10 max-w-5xl">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight" style={{ color: '#fff' }}>Connections</h1>
        <p className="text-sm max-w-2xl" style={{ color: 'var(--color-text-muted)' }}>
          Manage your local data sources and API keys. All data is analyzed locally on your machine.
          Keys are stored securely in <code className="px-1.5 py-0.5 rounded" style={{ color: 'var(--color-text)', background: 'rgba(255,255,255,0.1)' }}>~/.skill-builder/config.json</code>.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column */}
        <div className="space-y-8">
          {/* API Keys */}
          <div className="space-y-4">
            <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: '#fff' }}>
              <Key className="w-5 h-5" style={{ color: 'var(--color-warning)' }} /> API Keys
            </h2>

            <div className="rounded-xl p-6 space-y-5" style={{ background: 'var(--color-card)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)', boxShadow: '0 8px 40px rgba(0, 0, 0, 0.4)' }}>
              {[
                { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-...' },
                { id: 'openrouter', name: 'OpenRouter', placeholder: 'sk-or-...' },
                { id: 'openai', name: 'OpenAI', placeholder: 'sk-proj-...' },
                { id: 'google', name: 'Google (Gemini)', placeholder: 'AIza...' },
                { id: 'microsoft', name: 'Microsoft 365', placeholder: 'Bearer token or app credentials' },
                { id: 'slack', name: 'Slack Bot Token', placeholder: 'xoxb-...' },
                { id: 'github', name: 'GitHub Token', placeholder: 'ghp_...' },
                { id: 'hubspot', name: 'HubSpot', placeholder: 'pat-...' },
                { id: 'salesforce', name: 'Salesforce', placeholder: 'Bearer token or connected app credentials' },
              ].map((key) => {
                const val = keys[key.id as keyof typeof keys];
                const connected = val && val.length > 0;
                return (
                  <div key={key.id} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{key.name}</label>
                      {connected ? (
                        <span className="text-xs flex items-center gap-1" style={{ color: 'var(--color-success)' }}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                        </span>
                      ) : (
                        <span className="text-xs flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                          <XCircle className="w-3.5 h-3.5" /> Not Set
                        </span>
                      )}
                    </div>
                    <input
                      type="password"
                      placeholder={key.placeholder}
                      value={val}
                      onChange={(e) => setKeys({ ...keys, [key.id]: e.target.value })}
                      className="w-full rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 transition-all"
                      style={{ background: 'var(--color-bg)', color: '#fff', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)' }}
                    />
                  </div>
                );
              })}

              <div className="pt-4 flex justify-end" style={{ borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'var(--color-border)' }}>
                <button
                  onClick={handleSaveKeys}
                  disabled={saving}
                  className="text-sm px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                  style={{ background: 'var(--color-accent)', color: '#fff' }}
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Keys
                </button>
              </div>
            </div>
          </div>

          {/* Analysis Model */}
          <div className="space-y-4">
            <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: '#fff' }}>
              <BrainCircuit className="w-5 h-5 text-purple-400" /> AI Model for Analysis
            </h2>
            <div className="rounded-xl p-6" style={{ background: 'var(--color-card)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)', boxShadow: '0 8px 40px rgba(0, 0, 0, 0.4)' }}>
              <select
                value={analysisModel}
                onChange={handleModelChange}
                className="w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 transition-all appearance-none"
                style={{ background: 'var(--color-bg)', color: '#fff', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)' }}
              >
                <option value="claude-sonnet">Claude Sonnet (recommended — best quality)</option>
                <option value="gemini-pro">Gemini Pro</option>
                <option value="gemini-flash">Gemini Flash (fast, cheap)</option>
                <option value="openrouter-auto">OpenRouter Auto</option>
                <option value="gpt-4o-mini">GPT-4o-mini</option>
              </select>
              <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)' }}>
                Uses your API key for the selected provider. Claude Sonnet recommended for best skill quality.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column - Data Sources */}
        <div className="space-y-4">
          <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: '#fff' }}>
            <Database className="w-5 h-5" style={{ color: 'var(--color-accent)' }} /> Local Data Sources
          </h2>

          <div className="rounded-xl p-2" style={{ background: 'var(--color-card)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)', boxShadow: '0 8px 40px rgba(0, 0, 0, 0.4)' }}>
            {AVAILABLE_SOURCES.map((source, idx) => {
              const isActive = !!sources[source.id];
              const missingKey = source.requiresKey && !keys[source.requiresKey as keyof typeof keys];

              return (
                <div
                  key={source.id}
                  className="p-4 flex flex-col gap-3"
                  style={idx !== AVAILABLE_SOURCES.length - 1 ? { borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'var(--color-border)' } : undefined}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{source.name}</h3>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{source.desc}</p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      {source.configKey && (
                        <input
                          type="text"
                          placeholder={source.configPlaceholder}
                          value={sourceConfigs[source.configKey] || ''}
                          onChange={(e) => setSourceConfigs({...sourceConfigs, [source.configKey!]: e.target.value})}
                          onBlur={handleConfigBlur}
                          className="w-48 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 transition-all"
                          style={{ background: 'var(--color-bg)', color: '#fff', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)' }}
                        />
                      )}
                      {source.auto ? (
                        <span className="text-xs px-2 py-1 rounded font-medium flex items-center gap-1" style={{ color: 'var(--color-badge-working-text)', background: 'var(--color-badge-working-bg)' }}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Auto-detected
                        </span>
                      ) : missingKey ? (
                        <span className="text-xs px-2 py-1 rounded font-medium" style={{ color: 'var(--color-badge-idle-text)', background: 'var(--color-badge-idle-bg)' }}>
                          Requires {source.requiresKey} key
                        </span>
                      ) : (
                        <button
                          onClick={() => toggleSource(source.id)}
                          className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none"
                          style={{ background: isActive ? 'var(--color-accent)' : '#3f3f46' }}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform ${
                              isActive ? 'translate-x-4' : 'translate-x-1'
                            }`}
                            style={{ background: '#fff' }}
                          />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={handleScan}
            disabled={scanning}
            className="w-full text-sm py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: 'var(--color-accent)', color: '#fff', boxShadow: '0 4px 24px rgba(108, 92, 231, 0.2)' }}
          >
            {scanning && <Loader2 className="w-4 h-4 animate-spin" />}
            {scanning ? 'Scanning...' : 'Scan All Enabled Sources'}
          </button>
        </div>
      </div>
    </div>
  );
}
