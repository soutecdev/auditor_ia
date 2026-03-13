# Contexto del Proyecto SonIA — Estado v5.4 (Smart Table Handler)

Generado: 2026-03-05

---

## 1. Infraestructura y Hardware

| Campo | Valor |
|---|---|
| Dispositivo | NVIDIA Jetson AGX Orin 64GB (LPDDR5) |
| OS | Ubuntu con JetPack 6.1 |
| IP | 10.245.100.102 |
| Usuario | soutec-jet02 |
| NVMe | 1.7TB montado en /data |
| eMMC | 57GB (~46% usado) |

---

## 2. Estructura de Archivos

```
/data/AI_Projects/SonIA/
\u251c\u2500\u2500 app/
\u2502   \u2514\u2500\u2500 main.py                      \u2192 FastAPI RAG Gateway (puerto 8090)
\u251c\u2500\u2500 corpus/                          \u2192 Documentos corporativos indexados
\u251c\u2500\u2500 models/
\u2502   \u2514\u2500\u2500 nomic/                       \u2192 nomic-ai/nomic-embed-text-v1.5 (ACTIVO, 768 dims)
\u251c\u2500\u2500 qdrant/                          \u2192 Vector Database persistente
\u251c\u2500\u2500 qdrant_backup/                   \u2192 Backup pre-migraci\u00f3n (786 puntos MiniLM originales)
\u251c\u2500\u2500 scripts/
\u2502   \u251c\u2500\u2500 ingest.py                    \u2192 Pipeline ingesta corpus local (texto, nomic 768d)
\u2502   \u251c\u2500\u2500 ingest_vision.py             \u2192 Pipeline ingesta visual (im\u00e1genes + PDFs escaneados)
\u2502   \u251c\u2500\u2500 migrate_embeddings.py        \u2192 Script migraci\u00f3n MiniLM \u2192 nomic
\u2502   \u251c\u2500\u2500 corpus_watcher.py            \u2192 Watcher autom\u00e1tico del corpus
\u2502   \u2514\u2500\u2500 ingest_web.py                \u2192 Ingesta de p\u00e1ginas web al corpus
\u251c\u2500\u2500 gdrive_sync/
\u2502   \u251c\u2500\u2500 main.py                      \u2192 Punto de entrada (scheduler + CLI)
\u2502   \u251c\u2500\u2500 config.py                    \u2192 Configuraci\u00f3n central (nomic 768d, IMAGE_MIME_TYPES)
\u2502   \u251c\u2500\u2500 auth.py                      \u2192 Autenticaci\u00f3n Google Service Account
\u2502   \u251c\u2500\u2500 drive_client.py              \u2192 Google Drive API + Changes API + protecci\u00f3n modelo
\u2502   \u251c\u2500\u2500 file_processor.py            \u2192 Extracci\u00f3n texto + visi\u00f3n para im\u00e1genes
\u2502   \u251c\u2500\u2500 vectorizer.py                \u2192 Chunking sem\u00e1ntico + embeddings nomic
\u2502   \u251c\u2500\u2500 sync_engine.py               \u2192 Motor sincronizaci\u00f3n incremental con Qdrant
\u2502   \u251c\u2500\u2500 credentials/
\u2502   \u2502   \u2514\u2500\u2500 service_account.json    \u2192 Google Service Account
\u2502   \u251c\u2500\u2500 state/                       \u2192 drive_state.json (pageToken + embedding_model)
\u2502   \u2514\u2500\u2500 logs/                        \u2192 gdrive_sync.log
\u251c\u2500\u2500 web-ui/                          \u2192 SonIA Web UI (puerto 80, docker-compose)
\u251c\u2500\u2500 notes/                           \u2192 Notas de auditor\u00eda y cambios
\u251c\u2500\u2500 venv/                            \u2192 Entorno Python
\u2514\u2500\u2500 open-webui/                      \u2192 Datos de Open WebUI (contenedor detenido)

/data/AI_Projects/PersonaPlex/       \u2192 Otro proyecto, NO TOCAR
/data/docker/                        \u2192 Docker root (en NVMe)
/data/containerd/                    \u2192 Containerd root (en NVMe)
```

---

## 3. Stack Tecnol\u00f3gico

| Componente | Tecnolog\u00eda | Detalle |
|---|---|---|
| LLM | Qwen 3.5 9B | Ollama 0.17.5, modelo `sonia-qwen:9b` |
| Visi\u00f3n | Qwen 3.5 9B (nativa) | Mismo modelo, capacidad multimodal incluida |
| **Embeddings** | **nomic-ai/nomic-embed-text-v1.5** | **768 dims, CPU, trust_remote_code=True, requiere einops** |
| Vector DB | Qdrant 1.16.3 | Colecci\u00f3n "corporativo", **768 dims**, COSINE |
| Gateway | FastAPI + uvicorn | Puerto 8090, SSE streaming |
| **Web UI** | **SonIA Web UI** | **Puerto 80** (Open WebUI detenido, disponible para rollback) |
| Frontera | Gemini gemini-3-pro-preview | API key activa |
| Drive Sync | Google Drive API v3 | Service Account + Changes API incremental |
| PII | Presidio (ES/EN) | Sanitizaci\u00f3n antes de consultar Gemini |

