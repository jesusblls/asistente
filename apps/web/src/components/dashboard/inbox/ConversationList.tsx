'use client';

import React from 'react';
import { AlertTriangle, Instagram, MessageSquare, PhoneCall, Plus, Search } from 'lucide-react';
import type { ConversationItem } from '../../../app/dashboard/inbox/types';

export interface ConversationListProps {
  mode: 'demo' | 'live';
  isLiveConnected: boolean;
  conversationsError: Error | null;
  onRetryConnection: () => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  conversations: ConversationItem[];
  activeConvId: string;
  onOpenConversation: (id: string) => void;
  activeTenantId: string | null;
  isSeeding: boolean;
  onSeed: () => void;
  hidden: boolean;
}

/** Columna izquierda de la bandeja: buscador, estado de conexión y lista de chats. */
export function ConversationList({
  mode,
  isLiveConnected,
  conversationsError,
  onRetryConnection,
  searchQuery,
  setSearchQuery,
  conversations,
  activeConvId,
  onOpenConversation,
  activeTenantId,
  isSeeding,
  onSeed,
  hidden,
}: ConversationListProps) {
  return (
    <div
      className={`${
        hidden ? 'hidden md:flex' : 'flex'
      } w-full md:w-80 bg-white border-r border-slate-200 flex-col shrink-0`}
    >
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900">Bandeja Omnicanal</h1>
            {mode === 'demo' ? (
              <span className="inline-flex items-center gap-1 text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-bold">
                🟣 Showcase
              </span>
            ) : isLiveConnected ? (
              <span
                aria-live="polite"
                className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full font-bold"
              >
                <span aria-hidden="true" className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                En vivo
              </span>
            ) : null}
          </div>
          <span className="text-xs bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full font-semibold">
            {conversations.length} {conversations.length === 1 ? 'chat' : 'chats'}
          </span>
        </div>

        {mode === 'live' && conversationsError && (
          <div
            role="alert"
            className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[11px] font-semibold text-amber-900">Sin conexión con la API</p>
              <p className="text-[10px] text-amber-800 leading-relaxed">Reintentando con backoff.</p>
            </div>
            <button
              type="button"
              onClick={onRetryConnection}
              className="text-[10px] font-semibold text-amber-900 underline"
            >
              Reintentar
            </button>
          </div>
        )}

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          {/* 16 px en móvil: con menos, iOS hace zoom al enfocar el campo. */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar paciente o teléfono..."
            aria-label="Buscar conversación por paciente o teléfono"
            className="w-full pl-9 pr-3 py-2.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-lg text-base sm:text-xs focus:outline-none focus:border-teal-500 transition-colors"
          />
        </div>
      </div>

      {/* Lista de Conversaciones */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {conversations.length === 0 ? (
          <div className="p-6 text-center space-y-3">
            <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
              <MessageSquare className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-slate-700">Sin conversaciones registradas</p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {mode === 'demo'
                ? 'No hay resultados que coincidan con la búsqueda.'
                : 'Esta clínica aún no tiene chats activos en la base de datos.'}
            </p>
            {mode === 'live' && activeTenantId && (
              <button
                onClick={onSeed}
                disabled={isSeeding}
                className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition-all shadow flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                {isSeeding ? 'Generando...' : 'Generar Citas & Chats Demo'}
              </button>
            )}
          </div>
        ) : (
          conversations.map((conv) => {
            const isSelected = conv.id === activeConvId;
            return (
              <button
                key={conv.id}
                id={`conv-${conv.id}`}
                onClick={() => onOpenConversation(conv.id)}
                aria-current={isSelected ? 'true' : undefined}
                className={`w-full p-3.5 text-left transition-colors flex items-start gap-3 rounded-lg ${
                  isSelected ? 'bg-teal-50/90 ring-1 ring-teal-600/20' : 'hover:bg-slate-50'
                }`}
              >
                <div className="relative">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs shrink-0 transition-all ${
                      conv.isUrgent
                        ? 'bg-red-100 text-red-700 ring-2 ring-red-400 ring-offset-1'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {conv.patientName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-white shadow">
                    {conv.channel === 'WHATSAPP' && (
                      <span className="w-3.5 h-3.5 bg-emerald-500 rounded-full flex items-center justify-center text-white">
                        <MessageSquare className="w-2.5 h-2.5" />
                      </span>
                    )}
                    {conv.channel === 'PHONE_CALL' && (
                      <span className="w-3.5 h-3.5 bg-blue-500 rounded-full flex items-center justify-center text-white">
                        <PhoneCall className="w-2.5 h-2.5" />
                      </span>
                    )}
                    {conv.channel === 'INSTAGRAM' && (
                      <span className="w-3.5 h-3.5 bg-pink-500 rounded-full flex items-center justify-center text-white">
                        <Instagram className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900 truncate">{conv.patientName}</span>
                    <span className="text-[10px] text-slate-400 tabular-nums">{conv.lastTime}</span>
                  </div>

                  <p className="text-[11px] text-slate-500 truncate mt-0.5">{conv.lastMessage}</p>

                  <div className="flex items-center gap-1.5 mt-1.5">
                    {conv.isUrgent && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded animate-pulse">
                        <AlertTriangle className="w-2.5 h-2.5" /> Urgente
                      </span>
                    )}
                    {conv.isHandedOverToHuman ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                        👤 Humano
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-teal-700 bg-teal-100 px-1.5 py-0.5 rounded">
                        🤖 Asistente IA
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
