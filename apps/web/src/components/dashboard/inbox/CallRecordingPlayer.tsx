'use client';

import React from 'react';
import { Pause, Play, PhoneCall, RotateCcw } from 'lucide-react';

const WAVEFORM_BARS = [
  30, 45, 70, 35, 80, 95, 60, 40, 55, 85, 100, 75, 50, 65, 90, 85, 45, 35, 75, 90,
  65, 40, 80, 95, 55, 30, 70, 85, 95, 65, 45, 60, 80, 45, 35, 60, 85, 55, 40, 25,
];

function formatAudioTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export interface CallRecordingPlayerProps {
  isPlaying: boolean;
  setIsPlaying: (v: boolean) => void;
  progress: number;
  setProgress: (updater: (prev: number) => number) => void;
  duration: number;
  playbackSpeed: number;
  setPlaybackSpeed: (v: number) => void;
}

/** Reproductor simulado de la grabación de llamada Twilio, con waveform interactivo. */
export function CallRecordingPlayer({
  isPlaying,
  setIsPlaying,
  progress,
  setProgress,
  duration,
  playbackSpeed,
  setPlaybackSpeed,
}: CallRecordingPlayerProps) {
  return (
    <div className="bg-slate-900 text-slate-200 border-b border-slate-800 p-3.5 px-4 sm:px-6 flex flex-col gap-2.5 shrink-0 select-none shadow-inner">
      {/* Header de la llamada */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 shrink-0 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold text-white flex items-center gap-1.5 min-w-0">
            <PhoneCall className="w-3.5 h-3.5 shrink-0 text-teal-400" />
            <span className="truncate">Grabación Twilio Voice (+52) • Dr. Roberto Mendoza</span>
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-xs text-slate-400">
          <span className="tabular-nums text-slate-300">
            Latencia: <strong className="text-teal-400 font-semibold tabular-nums">540ms</strong>
          </span>
          <span className="text-slate-700">•</span>
          <span className="text-emerald-400 bg-emerald-950/70 border border-emerald-800/80 px-2 py-0.5 rounded text-[10px] font-semibold">
            Twilio Media Stream
          </span>
        </div>
      </div>

      {/* Controles y Onda de Audio (Waveform) */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Play / Pause */}
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl bg-teal-600 hover:bg-teal-500 text-white flex items-center justify-center transition-all shadow-md shadow-teal-600/30 shrink-0 active:scale-95"
          title={isPlaying ? 'Pausar llamada' : 'Reproducir llamada'}
          aria-label={isPlaying ? 'Pausar llamada' : 'Reproducir llamada'}
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
        </button>

        {/* Saltar 10s atrás (en móvil se salta tocando la onda) */}
        <button
          onClick={() => setProgress((p) => Math.max(0, p - 10))}
          className="hidden sm:flex w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 items-center justify-center transition-colors shrink-0 text-xs"
          title="Retroceder 10 segundos"
          aria-label="Retroceder 10 segundos"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        {/* Waveform Interactivo con barras de audio */}
        <div
          className="flex-1 min-w-0 flex items-center gap-1 h-10 sm:h-9 px-2.5 bg-slate-950/80 rounded-xl border border-slate-800 cursor-pointer overflow-hidden group select-none"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const percentage = Math.max(0, Math.min(1, clickX / rect.width));
            setProgress(() => Math.round(percentage * duration));
          }}
          title="Haz clic en cualquier barra para saltar en la llamada"
        >
          {WAVEFORM_BARS.map((height, i) => {
            const progressRatio = progress / duration;
            const barRatio = (i + 1) / WAVEFORM_BARS.length;
            const isPlayed = barRatio <= progressRatio;
            return (
              <div
                key={i}
                className={`flex-1 rounded-full transition-all ${
                  isPlayed ? 'bg-teal-400 group-hover:bg-teal-300' : 'bg-slate-700 group-hover:bg-slate-600'
                }`}
                style={{
                  height: `${height}%`,
                  opacity: isPlayed ? 1 : 0.4,
                }}
              />
            );
          })}
        </div>

        {/* Saltar 10s adelante */}
        <button
          onClick={() => setProgress((p) => Math.min(duration, p + 10))}
          className="hidden sm:flex w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 items-center justify-center transition-colors shrink-0 text-xs font-mono"
          title="Adelantar 10 segundos"
          aria-label="Adelantar 10 segundos"
        >
          <span className="text-[10px] font-bold font-mono">+10s</span>
        </button>

        {/* Tiempo Transcurrido */}
        <div className="text-right shrink-0">
          <span className="text-xs font-mono font-medium text-slate-200 tabular-nums">
            {formatAudioTime(progress)} / {formatAudioTime(duration)}
          </span>
        </div>

        {/* Velocidad de reproducción (1x, 1.25x, 1.5x, 2x) */}
        <button
          onClick={() => {
            const speeds = [1.0, 1.25, 1.5, 2.0];
            const nextIndex = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
            setPlaybackSpeed(speeds[nextIndex]);
          }}
          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-teal-400 border border-slate-700 text-xs font-mono font-bold shrink-0 transition-colors"
          title="Cambiar velocidad de reproducción"
          aria-label={`Velocidad de reproducción ${playbackSpeed}x`}
        >
          {playbackSpeed}x
        </button>
      </div>
    </div>
  );
}
