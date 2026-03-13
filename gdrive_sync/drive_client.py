# -*- coding: utf-8 -*-
"""
drive_client.py \u2014 Interacci\u00f3n con Google Drive API
Sincronizaci\u00f3n incremental con Changes API.
Los archivos se descargan directamente a RAM, nunca a disco.
"""

import io
import json
import logging
import os
from pathlib import Path

from googleapiclient.http import MediaIoBaseDownload
from auth import get_drive_service
from config import DRIVE_FOLDER_ID, DRIVE_STATE_FILE, GOOGLE_EXPORT_MAP, SUPPORTED_MIME_TYPES, EMBEDDING_MODEL

logger = logging.getLogger(__name__)


def _load_state() -> dict:
    if os.path.exists(DRIVE_STATE_FILE):
        with open(DRIVE_STATE_FILE, "r") as f:
            return json.load(f)
    return {}

def _save_state(state: dict):
    # Always include embedding_model for migration detection
    state["embedding_model"] = EMBEDDING_MODEL
    Path(DRIVE_STATE_FILE).parent.mkdir(parents=True, exist_ok=True)
    with open(DRIVE_STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)
    logger.debug("Estado guardado: %s", state)


def _list_all_files(service) -> list:
    logger.info("\U0001f50d Primera ejecuci\u00f3n \u2014 listando todos los archivos del Drive...")
    files = []
    page_token = None
    query = "trashed = false"

    if DRIVE_FOLDER_ID != "root":
        query += " and '{}' in parents".format(DRIVE_FOLDER_ID)

    while True:
        params = {
            "q": query,
            "fields": "nextPageToken, files(id, name, mimeType, modifiedTime, parents, size)",
            "pageSize": 200,
        }
        if page_token:
            params["pageToken"] = page_token

        result = service.files().list(**params).execute()
        batch = result.get("files", [])
        files.extend(batch)
        logger.debug("   P\u00e1gina descargada: %d archivos", len(batch))

        page_token = result.get("nextPageToken")
        if not page_token:
            break

    logger.info("   Total archivos encontrados: %d", len(files))
    return files


def _get_start_page_token(service) -> str:
    response = service.changes().getStartPageToken().execute()
    return response.get("startPageToken")

def _list_changes(service, saved_token: str):
    logger.info("\U0001f504 Consultando cambios desde la \u00faltima sincronizaci\u00f3n...")
    changed = []
    deleted_ids = []
    page_token = saved_token

    while True:
        result = service.changes().list(
            pageToken=page_token,
            fields="nextPageToken, newStartPageToken, changes(fileId, removed, file(id, name, mimeType, modifiedTime, parents, size, trashed))",
            pageSize=200
        ).execute()

        for change in result.get("changes", []):
            file_id = change.get("fileId")
            removed = change.get("removed", False)
            file    = change.get("file", {})
            trashed = file.get("trashed", False) if file else True

            if removed or trashed:
                deleted_ids.append(file_id)
            else:
                mime = file.get("mimeType", "")
                if mime in SUPPORTED_MIME_TYPES:
                    changed.append(file)
                else:
                    logger.debug("   Saltando formato no soportado: %s (%s)", file.get("name"), mime)

        new_token = result.get("newStartPageToken")
        next_page = result.get("nextPageToken")

        if new_token:
            logger.info("   Cambios: %d modificados/nuevos, %d eliminados", len(changed), len(deleted_ids))
            return changed, deleted_ids, new_token

        page_token = next_page


def get_changes():
    service = get_drive_service()
    state   = _load_state()

    # Detect embedding model change -> force full re-sync
    stored_model = state.get("embedding_model")
    if stored_model and stored_model != EMBEDDING_MODEL:
        logger.warning(
            "\u26a0\ufe0f  Modelo de embeddings cambi\u00f3: %s -> %s. Forzando re-sincronizaci\u00f3n completa.",
            stored_model, EMBEDDING_MODEL
        )
        state = {}  # Treat as first sync (no page_token)

    if "page_token" not in state:
        logger.info("\U0001f4cb Primera sincronizaci\u00f3n completa")
        start_token = _get_start_page_token(service)
        all_files = _list_all_files(service)
        supported = [f for f in all_files if f.get("mimeType") in SUPPORTED_MIME_TYPES]
        logger.info("   Archivos soportados: %d de %d", len(supported), len(all_files))
        _save_state({"page_token": start_token})
        return supported, []
    else:
        changed, deleted_ids, new_token = _list_changes(service, state["page_token"])
        _save_state({"page_token": new_token})
        return changed, deleted_ids


def download_file_to_memory(file_id: str, mime_type: str, filename: str):
    service = get_drive_service()
    try:
        if mime_type in GOOGLE_EXPORT_MAP:
            export_mime, ext = GOOGLE_EXPORT_MAP[mime_type]
            logger.debug("   Exportando Google Doc '%s' como %s", filename, ext)
            request = service.files().export_media(fileId=file_id, mimeType=export_mime)
            real_mime = export_mime
        else:
            request = service.files().get_media(fileId=file_id)
            real_mime = mime_type

        buffer = io.BytesIO()
        downloader = MediaIoBaseDownload(buffer, request, chunksize=4 * 1024 * 1024)
        done = False
        while not done:
            _, done = downloader.next_chunk()

        buffer.seek(0)
        logger.debug("   \u2705 Descargado en RAM: %s (%.1f KB)", filename, buffer.getbuffer().nbytes / 1024)
        return buffer, real_mime

    except Exception as e:
        logger.error("   \u274c Error descargando '%s' (%s): %s", filename, file_id, e)
        return None, mime_type
