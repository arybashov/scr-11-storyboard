"""Extract the supplied screenplay without rewriting its text. No dependencies."""
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import hashlib
import json
import re
import shutil
import sys

sys.stdout.reconfigure(encoding='utf-8')
root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1]) if len(sys.argv) > 1 else root.parents[1] / '01_Source' / 'SCR-11. UNDERGROUND CROSSING.docx'
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
with ZipFile(source) as archive:
    xml = ET.fromstring(archive.read('word/document.xml'))
paragraphs = []
for p in xml.findall('.//w:body//w:p', ns):
    text = ''.join(t.text or '' for t in p.findall('.//w:t', ns))
    if text.strip():
        paragraphs.append({'id': len(paragraphs) + 1, 'text': text})

scenes, frontmatter = [], []
for p in paragraphs:
    if re.match(r'^(ИНТ\.|ЭКСТ\.)', p['text']):
        heading = re.match(r'^((?:ИНТ\.|ЭКСТ\.)[^.]*\.)', p['text'])
        scenes.append({'id': len(scenes) + 1, 'title': heading.group(1) if heading else p['text'], 'paragraphs': []})
    if scenes:
        scenes[-1]['paragraphs'].append(p)
    else:
        frontmatter.append(p)

data = {
    'title': 'Подземный переход', 'credit': 'Summer Night Production', 'year': '2022',
    'source': 'source/SCR-11-Underground-Crossing.docx',
    'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'frontmatter': frontmatter, 'scenes': scenes, 'paragraphCount': len(paragraphs)
}
(root / 'data').mkdir(exist_ok=True)
(root / 'source').mkdir(exist_ok=True)
(root / 'data' / 'screenplay.json').write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
shutil.copy2(source, root / data['source'])
print(json.dumps({'scenes': len(scenes), 'paragraphs': len(paragraphs), 'sha256': data['sha256']}, ensure_ascii=False))
for scene in scenes:
    print(f"{scene['id']:02d} | {scene['paragraphs'][0]['id']}-{scene['paragraphs'][-1]['id']} | {scene['title']}")
