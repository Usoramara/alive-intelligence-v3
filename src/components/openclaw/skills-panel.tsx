'use client';

import { useState } from 'react';
import type { GatewayInfo } from '@/hooks/use-openclaw-stream';

interface SkillEntry {
  name: string;
  enabled?: boolean;
  [key: string]: unknown;
}

async function updateSkill(skill: string, enabled: boolean) {
  const res = await fetch('/api/openclaw/skills/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skill, enabled }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to update skill');
  }
  return res.json();
}

async function installSkill(url: string) {
  const res = await fetch('/api/openclaw/skills/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to install skill');
  }
  return res.json();
}

function parseSkills(health: Record<string, unknown> | null): SkillEntry[] {
  if (!health) return [];
  const skills = (health as Record<string, unknown>).skills;
  if (!Array.isArray(skills)) return [];
  return skills.map((s) => {
    if (typeof s === 'string') return { name: s };
    if (typeof s === 'object' && s !== null) {
      const obj = s as Record<string, unknown>;
      return { name: String(obj.name ?? obj.id ?? 'unknown'), ...obj };
    }
    return { name: String(s) };
  });
}

export function SkillsPanel({ gateway }: { gateway: GatewayInfo }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installUrl, setInstallUrl] = useState('');
  const [showInstall, setShowInstall] = useState(false);

  const skills = parseSkills(gateway.health);

  const handleToggle = async (skill: string, enabled: boolean) => {
    setLoading(skill);
    setError(null);
    try {
      await updateSkill(skill, enabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Toggle failed');
    } finally {
      setLoading(null);
    }
  };

  const handleInstall = async () => {
    if (!installUrl.trim()) return;
    setLoading('install');
    setError(null);
    try {
      await installSkill(installUrl.trim());
      setInstallUrl('');
      setShowInstall(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Install failed');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="bg-white/5 rounded-lg px-4 py-3 border border-white/10">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] uppercase tracking-widest text-white/30">
          Skills
        </h3>
        <button
          onClick={() => setShowInstall(!showInstall)}
          className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
        >
          {showInstall ? 'Cancel' : '+ Install'}
        </button>
      </div>

      {error && (
        <div className="text-[10px] text-red-400/80 mb-2">{error}</div>
      )}

      {showInstall && (
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={installUrl}
            onChange={(e) => setInstallUrl(e.target.value)}
            placeholder="Skill URL or package..."
            className="flex-1 text-xs bg-white/5 border border-white/10 rounded px-2 py-1 text-white/70 placeholder:text-white/20 focus:outline-none focus:border-white/20"
          />
          <button
            onClick={handleInstall}
            disabled={loading !== null || !installUrl.trim()}
            className="text-[10px] px-2 py-1 rounded bg-blue-500/10 text-blue-400/70 hover:bg-blue-500/20 disabled:opacity-30 transition-colors"
          >
            {loading === 'install' ? '...' : 'Install'}
          </button>
        </div>
      )}

      {skills.length === 0 ? (
        <div className="text-xs text-white/25">No skills data</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {skills.map((skill) => (
            <button
              key={skill.name}
              onClick={() => handleToggle(skill.name, skill.enabled === false)}
              disabled={loading !== null}
              className={`text-[10px] border rounded px-2 py-0.5 transition-colors disabled:opacity-30 ${
                skill.enabled === false
                  ? 'bg-white/3 border-white/5 text-white/25 hover:border-white/15'
                  : 'bg-white/5 border-white/10 text-white/50 hover:border-white/20'
              }`}
              title={`Click to ${skill.enabled === false ? 'enable' : 'disable'}`}
            >
              {loading === skill.name ? '...' : skill.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
