"""
auth.py — Autenticación con Google Drive usando Service Account
"""

import logging
from google.oauth2 import service_account
from googleapiclient.discovery import build
from config import GOOGLE_SERVICE_ACCOUNT_FILE

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

_service = None

def get_drive_service():
    global _service
    if _service is not None:
        return _service
    try:
        credentials = service_account.Credentials.from_service_account_file(
            GOOGLE_SERVICE_ACCOUNT_FILE,
            scopes=SCOPES
        )
        _service = build("drive", "v3", credentials=credentials, cache_discovery=False)
        logger.info("✅ Autenticación con Google Drive exitosa")
        return _service
    except FileNotFoundError:
        logger.error(f"❌ Archivo de credenciales no encontrado: {GOOGLE_SERVICE_ACCOUNT_FILE}")
        raise
    except Exception as e:
        logger.error(f"❌ Error de autenticación con Google Drive: {e}")
        raise
