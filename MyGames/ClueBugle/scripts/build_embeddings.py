"""One-time OFFLINE BUILD: download MiniLM embeddings and emit browser-ready vectors.

Run on a computer with ordinary internet access:
  pip install sentence-transformers
  python scripts/build_embeddings.py

The generated embeddings.js travels with the HTML game. Players need no model,
GPU, account, API key, or network call for semantic AI.
"""
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
result = subprocess.run(['node', str(ROOT / 'scripts' / 'semantic_manifest.cjs')],
                        check=True, capture_output=True, text=True)
manifest = json.loads(result.stdout)
try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    sys.exit('Install dependencies first: pip install sentence-transformers')
model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
texts = list(dict.fromkeys(s['text'] for group in ('words', 'clues')
                           for item in manifest[group] for s in item['senses']))
vectors = model.encode(texts, normalize_embeddings=True, batch_size=64,
                       show_progress_bar=True)
lookup = {t: [round(float(x), 5) for x in vec] for t, vec in zip(texts, vectors)}
out = {}
for group in ('words', 'clues'):
    out[group] = {item['word']: [{'vec': lookup[s['text']], 'weight': s['weight']}
                                 for s in item['senses']]
                  for item in manifest[group] if item['senses']}
target = ROOT / 'embeddings.js'
target.write_text('globalThis.CB_EMBEDDINGS=' + json.dumps(out, separators=(',', ':')) + ';\n',
                  encoding='utf-8')
print(f'Wrote {target} ({target.stat().st_size/1024/1024:.1f} MiB)')
