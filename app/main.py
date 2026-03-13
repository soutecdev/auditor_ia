import numpy as np
# ─────────────────────────────────────────────────────────────────────────────
# AuditIA — RAG Gateway v1.0
# FastAPI + Qdrant + nomic-embed-text-v1.5 + Ollama (Qwen3.5 9B) + Gemini
# Puerto : 8091   |   Colección Qdrant : "auditia"
#
# Diferencias clave vs SonIA:
#   - Colección y puerto separados (no pisa SonIA)
#   - STEP 3: Detección de norma (ISA, NIIF, PCAOB, COSO, SOX) + filtro Qdrant
#   - STEP 4: Detección de ciclo de auditoría + filtro ciclo_audit
#   - STEP 6: Tareas generativas (redactar hallazgo, memo, conclusión)
#   - RAG prompt con referencia a código y párrafo de norma
#   - TABLA_MAP orientado a papeles de trabajo (hallazgos, riesgos, programas)
#   - Mismo modelo nomic reutiliza cache de SonIA (sin duplicar disco)
# ─────────────────────────────────────────────────────────────────────────────

import re, json, uuid, asyncio, io, logging, os
from typing import Optional

import httpx
import pandas as pd
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Filter, FieldCondition, MatchValue, MatchAny, MatchText,
    Distance, VectorParams,
)
from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("auditia")

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN
# ─────────────────────────────────────────────────────────────────────────────
COLLECTION      = "auditia"                          # Colección separada de SonIA
PORT            = 8091                               # Puerto separado de SonIA (:8090)
LLM_URL         = "http://localhost:11434/api/chat"  # API nativa Ollama (think:false)
LLM_MODEL       = "sonia-qwen:9b"                   # Mismo modelo compartido con SonIA
EMBEDDING_MODEL = "nomic-ai/nomic-embed-text-v1.5"
EMBEDDING_DIMS  = 768
# Reutilizar cache de SonIA — evita descargar 500MB adicionales
MODELS_CACHE    = "/data/AI_Projects/SonIA/models/nomic"

score_threshold    = 0.50
audit_threshold    = 0.40       # Más permisivo para estándares internacionales

# Familias de estándares internacionales — siempre se buscan primero en RAG general
AUDIT_STANDARDS = {"ISA", "NIIF", "NIC", "COSO", "PCAOB", "SOX", "NIA", "IIA", "EY_INTERNO"}

# Keywords que indican que la query es sobre legislación venezolana
NACIONAL_KEYWORDS = [
    "venezuela", "venezolano", "venezolana",
    "lottt", "lot ", "ley organica del trabajo",
    "cot", "codigo organico tributario",
    "islr", "impuesto sobre la renta",
    "seniat", "tributario", "tributaria",
    "laboral", "trabajador", "patrono",
    "impuesto", "fiscal venezolano",
]
top_k              = 5
MAX_SEQ_LEN        = 4096
DEFAULT_MAX_TOKENS = 512

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL   = "gemini-2.0-flash"
GEMINI_URL     = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
)

# ─────────────────────────────────────────────────────────────────────────────
# PROMPTS
# ─────────────────────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """Eres el Auditor Interno Inteligente (AII), asistente especializado \
de EY/Soutec para equipos de auditoría interna.

IDENTIDAD Y ROL:
- Apoyas en análisis, investigación, documentación y comprensión de normas de auditoría.
- Sigues estándares internacionales: IPPF (IIA), COSO (2013 y ERM 2017), ISA/NIA, NIIF.
- Tu metodología es auditoría basada en riesgos.

ESTRUCTURA DE RESPUESTA:
Sigue internamente el flujo Contexto → Análisis → Recomendación, pero NO escribas
esas palabras como encabezados ni etiquetas explícitas. La respuesta debe fluir como
prosa profesional continua: primero sitúa el marco normativo o la situación,
luego desarrolla el análisis con riesgos y controles, y cierra con una conclusión
o recomendación concreta. La estructura debe sentirse como razonamiento natural,
no como un formulario.

NOMENCLATURA ESTÁNDAR:
- Riesgos: Riesgo 1 (Operativo), Riesgo 2 (Cumplimiento), Riesgo 3 (Información),
  Riesgo 4 (Financiero), Riesgo 5 (Tecnológico), Riesgo 6 (Fraude).
- Controles: Control A (Segregación/DoA), Control B (Revisión independiente/4 ojos),
  Control C (Validación de datos), Control D (Evidencia y trazabilidad),
  Control E (Controles automáticos del sistema), Control F (Monitoreo continuo),
  Control G (Gestión de cambios TI), Control H (Políticas y capacitación),
  Control I (Auditorías internas y cumplimiento).

REGLAS CRÍTICAS:
1. NUNCA inventes referencias normativas, párrafos ni artículos.
2. Cuando cites una norma, incluye el código y párrafo exacto si está en el corpus.
3. Usa riesgos y controles genéricos (Riesgo 1, Control A, etc.) — nunca datos reales.
4. NO incluyas "Fuentes consultadas:" al final. Las fuentes se muestran automáticamente.
5. Puedes citar normas inline: (ISA 315, párr. 28) — esto sí está permitido.
6. Evita exponer códigos internos, nombres reales de clientes o datos sensibles.
7. Si no encuentras la información en el corpus, di claramente:
   "No encontré esta información en el corpus disponible."
8. Responde en el mismo idioma en que te preguntan.
9. Sé profesional, claro y ejecutivo."""

BASE_RULES = """REGLAS:
1. Eres AuditIA, asistente de auditoría financiera de precisión.
2. NUNCA inventes párrafos, requisitos ni referencias normativas.
3. Cita siempre el código de norma y párrafo cuando sea posible.
4. Si no estás seguro, di: "Esta información necesita verificación adicional."
5. Responde en el mismo idioma en que te preguntan.
6. Sé técnico, preciso y profesional."""

IDENTITY_RESPONSE = """Soy **AuditIA**, un asistente especializado en auditoría financiera y control interno.

Puedo ayudarte con:
- 📋 **Consultas normativas**: ISA, NIIF, PCAOB, COSO, SOX — búsqueda por norma y párrafo
- 🔍 **Ciclos de auditoría**: compras, ventas, nómina, tesorería, activos fijos, impuestos
- ✍️ **Redacción técnica**: hallazgos, memorandos, conclusiones, cartas de recomendación
- 📊 **Tablas de trabajo**: matrices de hallazgos, riesgos y programas de auditoría
- 🌐 **Consultas complejas**: escalado a Gemini con sanitización de datos sensibles (PII)