**Migraci\u00f3n de embeddings (2026-03-04)**:
- Anterior: paraphrase-multilingual-MiniLM-L12-v2 (384 dims, 128 token limit)
- Actual: nomic-ai/nomic-embed-text-v1.5 (768 dims, 2048 token limit)
- Colecci\u00f3n recreada con 768 dims. Backup en `qdrant_backup/`

---

## 4. Servicios y Puertos

| Puerto | Servicio | Tipo | Estado |
|---|---|---|---|
| :6333 | Qdrant | Docker (restart always) | Activo |
| :11434 | Ollama Server | Systemd | Activo |
| :8090 | SonIA RAG Gateway | Systemd: rag-gateway.service | Activo |
| :80 | SonIA Web UI | Docker (network_mode: host) | Activo |

Servicios systemd: `rag-gateway.service`, `corpus-watcher.service`, `gdrive-sync.service`

**Open WebUI**: contenedor `open-webui` detenido (no eliminado). Rollback: `docker start open-webui`

---

## 5. Modelo Ollama \u2014 sonia-qwen:9b

### Capabilities detectadas por Ollama
```
completion, vision, tools, thinking
```

### Modelfile
```
FROM qwen3.5:9b
SYSTEM """Eres SONIA, el asistente inteligente oficial de Soutec..."""
PARAMETER temperature 0.7
PARAMETER num_ctx 4096
PARAMETER num_predict 512
```

### Notas cr\u00edticas del modelo
- **Thinking mode activo por defecto**: genera bloques `<think>...</think>` antes de responder
- **Soluci\u00f3n**: usar API nativa Ollama `/api/chat` con `"think": false` \u2014 NO usar `/v1/chat/completions` para desactivar thinking (no lo respeta)
- **Visi\u00f3n**: requiere im\u00e1genes de m\u00ednimo 32x32px. JPEG y PNG soportados
- **Tiempo cold start**: ~17s primera llamada. Siguientes: 3-6s texto, 4-8s visi\u00f3n sin thinking

---

## 6. Flujo de L\u00f3gica del Gateway \u2014 main.py

```
Mensaje recibido en POST /v1/chat/completions (o /stream para SSE)
  \u2502
  \u251c\u2500\u2500 0. \u00bfContiene imagen(es)? (content array con image_url)
  \u2502       \u2514\u2500\u2500 call_vision_llm() \u2192 /api/chat Ollama con think:false \u2192 Responder
  \u2502
  \u251c\u2500\u2500 1. \u00bfAutorizaci\u00f3n Gemini? (usuario escribi\u00f3 "autorizar")
  \u2502       \u2514\u2500\u2500 Sanitizar con Presidio \u2192 Llamar Gemini \u2192 Responder
  \u2502
  \u251c\u2500\u2500 2. \u00bfPregunta de identidad? (IDENTITY_KEYWORDS)
  \u2502       \u2514\u2500\u2500 LLM local directo (sin RAG)
  \u2502
  ├── 2c. ¿Follow-up de tabla anterior? (_get_table_context)
  │       ├── Detecta contexto previo: "Fuentes: X.xlsx" en historial
  │       ├── Carry-forward de filtros previos (prev_query_words)
  │       ├── Status + column-aware filtering
  │       └── Soporta: contar, filtrar, exportar XLSX, listar — sin LLM
  │
  ├── 3. ¿Consulta tabular inteligente? (TABLA_MAP + intents + implicit_filter + status)
  │       ├── Entry: has_list/filter/export/count/status_intent OR has_implicit_filter
  │       ├── EXPORTAR: filtros + status → XLSX con smart filename (Account Name)
  │       ├── CONTAR: filtros + status → "Total: **N** registros"
  │       ├── LISTAR FILTRADO: cascade (phrase → AND → OR) + column + status
  │       ├── LISTAR TODO: scroll Qdrant por source → tabla markdown
  │       └── Todo sin LLM — respuesta directa desde Qdrant
  \u2502
  \u251c\u2500\u2500 4. \u00bfContiene n\u00famero(s) TCK-XXXX? (re.findall)
  \u2502       \u2514\u2500\u2500 B\u00fasqueda exacta MatchText en Qdrant por cada TCK \u2192 LLM \u2192 Responder
  \u2502
  \u251c\u2500\u2500 5. \u00bfTarea generativa? (GENERATIVE_KEYWORDS)
  \u2502       \u2514\u2500\u2500 LLM local directo sin l\u00edmite de tokens (max_tokens_override=4096)
  \u2502
  \u251c\u2500\u2500 6. \u00bfPregunta sobre persona/tema? (PERSON_PATTERNS)
  ├── RAG-first: busca en docs corporativos primero
  └── Sin resultados RAG → call_local_llm_general_knowledge()
  \u2502
  \u251c\u2500\u2500 7. B\u00fasqueda vectorial RAG (score \u2265 0.50, top_k=5)
  \u2502       \u251c\u2500\u2500 Contexto conversacional (3 pares previos) incluido en prompt
  \u2502       \u251c\u2500\u2500 Query augmentation: si query < 8 palabras, concatena con \u00faltimo mensaje usuario
  \u2502       \u251c\u2500\u2500 Contexto encontrado + respuesta v\u00e1lida \u2192 Responder con fuentes
  \u2502       \u2514\u2500\u2500 is_knowledge_gap() \u2192 contin\u00faa
  \u2502
  \u251c\u2500\u2500 8. Conocimiento general del LLM (temperature 0.5, warning prefix)
  \u2502       \u251c\u2500\u2500 Sin LOW_CONFIDENCE y sin is_knowledge_gap() \u2192 Responder con prefijo "\u26a0\ufe0f"
  \u2502       \u2514\u2500\u2500 LOW_CONFIDENCE o gap detectado \u2192 BRECHA DE CONOCIMIENTO
  \u2502
  \u2514\u2500\u2500 9. BRECHA DE CONOCIMIENTO \u2192 Ofrecer consulta a Gemini
```

