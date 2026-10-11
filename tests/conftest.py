"""Shared test setup.

The code imports its siblings via sys.path (see api/main.py), so mirror that here.
The OpenAI clients are built at import time and need *a* key to construct — a dummy
one is enough, and guarantees no test can spend money by accident.
"""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
for sub in ("tools", "agent", "rag", "db"):
    sys.path.insert(0, str(ROOT / sub))
sys.path.insert(0, str(ROOT))

os.environ["OPENAI_API_KEY"] = "sk-test-dummy"
