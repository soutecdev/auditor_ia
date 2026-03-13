# -*- coding: utf-8 -*-
"""
vectorizer.py \u2014 Chunking sem\u00e1ntico y embeddings con nomic-embed-text-v1.5
"""

import re
import logging
from sentence_transformers import SentenceTransformer
from config import (
    EMBEDDING_MODEL, EMBEDDING_CACHE_DIR,
    EMBEDDING_BATCH_SIZE, EMBEDDING_DEVICE,
    CHUNK_SIZE, CHUNK_OVERLAP
)

logger = logging.getLogger(__name__)
# ── NORMA_REGISTRY (mismo que ingest.py) ──────────────────────────────────────
NORMA_REGISTRY = {
    "ISA_200":           {"keywords": ["ISA_200","ISA200","NIA_200","NIA200"],                "norma_codigo": "ISA-200",        "norma_familia": "ISA",   "norma_version": "2009", "organismo": "IAASB", "ambito": "internacional", "ciclo_audit": ["general"]},
    "ISA_240":           {"keywords": ["ISA_240","ISA240","NIA_240","NIA240"],                "norma_codigo": "ISA-240",        "norma_familia": "ISA",   "norma_version": "2009", "organismo": "IAASB", "ambito": "internacional", "ciclo_audit": ["fraude"]},
    "ISA_315":           {"keywords": ["ISA_315","ISA315","NIA_315","NIA315"],                "norma_codigo": "ISA-315",        "norma_familia": "ISA",   "norma_version": "2022", "organismo": "IAASB", "ambito": "internacional", "ciclo_audit": ["riesgos","control_interno"]},
    "ISA_330":           {"keywords": ["ISA_330","ISA330","NIA_330","NIA330"],                "norma_codigo": "ISA-330",        "norma_familia": "ISA",   "norma_version": "2009", "organismo": "IAASB", "ambito": "internacional", "ciclo_audit": ["control_interno"]},
    "ISA_500":           {"keywords": ["ISA_500","ISA500","NIA_500","NIA500"],                "norma_codigo": "ISA-500",        "norma_familia": "ISA",   "norma_version": "2009", "organismo": "IAASB", "ambito": "internacional", "ciclo_audit": ["general"]},
    "ISA_700":           {"keywords": ["ISA_700","ISA700","NIA_700","NIA700"],                "norma_codigo": "ISA-700",        "norma_familia": "ISA",   "norma_version": "2015", "organismo": "IAASB", "ambito": "internacional", "ciclo_audit": ["general"]},
    "ISA_HANDBOOK_VOL1": {"keywords": ["ISA_Handbook_2022_Vol1"],                             "norma_codigo": "ISA-HANDBOOK-V1","norma_familia": "ISA",   "norma_version": "2022", "organismo": "IAASB", "ambito": "internacional", "ciclo_audit": ["general","control_interno","riesgos","fraude"]},
    "ISA_HANDBOOK_VOL2": {"keywords": ["ISA_Handbook_2022_Vol2"],                             "norma_codigo": "ISA-HANDBOOK-V2","norma_familia": "ISA",   "norma_version": "2022", "organismo": "IAASB", "ambito": "internacional", "ciclo_audit": ["general"]},
    "ISA_HANDBOOK_VOL3": {"keywords": ["ISA_Handbook_2022_Vol3"],                             "norma_codigo": "ISA-HANDBOOK-V3","norma_familia": "ISA",   "norma_version": "2022", "organismo": "IAASB", "ambito": "internacional", "ciclo_audit": ["general"]},
    "NIIF_9":            {"keywords": ["NIIF_9","NIIF9","IFRS_9","IFRS9"],                   "norma_codigo": "NIIF-9",         "norma_familia": "NIIF",  "norma_version": "2014", "organismo": "IASB",  "ambito": "internacional", "ciclo_audit": ["tesoreria","consolidacion"]},
    "NIIF_15":           {"keywords": ["NIIF_15","NIIF15","IFRS_15","IFRS15"],               "norma_codigo": "NIIF-15",        "norma_familia": "NIIF",  "norma_version": "2014", "organismo": "IASB",  "ambito": "internacional", "ciclo_audit": ["ventas"]},
    "NIIF_16":           {"keywords": ["NIIF_16","NIIF16","IFRS_16","IFRS16"],               "norma_codigo": "NIIF-16",        "norma_familia": "NIIF",  "norma_version": "2016", "organismo": "IASB",  "ambito": "internacional", "ciclo_audit": ["activos_fijos"]},
    "NIIF_MARCO":        {"keywords": ["NIIF_MarcoConceptual","conceptual-framework"],        "norma_codigo": "NIIF-MARCO",     "norma_familia": "NIIF",  "norma_version": "2024", "organismo": "IASB",  "ambito": "internacional", "ciclo_audit": ["general"]},
    "PCAOB_AS2201":      {"keywords": ["PCAOB_AS2201","AS2201","AS_2201"],                   "norma_codigo": "PCAOB-AS2201",   "norma_familia": "PCAOB", "norma_version": "2007", "organismo": "PCAOB", "ambito": "internacional", "ciclo_audit": ["control_interno"], "industria": ["cotizadas"]},
    "PCAOB_AS2301":      {"keywords": ["PCAOB_AS2301","AS2301","AS_2301"],                   "norma_codigo": "PCAOB-AS2301",   "norma_familia": "PCAOB", "norma_version": "2010", "organismo": "PCAOB", "ambito": "internacional", "ciclo_audit": ["control_interno"], "industria": ["cotizadas"]},
    "COSO_2013":         {"keywords": ["COSO_2013_ExecutiveSummary","COSO_2013","COSO2013"], "norma_codigo": "COSO-2013",      "norma_familia": "COSO",  "norma_version": "2013", "organismo": "COSO",  "ambito": "internacional", "ciclo_audit": ["control_interno","riesgos"]},
    "COT_VE": {"keywords": ["COT_VE","CODIGO_ORGANICO_TRIBUTARIO","COT2020"], "norma_codigo": "COT-2020", "norma_familia": "COT", "norma_version": "2020", "organismo": "SENIAT", "ambito": "venezuela", "ciclo_audit": ["impuestos"], "industria": ["general"]},
    "ISLR_VE": {"keywords": ["ISLR_VE","ISLR","IMPUESTO_SOBRE_LA_RENTA"], "norma_codigo": "ISLR-2015", "norma_familia": "ISLR", "norma_version": "2015", "organismo": "SENIAT", "ambito": "venezuela", "ciclo_audit": ["impuestos"], "industria": ["general"]},
    "LOTTT": {"keywords": ["LOTTT","LOT_VE","LEY_ORGANICA_TRABAJO","LEY_TRABAJO_VE","LOTTT_VE","LOT2012","LOTTT2012"], "norma_codigo": "LOTTT-2012", "norma_familia": "LOTTT", "norma_version": "2012", "organismo": "MPPPST", "ambito": "venezuela", "ciclo_audit": ["nomina"], "industria": ["general"]},
    "COSO_ERM":          {"keywords": ["COSO_ERM","COSO_2017","COSO2017"],                   "norma_codigo": "COSO-ERM-2017",  "norma_familia": "COSO",  "norma_version": "2017", "organismo": "COSO",  "ambito": "internacional", "ciclo_audit": ["riesgos"]},
    "SOX":               {"keywords": ["SOX","Sarbanes_Oxley","SarbanesOxley"],              "norma_codigo": "SOX",            "norma_familia": "SOX",   "norma_version": "2002", "organismo": "US_Congress", "ambito": "internacional", "ciclo_audit": ["control_interno","fraude"], "industria": ["cotizadas"]},

    # ── IIA ───────────────────────────────────────────────────────────────────
    "IIA_NORMAS_GLOBALES": {
        "keywords": ["IIA_Normas_Globales", "IIA_NORMAS", "IPPF"],
        "norma_codigo": "IIA-2024", "norma_familia": "IIA", "norma_version": "2024",
        "organismo": "IIA", "ambito": "internacional",
        "ciclo_audit": ["control_interno", "riesgos", "fraude", "tecnologia"],
        "confidencialidad": "publica",
    },
    "IIA_THREE_LINES": {
        "keywords": ["IIA_Three_Lines", "THREE_LINES_MODEL", "Three_Lines"],
        "norma_codigo": "IIA-TLM-2020", "norma_familia": "IIA", "norma_version": "2020",
        "organismo": "IIA", "ambito": "internacional",
        "ciclo_audit": ["control_interno", "riesgos"],
        "confidencialidad": "publica",
    },
    # ── COSO adicionales ──────────────────────────────────────────────────────
    "COSO_FRM": {
        "keywords": ["COSO_FRM", "Fraud_Risk_Management", "COSO_FRAUD", "FRM_Executive"],
        "norma_codigo": "COSO-FRM-2023", "norma_familia": "COSO", "norma_version": "2023",
        "organismo": "COSO", "ambito": "internacional",
        "ciclo_audit": ["fraude", "control_interno", "riesgos"],
        "confidencialidad": "publica",
    },
    "COSO_ICIF": {
        "keywords": ["COSO_ICIF", "Internal_Control_Integrated", "ICIF_2012"],
        "norma_codigo": "COSO-ICIF-2012", "norma_familia": "COSO", "norma_version": "2012",
        "organismo": "COSO", "ambito": "internacional",
        "ciclo_audit": ["control_interno", "riesgos", "fraude"],
        "confidencialidad": "publica",
    },
    "COSO_ERM_2017": {
        "keywords": ["COSO_ERM_2017", "Enterprise_Risk_Management", "ERM_2017"],
        "norma_codigo": "COSO-ERM-2017", "norma_familia": "COSO", "norma_version": "2017",
        "organismo": "COSO", "ambito": "internacional",
        "ciclo_audit": ["riesgos", "control_interno"],
        "confidencialidad": "publica",
    },
    "COSO_ERM_FAQ": {
        "keywords": ["COSO_ERM_FAQ", "ERM_FAQ"],
        "norma_codigo": "COSO-ERM-FAQ", "norma_familia": "COSO", "norma_version": "2017",
        "organismo": "COSO", "ambito": "internacional",
        "ciclo_audit": ["riesgos", "control_interno"],
        "confidencialidad": "publica",
    },
    "COSO_GENAI": {
        "keywords": ["COSO_GenAI", "GenAI_IC", "Generative_AI_Control", "COSO_AI"],
        "norma_codigo": "COSO-GENAI-2026", "norma_familia": "COSO", "norma_version": "2026",
        "organismo": "COSO", "ambito": "internacional",
        "ciclo_audit": ["tecnologia", "control_interno", "riesgos"],
        "confidencialidad": "publica",
    },
    # ── Documentos internos EY ─────────────────────────────────────────────────
    "EY_INTERNO": {
        "keywords": ["EY_Taller", "EY_INTERNO", "EY_"],
        "norma_codigo": None, "norma_familia": "EY_INTERNO", "norma_version": None,
        "organismo": "EY", "ambito": "internacional",
        "ciclo_audit": ["control_interno", "tecnologia", "riesgos"],
        "confidencialidad": "restringida",
    },
}

