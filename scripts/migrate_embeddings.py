# -*- coding: utf-8 -*-
"""
migrate_embeddings.py \u2014 Migra de MiniLM (384d) a nomic-embed-text-v1.5 (768d)
1. Descarga el modelo nomic
2. Backup de la colecci\u00f3n Qdrant
3. Recrea la colecci\u00f3n con 768 dimensiones
"""
import sys
import logging
import json
from pathlib import Path
from datetime import datetime

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')
logger = logging.getLogger(__name__)

QDRANT_URL = "http://localhost:6333"
COLLECTION = "corporativo"
NEW_DIMS = 768
NEW_MODEL = "nomic-ai/nomic-embed-text-v1.5"
MODEL_CACHE = "/data/AI_Projects/SonIA/models/nomic"
BACKUP_DIR = "/data/AI_Projects/SonIA/qdrant_backup"


def step1_download_model():
    """Descarga el modelo nomic si no existe."""
    logger.info("=== Paso 1: Descargando modelo nomic-embed-text-v1.5 ===")
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer(NEW_MODEL, cache_folder=MODEL_CACHE, trust_remote_code=True)
    # Verificar dimensiones
    test_vec = model.encode("prueba", normalize_embeddings=True)
    actual_dims = len(test_vec)
    logger.info(f"Modelo descargado. Dimensiones: {actual_dims}")
    if actual_dims != NEW_DIMS:
        logger.error(f"DIMENSIONES INESPERADAS: esperaba {NEW_DIMS}, obtuvo {actual_dims}")
        sys.exit(1)
    logger.info("Modelo verificado OK")
    return model


def step2_backup_collection():
    """Backup de todos los puntos de la colecci\u00f3n actual."""
    logger.info("=== Paso 2: Backup de la colecci\u00f3n Qdrant ===")
    from qdrant_client import QdrantClient
    client = QdrantClient(url=QDRANT_URL)

    try:
        info = client.get_collection(COLLECTION)
        logger.info(f"Colecci\u00f3n actual: {info.points_count} puntos, dims={info.config.params.vectors.size}")
    except Exception as e:
        logger.warning(f"No se pudo obtener info de la colecci\u00f3n: {e}")
        logger.info("Se crear\u00e1 una nueva colecci\u00f3n desde cero")
        return 0

    # Exportar puntos como JSON
    backup_path = Path(BACKUP_DIR)
    backup_path.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = backup_path / f"corporativo_backup_{timestamp}.json"

    all_points = []
    offset = None
    while True:
        result = client.scroll(
            collection_name=COLLECTION,
            limit=100,
            offset=offset,
            with_vectors=False  # No necesitamos vectores viejos
        )
        points, next_offset = result
        for p in points:
            all_points.append({
                "id": p.id,
                "payload": p.payload
            })
        if next_offset is None:
            break
        offset = next_offset

    with open(str(backup_file), 'w', encoding='utf-8') as f:
        json.dump(all_points, f, ensure_ascii=False, indent=2)

    logger.info(f"Backup: {len(all_points)} puntos guardados en {backup_file}")
    return len(all_points)


def step3_recreate_collection():
    """Elimina y recrea la colecci\u00f3n con nuevas dimensiones."""
    logger.info(f"=== Paso 3: Recreando colecci\u00f3n con {NEW_DIMS} dimensiones ===")
    from qdrant_client import QdrantClient
    from qdrant_client.models import VectorParams, Distance
    client = QdrantClient(url=QDRANT_URL)

    # Eliminar colecci\u00f3n existente
    try:
        client.delete_collection(COLLECTION)
        logger.info(f"Colecci\u00f3n '{COLLECTION}' eliminada")
    except Exception as e:
        logger.warning(f"No se pudo eliminar (puede no existir): {e}")

    # Crear con nuevas dimensiones
    client.create_collection(
        collection_name=COLLECTION,
        vectors_config=VectorParams(size=NEW_DIMS, distance=Distance.COSINE)
    )

    # Crear \u00edndices de payload para filtrado
    for field in ["source", "file_type", "checksum", "doc_type"]:
        try:
            client.create_payload_index(
                collection_name=COLLECTION,
                field_name=field,
                field_schema="keyword"
            )
        except Exception:
            pass

    info = client.get_collection(COLLECTION)
    logger.info(f"Colecci\u00f3n '{COLLECTION}' creada: dims={info.config.params.vectors.size}")


def main():
    logger.info("=" * 60)
    logger.info("MIGRACION: MiniLM-L12-v2 (384d) -> nomic-embed-text-v1.5 (768d)")
    logger.info("=" * 60)

    # Paso 1: Descargar modelo
    model = step1_download_model()

    # Paso 2: Backup
    num_points = step2_backup_collection()

    # Paso 3: Recrear colecci\u00f3n
    step3_recreate_collection()

    logger.info("")
    logger.info("=" * 60)
    logger.info("MIGRACION COMPLETADA")
    logger.info(f"  Puntos respaldados: {num_points}")
    logger.info(f"  Nuevas dimensiones: {NEW_DIMS}")
    logger.info(f"  Modelo: {NEW_MODEL}")
    logger.info("")
    logger.info("Pr\u00f3ximo paso: re-ingestar el corpus con --force")
    logger.info("  cd /data/AI_Projects/SonIA/scripts")
    logger.info("  python3 ingest.py --force")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
