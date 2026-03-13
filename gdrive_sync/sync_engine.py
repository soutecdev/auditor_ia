"""
sync_engine.py — Motor de sincronización incremental Google Drive → Qdrant
"""

import gc
import hashlib
import logging
import time
from datetime import datetime

from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, Filter, FieldCondition, MatchValue

from config import QDRANT_URL, QDRANT_COLLECTION
from drive_client import get_changes, download_file_to_memory
from file_processor import extract_text
from vectorizer import chunk_text, embed_chunks

logger = logging.getLogger(__name__)
qdrant  = QdrantClient(url=QDRANT_URL)


def _make_point_id(file_id: str, chunk_index: int) -> int:
    key = f"{file_id}_chunk_{chunk_index}"
    return int(hashlib.md5(key.encode()).hexdigest(), 16) % (2**63)


def already_vectorized(file_id: str, last_modified: str) -> bool:
    try:
        results = qdrant.scroll(
            collection_name=QDRANT_COLLECTION,
            scroll_filter=Filter(
                must=[FieldCondition(key="file_id", match=MatchValue(value=file_id))]
            ),
            limit=1,
            with_payload=True,
            with_vectors=False
        )
        points = results[0]
        if not points:
            return False
        return points[0].payload.get("last_modified", "") == last_modified
    except Exception as e:
        logger.warning(f"   No se pudo verificar estado en Qdrant: {e}")
        return False


def _delete_file_chunks(file_id: str):
    try:
        qdrant.delete(
            collection_name=QDRANT_COLLECTION,
            points_selector=Filter(
                must=[FieldCondition(key="file_id", match=MatchValue(value=file_id))]
            )
        )
        logger.debug(f"   🗑  Chunks eliminados para file_id: {file_id}")
    except Exception as e:
        logger.error(f"   ❌ Error eliminando chunks de {file_id}: {e}")


def _upsert_chunks(chunks_with_vectors: list):
    points = []
    for chunk in chunks_with_vectors:
        point_id = _make_point_id(chunk["file_id"], chunk["chunk_index"])
        points.append(PointStruct(
            id=point_id,
            vector=chunk["vector"],
            payload={
                "text":          chunk["text"],
                "file_id":       chunk["file_id"],
                "filename":      chunk["filename"],
                "file_path":     chunk["file_path"],
                "last_modified": chunk["last_modified"],
                "file_type":     chunk["file_type"],
                "chunk_index":   chunk["chunk_index"],
                "source":        chunk["filename"],
                "doc_type":      "gdrive",
            }
        ))
    if points:
        for i in range(0, len(points), 100):
            qdrant.upsert(collection_name=QDRANT_COLLECTION, points=points[i:i+100])
        logger.debug(f"   ✅ {len(points)} chunks insertados en Qdrant")


def _process_file(file: dict) -> bool:
    file_id       = file["id"]
    filename      = file["name"]
    mime_type     = file["mimeType"]
    last_modified = file.get("modifiedTime", "")
    logger.info(f"   📄 Procesando: {filename}")
    buffer = None
    try:
        buffer, real_mime = download_file_to_memory(file_id, mime_type, filename)
        if buffer is None:
            return False
        text = extract_text(buffer, real_mime, filename)
        if not text or not text.strip():
            logger.warning(f"   ⚠️  Sin texto extraído: {filename}")
            return False
        ext_map = {
            "application/pdf": "pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
            "text/plain": "txt", "text/markdown": "md",
            "text/csv": "csv", "application/json": "json",
            "image/jpeg": "jpg", "image/png": "png",
            "image/webp": "webp", "image/gif": "gif", "text/html": "html",
        }
        file_type = ext_map.get(real_mime, "unknown")

        # Para imágenes: marcar como vision_processed en el payload
        is_image = real_mime in ("image/jpeg", "image/png", "image/webp", "image/gif")
        metadata = {
            "file_id":       file_id,
            "filename":      filename,
            "file_path":     f"gdrive://{filename}",
            "last_modified": last_modified,
            "file_type":     file_type,
        }
        chunks = chunk_text(text, metadata)
        if not chunks:
            logger.warning(f"   ⚠️  Sin chunks generados: {filename}")
            return False
        chunks_with_vectors = embed_chunks(chunks)
        _upsert_chunks(chunks_with_vectors)
        logger.info(f"   ✅ {filename}: {len(chunks_with_vectors)} chunks vectorizados")
        return True
    except Exception as e:
        logger.error(f"   ❌ Error procesando '{filename}': {e}")
        return False
    finally:
        if buffer is not None:
            buffer.close()
            del buffer
        gc.collect()


def run_sync():
    start_time = time.time()
    logger.info("=" * 60)
    logger.info(f"🚀 Inicio de sincronización: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    stats = {"nuevos": 0, "modificados": 0, "eliminados": 0, "errores": 0, "saltados": 0}
    try:
        files_to_process, deleted_ids = get_changes()
        for file_id in deleted_ids:
            logger.info(f"🗑  Eliminando: {file_id}")
            _delete_file_chunks(file_id)
            stats["eliminados"] += 1
        total = len(files_to_process)
        for i, file in enumerate(files_to_process, 1):
            file_id       = file["id"]
            filename      = file["name"]
            last_modified = file.get("modifiedTime", "")
            logger.info(f"[{i}/{total}] {filename}")
            if already_vectorized(file_id, last_modified):
                logger.info(f"   ⏭  Sin cambios, saltando: {filename}")
                stats["saltados"] += 1
                continue
            is_update = False
            try:
                existing = qdrant.scroll(
                    collection_name=QDRANT_COLLECTION,
                    scroll_filter=Filter(
                        must=[FieldCondition(key="file_id", match=MatchValue(value=file_id))]
                    ),
                    limit=1, with_vectors=False
                )
                is_update = len(existing[0]) > 0
            except:
                pass
            if is_update:
                _delete_file_chunks(file_id)
                stats["modificados"] += 1
            else:
                stats["nuevos"] += 1
            success = _process_file(file)
            if not success:
                stats["errores"] += 1
                if is_update:
                    stats["modificados"] -= 1
                else:
                    stats["nuevos"] -= 1
    except Exception as e:
        logger.error(f"❌ Error crítico en sincronización: {e}")
        raise
    finally:
        elapsed = time.time() - start_time
        logger.info("─" * 60)
        logger.info(f"📊 Resumen ({elapsed:.1f}s): Nuevos={stats['nuevos']} Modificados={stats['modificados']} Eliminados={stats['eliminados']} Saltados={stats['saltados']} Errores={stats['errores']}")
        logger.info("=" * 60)
    return stats