def _detect_norma_metadata(filename: str) -> dict:
    fname_upper = filename.upper()
    for _key, meta in NORMA_REGISTRY.items():
        for kw in meta["keywords"]:
            if kw.upper() in fname_upper:
                return {
                    "doc_type":         "normativa",
                    "norma_codigo":     meta["norma_codigo"],
                    "norma_familia":    meta["norma_familia"],
                    "norma_version":    meta.get("norma_version", ""),
                    "norma_vigente":    True,
                    "organismo":        meta["organismo"],
                    "ambito":           meta["ambito"],
                    "ciclo_audit":      meta.get("ciclo_audit", ["general"]),
                    "industria":        meta.get("industria", ["general"]),
                    "confidencialidad": "publica",
                    "cliente_id":       None,
                    "engagement_id":    None,
                    "ejercicio_fiscal": None,
                }
    return {
        "doc_type":         "gdrive",
        "norma_codigo":     "",
        "norma_familia":    "",
        "norma_version":    "",
        "norma_vigente":    False,
        "organismo":        "",
        "ambito":           "",
        "ciclo_audit":      ["general"],
        "industria":        ["general"],
        "confidencialidad": "interna",
        "cliente_id":       None,
        "engagement_id":    None,
        "ejercicio_fiscal": None,
    }