---

## 7. Par\u00e1metros Clave del Gateway (post-auditor\u00eda RAG 2026-03-04)

```python
COLLECTION         = "corporativo"
LLM_URL            = "http://localhost:11434/api/chat"      # API nativa Ollama
LLM_MODEL          = "sonia-qwen:9b"
EMBEDDING_MODEL    = "nomic-ai/nomic-embed-text-v1.5"       # 768 dims
EMBEDDING_DIMS     = 768
score_threshold    = 0.50       # Subido de 0.35 (filtra chunks irrelevantes)
top_k              = 5          # Subido de 3 (m\u00e1s contexto para el LLM)
MAX_SEQ_LEN        = 4096
DEFAULT_MAX_TOKENS = 512        # Para RAG y conocimiento general
# Temperature: 0.3 para RAG (factual), 0.5 para conocimiento general
# Tareas generativas usan max_tokens_override=4096
```

### Mejoras anti-alucinaci\u00f3n (auditor\u00eda RAG)
```python
BASE_RULES = """REGLAS GENERALES:
1. Eres SonIA, asistente corporativa de Soutec.
2. NUNCA inventes datos espec\u00edficos de la empresa (nombres, cifras, pol\u00edticas).
3. Si no est\u00e1s seguro, indica claramente que la informaci\u00f3n necesita verificaci\u00f3n.
4. Responde en el mismo idioma en que te preguntan.
5. S\u00e9 concisa, clara y profesional."""

# is_knowledge_gap(): detecci\u00f3n robusta con 8 patrones en espa\u00f1ol
# _QUERY_STOPWORDS: ~70 palabras comunes ES/EN filtradas de query expansion
# _build_conversation_context(): extrae \u00faltimos 3 intercambios para follow-ups
# Retrieval query augmentation: queries cortas (<8 palabras) se enriquecen con contexto
# Prompt RAG: instrucciones de formato (m\u00e1x 3 p\u00e1rrafos, citar fuentes)
# Warning prefix "\u26a0\ufe0f" en respuestas de conocimiento general
# Fuentes en formato bullet list: "
Fuentes:
- archivo1.pdf
- archivo2.pdf"
```

### Llamadas al LLM
```python
# Texto normal (acepta system_prompt parameter)
async def call_local_llm(prompt, system_prompt=SYSTEM_PROMPT, max_tokens_override=0):

# Conocimiento general
async def call_local_llm_general_knowledge(query):

# Visi\u00f3n (im\u00e1genes)
async def call_vision_llm(text_prompt, images_b64):

# SSE Streaming (nuevo 2026-03-05)
async def _stream_llm(prompt, system_prompt, temperature, max_tokens):
    # Usa httpx.AsyncClient.stream() con Ollama stream:true
    # Yields content strings token-by-token

async def _stream_llm_general(query):
    # Streaming para conocimiento general (temperature 0.5)

def _sse_chunk(content_text):  # -> "data: {delta JSON}\n\n"
def _sse_done():               # -> "data: [DONE]\n\n"
async def _sse_single(text):   # Single chunk + DONE (pasos sin streaming)
```

---

## 7b. Smart Table Handler — Consultas Tabulares sin LLM (2026-03-05)

El gateway maneja consultas sobre tablas estructuradas (tickets, plan de estudios, etc.)
directamente desde Qdrant, sin pasar por el LLM. Esto es instantáneo y exacto.

### TABLA_MAP
```python
TABLA_MAP = {
    "tickets": {
        "source": "Tabla_Base_Tickets.xlsx",
        "titulo": "Tabla Base de Tickets",
        "keywords": ["ticket", "tickets", "casos", "caso", "incidencias", "tabla de tickets"],
    },
    "plan_estudios": {
        "source": "Plan de Estudios IBM.xlsx",
        "titulo": "Plan de Estudios IBM",
        "keywords": ["plan de estudios", "materias", "cursos ibm", "pensum"],
    },
    # ... extensible con más tablas
}
```

