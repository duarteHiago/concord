# Gera a marca do Concord de testes (homologação): a mesma logo com as cores trocadas, para ninguém
# confundir a aba, o ícone instalado ou o favicon com os do app de verdade.
#
#   python -I client/scripts/staging-brand.py
#
# Lê client/public/ e escreve em client/staging/public/. O Dockerfile copia essa pasta por cima de
# client/public/ quando a imagem é construída com STAGING=true. Rode de novo se a logo mudar.
# Precisa do Pillow (pip install pillow).
import colorsys
import json
import re
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'public'
OUT = ROOT / 'staging' / 'public'

# Gira o matiz das partes coloridas: coral vira verde-água e lilás vira amarelo.
# O contorno quase preto e o fundo (escuros ou pouco saturados) ficam como estão.
HUE_SHIFT = 150 / 360
MIN_SATURATION = 0.12
MIN_VALUE = 0.2

PNGS = [
    'favicon-32.png',
    'apple-touch-icon.png',
    'icon-192.png',
    'icon-512.png',
    'icon-maskable-192.png',
    'icon-maskable-512.png',
    'brand/concord-logo.png',
    'brand/concord-simbolo.png',
]
SVGS = ['icon.svg', 'brand/concord-simbolo.svg', 'brand/concord-simbolo-16px.svg']


def shift(r: int, g: int, b: int) -> tuple[int, int, int]:
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    if s < MIN_SATURATION or v < MIN_VALUE:
        return r, g, b
    nr, ng, nb = colorsys.hsv_to_rgb((h + HUE_SHIFT) % 1, s, v)
    return round(nr * 255), round(ng * 255), round(nb * 255)


def recolor_png(rel: str) -> None:
    img = Image.open(SRC / rel).convert('RGBA')
    cache: dict[tuple[int, int, int], tuple[int, int, int]] = {}
    pixels = [
        (*cache.setdefault((r, g, b), shift(r, g, b)), a) if a else (r, g, b, a)
        for r, g, b, a in (img.get_flattened_data() if hasattr(img, 'get_flattened_data') else img.getdata())
    ]
    img.putdata(pixels)
    dest = OUT / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, optimize=True)


def recolor_svg(rel: str) -> None:
    def repl(m: re.Match[str]) -> str:
        hex6 = m.group(1)
        r, g, b = (int(hex6[i : i + 2], 16) for i in (0, 2, 4))
        return '#{:02X}{:02X}{:02X}'.format(*shift(r, g, b))

    text = re.sub(r'#([0-9A-Fa-f]{6})\b', repl, (SRC / rel).read_text(encoding='utf-8'))
    dest = OUT / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(text, encoding='utf-8')


def manifest() -> None:
    data = json.loads((SRC / 'manifest.json').read_text(encoding='utf-8'))
    data['name'] = 'Concord (teste)'
    data['short_name'] = 'Concord teste'
    data['description'] = 'Ambiente de testes do Concord'
    (OUT / 'manifest.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main() -> int:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    for rel in PNGS:
        recolor_png(rel)
    for rel in SVGS:
        recolor_svg(rel)
    manifest()
    print(f'Marca de testes gerada em {OUT}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