def _detect_chunk_flags(text: str) -> dict:
    text_lower = text.lower()
    return {
        "es_requerimiento":   bool(re.search(r"\b(el auditor debe|the auditor shall|deber\u00e1|debe evaluar|shall obtain|shall evaluate)\b", text_lower)),
        "es_definicion":      bool(re.search(r"\b(se define como|significa|definition|definici\u00f3n|a los efectos de|for purposes of)\b", text_lower)),
        "es_guia_aplicacion": bool(re.search(r"\b(a\d+\.|material de aplicaci\u00f3n|application material|guidance)\b", text_lower)),
    }



_embedder = None

def get_embedder():
    global _embedder
    if _embedder is None:
        logger.info(f"Cargando modelo de embeddings: {EMBEDDING_MODEL}")
        _embedder = SentenceTransformer(EMBEDDING_MODEL, cache_folder=EMBEDDING_CACHE_DIR, trust_remote_code=True)
        logger.info(f"Modelo cargado en {EMBEDDING_DEVICE}")
    return _embedder


def chunk_text(text: str, file_metadata: dict) -> list:
    if not text or not text.strip():
        return []

    file_type = file_metadata.get("file_type", "")
    # Para Excel y CSV: agrupar filas con headers
    if file_type in ("xlsx", "xls", "csv"):
        return _chunk_tabular(text, file_metadata)

    # Para el resto: chunking sem\u00e1ntico por oraciones
    return _chunk_semantic(text, file_metadata)