### Operaciones soportadas
| Operación | Ejemplo de query | Respuesta |
|---|---|---|
| **Listar todo** | "muéstrame todos los tickets" | Tabla markdown completa (hasta 50 filas + total) |
| **Filtrar por entidad** | "tickets de soutec" | Solo filas donde Account Name contiene "soutec" |
| **Filtrar por status** | "tickets en estado on hold" | Solo filas con Status ON HOLD |
| **Filtrar combinado** | "tickets de soutec no resueltos" | Entity + Status combinados |
| **Contar** | "cuántos tickets tiene LETI?" | "Total: **601** registros" |
| **Contar + filtro** | "cuántos tickets no resueltos tiene soutec?" | "Total: **52** registros" |
| **Exportar** | "expórtalo a excel" | XLSX descargable con smart filename |
| **Follow-up** | "ahora los de coca-cola femsa" | Reutiliza contexto de tabla anterior |

### Filtrado column-aware
```python
COLUMN_KEYWORDS = {
    "account name": ["de ", "del cliente ", "cuenta ", ...],
    "status":       ["estado ", "en estado ", "con estado ", ...],
    "priority":     ["prioridad ", "con prioridad ", ...],
}

# _detect_filter_column(query, col_header):
#   "tickets de soutec"       → target_column = "account name"
#   "tickets en estado on hold" → target_column = "status"
#   "tickets prioridad alta"  → target_column = "priority"
```

Esto evita falsos positivos: "tickets de soutec" ya no coincide con
"ON HOLD BY SOUTEC" en la columna Status.

### Filtrado status-aware con negación
```python
STATUS_GROUPS = {
    "resolved":    {"DONE", "SOLVED", "Closed", "RFC DONE"},
    "on_hold":     {"ON HOLD BY CLIENT", "ON HOLD BY SOUTEC", "ON HOLD BY VENDOR"},
    "in_progress": {"IN PROGRESS"},
}

STATUS_CONCEPTS = {
    "resueltos":    ("resolved", False),   # default_negate=False
    "abiertos":     ("resolved", True),    # default_negate=True → "no resueltos"
    "cerrados":     ("resolved", False),
    "on hold":      ("on_hold",  False),
    "en progreso":  ("in_progress", False),
    "pendientes":   ("resolved", True),
    "activos":      ("resolved", True),
    # ... más sinónimos
}
```

**Lógica de negación (XOR):**
- "tickets resueltos" → default_negate=False, has_negation=False → negate=False → Status IN resolved
- "tickets no resueltos" → default_negate=False, has_negation=True → negate=True → Status NOT IN resolved
- "tickets abiertos" → default_negate=True, has_negation=False → negate=True → Status NOT IN resolved
- "tickets no abiertos" → default_negate=True, has_negation=True → negate=False → Status IN resolved

### Cascade de filtrado (3 estrategias)
```
_filter_rows(query_words, rows, col_header, target_column):
  1. Frase exacta: "coca-cola femsa" como substring en la columna target
  2. AND: todas las palabras presentes en la fila/columna
  3. OR: cualquier palabra presente (fallback)
  Prioridad: phrase > AND > OR (usa el primero que devuelva resultados)
```

### Contexto multi-turn (≤ 8+ pasos verificados)
```python
_get_table_context(messages):
  # Busca "Fuentes: X.xlsx" en últimas 6 mensajes del asistente
  # Extrae: source, titulo, prev_query_words (términos del filtro anterior)
  # Permite: "muéstrame tickets" → "los de soutec" → "cuántos son?" → "expórtalo"
```

**Carry-forward:** Si el mensaje actual no tiene términos de búsqueda (e.g., "cuántos son?"),
se reutilizan los `prev_query_words` del turno anterior.

### Export XLSX con smart filename
```python
_extract_account_name(rows):
  # Si todos los rows tienen la misma Account Name, usa ese nombre
  # "Soutec" → "Soutec.xlsx"
  # Múltiples cuentas → "Tabla_Base_de_Tickets.xlsx"
```

### TABLE_STOPWORDS (~50 palabras)
Palabras filtradas de los términos de búsqueda para evitar falsos positivos:
- Interrogativos: cuáles, cuántos, qué, dónde
- Verbos auxiliares: están, son, tiene, muestra
- Conceptos de status: resueltos, abiertos, cerrados, pendientes (manejados por _detect_status_intent)
- Acciones: dame, dime, creados, exporta
- Artículos: los, las, del, una, todos

### Valores reales de Status en Tabla_Base_Tickets.xlsx
```
2971  DONE                         │  4  TO DO
  52  ON HOLD BY CLIENT            │  4  WAITING FOR CHILD TICKET
  31  SOLVED                       │  3  PENDING IMPLEMENTATION
  28  RAD                          │  1  Closed
  27  RFC DONE                     │  1  PENDING INTERNAL APPROVAL
  21  ON HOLD BY SOUTEC            │  1  Pending Customer
   7  IN PROGRESS                  │
   6  ON HOLD BY VENDOR            │  Total: 3157
```


## 8. Ingesta de Corpus

