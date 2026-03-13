"""
corpus_watcher.py — Vigilante automático del corpus de SonIA
Detecta archivos nuevos o modificados en /corpus y lanza ingest.py
o ingest_vision.py según el tipo de archivo, con debounce.
"""

import time
import logging
import subprocess
import threading
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# ── Configuración ────────────────────────────────────────────────────────────
CORPUS_DIR     = "/data/AI_Projects/SonIA/corpus"
INGEST_SCRIPT  = "/data/AI_Projects/SonIA/scripts/ingest.py"
VISION_SCRIPT  = "/data/AI_Projects/SonIA/scripts/ingest_vision.py"
PYTHON_BIN     = "/data/AI_Projects/SonIA/venv/bin/python3"
DEBOUNCE_SEC   = 10

# Extensiones de texto → ingest.py
TEXT_EXTENSIONS = {".pdf", ".txt", ".docx", ".md", ".csv", ".html", ".htm", ".pptx", ".xlsx"}

# Extensiones de imagen → ingest_vision.py
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

WATCHED_EXTENSIONS = TEXT_EXTENSIONS | IMAGE_EXTENSIONS

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [corpus-watcher] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger(__name__)


class CorpusHandler(FileSystemEventHandler):

    def __init__(self):
        self._timer_text: threading.Timer | None = None
        self._timer_vision: threading.Timer | None = None
        self._lock = threading.Lock()

    def _is_relevant(self, path: str) -> bool:
        p = Path(path)
        if p.name.startswith(".") or p.name.startswith("~"):
            return False
        return p.suffix.lower() in WATCHED_EXTENSIONS

    def _is_image(self, path: str) -> bool:
        return Path(path).suffix.lower() in IMAGE_EXTENSIONS

    def _is_scanned_pdf(self, path: str) -> bool:
        """Detecta rápidamente si un PDF no tiene texto extraíble."""
        if Path(path).suffix.lower() != ".pdf":
            return False
        try:
            import fitz
            doc = fitz.open(path)
            total_text = ""
            for i, page in enumerate(doc):
                if i >= 3:
                    break
                total_text += page.get_text("text").strip()
            doc.close()
            return len(total_text) < 50
        except:
            return False

    def _schedule_ingest(self, event_path: str, use_vision: bool):
        """Reinicia el timer de debounce correspondiente."""
        with self._lock:
            if use_vision:
                if self._timer_vision is not None:
                    self._timer_vision.cancel()
                self._timer_vision = threading.Timer(
                    DEBOUNCE_SEC, self._run_vision_ingest
                )
                self._timer_vision.start()
                logger.info(f"Imagen detectada: {Path(event_path).name} "
                            f"— ingesta visual en {DEBOUNCE_SEC}s")
            else:
                if self._timer_text is not None:
                    self._timer_text.cancel()
                self._timer_text = threading.Timer(
                    DEBOUNCE_SEC, self._run_text_ingest
                )
                self._timer_text.start()
                logger.info(f"Cambio detectado: {Path(event_path).name} "
                            f"— ingesta texto en {DEBOUNCE_SEC}s")

    def _run_script(self, script: str, label: str):
        logger.info(f"Iniciando {label}...")
        try:
            result = subprocess.run(
                [PYTHON_BIN, script],
                capture_output=True,
                text=True,
                timeout=1800  # 30 min para ingesta visual (puede ser lento)
            )
            if result.returncode == 0:
                logger.info(f"{label} completada correctamente")
                if result.stdout:
                    for line in result.stdout.strip().splitlines():
                        logger.info(f"   {line}")
            else:
                logger.error(f"{label} falló (código {result.returncode})")
                if result.stderr:
                    for line in result.stderr.strip().splitlines():
                        logger.error(f"   {line}")
        except subprocess.TimeoutExpired:
            logger.error(f"{label} cancelada por timeout")
        except Exception as e:
            logger.error(f"Error inesperado en {label}: {e}")

    def _run_text_ingest(self):
        self._run_script(INGEST_SCRIPT, "Ingesta texto")

    def _run_vision_ingest(self):
        self._run_script(VISION_SCRIPT, "Ingesta visual")

    def _handle_event(self, path: str):
        if not self._is_relevant(path):
            return
        # Imágenes → siempre visión
        if self._is_image(path):
            self._schedule_ingest(path, use_vision=True)
        # PDFs → verificar si es escaneado
        elif path.lower().endswith(".pdf") and self._is_scanned_pdf(path):
            logger.info(f"PDF escaneado detectado: {Path(path).name} → ingesta visual")
            self._schedule_ingest(path, use_vision=True)
        # Resto → texto
        else:
            self._schedule_ingest(path, use_vision=False)

    def on_created(self, event):
        if not event.is_directory:
            self._handle_event(event.src_path)

    def on_modified(self, event):
        if not event.is_directory:
            self._handle_event(event.src_path)

    def on_moved(self, event):
        if not event.is_directory:
            self._handle_event(event.dest_path)


def main():
    corpus_path = Path(CORPUS_DIR)
    if not corpus_path.exists():
        logger.error(f"El directorio del corpus no existe: {CORPUS_DIR}")
        raise SystemExit(1)

    logger.info(f"Vigilando corpus en: {CORPUS_DIR}")
    logger.info(f"Texto:  {', '.join(sorted(TEXT_EXTENSIONS))}")
    logger.info(f"Vision: {', '.join(sorted(IMAGE_EXTENSIONS))} + PDFs escaneados")
    logger.info(f"Debounce: {DEBOUNCE_SEC}s")

    handler = CorpusHandler()
    observer = Observer()
    observer.schedule(handler, CORPUS_DIR, recursive=False)
    observer.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Deteniendo watcher...")
    finally:
        observer.stop()
        observer.join()
        logger.info("Watcher detenido.")


if __name__ == "__main__":
    main()
