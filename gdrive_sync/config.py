import os

# ── Google Drive ───────────────────────────────────────────────────────────────
GOOGLE_SERVICE_ACCOUNT_FILE = os.getenv(
    "GOOGLE_SERVICE_ACCOUNT_FILE",
    "/data/AI_Projects/AuditIA/gdrive_sync/credentials/service_account.json"
)
DRIVE_FOLDER_ID  = os.getenv("DRIVE_FOLDER_ID", "1jBjpQRy1LfixjTKjEz7poUtCZJNezxZC")
DRIVE_STATE_FILE = "/data/AI_Projects/AuditIA/gdrive_sync/state/drive_state.json"

# ── Qdrant ─────────────────────────────────────────────────────────────────────
QDRANT_URL        = "http://localhost:6333"
QDRANT_COLLECTION = "auditia"

# ── Embeddings ─────────────────────────────────────────────────────────────────
EMBEDDING_MODEL      = "nomic-ai/nomic-embed-text-v1.5"
EMBEDDING_CACHE_DIR  = "/data/AI_Projects/SonIA/models/nomic"
EMBEDDING_BATCH_SIZE = 8
EMBEDDING_DEVICE     = "cpu"
EMBEDDING_DIMS       = 768

# ── Chunking ───────────────────────────────────────────────────────────────────
CHUNK_SIZE    = 500
CHUNK_OVERLAP = 50

# ── Sync ───────────────────────────────────────────────────────────────────────
SYNC_INTERVAL_MINUTES = 5

# ── Logging ────────────────────────────────────────────────────────────────────
LOG_LEVEL = "INFO"
LOG_FILE  = "/data/AI_Projects/AuditIA/gdrive_sync/logs/gdrive_sync.log"

# ── MIME types soportados ──────────────────────────────────────────────────────
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

IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}

GOOGLE_EXPORT_MAP = {
    "application/vnd.google-apps.document":     "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.google-apps.presentation": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.google-apps.spreadsheet":  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