### Pipeline texto \u2014 ingest.py (actualizado 2026-03-04)
Formatos soportados: `.pdf`, `.docx`, `.pptx`, `.xlsx`, `.csv`, `.txt`, `.md`, `.html`, `.htm`

| Formato | Extracci\u00f3n |
|---|---|
| PDF (con texto) | PyMuPDF (fitz) + metadatos (title, author) |
| DOCX | python-docx + headings con prefijo `##` |
| PPTX | python-pptx (por diapositiva + notas del presentador) |
| XLSX | openpyxl (chunking tabular: 5 filas por chunk con headers) |
| CSV | csv stdlib |
| TXT / MD | read_text() |
| HTML / HTM | BeautifulSoup + lxml (strip scripts/styles/nav/footer) |

**Mejoras aplicadas:**
- **Chunking sem\u00e1ntico por oraciones**: respeta l\u00edmites de oraci\u00f3n en vez de cortar por posici\u00f3n
  - Fallback a `\\n` si no hay separadores de oraci\u00f3n
  - Fallback a chunking por caracteres si es un solo bloque
  - Overlap: 1 oraci\u00f3n de solapamiento entre chunks
- **clean_text()**: elimina headers/footers repetidos, n\u00fameros de p\u00e1gina, whitespace excesivo
- **Metadatos**: title, author extra\u00eddos de PDF (fitz.metadata) y DOCX (core_properties)
- **Flag `--force`**: borra chunks anteriores por source y re-indexa sin verificar checksum
- **Modelo**: nomic-ai/nomic-embed-text-v1.5 (768 dims, normalize_embeddings=True)

### Pipeline visual \u2014 ingest_vision.py
Formatos soportados: `.jpg`, `.jpeg`, `.png`, `.webp`, PDFs escaneados

**Flujo:**
1. Detectar si imagen ya est\u00e1 indexada (checksum MD5)
2. Convertir imagen a base64
3. Llamar Qwen3.5 visi\u00f3n con prompt adaptativo (OCR + descripci\u00f3n sem\u00e1ntica)
4. Vectorizar descripci\u00f3n con nomic \u2192 insertar en Qdrant
5. Throttle: 2s entre im\u00e1genes para no saturar GPU

### Payload en Qdrant
```python
# Texto local (ingest.py)
{
    "text": "...",
    "source": "archivo.pdf",
    "file_type": "pdf",
    "doc_type": ".pdf",
    "page": 0,
    "checksum": "md5hash",
    "indexed_at": "ISO datetime",
    "title": "T\u00edtulo del documento",     # Nuevo: extra\u00eddo de metadatos
    "author": "Autor"                    # Nuevo: extra\u00eddo de metadatos
}

# Google Drive (gdrive_sync)
{
    "text": "...",
    "source": "archivo.pdf",
    "file_id": "google_drive_file_id",
    "filename": "archivo.pdf",
    "file_path": "gdrive://archivo.pdf",
    "last_modified": "ISO datetime",
    "file_type": "pdf",
    "doc_type": "gdrive",               # Diferenciador: "gdrive" vs ".pdf"
    "chunk_index": 0
}

# Imagen / PDF escaneado (ingest_vision.py)
{
    "text": "descripci\u00f3n generada por visi\u00f3n",
    "source": "imagen.png",
    "file_type": "png",
    "doc_type": "imagen",
    "checksum": "md5hash",
    "indexed_at": "ISO datetime",
    "vision_processed": True
}
```

---

## 9. Corpus Watcher \u2014 corpus_watcher.py

Dos timers independientes con debounce de 10s:

| Archivo detectado | Pipeline |
|---|---|
| `.pdf` con texto | \u2192 `ingest.py` |
| `.pdf` escaneado (< 50 chars en 3 p\u00e1ginas) | \u2192 `ingest_vision.py` |
| `.jpg/.jpeg/.png/.webp` | \u2192 `ingest_vision.py` |
| `.docx/.pptx/.xlsx/.csv/.txt/.md/.html` | \u2192 `ingest.py` |

Timeout ingesta texto: 10 min | Timeout ingesta visual: 30 min

---

## 10. Google Drive Sync \u2014 gdrive_sync/

### Formatos soportados (config.py)
```python
SUPPORTED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain", "text/markdown", "text/csv", "application/json",
    "application/vnd.google-apps.document",
    "application/vnd.google-apps.presentation",
    "application/vnd.google-apps.spreadsheet",
    "text/html",
    "image/jpeg", "image/png", "image/webp", "image/gif",
}
```

Las im\u00e1genes de Drive se procesan con `_extract_image_vision()` en `file_processor.py` usando Qwen3.5 visi\u00f3n via Ollama.

### Protecci\u00f3n contra cambio de modelo (FIX 2026-03-04)
- `drive_state.json` ahora almacena `embedding_model` junto con `page_token`
- Si el modelo cambia en config.py, `get_changes()` detecta la discrepancia y fuerza re-sincronizaci\u00f3n completa autom\u00e1ticamente
- Esto evita el problema de vectores hu\u00e9rfanos tras migraci\u00f3n de modelo de embeddings

