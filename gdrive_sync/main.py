"""
main.py — Punto de entrada del pipeline Google Drive → Qdrant
Uso:
  python3 main.py               → Modo scheduler (cada N minutos)
  python3 main.py --sync-now    → Sincronización manual inmediata
  python3 main.py --reset       → Borra estado delta y fuerza sync completo
"""

import argparse
import logging
import os
import sys
import time
from pathlib import Path

import schedule

from config import SYNC_INTERVAL_MINUTES, LOG_LEVEL, LOG_FILE, DRIVE_STATE_FILE
from sync_engine import run_sync


def setup_logging():
    Path(LOG_FILE).parent.mkdir(parents=True, exist_ok=True)
    log_level = getattr(logging, LOG_LEVEL.upper(), logging.INFO)
    formatter = logging.Formatter(
        "%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    file_handler = logging.FileHandler(LOG_FILE)
    file_handler.setFormatter(formatter)
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    root_logger.addHandler(console_handler)
    root_logger.addHandler(file_handler)
    logging.getLogger("googleapiclient.discovery").setLevel(logging.WARNING)
    logging.getLogger("google.auth").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("sentence_transformers").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)


def _scheduled_sync():
    try:
        run_sync()
    except Exception as e:
        logger.error(f"Error en sincronización programada: {e}")


def main():
    setup_logging()
    parser = argparse.ArgumentParser(description="Pipeline Google Drive → Qdrant para SonIA")
    parser.add_argument("--sync-now", action="store_true", help="Sincronización inmediata y salir")
    parser.add_argument("--reset", action="store_true", help="Borrar estado delta y forzar sync completo")
    args = parser.parse_args()

    if args.reset:
        if os.path.exists(DRIVE_STATE_FILE):
            os.remove(DRIVE_STATE_FILE)
            logger.info(f"🔄 Estado delta eliminado: {DRIVE_STATE_FILE}")
        else:
            logger.info("No había estado delta guardado.")

    if args.sync_now or args.reset:
        logger.info("▶ Ejecutando sincronización manual...")
        run_sync()
        return

    logger.info(f"⏰ Modo scheduler activo — sincronizando cada {SYNC_INTERVAL_MINUTES} minutos")
    logger.info("▶ Sincronización inicial al arrancar...")
    try:
        run_sync()
    except Exception as e:
        logger.error(f"Error en sincronización inicial: {e}")

    schedule.every(SYNC_INTERVAL_MINUTES).minutes.do(_scheduled_sync)

    while True:
        try:
            schedule.run_pending()
            time.sleep(30)
        except KeyboardInterrupt:
            logger.info("🛑 Scheduler detenido")
            break
        except Exception as e:
            logger.error(f"Error en scheduler: {e}")
            time.sleep(60)


if __name__ == "__main__":
    main()
