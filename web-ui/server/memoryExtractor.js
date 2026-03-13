/**
 * Keyword-based memory extraction from user messages.
 * No LLM calls — pure regex pattern matching.
 */
import { addMemory } from './db.js';

// Each pattern: { key, regex, group (capture group index for value) }
// ORDER MATTERS: more specific patterns first (area before company)
const PATTERNS = [
  // Name
  { key: 'nombre_usuario', regex: /\bme llamo\s+([A-Z\u00c0-\u00dc][a-z\u00e0-\u00fc]+(?:\s+[A-Z\u00c0-\u00dc][a-z\u00e0-\u00fc]+)*)/i, group: 1 },
  { key: 'nombre_usuario', regex: /\bmi nombre es\s+([A-Z\u00c0-\u00dc][a-z\u00e0-\u00fc]+(?:\s+[A-Z\u00c0-\u00dc][a-z\u00e0-\u00fc]+)*)/i, group: 1 },
  { key: 'nombre_usuario', regex: /\bsoy\s+([A-Z][a-z\u00e0-\u00fc]+(?:\s+[A-Z][a-z\u00e0-\u00fc]+)*)\s*[,.]?\s*$/i, group: 1 },

  // Department / area (BEFORE company — "trabajo en el departamento" is area, not company)
  { key: 'area_usuario', regex: /\bsoy del?\s+(?:area|departamento|equipo)\s+(?:de\s+)?(.+?)(?:\s*[,.]|$)/i, group: 1 },
  { key: 'area_usuario', regex: /\btrabajo en\s+(?:el\s+)?(?:area|departamento|equipo)\s+(?:de\s+)?(.+?)(?:\s*[,.]|$)/i, group: 1 },
  { key: 'area_usuario', regex: /\bmi (?:area|departamento)\s+es\s+(.+?)(?:\s*[,.]|$)/i, group: 1 },

  // Company / client (negative lookahead excludes department keywords)
  { key: 'empresa_usuario', regex: /\btrabajo en\s+(?!(?:el\s+)?(?:area|departamento|equipo)\b)(.+?)(?:\s*[,.]|$)/i, group: 1 },
  { key: 'empresa_usuario', regex: /\bsoy de\s+(?:la empresa\s+)?(.+?)(?:\s*[,.]|$)/i, group: 1 },
  { key: 'empresa_usuario', regex: /\bmi empresa es\s+(.+?)(?:\s*[,.]|$)/i, group: 1 },
  { key: 'cliente_frecuente', regex: /\bmi cliente(?:\s+principal)?\s+es\s+(.+?)(?:\s*[,.]|$)/i, group: 1 },
  { key: 'cliente_frecuente', regex: /\bsiempre\s+(?:trabajo|veo|reviso)\s+(?:con|los de)\s+(.+?)(?:\s*[,.]|$)/i, group: 1 },

  // Role / position
  { key: 'cargo_usuario', regex: /\bmi cargo es\s+(.+?)(?:\s*[,.]|$)/i, group: 1 },
  { key: 'cargo_usuario', regex: /\bmi puesto es\s+(.+?)(?:\s*[,.]|$)/i, group: 1 },

  // Preferred format
  { key: 'formato_preferido', regex: /\bprefiero\s+(?:el\s+)?(?:formato\s+)?(excel|csv|pdf|tabla|lista)/i, group: 1 },
  { key: 'formato_preferido', regex: /\bsiempre\s+(?:en|como)\s+(excel|csv|pdf)/i, group: 1 },
  { key: 'formato_preferido', regex: /\bme gusta (?:m[a\u00e1]s )?(?:en\s+)?(excel|csv|pdf)/i, group: 1 },

  // Project
  { key: 'proyecto_actual', regex: /\bmi proyecto(?:\s+actual)?\s+es\s+(.+?)(?:\s*[,.]|$)/i, group: 1 },
  { key: 'proyecto_actual', regex: /\btrabajo en el proyecto\s+(.+?)(?:\s*[,.]|$)/i, group: 1 },
  { key: 'proyecto_actual', regex: /\bestoy en el proyecto\s+(.+?)(?:\s*[,.]|$)/i, group: 1 },

  // Email
  { key: 'email_usuario', regex: /\bmi (?:correo|email|mail)\s+es\s+(\S+@\S+\.\S+)/i, group: 1 },

  // Preferred language (for responses)
  { key: 'idioma_preferido', regex: /\bprefiero\s+(?:que\s+(?:me\s+)?respondas?\s+)?en\s+(espa[n\u00f1]ol|ingl[e\u00e9]s|english|spanish)/i, group: 1 },
  { key: 'idioma_preferido', regex: /\bresp[o\u00f3]ndeme\s+(?:siempre\s+)?en\s+(espa[n\u00f1]ol|ingl[e\u00e9]s|english|spanish)/i, group: 1 },
];

// Words that should NOT be captured as names
const NAME_BLACKLIST = new Set([
  'el', 'la', 'un', 'una', 'de', 'del', 'que', 'por',
  'gerente', 'director', 'jefe', 'coordinador', 'analista',
  'ingeniero', 'desarrollador', 'soporte', 'administrador',
]);

/**
 * Extract memorable info from a user message.
 * Returns array of { key, value } objects.
 */
export function extractMemories(text) {
  if (!text || text.length < 5) return [];

  const found = [];
  const seenKeys = new Set();

  for (const pattern of PATTERNS) {
    if (seenKeys.has(pattern.key)) continue;

    const match = text.match(pattern.regex);
    if (!match) continue;

    let value = match[pattern.group].trim();

    // Clean trailing punctuation and conjunctions
    value = value.replace(/[.,;:!?]+$/, '').trim();
    value = value.replace(/\s+y\s+.*$/i, '').trim();

    // Skip very short or blacklisted values
    if (value.length < 2) continue;
    if (pattern.key === 'nombre_usuario' && NAME_BLACKLIST.has(value.toLowerCase())) continue;

    // Capitalize names properly
    if (pattern.key === 'nombre_usuario') {
      value = value.split(' ').map(w =>
        w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
      ).join(' ');
    }

    // Capitalize format
    if (pattern.key === 'formato_preferido') {
      value = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
    }

    found.push({ key: pattern.key, value });
    seenKeys.add(pattern.key);
  }

  return found;
}

/**
 * Extract memories from text and save to DB.
 * Fire-and-forget — errors are logged, not thrown.
 */
export function extractAndSaveMemories(text, chatId = null) {
  try {
    const memories = extractMemories(text);
    for (const { key, value } of memories) {
      addMemory(key, value, chatId);
      console.log(`[memory] Auto-saved: ${key} = "${value}"`);
    }
    return memories.length;
  } catch (err) {
    console.error('[memory] Extraction error:', err.message);
    return 0;
  }
}
