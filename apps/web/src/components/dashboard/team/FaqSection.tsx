'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { HelpCircle, Plus, Pencil, Trash2, AlertCircle, Loader2, X } from 'lucide-react';
import { API_BASE_URL, apiFetch } from '@/lib/api';

/**
 * Administración de las preguntas frecuentes de la clínica.
 *
 * El agente las consulta con `consultar_faq_clinica`: son el guion con el que
 * contesta todo lo que no está en la agenda (estacionamiento, aseguradoras,
 * formas de pago, cuidados posoperatorios). El modelo existía en base de datos
 * y el seed las llenaba, pero no había pantalla para administrarlas, así que
 * una clínica nueva se quedaba sin ninguna y el asistente improvisaba.
 */

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  keywords: string | null;
}

const FAQ_CATEGORIES = ['General', 'Ubicación', 'Pagos', 'Procedimientos', 'Cuidados', 'Horarios'];

/** Ejemplos para Modo Demo: nunca se guardan, solo evitan una pantalla vacía. */
const DEMO_FAQS: FaqItem[] = [
  {
    id: 'demo-faq-1',
    question: '¿Tienen estacionamiento?',
    answer:
      'Sí, contamos con estacionamiento con valet parking sin costo para pacientes en Av. Presidente Masaryk 407, Polanco.',
    category: 'Ubicación',
    keywords: 'estacionamiento, valet, coche',
  },
  {
    id: 'demo-faq-2',
    question: '¿Qué aseguradoras aceptan?',
    answer:
      'Trabajamos con GNP, MetLife, AXA, Seguros Monterrey y Mapfre. Trae tu póliza vigente y una identificación oficial.',
    category: 'Pagos',
    keywords: 'seguro, aseguradora, gnp, metlife, axa',
  },
  {
    id: 'demo-faq-3',
    question: '¿Puedo pagar con tarjeta o a meses?',
    answer:
      'Aceptamos efectivo, tarjeta de débito y crédito, transferencia SPEI y meses sin intereses a 3 y 6 meses con tarjetas participantes.',
    category: 'Pagos',
    keywords: 'pago, tarjeta, meses sin intereses, spei',
  },
];

export interface FaqSectionProps {
  mode: 'demo' | 'live';
  tenantId?: string | null;
  canEdit: boolean;
  onToast: (message: string) => void;
}