### Estado actual de Drive
- **23 archivos en Drive**, 19 soportados, 13 con texto extra\u00edble
- **~112 vectores** de Drive en Qdrant (doc_type=gdrive)
- **6 PDFs escaneados** sin texto: propuesta AP, propuesta camaras, propuesta cajas de switch, Propuesta redes, p3, detalle de equipos propuestos (necesitan OCR)
- **Service Account**: `DRIVE_FOLDER_ID=root` (solo ve archivos compartidos con el email de la SA)

---

## 11. SonIA Web UI (puerto 80)

- URL interna: `http://10.245.100.102` (puerto 80)
- Contenedor: `sonia-web-ui` (docker-compose, network_mode: host)
- Conectado al gateway: `GATEWAY_URL=http://localhost:8090`
- **Open WebUI**: contenedor detenido (`docker stop open-webui`), disponible para rollback con `docker start open-webui`
- Soporta env\u00edo de im\u00e1genes desde la UI \u2192 el gateway las detecta y rutea a visi\u00f3n
- **SSE Streaming** (2026-03-05): respuestas word-by-word en tiempo real
  - Gateway: `POST /v1/chat/completions/stream` → SSE con formato OpenAI delta
  - Proxy Express: `POST /:id/messages/stream` → pipe SSE + save en SQLite
  - React: `sendMessageStream()` en api.js + useChat.js con callbacks
  - Cursor parpadeante (CSS `.streaming-cursor`) durante streaming
  - Protocolo: `user_saved` → delta chunks → `[DONE]` → `done` (metadata)
  - Pasos rápidos (visión, tablas, CSV, auth) se envían como single-chunk SSE
  - Pasos LLM (identity, tickets, generativo, persona, RAG, general) streaming real

---

## 12. Dependencias instaladas en el venv

```
fastapi, uvicorn, httpx, pydantic
sentence-transformers
qdrant-client==1.17.0
einops                           # Requerido por nomic-embed-text-v1.5
presidio-analyzer, presidio-anonymizer
watchdog
requests, beautifulsoup4, lxml
google-api-python-client
google-auth, google-auth-httplib2
python-dotenv
PyMuPDF (fitz)
python-docx
python-pptx
openpyxl
schedule
pandas
```

---

## 13. Procedimientos de Operaci\u00f3n

### Ingesta manual completa
```bash
# Texto (con --force para re-indexar todo)
cd /data/AI_Projects/SonIA && source venv/bin/activate
python3 scripts/ingest.py --force

# Visual (im\u00e1genes + PDFs escaneados)
python3 scripts/ingest_vision.py
```

### Sync manual de Google Drive
```bash
cd /data/AI_Projects/SonIA && source venv/bin/activate

# Sincronizaci\u00f3n incremental (solo cambios nuevos)
python3 gdrive_sync/main.py --sync-now

# Reset completo (re-procesa TODOS los archivos)
python3 gdrive_sync/main.py --reset
python3 gdrive_sync/main.py --sync-now
```

### Ver score real de una b\u00fasqueda
```bash
cd /data/AI_Projects/SonIA && source venv/bin/activate
python3 << 'EOF'
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
embedder = SentenceTransformer("nomic-ai/nomic-embed-text-v1.5",
    cache_folder="/data/AI_Projects/SonIA/models/nomic",
    trust_remote_code=True)
client = QdrantClient(url="http://localhost:6333")
query = "TU QUERY AQUI"
vector = embedder.encode(query, normalize_embeddings=True).tolist()
results = client.query_points(collection_name="corporativo", query=vector, limit=5).points
for r in results:
    print("Score: {:.4f} | {} | {}".format(r.score, r.payload.get("source","?"), r.payload.get("text","")[:120]))
EOF
```

### Monitoreo
```bash
# Estado servicios
sudo systemctl status rag-gateway corpus-watcher gdrive-sync

# Logs en tiempo real
sudo journalctl -u rag-gateway -f
sudo journalctl -u gdrive-sync -f

# Health checks
curl http://localhost:6333/health
curl http://localhost:8090/health
curl http://localhost:8090/stats

# Conteo vectores Drive vs Local
python3 -c "
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue
c = QdrantClient('http://localhost:6333')
info = c.get_collection('corporativo')
drive = c.scroll('corporativo', scroll_filter=Filter(must=[FieldCondition(key='doc_type', match=MatchValue(value='gdrive'))]), limit=1000)
print('Total: {} | Drive: {} | Local: {}'.format(info.points_count, len(drive[0]), info.points_count - len(drive[0])))
"

# GPU y memoria
sudo tegrastats
free -h
```

