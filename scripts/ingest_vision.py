# -*- coding: utf-8 -*-
"""
ingest_vision.py \u2014 Pipeline de ingesta visual para SonIA
Procesa im\u00e1genes .jpg/.png y PDFs escaneados usando Qwen3.5 visi\u00f3n.
Genera descripciones textuales que se vectorizan en Qdrant.
"""

import base64
import hashlib
import logging
import time
from datetime import datetime
from pathlib import Path

import httpx
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, Filter, FieldCondition, MatchValue

logger = logging.getLogger(__name__)

QDRANT_URL      = "http://localhost:6333"
COLLECTION_NAME = "corporativo"
OLLAMA_URL      = "http://localhost:11434/api/chat"
LLM_MODEL       = "sonia-qwen:9b"
EMBEDDING_MODEL = "nomic-ai/nomic-embed-text-v1.5"
EMBEDDING_CACHE = "/data/AI_Projects/SonIA/models/nomic"
EMBEDDING_DIMS  = 768
THROTTLE_SECS   = 2   # Pausa entre im\u00e1genes para no saturar GPU

client   = QdrantClient(url=QDRANT_URL)
embedder = SentenceTransformer(EMBEDDING_MODEL, cache_folder=EMBEDDING_CACHE, trust_remote_code=True)

PROMPT_MIXED = """Analiza esta imagen con detalle. Sigue estas instrucciones:

1. Si la imagen contiene TEXTO (documentos, formularios, facturas, contratos, tablas):
   - Transcribe TODO el texto visible con la mayor precisi\u00f3n posible
   - Mant\u00e9n la estructura (tablas, listas, p\u00e1rrafos)
   - Indica secci\u00f3n por secci\u00f3n

2. Si la imagen contiene DIAGRAMAS, GR\u00c1FICOS o CAPTURAS DE PANTALLA:
   - Describe qu\u00e9 representa visualmente
   - Explica los elementos clave, relaciones y datos importantes
   - Si hay etiquetas o n\u00fameros, incl\u00fayelos

3. Si es MIXTO (texto + visual):
   - Primero transcribe el texto
   - Luego describe los elementos visuales

Responde en espa\u00f1ol. S\u00e9 exhaustivo \u2014 esta informaci\u00f3n se usar\u00e1 para b\u00fasqueda sem\u00e1ntica."""


def image_to_base64(image_path: str) -> str:
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def describe_image_with_vision(image_b64: str, filename: str) -> str:
    """Usa Qwen3.5 visi\u00f3n para generar descripci\u00f3n textual de una imagen."""
    try:
        with httpx.Client(timeout=120) as client_http:
            resp = client_http.post(OLLAMA_URL, json={
                "model":  LLM_MODEL,
                "think":  False,
                "stream": False,
                "messages": [{
                    "role":    "user",
                    "content": PROMPT_MIXED,
                    "images":  [image_b64]
                }]
            })
            result = resp.json().get("message", {}).get("content", "").strip()
            if result:
                logger.info(f"   Vision OK: {len(result)} chars generados")
            return result
    except Exception as e:
        logger.error(f"   Error llamando vision LLM para {filename}: {e}")
        return ""