export function FaqSection({ mode, tenantId, canEdit, onToast }: FaqSectionProps) {
  const isDemo = mode === 'demo';

  const [items, setItems] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [category, setCategory] = useState('General');
  const [keywords, setKeywords] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadFaqs = useCallback(async () => {
    if (isDemo) {
      setItems(DEMO_FAQS);
      setLoadError(null);
      return;
    }
    if (!tenantId) {
      setItems([]);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/tenants/${tenantId}/faqs`);
      if (!res.ok) throw new Error('No se pudieron cargar las preguntas frecuentes');
      setItems(await res.json());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, [isDemo, tenantId]);

  useEffect(() => {
    loadFaqs();
  }, [loadFaqs]);

  const resetForm = () => {
    setEditingId(null);
    setQuestion('');
    setAnswer('');
    setCategory('General');
    setKeywords('');
    setFormError(null);
  };

  const openCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (item: FaqItem) => {
    setEditingId(item.id);
    setQuestion(item.question);
    setAnswer(item.answer);
    setCategory(item.category || 'General');
    setKeywords(item.keywords || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!question.trim() || !answer.trim()) {
      setFormError('La pregunta y la respuesta son obligatorias');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      if (isDemo) {
        // En Modo Demo nada se persiste: se actualiza solo la vista.
        setItems((prev) =>
          editingId
            ? prev.map((item) =>
                item.id === editingId
                  ? { ...item, question: question.trim(), answer: answer.trim(), category, keywords }
                  : item
              )
            : [
                ...prev,
                {
                  id: `demo-faq-${Date.now()}`,
                  question: question.trim(),
                  answer: answer.trim(),
                  category,
                  keywords: keywords.trim() || null,
                },
              ]
        );
        onToast(editingId ? 'Pregunta actualizada (Modo Demo)' : 'Pregunta agregada (Modo Demo)');
      } else {
        if (!tenantId) throw new Error('No hay una clínica activa seleccionada');

        const payload = {
          question: question.trim(),
          answer: answer.trim(),
          category,
          keywords: keywords.trim() || null,
        };

        const res = editingId
          ? await apiFetch(`${API_BASE_URL}/api/faqs/${editingId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
          : await apiFetch(`${API_BASE_URL}/api/tenants/${tenantId}/faqs`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'No se pudo guardar la pregunta');
        }

        await loadFaqs();
        onToast(editingId ? 'Pregunta actualizada' : 'Pregunta agregada');
      }

      setIsModalOpen(false);
      resetForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar la pregunta');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (item: FaqItem) => {
    setDeletingId(item.id);
    try {
      if (isDemo) {
        setItems((prev) => prev.filter((f) => f.id !== item.id));
        onToast('Pregunta eliminada (Modo Demo)');
      } else {
        const res = await apiFetch(`${API_BASE_URL}/api/faqs/${item.id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('No se pudo eliminar la pregunta');
        await loadFaqs();
        onToast('Pregunta eliminada');
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo eliminar la pregunta');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <HelpCircle className="w-4 h-4 text-teal-600" />
          <h2 className="text-base font-bold text-slate-900 tracking-tight">
            Preguntas Frecuentes
          </h2>
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            {items.length} {items.length === 1 ? 'respuesta' : 'respuestas'}
          </span>
        </div>

        {canEdit && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800 hover:bg-teal-50 px-2.5 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Agregar pregunta
          </button>
        )}
      </div>

      <p className="text-xs text-slate-500 mb-4 max-w-3xl leading-relaxed">
        El Asistente IA responde con estas respuestas cuando un paciente pregunta algo que no es
        una cita: estacionamiento, aseguradoras, formas de pago o cuidados. Si no hay ninguna,
        improvisa.
      </p>

      {loadError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500 py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando preguntas…
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center">
          <HelpCircle className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700">
            Tu asistente todavía no sabe responder dudas frecuentes
          </p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Agrega las preguntas que más te hacen por teléfono y WhatsApp para que las conteste
            igual que tu recepción.
          </p>
          {canEdit && (
            <button
              onClick={openCreate}
              className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar primera pregunta
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs hover:border-teal-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-teal-700 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded-full mb-2">
                    {item.category || 'General'}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">{item.question}</h3>
                </div>

                {canEdit && (
                  <div className="flex items-center shrink-0">
                    <button
                      onClick={() => openEdit(item)}
                      className="p-1.5 text-slate-400 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
                      title="Editar pregunta"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(item)}
                      disabled={deletingId === item.id}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Eliminar pregunta"
                    >
                      {deletingId === item.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-600 mt-2 leading-relaxed">{item.answer}</p>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                  <HelpCircle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingId ? 'Editar Pregunta' : 'Nueva Pregunta Frecuente'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    El Asistente IA usará esta respuesta tal cual
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                {formError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="faq-q">
                    Pregunta del paciente *
                  </label>
                  <input
                    id="faq-q"
                    type="text"
                    required
                    maxLength={500}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="¿Tienen estacionamiento?"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="faq-a">
                    Respuesta *
                  </label>
                  <textarea
                    id="faq-a"
                    required
                    rows={4}
                    maxLength={2000}
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Sí, contamos con estacionamiento gratuito para pacientes en el sótano del edificio."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      className="block text-xs font-semibold text-slate-700 mb-1"
                      htmlFor="faq-cat"
                    >
                      Categoría
                    </label>
                    <select
                      id="faq-cat"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                    >
                      {FAQ_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      className="block text-xs font-semibold text-slate-700 mb-1"
                      htmlFor="faq-kw"
                    >
                      Palabras clave
                    </label>
                    <input
                      id="faq-kw"
                      type="text"
                      maxLength={500}
                      value={keywords}
                      onChange={(e) => setKeywords(e.target.value)}
                      placeholder="estacionamiento, valet"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                    />
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Guardando...' : editingId ? 'Guardar Cambios' : 'Agregar Pregunta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