### Probar consultas
```bash
# Texto
curl -s -X POST http://localhost:8090/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "sonia-qwen:9b", "messages": [{"role": "user", "content": "servicios de Soutec"}]}' \
  | python3 -m json.tool

# SSE Streaming
curl -s -N http://localhost:8090/v1/chat/completions/stream \
  -H "Content-Type: application/json" \
  -d '{"model": "sonia-qwen:9b", "messages": [{"role": "user", "content": "Cual es la mision de soutec"}]}'

# Imagen (base64)
curl -s -X POST http://localhost:8090/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d "{\"model\": \"sonia-qwen:9b\", \"messages\": [{\"role\": \"user\", \"content\": [{\"type\": \"text\", \"text\": \"describe esta imagen\"}, {\"type\": \"image_url\", \"image_url\": {\"url\": \"data:image/png;base64,$(base64 -w 0 /ruta/imagen.png)\"}}]}]}" \
  | python3 -m json.tool
```

---

## 14. Notas T\u00e9cnicas Importantes

- **API nativa Ollama**: usar `/api/chat` con `"think": false` \u2014 el endpoint `/v1/chat/completions` NO desactiva el thinking en Ollama 0.17.5
- **Visi\u00f3n Qwen3.5**: im\u00e1genes m\u00ednimo 32x32px. Throttle 2s entre im\u00e1genes durante ingesta
- **nomic scores**: rango 0.40-0.80 para documentos relevantes. Threshold calibrado en 0.50
- **qdrant-client 1.17+**: `search()` fue reemplazado por `query_points()` que retorna objeto con `.points`
- **Thinking en ingesta**: Qwen3.5 genera thinking incluso con `think:false` a veces \u2014 `_strip_thinking()` limpia el output
- **HuggingFace online**: nomic verifica modelo en HF Hub al arrancar. Para modo offline: `TRANSFORMERS_OFFLINE=1`
- **max_tokens din\u00e1mico**: calculado en cada llamada para no superar 4096 tokens
- **MatchText en Qdrant**: funciona con guiones (TCK-XXXX) para b\u00fasqueda full-text exacta
- **Memoria GPU**: qwen3.5:9b ocupa ~20GB (5.6GB pesos + 9.2GB KV cache 262K + 3.5GB compute)
- El corpus local y Drive sync comparten la misma colecci\u00f3n "corporativo" en Qdrant
- **doc_type diferenciador**: local usa extensi\u00f3n (`.pdf`), Drive usa `gdrive`
- **drive_state.json**: incluye `embedding_model` para detectar migraciones autom\u00e1ticamente
- **rag-gateway.service**: puede fallar al reiniciar (import torch race condition). Restart=always reintenta
- **SSE Streaming**: endpoint `/v1/chat/completions/stream` usa `httpx.AsyncClient.stream()` con Ollama `stream:true`
- **SSE formato**: cada chunk es `data: {"choices":[{"delta":{"content":"token"}}]}\n\n`, termina con `data: [DONE]\n\n`
- **Express SSE proxy**: acumula `fullContent` mientras pasa chunks al browser; guarda en SQLite al final
- **Fuentes en streaming**: se envían como último chunk SSE antes de `[DONE]`
- **Knowledge gap en streaming**: se detecta post-stream sobre `fullContent` acumulado
- **Smart Table Handler**: consultas sobre TABLA_MAP se resuelven sin LLM (instantáneo vs 3-8s)
- **Cascade de filtrado**: phrase → AND → OR, con target_column opcional para column-aware matching
- **Status XOR**: `negate = default_negate ^ has_negation` permite que "abiertos" = "no resueltos" automáticamente
- **Multi-turn context**: _get_table_context busca "Fuentes: X.xlsx" en últimas 6 msgs; ≤8+ pasos verificados
- **XLSX export**: pandas DataFrame + openpyxl, filename smart basado en Account Name único

---

## 15. Estado de Problemas