def _chunk_semantic(text: str, file_metadata: dict) -> list:
    """Chunking que respeta l\u00edmites de oraci\u00f3n para embeddings coherentes."""
    text = text.strip()
    chunks = []
    index = 0

    # Separar por oraciones (punto/!/? seguido de espacio o fin de l\u00ednea)
    sentences = re.split(r'(?<=[.!?])\s+', text)
    sentences = [s.strip() for s in sentences if s.strip()]

    # Si no hay separadores, intentar por saltos de l\u00ednea
    if len(sentences) <= 1 and len(text) > CHUNK_SIZE:
        sentences = [s.strip() for s in text.split('\n') if s.strip()]

    # Fallback: chunking por caracteres
    if len(sentences) <= 1 and len(text) > CHUNK_SIZE:
        start = 0
        while start < len(text):
            end = start + CHUNK_SIZE
            chunk = text[start:end].strip()
            if len(chunk) >= 30:
                chunks.append(_make_chunk(chunk, file_metadata, index))
                index += 1
            start += CHUNK_SIZE - CHUNK_OVERLAP
        return chunks

    # Agrupar oraciones respetando CHUNK_SIZE
    current_chunk = []
    current_len = 0

    for sent in sentences:
        if current_len + len(sent) > CHUNK_SIZE and current_chunk:
            chunk_text = ' '.join(current_chunk)
            if len(chunk_text) >= 30:
                chunks.append(_make_chunk(chunk_text, file_metadata, index))
                index += 1
            # Overlap: mantener \u00faltima oraci\u00f3n
            current_chunk = current_chunk[-1:]
            current_len = sum(len(s) for s in current_chunk) + len(current_chunk)
        current_chunk.append(sent)
        current_len += len(sent) + 1

    if current_chunk:
        chunk_text = ' '.join(current_chunk)
        if len(chunk_text) >= 30:
            chunks.append(_make_chunk(chunk_text, file_metadata, index))
            index += 1

    logger.debug(f"   '{file_metadata['filename']}': {len(chunks)} chunks (sem\u00e1ntico)")
    return chunks


