import os
import re
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
from pathlib import Path
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env", override=True)

_logger = logging.getLogger(__name__)

_raw_url = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/rafiki"
)

# ── Normalize Render's DATABASE_URL for psycopg2 ──

# 1. Fix scheme to psycopg2
DATABASE_URL = re.sub(r'^postgres(ql)?(\+\w+)?://', 'postgresql+psycopg2://', _raw_url)

# 2. Parse and strip ALL ssl-related params from query string
_parsed = urlparse(DATABASE_URL)
_params = parse_qs(_parsed.query)
_needs_ssl = bool(_params.pop("ssl", None) or _params.pop("sslmode", None))
_clean_query = urlencode({k: v[0] for k, v in _params.items()}) if _params else ""
DATABASE_URL = urlunparse((_parsed.scheme, _parsed.netloc, _parsed.path, _parsed.params, _clean_query, _parsed.fragment))

# 3. Also catch any ssl params that might be embedded differently
DATABASE_URL = re.sub(r'[?&]ssl=[^&]*', '', DATABASE_URL)
DATABASE_URL = re.sub(r'[?&]sslmode=[^&]*', '', DATABASE_URL)
# Clean up orphaned ? or & at the end
DATABASE_URL = DATABASE_URL.rstrip('?&')

# 4. Build connect_args for SSL
_connect_args = {}
if _needs_ssl or "render.com" in _raw_url or "oregon-postgres" in _raw_url or "dpg-" in _raw_url:
    _connect_args["sslmode"] = "require"

_logger.info("DB URL normalized: %s...  ssl=%s", DATABASE_URL[:50], bool(_connect_args))

engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args=_connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