| # | Problema | Estado |
|---|---|---|
| 1 | BGE-M3 lento en CPU (7.1s) | Reemplazado por nomic (0.3s) |
| 2 | score_threshold 0.50 alto para MiniLM | Calibrado: 0.50 para nomic (rango m\u00e1s alto) |
| 3 | Tareas generativas escalaban a Gemini | GENERATIVE_KEYWORDS |
| 4 | LLM confund\u00eda SONIA con tasa financiera | IDENTITY_KEYWORDS ampliadas |
| 5 | max_tokens fijo causaba error 400 | C\u00e1lculo din\u00e1mico |
| 6 | Excel chunkeado mal | Chunking tabular por filas |
| 7 | Tickets no encontrados por score | B\u00fasqueda exacta MatchText |
| 8 | Multi-ticket solo buscaba el primero | re.findall() + loop |
| 9 | TensorRT-LLM \u2192 migraci\u00f3n a Ollama | Ollama 0.17.5 + sonia-qwen:9b |
| 10 | Thinking mode activo (30s, respuesta vac\u00eda) | API nativa + think:false |
| 11 | Open WebUI desconectado de Ollama | SonIA Web UI en puerto 80 |
| 12 | Soporte im\u00e1genes en chat | call_vision_llm() implementado |
| 13 | Ingesta visual de im\u00e1genes y PDFs escaneados | ingest_vision.py |
| 14 | corpus_watcher sin soporte visual | Dos timers independientes texto/visi\u00f3n |
| 15 | gdrive_sync sin soporte im\u00e1genes | IMAGE_MIME_TYPES + _extract_image_vision |
| 16 | Respuestas generativas cortadas | max_tokens_override=4096 |
| 17 | KNOWLEDGE_GAP_DETECTED parafraseado | Prompt m\u00e1s estricto |
| 18 | MiniLM 384d \u2192 nomic 768d | Migraci\u00f3n completada, backup en qdrant_backup/ |
| 19 | Chunking por caracteres cortaba oraciones | Chunking sem\u00e1ntico por oraciones |
| 20 | Headers/footers repetidos en PDFs | clean_text() los elimina |
| 21 | Sin metadatos en vectores | title, author extra\u00eddos de PDF/DOCX |
| 22 | Alucinaciones: LLM inventaba datos | BASE_RULES + is_knowledge_gap() + temperature 0.3 |
| 23 | Follow-ups sin contexto | _build_conversation_context() + query augmentation |
| 24 | Drive vectors perdidos tras migraci\u00f3n | Reset pageToken + re-sync + protecci\u00f3n modelo |
| 25 | Respuestas generales sin advertencia | Prefijo "\u26a0\ufe0f" en conocimiento general |
| 26 | is_knowledge_gap() no detecta typos LLM (KNOLEDGE) | Detectores universales `_gap_` + `gap_detected` |
| 27 | Step 6 personas bypass RAG | RAG-first antes de conocimiento general |
| 28 | Step 8 mostraba gap text con prefijo | is_knowledge_gap() check agregado |
| 29 | Step 9 mostraba texto raw de gap | Limpieza partial con is_knowledge_gap() |
| 30 | Query expansion trataba stopwords como acronimos | _QUERY_STOPWORDS (~70 palabras ES/EN) |
| 31 | HTML de Drive no se indexaba | `text/html` agregado a SUPPORTED_MIME_TYPES |
| 32 | Fuentes en formato comma-separated | Formato bullet list con separador `
- ` |
| 33 | Emoji surrogate causaba UnicodeEncodeError | Emoji removido de src_text |
| 34 | ingest.py sin soporte HTML | extract_html() con BeautifulSoup+lxml |
| 35 | Respuestas lentas sin feedback visual (3-8s spinner) | SSE streaming word-by-word implementado |
| 36 | TABLA_MAP solo listaba, no filtraba | Smart table handler: filtrar, contar, exportar sin LLM |
| 37 | "tickets de soutec" coincidía con "ON HOLD BY SOUTEC" | Column-aware filtering (_detect_filter_column) |
| 38 | "cuáles no están resueltos" devolvía Nations Benefits | Status-aware filtering + TABLE_STOPWORDS ampliados |
| 39 | Follow-up "cuántos son?" perdía filtro previo | _get_table_context() con prev_query_words carry-forward |
| 40 | "expórtalo" usado como término de búsqueda | Exclusion set ampliado + chain traversal en step 2b |
| 41 | Export filename usaba Subject en vez de Account Name | Fix _extract_account_name: preservar columnas vacías |
| 42 | "tickets de X" y "tickets en estado X" iban a RAG | has_implicit_filter + FILTER_INTENT_KEYWORDS ampliados |
| 43 | Negación "no resueltos" ignorada completamente | _detect_status_intent() con XOR: default_negate ^ has_negation |

---

## 16. Vectores Indexados (2026-03-04)

| Fuente | Archivos | Vectores |
|---|---|---|
| **Corpus local** | 6 | 645 |
| **Google Drive** | 15 | 112 |
| **Tabla_Base_Tickets.xlsx** | 1 | ~630 |
| **Total** | 21+ | **~757+** |

### Archivos locales (corpus/)
- Que Rayos es EOS (Gino Wickman).pdf: 432 chunks
- Implementaci\u00f3n RaM\u00f3n Alfredo.pdf: 101 chunks
- Phishing Analysis & Cyber Operations (P.A.C.O.).pdf: 40 chunks
- Arquitectura y Flujo Operativo Del Agente RaM\u00f3n.pdf: 39 chunks
- CAF - OP REP.DOMINICANA...: 18 chunks
- Firmas Corporativas 2025 - 1.pdf: 15 chunks

### Archivos de Drive (doc_type=gdrive)
- Oferta Solucion Multiagente Arturos V2.docx: 24 chunks
- Preguntas y Respuestas sobre el Cotizador.pdf: 17 chunks
- Manual de Usuario del Reportes Cotizador.pdf: 8 chunks
- Plan de Estudios IBM.xlsx: 7 chunks
- 250206_2502_OFBG_A01_PLANTA BAJA_OFICINAS BANGENTE.pdf: 6 chunks
- WhatsApp Image 2025-01-22 (2 im\u00e1genes): 11 chunks
- Planos (4 PDFs t\u00e9cnicos): 7 chunks
- Tabla de Casos y Tiempos de Atenci\u00f3n.xlsx: 4 chunks
- Piso 3.pdf: 2 chunks
- Soutec VE _ ¿Quiénes Somos_.html: 12 chunks
- Soutec VE _ Proveedores de Servicios Administrados....html: 15 chunks
