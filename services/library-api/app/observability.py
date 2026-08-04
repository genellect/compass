from __future__ import annotations

import json
import sys
from typing import Any


def emit_event(event: str, **fields: Any) -> None:
    """Emit one PII-free JSON object for Cloud Logging ingestion."""

    payload = {"event": event, **fields}
    sys.stdout.write(
        json.dumps(payload, ensure_ascii=True, separators=(",", ":")) + "\n"
    )
    sys.stdout.flush()