Escribe `autorizar` para habilitar consultas a Gemini en esta sesión."""

# ─────────────────────────────────────────────────────────────────────────────
# IDENTITY KEYWORDS
# ─────────────────────────────────────────────────────────────────────────────
IDENTITY_KEYWORDS = [
    "quién eres", "quien eres", "qué eres", "que eres",
    "cómo te llamas", "como te llamas", "tu nombre",
    "qué puedes hacer", "que puedes hacer", "para qué sirves",
    "cuál es tu función", "cual es tu funcion",
    "qué es auditia", "que es auditia",
    "eres una ia", "eres un bot", "eres un asistente",
]

# ─────────────────────────────────────────────────────────────────────────────
# NORMA REGISTRY
# Patrones regex → metadatos de norma para filtros Qdrant
# ─────────────────────────────────────────────────────────────────────────────
NORMA_REGISTRY = {
    # ISA con número (ej: ISA 315, ISA-570)
    r"\bisa[\s\-]?(\d{3})\b":    {"norma_familia": "ISA",   "organismo": "IAASB"},
    # ISA genérico
    r"\bisa\b":                   {"norma_familia": "ISA",   "organismo": "IAASB"},
    # NIIF con número (ej: NIIF 9, IFRS 16)
    r"\bniif[\s\-]?(\d+)\b":      {"norma_familia": "NIIF",  "organismo": "IASB"},
    r"\bifrs[\s\-]?(\d+)\b":      {"norma_familia": "NIIF",  "organismo": "IASB"},
    r"\bniif\b":                   {"norma_familia": "NIIF",  "organismo": "IASB"},
    # NIC con número (ej: NIC 36, IAS 7)
    r"\bnic[\s\-]?(\d+)\b":       {"norma_familia": "NIC",   "organismo": "IASB"},
    r"\bias[\s\-]?(\d+)\b":       {"norma_familia": "NIC",   "organismo": "IASB"},
    # PCAOB (ej: AS 2201, PCAOB AS2301)
    r"\bpcaob\b":                  {"norma_familia": "PCAOB", "organismo": "PCAOB"},
    r"\bas[\s\-]?(\d{4})\b":      {"norma_familia": "PCAOB", "organismo": "PCAOB"},
    # COSO ERM específico — debe ir ANTES del genérico \bcoso\b
    r"\berm\b":                    {"norma_familia": "COSO",  "organismo": "COSO", "norma_codigo": "COSO-ERM-2017"},
    r"\bcoso[\s\-]?erm\b":          {"norma_familia": "COSO",  "organismo": "COSO", "norma_codigo": "COSO-ERM-2017"},
    # COSO GenAI — debe ir ANTES del genérico \bcoso\b
    r"\bgenai\b":                        {"norma_familia": "COSO", "organismo": "COSO", "norma_codigo": "COSO-GENAI-2026"},
    r"\binteligencia artificial generativa\b": {"norma_familia": "COSO", "organismo": "COSO", "norma_codigo": "COSO-GENAI-2026"},
    r"\bia generativa\b":                {"norma_familia": "COSO", "organismo": "COSO", "norma_codigo": "COSO-GENAI-2026"},
    r"\bgenerative ai\b":                {"norma_familia": "COSO", "organismo": "COSO", "norma_codigo": "COSO-GENAI-2026"},
    # COSO genérico
    r"\bcoso\b":                   {"norma_familia": "COSO",  "organismo": "COSO"},
    # SOX / Sarbanes-Oxley
    r"\bsox\b":                    {"norma_familia": "SOX",   "organismo": "SEC"},
    r"\bsarbanes\b":               {"norma_familia": "SOX",   "organismo": "SEC"},
    # NIA (versión española de ISA)
    r"\bnia[\s\-]?(\d{3})\b":     {"norma_familia": "NIA",   "organismo": "ICAC"},
    r"\bnia\b":                    {"norma_familia": "NIA",   "organismo": "ICAC"},
    # IIA — Normas Globales de Auditoría Interna / Three Lines Model
    r"\biia\b":                    {"norma_familia": "IIA",   "organismo": "IIA"},
    r"\bippf\b":                   {"norma_familia": "IIA",   "organismo": "IIA"},
    r"\bthree\s+lines\b":          {"norma_familia": "IIA",   "organismo": "IIA"},
    r"\btres\s+l[ií]neas\b":       {"norma_familia": "IIA",   "organismo": "IIA"},
    # ERM / ICIF / FRM — variantes de COSO
    r"\bicif\b":                   {"norma_familia": "COSO",  "organismo": "COSO"},
    r"\bfrm\b":                    {"norma_familia": "COSO",  "organismo": "COSO"},
    r"\brisk\s+management\b":      {"norma_familia": "COSO",  "organismo": "COSO"},
    r"\binternal\s+control\s+integrated\b": {"norma_familia": "COSO", "organismo": "COSO"},
}

# ─────────────────────────────────────────────────────────────────────────────
# CICLO MAP
# Palabras clave → ciclo de auditoría (para filtros Qdrant por ciclo_audit)
# ─────────────────────────────────────────────────────────────────────────────
CICLO_MAP = {
    "compras":         ["compras", "cuentas por pagar", "proveedores", "adquisiciones",
                        "pagos a proveedores", "purchase", "accounts payable"],
    "ventas":          ["ventas", "ingresos", "cuentas por cobrar", "clientes",
                        "facturación", "facturacion", "revenue", "accounts receivable"],
    "nomina":          ["nómina", "nomina", "personal", "empleados", "salarios",
                        "rrhh", "recursos humanos", "payroll", "hr"],
    "tesoreria":       ["tesorería", "tesoreria", "caja", "bancos", "efectivo",
                        "liquidez", "cash", "treasury"],
    "inventario":      ["inventario", "inventarios", "existencias", "stock",
                        "almacén", "almacen", "inventory"],
    "activos_fijos":   ["activos fijos", "propiedad planta", "ppe", "inmovilizado",
                        "depreciación", "depreciacion", "fixed assets"],
    "impuestos":       ["impuestos", "tributario", "fiscal", "iva", "isr", "tax",
                        "renta", "declaración fiscal", "declaracion fiscal"],
    "consolidacion":   ["consolidación", "consolidacion", "estados financieros consolidados",
                        "grupo", "subsidiaria", "consolidation"],
    "control_interno": ["control interno", "sox", "segregación", "segregacion",
                        "itgc", "controles it", "control interno"],
    "fraude":          ["fraude", "irregularidad", "malversación", "malversacion",
                        "forensic", "forensics", "desfalco"],
    "tecnologia":      ["tecnología", "tecnologia", "sistemas", "itgc", "it audit",
                        "ciberseguridad", "cybersecurity", "general it controls"],
    "riesgos":         ["riesgo inherente", "riesgo de control", "materialidad",
                        "risk assessment", "scoping", "evaluación de riesgos"],
    "sostenibilidad":  ["esg", "sostenibilidad", "medio ambiente", "carbono",
                        "csrd", "sustainability", "no financiero"],
}

# ─────────────────────────────────────────────────────────────────────────────
# GENERATIVE KEYWORDS — tareas de redacción técnica de auditoría
# ─────────────────────────────────────────────────────────────────────────────
GENERATIVE_KEYWORDS = [
    "redacta", "redactar", "elabora", "elaborar", "escribe", "escribir",
    "prepara", "preparar", "genera", "generar", "crea", "crear",
    "draft", "drafting", "memo", "memorando", "hallazgo", "hallazgos",
    "informe de auditoría", "carta de recomendación", "management letter",
    "conclusión", "conclusion", "conclusiones", "recomendación", "recomendacion",
    "plantilla", "template", "resumen ejecutivo", "opinión de auditoría",
    "opinion de auditoria", "párrafo de énfasis", "parrafo de enfasis",
    # Productos de auditoría AII
    "redacta un hallazgo", "escribe un hallazgo", "elabora un hallazgo",
    "hallazgo de auditoría", "criterio condición causa efecto",
    "resumen ejecutivo", "genera un resumen", "elabora un resumen",
    "minuta de seguimiento", "acta de seguimiento", "acuerdos y responsables",
    "cuestionario de entendimiento", "preguntas para el dueño",
    "mapeo de riesgos", "mapa de riesgos y controles", "matriz de riesgos",
    "pruebas de auditoría", "programa de auditoría", "procedimientos de auditoría",
    "diseña pruebas", "propón pruebas", "checklist",
    "plan de acción", "seguimiento de hallazgos",
    "KRI", "indicadores de riesgo", "key risk indicator",
]

# ─────────────────────────────────────────────────────────────────────────────
# TABLA MAP — tablas estructuradas de papeles de trabajo
# ─────────────────────────────────────────────────────────────────────────────
TABLA_MAP = {
    "hallazgos": {
        "source":   "Matriz_Hallazgos.xlsx",
        "titulo":   "Matriz de Hallazgos",
        "keywords": ["matriz de hallazgos", "tabla de hallazgos", "lista de hallazgos",
                     "findings", "finding",
                     "observación", "observacion", "deficiencia", "deficiencias"],
    },
    "riesgos": {
        "source":   "Matriz_Riesgos.xlsx",
        "titulo":   "Matriz de Riesgos",
        "keywords": ["riesgo", "riesgos", "matriz de riesgos", "risk matrix",
                     "evaluación de riesgos", "evaluacion de riesgos"],
    },
    "programas": {
        "source":   "Programas_Auditoria.xlsx",
        "titulo":   "Programas de Auditoría",
        "keywords": ["programa de auditoría", "programa de auditoria",
                     "audit program", "procedimientos de auditoría",
                     "procedimientos de auditoria"],
    },
}

TABLE_STOPWORDS = {
    "cuáles", "cuales", "cuántos", "cuantos", "qué", "que", "dónde", "donde",
    "están", "estan", "son", "tiene", "muestra", "muéstrame", "mostrame",
    "dame", "dime", "los", "las", "del", "una", "todos", "todas",
    "hay", "existen", "listar", "lista", "ver", "mostrar",
    "exporta", "exportar", "expórtalo", "exportalo", "descarga",
    "abiertos", "cerrados", "resueltos", "pendientes", "activos",
    "criticos", "críticos", "altos", "medios", "bajos",
    "hallazgo", "hallazgos", "riesgo", "riesgos", "programa", "programas",
}

# ─────────────────────────────────────────────────────────────────────────────
# QUERY STOPWORDS — para query augmentation y filtrado de términos vacíos
# ─────────────────────────────────────────────────────────────────────────────
_QUERY_STOPWORDS = {
    "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del",
    "al", "en", "con", "por", "para", "que", "qué", "es", "son", "está",
    "hay", "se", "me", "te", "le", "nos", "como", "cómo", "cuál", "cual",
    "cuáles", "cuales", "quién", "quien", "dónde", "donde",
    "cuándo", "cuando", "a", "e", "o", "y", "the", "is", "are", "of",
    "and", "or", "in", "on", "at", "to", "for", "with", "about",
    "what", "how", "which", "who", "when", "where", "this", "that", "an",
    "dame", "dime", "muestra", "muéstrame", "ver", "auditoría", "auditoria",
    "norma", "normas", "según", "segun", "establece", "dice", "indica",
}

# ─────────────────────────────────────────────────────────────────────────────
# INIT — FastAPI + Embedder + Qdrant + Presidio
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(title="AuditIA Gateway", version="1.0")

log.info("Cargando modelo nomic (cache compartida con SonIA)...")
embedder = SentenceTransformer(
    EMBEDDING_MODEL,
    cache_folder=MODELS_CACHE,
    trust_remote_code=True,
)
log.info("Embedder listo.")

qdrant = QdrantClient(url="http://localhost:6333")

# Crear colección si no existe
try:
    qdrant.get_collection(COLLECTION)
    log.info(f"Colección '{COLLECTION}' encontrada.")
except Exception:
    log.info(f"Creando colección '{COLLECTION}' (768 dims, COSINE)...")
    qdrant.create_collection(
        collection_name=COLLECTION,
        vectors_config=VectorParams(size=EMBEDDING_DIMS, distance=Distance.COSINE),
    )
    log.info("Colección creada.")

presidio_analyzer   = AnalyzerEngine()
presidio_anonymizer = AnonymizerEngine()

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS — Texto / Thinking / PII
# ─────────────────────────────────────────────────────────────────────────────
def _strip_thinking(text: str) -> str:
    """Elimina bloques <think>...</think> que Qwen3.5 genera a veces incluso con think:false."""
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    return cleaned.strip()


def _sanitize_pii(text: str) -> str:
    """Sanitiza PII con Presidio (ES/EN) antes de enviar a Gemini."""
    results = presidio_analyzer.analyze(text=text, language="es")
    if not results:
        results = presidio_analyzer.analyze(text=text, language="en")
    return presidio_anonymizer.anonymize(text=text, analyzer_results=results).text


def is_knowledge_gap(text: str) -> bool:
    t = text.lower()
    patterns = [
        "no tengo información", "no dispongo de", "no encuentro",
        "no está en mi base", "no figura en", "no está disponible",
        "knowledge_gap_detected", "_gap_", "gap_detected",
        "no puedo responder", "información no disponible",
        "fuera de mi conocimiento", "no tengo acceso",
        "no se encuentra en el corpus", "no hay información",
    ]
    return any(p in t for p in patterns)


def _build_conversation_context(messages: list, n: int = 3) -> str:
    """Extrae los últimos n pares user/assistant para contexto conversacional."""
    pairs = []
    msgs = [m for m in messages if m.get("role") in ("user", "assistant")]
    for i in range(len(msgs) - 1, -1, -1):
        if msgs[i]["role"] == "assistant" and i > 0 and msgs[i - 1]["role"] == "user":
            u = msgs[i - 1].get("content", "")
            a = msgs[i].get("content", "")
            if isinstance(u, list):
                u = " ".join(p.get("text", "") for p in u if isinstance(p, dict))
            pairs.insert(0, f"Usuario: {u}\nAsistente: {a}")
            if len(pairs) >= n:
                break
    return "\n\n".join(pairs)


def _extract_images(messages: list) -> list:
    """Extrae imágenes base64 del último mensaje del usuario."""
    for msg in reversed(messages):
        if msg.get("role") != "user":
            continue
        content = msg.get("content", "")
        if not isinstance(content, list):
            continue
        imgs = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "image_url":
                url = part.get("image_url", {}).get("url", "")
                if url.startswith("data:image"):
                    imgs.append(url.split(",", 1)[-1])
        if imgs:
            return imgs
    return []


def _get_user_text(messages: list) -> str:
    """Extrae el texto del último mensaje del usuario."""
    for msg in reversed(messages):
        if msg.get("role") != "user":
            continue
        content = msg.get("content", "")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            return " ".join(
                p.get("text", "") for p in content
                if isinstance(p, dict) and p.get("type") == "text"
            )
    return ""

# ─────────────────────────────────────────────────────────────────────────────
# TEMPLATES DE PRODUCTOS DE AUDITORÍA
# ─────────────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────────────
# BÚSQUEDA DE EJEMPLOS DE REFERENCIA
# ─────────────────────────────────────────────────────────────────────────────

def _is_matriz_request(query: str) -> bool:
    """Detecta si el usuario pide generar una matriz de riesgos y controles."""
    q = query.lower()
    triggers = ["matriz de riesgo", "matriz de control", "racm", "rcc",
                "genera una matriz", "crea una matriz", "elabora una matriz",
                "mapeo de riesgos", "mapa de riesgos y controles",
                "tabla de riesgos", "inventario de riesgos"]
    return any(t in q for t in triggers)


async def _get_ejemplo_context(query: str, ciclo: str = None) -> str:
    """Busca chunks de matrices de ejemplo relevantes para usar como plantilla."""
    vector = embedder.encode(query, normalize_embeddings=True).tolist()

    conditions = [FieldCondition(key="doc_type", match=MatchValue(value="ejemplo"))]
    if ciclo:
        conditions.append(
            FieldCondition(key="ciclo_audit", match=MatchAny(any=[ciclo]))
        )

    ejemplo_filter = Filter(must=conditions)

    points = qdrant.query_points(
        collection_name=COLLECTION,
        query=vector,
        query_filter=ejemplo_filter,
        limit=6,
        score_threshold=0.30,
    ).points

    if not points:
        # Fallback: cualquier ejemplo sin filtro de ciclo
        ejemplo_filter_general = Filter(must=[
            FieldCondition(key="doc_type", match=MatchValue(value="ejemplo"))
        ])
        points = qdrant.query_points(
            collection_name=COLLECTION,
            query=vector,
            query_filter=ejemplo_filter_general,
            limit=6,
            score_threshold=0.30,
        ).points

    if not points:
        return ""

    fuentes = list({p.payload.get("titulo_ejemplo", p.payload.get("source", "?"))
                    for p in points})
    chunks = "\n---\n".join(p.payload.get("text", "") for p in points)

    return (
        f"EJEMPLOS DE REFERENCIA (úsalos como plantilla de estructura, "
        f"genera contenido genérico nuevo basado en ellos, "
        f"NO copies los datos reales):\n"
        f"Fuentes de ejemplo: {', '.join(fuentes)}\n\n"
        f"{chunks}"
    )


def _is_hallazgo_request(query: str) -> bool:
    """Detecta si el usuario pide redactar un hallazgo."""
    q = query.lower()
    # Excluir consultas sobre tablas/matrices — esas van al handler de tablas
    table_queries = ["matriz de hallazgos", "tabla de hallazgos",
                     "lista de hallazgos", "muéstrame los hallazgos",
                     "muéstrame hallazgos", "ver hallazgos", "mostrar hallazgos"]
    if any(t in q for t in table_queries):
        return False
    triggers = ["redacta", "elabora", "escribe", "crea", "genera",
                "criterio", "condición", "causa", "efecto",
                "hallazgo de auditoría", "hallazgo ficticio"]
    return any(t in q for t in triggers) and "hallazgo" in q

def _is_resumen_ejecutivo_request(query: str) -> bool:
    q = query.lower()
    triggers = ["resumen ejecutivo", "executive summary", "genera un resumen",
                "elabora un resumen", "resume ejecutivamente"]
    return any(t in q for t in triggers)

def _is_minuta_request(query: str) -> bool:
    q = query.lower()
    triggers = ["minuta", "acta de seguimiento", "acuerdos", "responsables",
                "seguimiento de hallazgo", "plan de acción"]
    return any(t in q for t in triggers)

def _is_cuestionario_request(query: str) -> bool:
    q = query.lower()
    triggers = ["cuestionario", "preguntas para", "entendimiento del proceso",
                "interview", "entrevista al dueño"]
    return any(t in q for t in triggers)

HALLAZGO_SYSTEM = """Eres el AII. Redacta hallazgos de auditoría siguiendo la estructura:
**Criterio**: norma, política o estándar aplicable.
**Condición**: situación encontrada (usa datos genéricos).
**Causa**: origen o razón de la desviación.
**Efecto**: impacto real o potencial (Riesgo 1-6).
**Recomendación**: acción correctiva con responsable genérico y plazo.
Usa riesgos y controles genéricos. No expongas datos reales."""

RESUMEN_SYSTEM = """Eres el AII. Genera resúmenes ejecutivos de auditoría con:
- Objetivo y alcance (1-2 líneas)
- Hallazgos clave (numerados, con nivel de riesgo: Alto/Medio/Bajo)
- Controles clave evaluados
- Conclusión general y nivel de madurez de control
Máximo 200 palabras. Profesional y ejecutivo."""

MINUTA_SYSTEM = """Eres el AII. Genera minutas/actas de seguimiento con:
- Fecha y participantes (genéricos: Responsable 1, Área X)
- Acuerdos numerados con: Descripción | Responsable | Fecha compromiso | Estado
- Próximos pasos
Formato tabla markdown para los acuerdos.
IMPORTANTE: Si el espacio es limitado, reduce a 3 acuerdos bien completos
en vez de 5 incompletos. Nunca cortes una fila de tabla a la mitad."""

CUESTIONARIO_SYSTEM = """Eres el AII. Diseña cuestionarios de entendimiento con:
- 10 preguntas abiertas dirigidas al dueño del proceso
- Cada pregunta con: objetivo de la pregunta y evidencia a solicitar
- Organizado por fase: Entorno de control → Proceso → Riesgos → Controles
Basado en metodología de auditoría basada en riesgos (IPPF/COSO).
IMPORTANTE: Si el espacio es limitado, genera 6 preguntas completas y bien
desarrolladas en vez de 10 incompletas. Nunca dejes una pregunta sin su
objetivo y evidencia."""

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS — Detección normativa y de intención
# ─────────────────────────────────────────────────────────────────────────────
def _detect_norma(query: str) -> Optional[dict]:
    """Detecta si la query menciona una norma específica.
    Retorna dict con norma_familia, organismo, y opcionalmente norma_codigo."""
    q = query.lower()
    for pattern, meta in NORMA_REGISTRY.items():
        m = re.search(pattern, q)
        if m:
            result = dict(meta)
            if m.lastindex and m.lastindex >= 1:
                num = m.group(1)
                familia = meta["norma_familia"]
                result["norma_codigo"] = f"{familia}-{num}"
            return result
    return None


def _detect_ciclo(query: str) -> Optional[str]:
    """Detecta el ciclo de auditoría mencionado en la query."""
    q = query.lower()
    for ciclo, keywords in CICLO_MAP.items():
        for kw in keywords:
            if kw in q:
                return ciclo
    return None


def _detect_requerimiento_intent(query: str) -> bool:
    """True si el usuario busca requisitos/obligaciones específicos de una norma."""
    q = query.lower()
    patterns = [
        "requisito", "requerimiento", "debe", "shall", "obligación", "obligacion",
        "es obligatorio", "qué dice", "que dice", "qué establece", "que establece",
        "párrafo", "parrafo", "artículo", "articulo", "sección", "seccion",
        "qué requiere", "que requiere", "cuál es el procedimiento", "cual es el procedimiento",
    ]
    return any(p in q for p in patterns)


def _detect_generative_intent(query: str) -> bool:
    q = query.lower()
    return any(kw in q for kw in GENERATIVE_KEYWORDS)


def _detect_table_intent(query: str) -> Optional[str]:
    """Retorna la clave de TABLA_MAP si la query es sobre una tabla conocida."""
    q = query.lower()
    for key, cfg in TABLA_MAP.items():
        for kw in cfg["keywords"]:
            if kw in q:
                return key
    return None

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS — Smart Table Handler (adaptado de SonIA para auditoría)
# ─────────────────────────────────────────────────────────────────────────────
def _get_table_context(messages: list) -> Optional[dict]:
    """Detecta si hay contexto de tabla previa en el historial (follow-ups)."""
    for msg in reversed(messages[-6:]):
        if msg.get("role") != "assistant":
            continue
        content = msg.get("content", "")
        m = re.search(r"Fuentes:.*?([\w\s_]+\.xlsx)", content, re.DOTALL)
        if m:
            source = m.group(1).strip()
            for key, cfg in TABLA_MAP.items():
                if cfg["source"].lower() == source.lower():
                    # Recuperar prev_query_words del último mensaje usuario
                    prev_words = []
                    for m2 in reversed(messages[-6:]):
                        if m2.get("role") == "user":
                            raw = m2.get("content", "")
                            if isinstance(raw, list):
                                raw = " ".join(
                                    p.get("text", "") for p in raw if isinstance(p, dict)
                                )
                            words = [
                                w for w in raw.lower().split()
                                if w not in TABLE_STOPWORDS and len(w) > 2
                            ]
                            if words:
                                prev_words = words
                                break
                    return {
                        "source": cfg["source"],
                        "titulo": cfg["titulo"],
                        "prev_query_words": prev_words,
                    }
    return None


def _fetch_table_rows(source: str) -> list:
    """Recupera todos los payloads de una tabla desde Qdrant."""
    results = qdrant.scroll(
        collection_name=COLLECTION,
        scroll_filter=Filter(
            must=[FieldCondition(key="source", match=MatchValue(value=source))]
        ),
        limit=2000,
        with_payload=True,
    )
    return [p.payload for p in results[0]]


def _filter_rows(query_words: list, rows: list, col_header: str = None) -> list:
    """Filtrado cascade: frase exacta → AND → OR."""
    if not query_words:
        return rows

    phrase = " ".join(query_words)

    def row_text(r):
        if col_header:
            return str(r.get(col_header, "")).lower()
        return " ".join(str(v) for v in r.values()).lower()

    # 1. Frase exacta
    filtered = [r for r in rows if phrase in row_text(r)]
    if filtered:
        return filtered
    # 2. AND
    filtered = [r for r in rows if all(w in row_text(r) for w in query_words)]
    if filtered:
        return filtered
    # 3. OR (fallback)
    return [r for r in rows if any(w in row_text(r) for w in query_words)]


def _rows_to_markdown(rows: list, titulo: str, max_rows: int = 50) -> str:
    if not rows:
        return f"No se encontraron registros en **{titulo}**."
    shown = rows[:max_rows]
    # Excluir columnas internas de Qdrant
    exclude = {"text", "checksum", "indexed_at", "chunk_index", "doc_type",
               "file_type", "vision_processed", "embedding_model"}
    headers = [h for h in shown[0].keys() if h not in exclude]
    if not headers:
        headers = list(shown[0].keys())[:6]

    lines = ["| " + " | ".join(headers) + " |"]
    lines.append("|" + "|".join(["---"] * len(headers)) + "|")
    for row in shown:
        vals = [str(row.get(h, "")).replace("|", "\\|") for h in headers]
        lines.append("| " + " | ".join(vals) + " |")

    result = "\n".join(lines)
    if len(rows) > max_rows:
        result += f"\n\n*Mostrando {max_rows} de {len(rows)} registros.*"
    result += f"\n\nFuentes:\n- {shown[0].get('source', titulo)}"
    return result


def _export_xlsx(rows: list, filename_base: str) -> bytes:
    df = pd.DataFrame(rows)
    exclude = {"text", "checksum", "indexed_at", "embedding_model"}
    safe_cols = [c for c in df.columns if c not in exclude]
    df = df[safe_cols] if safe_cols else df
    buf = io.BytesIO()
    df.to_excel(buf, index=False, engine="openpyxl")
    return buf.getvalue()

# ─────────────────────────────────────────────────────────────────────────────
# LLM CALLS
# ─────────────────────────────────────────────────────────────────────────────
async def call_local_llm(
    prompt: str,
    system_prompt: str = SYSTEM_PROMPT,
    max_tokens_override: int = 0,
    temperature: float = 0.3,
) -> str:
    prompt_tokens = len(prompt.split()) * 1.3
    max_tokens = max_tokens_override or min(DEFAULT_MAX_TOKENS, int(MAX_SEQ_LEN - prompt_tokens))
    max_tokens = max(64, max_tokens)

    payload = {
        "model":  LLM_MODEL,
        "think":  False,
        "stream": False,
        "options": {"temperature": temperature, "num_predict": max_tokens},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": prompt},
        ],
    }
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(LLM_URL, json=payload)
        r.raise_for_status()
    raw = r.json().get("message", {}).get("content", "")
    return _strip_thinking(raw)


async def call_local_llm_general_knowledge(query: str) -> str:
    prompt = f"{BASE_RULES}\n\nPregunta: {query}"
    return await call_local_llm(prompt, temperature=0.5)


async def call_vision_llm(text_prompt: str, images_b64: list) -> str:
    payload = {
        "model":  LLM_MODEL,
        "think":  False,
        "stream": False,
        "messages": [{
            "role":    "user",
            "content": text_prompt,
            "images":  images_b64,
        }],
    }
    async with httpx.AsyncClient(timeout=180) as client:
        r = await client.post(LLM_URL, json=payload)
        r.raise_for_status()
    raw = r.json().get("message", {}).get("content", "")
    return _strip_thinking(raw)


async def call_gemini(query: str) -> str:
    if not GEMINI_API_KEY:
        return "⚠️ API key de Gemini no configurada. Agrega GEMINI_API_KEY al entorno."
    sanitized = _sanitize_pii(query)
    payload = {"contents": [{"parts": [{"text": sanitized}]}]}
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(GEMINI_URL, json=payload)
        r.raise_for_status()
    candidates = r.json().get("candidates", [])
    if candidates:
        return candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    return "Sin respuesta de Gemini."

# ─────────────────────────────────────────────────────────────────────────────
# SSE HELPERS
# ─────────────────────────────────────────────────────────────────────────────
def _sse_chunk(content: str) -> str:
    data = json.dumps({"choices": [{"delta": {"content": content}}]})
    return f"data: {data}\n\n"


def _sse_done() -> str:
    return "data: [DONE]\n\n"


async def _sse_single(text: str):
    """Envía texto completo como un único chunk SSE seguido de DONE."""
    yield _sse_chunk(text)
    yield _sse_done()


async def _stream_llm(
    prompt: str,
    system_prompt: str = SYSTEM_PROMPT,
    temperature: float = 0.3,
    max_tokens: int = DEFAULT_MAX_TOKENS,
):
    """Streaming token-by-token desde Ollama con limpieza de thinking."""
    payload = {
        "model":  LLM_MODEL,
        "think":  False,
        "stream": True,
        "options": {"temperature": temperature, "num_predict": max_tokens},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": prompt},
        ],
    }
    in_think = False
    async with httpx.AsyncClient(timeout=180) as client:
        async with client.stream("POST", LLM_URL, json=payload) as resp:
            async for line in resp.aiter_lines():
                if not line.strip():
                    continue
                try:
                    chunk = json.loads(line)
                except Exception:
                    continue
                token = chunk.get("message", {}).get("content", "")
                if not token:
                    if chunk.get("done"):
                        break
                    continue
                # Filtrar bloques <think>
                if "<think>" in token:
                    in_think = True
                if in_think:
                    if "</think>" in token:
                        in_think = False
                    continue
                yield token
                if chunk.get("done"):
                    break


async def _stream_llm_general(query: str):
    prompt = f"{BASE_RULES}\n\nPregunta: {query}"
    async for token in _stream_llm(prompt, temperature=0.5):
        yield token

# ─────────────────────────────────────────────────────────────────────────────
# RAG — Búsqueda vectorial con filtros normativos
# ─────────────────────────────────────────────────────────────────────────────
def _build_norma_filter(norma_meta: dict, requerimiento_only: bool = False) -> Optional[Filter]:
    """Construye filtro Qdrant a partir de metadatos normativos detectados."""
    conditions = []
    if "norma_codigo" in norma_meta:
        conditions.append(
            FieldCondition(key="norma_codigo", match=MatchValue(value=norma_meta["norma_codigo"]))
        )
    elif "norma_familia" in norma_meta:
        conditions.append(
            FieldCondition(key="norma_familia", match=MatchValue(value=norma_meta["norma_familia"]))
        )
    if requerimiento_only:
        conditions.append(
            FieldCondition(key="es_requerimiento", match=MatchValue(value=True))
        )
    return Filter(must=conditions) if conditions else None


def _build_ciclo_filter(ciclo: str) -> Filter:
    return Filter(
        must=[FieldCondition(key="ciclo_audit", match=MatchAny(any=[ciclo]))]
    )



async def _translate_query_to_english(query: str) -> str:
    """Traduce query al inglés para mejorar similitud con corpus en inglés.
    Retorna la traducción o la query original si falla."""
    spanish_markers = ['á','é','í','ó','ú','ñ','ü','¿','¡','qué','cómo','cuál',
                        'según','también','gestión','auditoría','control','riesgo']
    q_lower = query.lower()
    if not any(m in q_lower for m in spanish_markers):
        return query

    try:
        prompt = f"Translate the following audit/accounting query to English. Return ONLY the translation, no explanations:\n\n{query}"
        translation = await call_local_llm(
            prompt,
            system_prompt="You are a professional translator specializing in auditing and accounting. Translate accurately and concisely.",
            max_tokens_override=150,
            temperature=0.1,
        )
        translation = translation.strip()
        if translation and len(translation) > 5 and len(translation) < len(query) * 4:
            log.info(f"Query traducida: [{translation[:100]}]")
            return translation
    except Exception as e:
        log.warning(f"Traducción fallida: {e}")
    return query


def _bilingual_vector(query_es: str, query_en: str) -> list:
    """Genera vector promedio de query en español e inglés para mejorar
    similitud con corpus en inglés."""
    if query_es == query_en:
        return embedder.encode(query_es, normalize_embeddings=True).tolist()
    vec_es = embedder.encode(query_es, normalize_embeddings=True)
    vec_en = embedder.encode(query_en, normalize_embeddings=True)
    vec_avg = (vec_es + vec_en) / 2.0
    norm = np.linalg.norm(vec_avg)
    if norm > 0:
        vec_avg = vec_avg / norm
    return vec_avg.tolist()

async def rag_search(
    query: str,
    norma_filter: Optional[Filter] = None,
    ciclo_filter: Optional[Filter] = None,
    k: Optional[int] = None,
) -> list:
    """
    Búsqueda vectorial en Qdrant con filtros opcionales por norma o ciclo.

    Sin filtro explícito (STEP 7 general):
      - Búsqueda 1: estándares internacionales (ISA/NIIF/COSO/IIA/etc) con threshold 0.40
        → máximo 2 chunks por fuente para evitar que una norma domine
      - Búsqueda 2: legislación venezolana SOLO si la query la menciona explícitamente
      - Combina ambos y desduplicar por id
    """
    k = k or top_k
    # Query augmentation bilingüe: mejora similitud con corpus en inglés
    query_en = await _translate_query_to_english(query)
    vector   = _bilingual_vector(query, query_en)

    # Si hay filtro explícito (norma o ciclo), búsqueda directa sin lógica dual
    if norma_filter or ciclo_filter:
        search_filter = norma_filter or ciclo_filter
        pts = qdrant.query_points(
            collection_name=COLLECTION,
            query=vector,
            query_filter=search_filter,
            limit=k,
            score_threshold=audit_threshold,
        ).points
        log.info(f'rag_search filtrado: {len(pts)} puntos, threshold={audit_threshold}')
        return pts

    # ── Búsqueda dual para STEP 7 (RAG general sin filtro explícito) ──────────

    # Búsqueda 1: solo estándares internacionales, threshold más permisivo
    intl_filter = Filter(
        must=[
            FieldCondition(
                key="norma_familia",
                match=MatchAny(any=list(AUDIT_STANDARDS))
            )
        ],
        must_not=[
            FieldCondition(key="ambito", match=MatchValue(value="venezuela"))
        ]
    )
    intl_results = qdrant.query_points(
        collection_name=COLLECTION,
        query=vector,
        query_filter=intl_filter,
        limit=k * 2,        # pedir más para luego recortar por fuente
        score_threshold=audit_threshold,
    ).points

    # Máximo 2 chunks por fuente de estándares (evita que ISA o IIA dominen los slots)
    source_count: dict = {}
    filtered_intl = []
    for p in intl_results:
        src = p.payload.get("source", "")
        if source_count.get(src, 0) < 2:
            filtered_intl.append(p)
            source_count[src] = source_count.get(src, 0) + 1

    # Búsqueda 2: legislación venezolana — SOLO si la query la menciona explícitamente
    q_lower = query.lower()
    nacional_results = []
    if any(kw in q_lower for kw in NACIONAL_KEYWORDS):
        nacional_filter = Filter(
            must=[
                FieldCondition(key="ambito", match=MatchValue(value="venezuela"))
            ]
        )
        nacional_results = qdrant.query_points(
            collection_name=COLLECTION,
            query=vector,
            query_filter=nacional_filter,
            limit=3,
            score_threshold=score_threshold,
        ).points

    # Combinar y desduplicar por id
    seen_ids = set()
    combined = []
    for p in filtered_intl + nacional_results:
        if p.id not in seen_ids:
            combined.append(p)
            seen_ids.add(p.id)

    # Si la búsqueda dual no devuelve nada, fallback a búsqueda general sin filtro
    if not combined:
        combined = qdrant.query_points(
            collection_name=COLLECTION,
            query=vector,
            limit=k,
            score_threshold=score_threshold,
        ).points

    return combined[:k]


def _format_sources(points: list) -> str:
    sources = list(dict.fromkeys(p.payload.get("source", "desconocido") for p in points))
    return "\n\nFuentes:\n" + "\n".join(f"- {s}" for s in sources)


def _build_rag_prompt(query: str, points: list, conv_context: str = "") -> str:
    """Construye prompt RAG con contexto normativo y referencias a párrafos."""
    chunks = "\n\n---\n\n".join(p.payload.get("text", "") for p in points)

    # Extraer referencias de norma de los metadatos de los chunks
    norma_refs = []
    for p in points:
        nc  = p.payload.get("norma_codigo", "")
        sec = p.payload.get("seccion", "")
        if nc:
            ref = f"{nc}"
            if sec:
                ref += f" — {sec}"
            norma_refs.append(ref)

    norma_section = ""
    if norma_refs:
        norma_section = f"\nReferencias normativas en el contexto: {', '.join(set(norma_refs))}\n"

    conv = f"\n\nContexto conversacional:\n{conv_context}" if conv_context else ""

    return f"""{BASE_RULES}
{norma_section}
Contexto normativo disponible:
{chunks}
{conv}