def _chunk_tabular(text: str, file_metadata: dict, rows_per_chunk: int = 5) -> list:
    """Agrupa N filas con headers repetidos por chunk."""
    chunks = []
    index = 0
    current_sheet_header = ""
    current_col_header = ""
    header_captured = False
    data_rows = []

    for line in text.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("[Hoja:"):
            # Flush filas pendientes
            if data_rows:
                for i in range(0, len(data_rows), rows_per_chunk):
                    batch = data_rows[i:i + rows_per_chunk]
                    header = f"{current_sheet_header}\n{current_col_header}".strip()
                    ct = f"{header}\n" + "\n".join(batch) if header else "\n".join(batch)
                    if len(ct) >= 30:
                        chunks.append(_make_chunk(ct, file_metadata, index))
                        index += 1
                data_rows = []
            current_sheet_header = line
            header_captured = False
            continue
        if "|" in line and not header_captured:
            current_col_header = line
            header_captured = True
            continue
        if len(line) >= 10:
            data_rows.append(line)

    # Flush remaining
    if data_rows:
        for i in range(0, len(data_rows), rows_per_chunk):
            batch = data_rows[i:i + rows_per_chunk]
            header = f"{current_sheet_header}\n{current_col_header}".strip()
            ct = f"{header}\n" + "\n".join(batch) if header else "\n".join(batch)
            if len(ct) >= 30:
                chunks.append(_make_chunk(ct, file_metadata, index))
                index += 1

    logger.debug(f"   '{file_metadata['filename']}' (tabular): {len(chunks)} chunks")
    return chunks


def _make_chunk(text: str, file_metadata: dict, index: int) -> dict:
    """Construye dict de chunk con metadatos normativos extendidos."""
    norma  = _detect_norma_metadata(file_metadata["filename"])
    flags  = _detect_chunk_flags(text)
    return {
        # ── Campos base ───────────────────────────────────────────
        "text":                text,
        "file_id":             file_metadata.get("file_id", ""),
        "filename":            file_metadata["filename"],
        "file_path":           file_metadata.get("file_path", ""),
        "last_modified":       file_metadata.get("last_modified", ""),
        "file_type":           file_metadata.get("file_type", ""),
        "chunk_index":         index,
        "source":              file_metadata["filename"],
        "title":               file_metadata.get("title", ""),
        "author":              file_metadata.get("author", ""),
        # ── Clasificación normativa ───────────────────────────────
        "doc_type":            norma["doc_type"],
        "norma_codigo":        norma["norma_codigo"],
        "norma_familia":       norma["norma_familia"],
        "norma_version":       norma["norma_version"],
        "norma_vigente":       norma["norma_vigente"],
        "organismo":           norma["organismo"],
        "ambito":              norma["ambito"],
        "ciclo_audit":         norma["ciclo_audit"],
        "industria":           norma["industria"],
        "confidencialidad":    norma["confidencialidad"],
        "cliente_id":          norma["cliente_id"],
        "engagement_id":       norma["engagement_id"],
        "ejercicio_fiscal":    norma["ejercicio_fiscal"],
        # ── Flags de chunk ────────────────────────────────────────
        "es_requerimiento":    flags["es_requerimiento"],
        "es_definicion":       flags["es_definicion"],
        "es_guia_aplicacion":  flags["es_guia_aplicacion"],
    }


def embed_chunks(chunks: list) -> list:
    if not chunks:
        return []
    embedder = get_embedder()
    texts    = [c["text"] for c in chunks]
    all_vectors = []
    for i in range(0, len(texts), EMBEDDING_BATCH_SIZE):
        batch   = texts[i:i + EMBEDDING_BATCH_SIZE]
        vectors = embedder.encode(
            batch,
            normalize_embeddings=True,
            batch_size=EMBEDDING_BATCH_SIZE,
            show_progress_bar=False
        ).tolist()
        all_vectors.extend(vectors)
    for chunk, vector in zip(chunks, all_vectors):
        chunk["vector"] = vector
    return chunks
