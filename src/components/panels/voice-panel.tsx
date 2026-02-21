'use client';

import { useCallback, useContext, useRef, useState } from 'react';
import { useConversation } from '@elevenlabs/react';
import { MindContext } from '@/components/mind-provider';
import { ENGINE_IDS, SIGNAL_PRIORITIES } from '@/core/constants';

type VoiceStatus = 'idle' | 'connecting' | 'connected';

export function VoicePanel() {
  const loop = useContext(MindContext);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const fetchingRef = useRef(false);

  const conversation = useConversation({
    onConnect: () => {
      setVoiceStatus('connected');
    },
    onDisconnect: () => {
      setVoiceStatus('idle');
      setIsSpeaking(false);
    },
    onError: (error) => {
      console.error('[voice-panel] ElevenLabs error:', error);
      setVoiceStatus('idle');
      setIsSpeaking(false);
    },
    onModeChange: (mode) => {
      setIsSpeaking(mode.mode === 'speaking');
    },
    onMessage: (message) => {
      // Emit text-input signal when ElevenLabs transcribes user speech
      if (loop && message.source === 'user' && message.message) {
        loop.bus.emit({
          type: 'text-input',
          source: ENGINE_IDS.TEXT_INPUT,
          payload: { text: message.message, timestamp: Date.now() },
          priority: SIGNAL_PRIORITIES.HIGH,
        });
      }
    },
  });

  const handleToggle = useCallback(async () => {
    if (voiceStatus === 'connecting') return;

    if (voiceStatus === 'connected') {
      await conversation.endSession();
      return;
    }

    // Fetch signed URL and start session
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setVoiceStatus('connecting');

    try {
      const res = await fetch('/api/openclaw/elevenlabs/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        throw new Error(`Failed to get signed URL: ${res.status}`);
      }

      const data = await res.json();
      const signedUrl = data.signedUrl;

      if (!signedUrl) {
        throw new Error('No signed URL returned');
      }

      await conversation.startSession({ signedUrl });
    } catch (err) {
      console.error('[voice-panel] Failed to start session:', err);
      setVoiceStatus('idle');
    } finally {
      fetchingRef.current = false;
    }
  }, [voiceStatus, conversation]);

  const isListening = voiceStatus === 'connected' && !isSpeaking;

  return (
    <div className="bg-white/5 rounded-lg p-4 backdrop-blur-sm border border-white/10">
      <h3 className="text-white/60 text-xs font-mono uppercase tracking-wider mb-3">
        Voice
      </h3>

      <div className="flex flex-col items-center gap-3">
        {/* Mic button */}
        <button
          onClick={handleToggle}
          disabled={voiceStatus === 'connecting'}
          className={`
            relative w-16 h-16 rounded-full flex items-center justify-center
            transition-all duration-300 cursor-pointer
            ${voiceStatus === 'idle'
              ? 'bg-white/10 hover:bg-white/15 border border-white/20'
              : voiceStatus === 'connecting'
                ? 'bg-amber-500/20 border border-amber-500/30'
                : isSpeaking
                  ? 'bg-purple-500/20 border border-purple-500/40'
                  : 'bg-emerald-500/20 border border-emerald-500/40'
            }
          `}
        >
          {/* Pulsing ring when listening */}
          {isListening && (
            <span className="absolute inset-0 rounded-full border-2 border-emerald-400/40 animate-ping" />
          )}

          {/* Waveform ring when speaking */}
          {isSpeaking && (
            <span className="absolute inset-0 rounded-full border-2 border-purple-400/40 animate-pulse" />
          )}

          {/* Mic icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`w-6 h-6 ${
              voiceStatus === 'idle'
                ? 'text-white/40'
                : voiceStatus === 'connecting'
                  ? 'text-amber-300/60'
                  : isSpeaking
                    ? 'text-purple-300/80'
                    : 'text-emerald-300/80'
            }`}
          >
            {voiceStatus === 'connected' ? (
              // Stop icon when active
              <rect x="6" y="6" width="12" height="12" rx="1" />
            ) : (
              // Mic icon when idle/connecting
              <>
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </>
            )}
          </svg>
        </button>

        {/* Status text */}
        <span className={`text-[10px] font-mono ${
          voiceStatus === 'idle'
            ? 'text-white/20'
            : voiceStatus === 'connecting'
              ? 'text-amber-300/50'
              : isSpeaking
                ? 'text-purple-300/50'
                : 'text-emerald-300/50'
        }`}>
          {voiceStatus === 'idle' && 'tap to speak'}
          {voiceStatus === 'connecting' && 'connecting...'}
          {voiceStatus === 'connected' && !isSpeaking && 'listening'}
          {voiceStatus === 'connected' && isSpeaking && 'speaking'}
        </span>
      </div>
    </div>
  );
}