def get_image_hash(image_path: str) -> str:
    h = hashlib.md5()
    with open(image_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def already_indexed(file_hash: str) -> bool:
    try:
        results = client.scroll(
            collection_name=COLLECTION_NAME,
            scroll_filter=Filter(must=[FieldCondition(
                key="checksum", match=MatchValue(value=file_hash)
            )]),
            limit=1
        )
        return len(results[0]) > 0
    except:
        return False


def ingest_image(image_path: Path) -> bool:
    """Ingesta una imagen .jpg/.png al corpus vectorial."""
    file_hash = get_image_hash(str(image_path))
    if already_indexed(file_hash):
        logger.info(f"   Sin cambios: {image_path.name}")
        return False

    logger.info(f"   Procesando imagen: {image_path.name}")
    image_b64   = image_to_base64(str(image_path))
    description = describe_image_with_vision(image_b64, image_path.name)

    if not description or len(description) < 20:
        logger.warning(f"   Sin descripcion util para: {image_path.name}")
        return False

    vector   = embedder.encode(description, normalize_embeddings=True).tolist()
    point_id = abs(hash(f"{file_hash}_vision")) % (2**63)

    client.upsert(
        collection_name=COLLECTION_NAME,
        points=[PointStruct(
            id=point_id,
            vector=vector,
            payload={
                "text":        description,
                "source":      image_path.name,
                "file_type":   image_path.suffix.lower().lstrip("."),
                "doc_type":    "imagen",
                "checksum":    file_hash,
                "indexed_at":  datetime.now().isoformat(),
                "vision_processed": True
            }
        )]
    )
    logger.info(f"   Indexada: {image_path.name} ({len(description)} chars)")
    time.sleep(THROTTLE_SECS)
    return True


def ingest_scanned_pdf(pdf_path: Path) -> int:
    """
    Ingesta un PDF escaneado procesando cada p\u00e1gina como imagen.
    Retorna el n\u00famero de p\u00e1ginas procesadas.
    """
    import fitz  # PyMuPDF

    file_hash = get_image_hash(str(pdf_path))
    if already_indexed(file_hash):
        logger.info(f"   Sin cambios: {pdf_path.name}")
        return 0

    logger.info(f"   PDF escaneado: {pdf_path.name}")
    pages_processed = 0

    try:
        doc = fitz.open(str(pdf_path))
        for page_num, page in enumerate(doc):
            # Renderizar p\u00e1gina como imagen (150 DPI es suficiente para OCR)
            mat  = fitz.Matrix(150/72, 150/72)
            pix  = page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("png")
            image_b64 = base64.b64encode(img_bytes).decode("utf-8")

            logger.info(f"   P\u00e1gina {page_num+1}/{len(doc)}")
            description = describe_image_with_vision(image_b64,
                              f"{pdf_path.name} p.{page_num+1}")

            if not description or len(description) < 20:
                logger.warning(f"   P\u00e1gina {page_num+1} sin contenido util")
                continue

            vector   = embedder.encode(description,
                           normalize_embeddings=True).tolist()
            point_id = abs(hash(f"{file_hash}_p{page_num}")) % (2**63)

            client.upsert(
                collection_name=COLLECTION_NAME,
                points=[PointStruct(
                    id=point_id,
                    vector=vector,
                    payload={
                        "text":       description,
                        "source":     pdf_path.name,
                        "file_type":  "pdf",
                        "doc_type":   "pdf_escaneado",
                        "page":       page_num + 1,
                        "checksum":   file_hash,
                        "indexed_at": datetime.now().isoformat(),
                        "vision_processed": True
                    }
                )]
            )
            pages_processed += 1
            time.sleep(THROTTLE_SECS)

        doc.close()

        # Marcar el PDF completo como indexado con su hash
        if pages_processed > 0:
            logger.info(f"   {pages_processed} paginas indexadas: {pdf_path.name}")

    except Exception as e:
        logger.error(f"   Error procesando PDF escaneado {pdf_path.name}: {e}")

    return pages_processed


def is_scanned_pdf(pdf_path: Path) -> bool:
    """Detecta si un PDF es escaneado (sin texto extra\u00edble)."""
    import fitz
    try:
        doc = fitz.open(str(pdf_path))
        total_text = ""
        # Revisar primeras 3 p\u00e1ginas
        for i, page in enumerate(doc):
            if i >= 3:
                break
            total_text += page.get_text("text").strip()
        doc.close()
        # Si tiene menos de 50 caracteres en 3 p\u00e1ginas \u2192 escaneado
        return len(total_text) < 50
    except:
        return False


def run_vision_ingestion(corpus_dir: str):
    """Punto de entrada: procesa todas las im\u00e1genes y PDFs escaneados del corpus."""
    corpus = Path(corpus_dir)
    image_extensions = [".jpg", ".jpeg", ".png", ".webp"]

    # 1. Im\u00e1genes sueltas
    images = [f for ext in image_extensions
                for f in corpus.rglob(f"*{ext}")]
    logger.info(f"Imagenes encontradas: {len(images)}")
    for i, img_path in enumerate(images, 1):
        logger.info(f"[{i}/{len(images)}] {img_path.name}")
        ingest_image(img_path)

    # 2. PDFs escaneados
    pdfs = list(corpus.rglob("*.pdf"))
    scanned = [p for p in pdfs if is_scanned_pdf(p)]
    logger.info(f"PDFs escaneados detectados: {len(scanned)} de {len(pdfs)} PDFs")
    for i, pdf_path in enumerate(scanned, 1):
        logger.info(f"[{i}/{len(scanned)}] {pdf_path.name}")
        ingest_scanned_pdf(pdf_path)

    info = client.get_collection(COLLECTION_NAME)
    logger.info(f"Vision ingestion completa. Total vectores: {info.points_count:,}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")
    run_vision_ingestion("/data/AI_Projects/SonIA/corpus")
