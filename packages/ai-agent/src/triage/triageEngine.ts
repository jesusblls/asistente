export type TriageUrgencyLevel = 'CRITICAL_EMERGENCY' | 'URGENT_DENTAL' | 'ROUTINE';

export interface TriageResult {
  level: TriageUrgencyLevel;
  requiresImmediateHospital: boolean;
  prioritySlotRecommended: boolean;
  recommendedSpecialty: string;
  adviceForPatient: string;
  alertStaff: boolean;
}

const CRITICAL_KEYWORDS = [
  'no puedo respirar',
  'dificultad para respirar',
  'ahogando',
  'hemorragia',
  'hemorragia que no para',
  'sangrado abundante',
  'sangrado profuso',
  'sangrado incontrolable',
  'perdio el conocimiento',
  'desmayo',
  'fractura de mandibula',
  'accidente automovilistico',
  'anafilaxia',
  'alergia severa',
  'dolor de pecho',
];

const DENTAL_URGENT_KEYWORDS = [
  'dolor insoportable',
  'dolor muy fuerte',
  'dolor agudo',
  'dolor agudo de muela',
  'dolor de muela',
  'no me deja dormir',
  'se me cayo el diente',
  'diente roto de golpe',
  'diente salido',
  'absceso',
  'flemon',
  'hinchada la cara',
  'me late la muela',
  'fiebre',
  'infeccion',
  'sangrado en la encia constante',
];

export function evaluateTriage(message: string, painLevel?: number): TriageResult {
  const normalized = message.toLowerCase();

  // 1. Detección de Emergencia Crítica Vital (911 / Hospital)
  for (const kw of CRITICAL_KEYWORDS) {
    if (normalized.includes(kw)) {
      return {
        level: 'CRITICAL_EMERGENCY',
        requiresImmediateHospital: true,
        prioritySlotRecommended: false,
        recommendedSpecialty: 'Urgencias Médicas Hospitalarias',
        adviceForPatient: 'ALERTA MÉDICA: Por tus síntomas, se requiere atención médica inmediata de urgencia. Por favor acude al servicio de urgencias hospitalarias más cercano o llama al 911 de inmediato.',
        alertStaff: true,
      };
    }
  }

  // 2. Detección de Urgencia Dental (Dolor agudo, avulsión o infección)
  const hasUrgentKeyword = DENTAL_URGENT_KEYWORDS.some((kw) => normalized.includes(kw));
  const isHighPain = typeof painLevel === 'number' && painLevel >= 7;

  if (hasUrgentKeyword || isHighPain) {
    return {
      level: 'URGENT_DENTAL',
      requiresImmediateHospital: false,
      prioritySlotRecommended: true,
      recommendedSpecialty: 'Cirugía Maxilofacial y Endodoncia',
      adviceForPatient: 'Identificamos que presentas un cuadro de dolor agudo o posible infección. Te recomendamos agendar con máxima prioridad el día de hoy con el especialista. Mientras acudes a consulta: no apliques calor en la zona y evita automedicarte con aspirina.',
      alertStaff: true,
    };
  }

  // 3. Consulta de Rutina / Preventiva
  return {
    level: 'ROUTINE',
    requiresImmediateHospital: false,
    prioritySlotRecommended: false,
    recommendedSpecialty: 'Odontología General y Estética Dental',
    adviceForPatient: 'Consulta estándar o preventiva. Puedes seleccionar el horario y doctor que mejor se ajuste a tu tiempo.',
    alertStaff: false,
  };
}