Pregunta: {query}

Instrucciones de respuesta:
- Cita código y párrafo exacto de la norma inline (ej: ISA 315, párr. 12).
- Máximo 4 párrafos. Sé técnico y preciso.
- Si no encuentras la información en el contexto, di: "No encontré esta información en el corpus disponible."
- NO incluyas un listado de "Fuentes consultadas:" al final de tu respuesta. Las fuentes se muestran automáticamente en la interfaz."""

# ─────────────────────────────────────────────────────────────────────────────
# HELPER — Respuesta JSON y oferta de Gemini
# ─────────────────────────────────────────────────────────────────────────────
def _json_response(text: str) -> JSONResponse:
    return JSONResponse({
        "id":     f"auditia-{uuid.uuid4().hex[:8]}",
        "object": "chat.completion",
        "choices": [{
            "message":       {"role": "assistant", "content": text},
            "finish_reason": "stop",
        }],
    })


def _gap_offer_gemini(query: str) -> str:
    q_preview = query[:100] + "..." if len(query) > 100 else query
    return (
        "No encontré información suficiente en el corpus normativo para responder con precisión.\n\n"
        "Puedo consultar a **Gemini** para obtener una respuesta más amplia sobre este tema. "
        "Si deseas proceder, escribe **autorizar** y repite tu consulta.\n\n"
        f"> *Consulta: {q_preview}*"
    )

# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINTS — Health / Stats
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status":  "ok",
        "service": "AuditIA Gateway",
        "version": "1.0",
        "collection": COLLECTION,
        "port":    PORT,
    }


@app.get("/stats")
async def stats():
    try:
        info = qdrant.get_collection(COLLECTION)
        return {
            "collection":      COLLECTION,
            "vectors":         info.points_count,
            "embedding_model": EMBEDDING_MODEL,
            "embedding_dims":  EMBEDDING_DIMS,
            "score_threshold": score_threshold,
            "top_k":           top_k,
        }
    except Exception as e:
        return {"error": str(e)}

# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT PRINCIPAL — POST /v1/chat/completions
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/v1/chat/completions")
async def chat(request: Request):
    body     = await request.json()
    messages = body.get("messages", [])
    query    = _get_user_text(messages)
    q_lower  = query.lower().strip()

    log.info(f"[AuditIA] Query: {query[:120]}")

    # ── STEP 0: Visión ────────────────────────────────────────────────────────
    images = _extract_images(messages)
    if images:
        log.info("STEP 0: Vision")
        answer = await call_vision_llm(query, images)
        return _json_response(answer)

    # ── STEP 1: Autorización Gemini ───────────────────────────────────────────
    if "autorizar" in q_lower:
        log.info("STEP 1: Gemini auth")
        answer = await call_gemini(query)
        return _json_response(answer)

    # ── STEP 2: Identidad ─────────────────────────────────────────────────────
    if any(kw in q_lower for kw in IDENTITY_KEYWORDS):
        log.info("STEP 2: Identity")
        return _json_response(IDENTITY_RESPONSE)

    # ── STEP 2b: Follow-up de tabla previa ───────────────────────────────────
    table_ctx = _get_table_context(messages)
    if table_ctx:
        log.info(f"STEP 2b: Table follow-up → {table_ctx['source']}")
        rows = _fetch_table_rows(table_ctx["source"])
        current_words = [w for w in q_lower.split() if w not in TABLE_STOPWORDS and len(w) > 2]
        query_words   = current_words or table_ctx.get("prev_query_words", [])

        # Export
        if any(kw in q_lower for kw in ["export", "exporta", "descarga", "excel", "xlsx"]):
            xlsx_bytes = _export_xlsx(rows, table_ctx["source"])
            filename   = table_ctx["titulo"].replace(" ", "_") + ".xlsx"
            return StreamingResponse(
                io.BytesIO(xlsx_bytes),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f"attachment; filename={filename}"},
            )

        filtered = _filter_rows(query_words, rows) if query_words else rows

        if any(kw in q_lower for kw in ["cuántos", "cuantos", "total", "count", "número", "numero"]):
            return _json_response(
                f"Total: **{len(filtered)}** registros\n\nFuentes:\n- {table_ctx['source']}"
            )
        return _json_response(_rows_to_markdown(filtered, table_ctx["titulo"]))

    # ── STEP 2c: Productos de auditoría específicos ─────────────────────────
    # ── Matrices de riesgo y controles con ejemplos ──────────────────────────
    if _is_matriz_request(query):
        log.info("STEP 2c: Matriz de riesgos")
        ciclo_detectado = _detect_ciclo(query)
        ejemplo_ctx = await _get_ejemplo_context(query, ciclo_detectado)

        matriz_system = (
            "Eres el AII. Genera matrices de riesgos y controles profesionales "
            "para auditoría interna usando nomenclatura estándar "
            "(Riesgo 1-6, Control A-I). Formato tabla markdown con columnas: "
            "ID | Proceso/Actividad | Riesgo | Tipo | Probabilidad | Impacto | "
            "Control | Tipo Control | Responsable. "
            "Usa riesgos y controles genéricos, no datos reales de clientes. "
            "Sé exhaustivo pero conciso."
        )

        if ejemplo_ctx:
            prompt = f"{ejemplo_ctx}\n\nSolicitud del usuario: {query}"
        else:
            prompt = query

        answer = await call_local_llm(prompt, system_prompt=matriz_system,
                                       max_tokens_override=2000, temperature=0.3)
        return _json_response(answer)

    if _is_hallazgo_request(query):
        log.info("STEP 2c: Hallazgo de auditoría")
        answer = await call_local_llm(query, system_prompt=HALLAZGO_SYSTEM, max_tokens_override=1500, temperature=0.3)
        return _json_response(answer)

    if _is_resumen_ejecutivo_request(query):
        log.info("STEP 2c: Resumen ejecutivo")
        answer = await call_local_llm(query, system_prompt=RESUMEN_SYSTEM, max_tokens_override=800, temperature=0.3)
        return _json_response(answer)

    if _is_minuta_request(query):
        log.info("STEP 2c: Minuta de seguimiento")
        answer = await call_local_llm(query, system_prompt=MINUTA_SYSTEM, max_tokens_override=1500, temperature=0.3)
        return _json_response(answer)

    if _is_cuestionario_request(query):
        log.info("STEP 2c: Cuestionario de entendimiento")
        answer = await call_local_llm(query, system_prompt=CUESTIONARIO_SYSTEM, max_tokens_override=2000, temperature=0.3)
        return _json_response(answer)

    # ── STEP 3: Consulta normativa específica ────────────────────────────────
    norma_meta = _detect_norma(query)
    if norma_meta:
        log.info(f"STEP 3: Norma → {norma_meta}")
        requerimiento = _detect_requerimiento_intent(query)
        norma_filter  = _build_norma_filter(norma_meta, requerimiento_only=requerimiento)
        points        = await rag_search(query, norma_filter=norma_filter)

        # Fallback sin filtro de norma si no hay resultados filtrados
        if not points:
            log.info("STEP 3: Fallback sin filtro de norma")
            # Si la norma detectada es internacional, excluir legislación venezolana
            if norma_meta.get("organismo") not in ("SENIAT", "MPPPST", "CGR", "SUDEBAN"):
                fallback_filter = Filter(must_not=[
                    FieldCondition(key="ambito", match=MatchValue(value="venezuela"))
                ])
                points = await rag_search(query, norma_filter=fallback_filter)
            else:
                points = await rag_search(query)

        if points:
            conv_ctx = _build_conversation_context(messages)
            prompt   = _build_rag_prompt(query, points, conv_ctx)
            answer   = await call_local_llm(prompt, temperature=0.3)
            if not is_knowledge_gap(answer):
                return _json_response(answer + _format_sources(points))

        return _json_response(_gap_offer_gemini(query))

    # ── STEP 4: Consulta por ciclo de auditoría ──────────────────────────────
    ciclo = _detect_ciclo(query)
    if ciclo:
        log.info(f"STEP 4: Ciclo → {ciclo}")
        ciclo_filter = _build_ciclo_filter(ciclo)
        points       = await rag_search(query, ciclo_filter=ciclo_filter)

        # Fallback sin filtro de ciclo
        if not points:
            log.info("STEP 4: Fallback sin filtro de ciclo")
            points = await rag_search(query)

        if points:
            conv_ctx = _build_conversation_context(messages)
            prompt   = _build_rag_prompt(query, points, conv_ctx)
            answer   = await call_local_llm(prompt, temperature=0.3)
            if not is_knowledge_gap(answer):
                return _json_response(answer + _format_sources(points))

    # ── STEP 5: Tabla estructurada ────────────────────────────────────────────
    tabla_key = _detect_table_intent(query)
    if tabla_key:
        log.info(f"STEP 5: Tabla → {tabla_key}")
        cfg  = TABLA_MAP[tabla_key]
        rows = _fetch_table_rows(cfg["source"])

        if any(kw in q_lower for kw in ["export", "exporta", "descarga", "excel", "xlsx"]):
            xlsx_bytes = _export_xlsx(rows, cfg["source"])
            filename   = cfg["titulo"].replace(" ", "_") + ".xlsx"
            return StreamingResponse(
                io.BytesIO(xlsx_bytes),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f"attachment; filename={filename}"},
            )

        query_words = [w for w in q_lower.split() if w not in TABLE_STOPWORDS and len(w) > 2]
        filtered    = _filter_rows(query_words, rows) if query_words else rows

        if any(kw in q_lower for kw in ["cuántos", "cuantos", "total", "count"]):
            return _json_response(
                f"Total: **{len(filtered)}** registros\n\nFuentes:\n- {cfg['source']}"
            )
        return _json_response(_rows_to_markdown(filtered, cfg["titulo"]))

    # ── STEP 6: Tarea generativa de auditoría ────────────────────────────────
    if _detect_generative_intent(query):
        log.info("STEP 6: Generative audit task")
        # Buscar contexto normativo relevante como base para la redacción
        points = await rag_search(query, k=3)
        if points:
            conv_ctx = _build_conversation_context(messages)
            prompt   = _build_rag_prompt(query, points, conv_ctx)
            prompt  += "\n\nIMPORTANTE: Genera el documento solicitado basándote en el contexto normativo anterior."
        else:
            prompt = f"{BASE_RULES}\n\nTarea de auditoría: {query}"
        answer = await call_local_llm(prompt, temperature=0.6, max_tokens_override=4096)
        sources = _format_sources(points) if points else ""
        return _json_response(answer + sources)

    # ── STEP 7: RAG general ───────────────────────────────────────────────────
    log.info("STEP 7: RAG general")
    # Query augmentation para queries cortas (<8 palabras)
    aug_query = query
    if len(query.split()) < 8:
        prev_msgs = [m for m in messages if m.get("role") == "user"]
        if len(prev_msgs) >= 2:
            prev = prev_msgs[-2].get("content", "")
            if isinstance(prev, str):
                prev_words = [w for w in prev.split() if w.lower() not in _QUERY_STOPWORDS]
                aug_query  = query + " " + " ".join(prev_words[:5])

    points = await rag_search(aug_query)
    if points:
        conv_ctx = _build_conversation_context(messages)
        prompt   = _build_rag_prompt(query, points, conv_ctx)
        answer   = await call_local_llm(prompt, temperature=0.3)
        if not is_knowledge_gap(answer):
            return _json_response(answer + _format_sources(points))

    # ── STEP 8: Conocimiento general del LLM ─────────────────────────────────
    log.info("STEP 8: General LLM knowledge")
    answer = await call_local_llm_general_knowledge(query)
    if not is_knowledge_gap(answer):
        return _json_response(
            "⚠️ *Respuesta basada en conocimiento general del modelo, no en el corpus indexado.*\n\n"
            + answer
        )

    # ── STEP 9: Brecha — ofrecer Gemini ──────────────────────────────────────
    log.info("STEP 9: Knowledge gap → offer Gemini")
    return _json_response(_gap_offer_gemini(query))

# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT SSE — POST /v1/chat/completions/stream
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/v1/chat/completions/stream")
async def chat_stream(request: Request):
    body     = await request.json()
    messages = body.get("messages", [])
    query    = _get_user_text(messages)
    q_lower  = query.lower().strip()

    log.info(f"[AuditIA][SSE] Query: {query[:120]}")

    async def generate():

        # STEP 0: Visión
        images = _extract_images(messages)
        if images:
            answer = await call_vision_llm(query, images)
            async for chunk in _sse_single(answer):
                yield chunk
            return

        # STEP 1: Gemini
        if "autorizar" in q_lower:
            answer = await call_gemini(query)
            async for chunk in _sse_single(answer):
                yield chunk
            return

        # STEP 2: Identidad
        if any(kw in q_lower for kw in IDENTITY_KEYWORDS):
            async for chunk in _sse_single(IDENTITY_RESPONSE):
                yield chunk
            return

        # STEP 2b: Follow-up tabla
        table_ctx = _get_table_context(messages)
        if table_ctx:
            rows = _fetch_table_rows(table_ctx["source"])
            current_words = [w for w in q_lower.split() if w not in TABLE_STOPWORDS and len(w) > 2]
            query_words   = current_words or table_ctx.get("prev_query_words", [])
            filtered = _filter_rows(query_words, rows) if query_words else rows
            if any(kw in q_lower for kw in ["cuántos", "cuantos", "total", "count"]):
                text = f"Total: **{len(filtered)}** registros\n\nFuentes:\n- {table_ctx['source']}"
            else:
                text = _rows_to_markdown(filtered, table_ctx["titulo"])
            async for chunk in _sse_single(text):
                yield chunk
            return

        # STEP 2c: Productos de auditoría específicos
        # Matrices de riesgo y controles con ejemplos
        if _is_matriz_request(query):
            log.info("STEP 2c: Matriz de riesgos (SSE)")
            ciclo_detectado = _detect_ciclo(query)
            ejemplo_ctx = await _get_ejemplo_context(query, ciclo_detectado)

            matriz_system = (
                "Eres el AII. Genera matrices de riesgos y controles profesionales "
                "para auditoría interna usando nomenclatura estándar "
                "(Riesgo 1-6, Control A-I). Formato tabla markdown con columnas: "
                "ID | Proceso/Actividad | Riesgo | Tipo | Probabilidad | Impacto | "
                "Control | Tipo Control | Responsable. "
                "Usa riesgos y controles genéricos, no datos reales de clientes. "
                "Sé exhaustivo pero conciso."
            )

            if ejemplo_ctx:
                prompt = f"{ejemplo_ctx}\n\nSolicitud del usuario: {query}"
            else:
                prompt = query

            async for token in _stream_llm(prompt, matriz_system,
                                            temperature=0.3, max_tokens=2000):
                yield _sse_chunk(token)
            yield _sse_done()
            return

        if _is_hallazgo_request(query):
            log.info("STEP 2c: Hallazgo de auditoría (SSE)")
            async for token in _stream_llm(query, HALLAZGO_SYSTEM, temperature=0.3, max_tokens=1500):
                yield _sse_chunk(token)
            yield _sse_done()
            return

        if _is_resumen_ejecutivo_request(query):
            log.info("STEP 2c: Resumen ejecutivo (SSE)")
            async for token in _stream_llm(query, RESUMEN_SYSTEM, temperature=0.3, max_tokens=800):
                yield _sse_chunk(token)
            yield _sse_done()
            return

        if _is_minuta_request(query):
            log.info("STEP 2c: Minuta de seguimiento (SSE)")
            async for token in _stream_llm(query, MINUTA_SYSTEM, temperature=0.3, max_tokens=1500):
                yield _sse_chunk(token)
            yield _sse_done()
            return

        if _is_cuestionario_request(query):
            log.info("STEP 2c: Cuestionario de entendimiento (SSE)")
            async for token in _stream_llm(query, CUESTIONARIO_SYSTEM, temperature=0.3, max_tokens=2000):
                yield _sse_chunk(token)
            yield _sse_done()
            return

        # STEP 3: Norma
        norma_meta = _detect_norma(query)
        if norma_meta:
            requerimiento = _detect_requerimiento_intent(query)
            norma_filter  = _build_norma_filter(norma_meta, requerimiento_only=requerimiento)
            points        = await rag_search(query, norma_filter=norma_filter)
            if not points:
                # Si la norma detectada es internacional, excluir legislación venezolana
                if norma_meta.get("organismo") not in ("SENIAT", "MPPPST", "CGR", "SUDEBAN"):
                    fallback_filter = Filter(must_not=[
                        FieldCondition(key="ambito", match=MatchValue(value="venezuela"))
                    ])
                    points = await rag_search(query, norma_filter=fallback_filter)
                else:
                    points = await rag_search(query)
            if points:
                conv_ctx = _build_conversation_context(messages)
                prompt   = _build_rag_prompt(query, points, conv_ctx)
                full = ""
                async for token in _stream_llm(prompt):
                    full += token
                    yield _sse_chunk(token)
                if not is_knowledge_gap(full):
                    yield _sse_chunk(_format_sources(points))
                    yield _sse_done()
                    return
            yield _sse_chunk(_gap_offer_gemini(query))
            yield _sse_done()
            return

        # STEP 4: Ciclo
        ciclo = _detect_ciclo(query)
        if ciclo:
            ciclo_filter = _build_ciclo_filter(ciclo)
            points       = await rag_search(query, ciclo_filter=ciclo_filter)
            if not points:
                points = await rag_search(query)
            if points:
                conv_ctx = _build_conversation_context(messages)
                prompt   = _build_rag_prompt(query, points, conv_ctx)
                full = ""
                async for token in _stream_llm(prompt):
                    full += token
                    yield _sse_chunk(token)
                if not is_knowledge_gap(full):
                    yield _sse_chunk(_format_sources(points))
                    yield _sse_done()
                    return

        # STEP 5: Tabla
        tabla_key = _detect_table_intent(query)
        if tabla_key:
            cfg  = TABLA_MAP[tabla_key]
            rows = _fetch_table_rows(cfg["source"])
            query_words = [w for w in q_lower.split() if w not in TABLE_STOPWORDS and len(w) > 2]
            filtered    = _filter_rows(query_words, rows) if query_words else rows
            if any(kw in q_lower for kw in ["cuántos", "cuantos", "total"]):
                text = f"Total: **{len(filtered)}** registros\n\nFuentes:\n- {cfg['source']}"
            else:
                text = _rows_to_markdown(filtered, cfg["titulo"])
            async for chunk in _sse_single(text):
                yield chunk
            return

        # STEP 6: Generativo
        if _detect_generative_intent(query):
            points = await rag_search(query, k=3)
            if points:
                conv_ctx = _build_conversation_context(messages)
                prompt   = _build_rag_prompt(query, points, conv_ctx)
                prompt  += "\n\nIMPORTANTE: Genera el documento solicitado basándote en el contexto normativo anterior."
            else:
                prompt = f"{BASE_RULES}\n\nTarea de auditoría: {query}"
            full = ""
            async for token in _stream_llm(prompt, temperature=0.6, max_tokens=4096):
                full += token
                yield _sse_chunk(token)
            if points:
                yield _sse_chunk(_format_sources(points))
            yield _sse_done()
            return

        # STEP 7: RAG general
        aug_query = query
        if len(query.split()) < 8:
            prev_msgs = [m for m in messages if m.get("role") == "user"]
            if len(prev_msgs) >= 2:
                prev = prev_msgs[-2].get("content", "")
                if isinstance(prev, str):
                    prev_words = [w for w in prev.split() if w.lower() not in _QUERY_STOPWORDS]
                    aug_query  = query + " " + " ".join(prev_words[:5])

        points = await rag_search(aug_query)
        if points:
            conv_ctx = _build_conversation_context(messages)
            prompt   = _build_rag_prompt(query, points, conv_ctx)
            full = ""
            async for token in _stream_llm(prompt):
                full += token
                yield _sse_chunk(token)
            if not is_knowledge_gap(full):
                yield _sse_chunk(_format_sources(points))
                yield _sse_done()
                return

        # STEP 8: Conocimiento general
        prefix = "⚠️ *Respuesta basada en conocimiento general del modelo, no en el corpus indexado.*\n\n"
        yield _sse_chunk(prefix)
        full = ""
        async for token in _stream_llm_general(query):
            full += token
            yield _sse_chunk(token)

        if is_knowledge_gap(full):
            yield _sse_chunk(_gap_offer_gemini(query))

        yield _sse_done()

    return StreamingResponse(generate(), media_type="text/event-stream")

# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
