# アイコンを 256px / 128px / 32px で並べ、明るい背景と暗い背景の両方で見比べる画像を作る。
# 使い方: python preview-icon.py <icon.png> <出力.png>
import sys
from PIL import Image

icon = Image.open(sys.argv[1]).convert('RGBA')
sizes = [256, 128, 32]
width = sum(sizes) + 40 * (len(sizes) + 1)
canvas = Image.new('RGBA', (width, (256 + 40) * 2), (0, 0, 0, 0))
for row, background in enumerate([(255, 255, 255, 255), (30, 30, 30, 255)]):
    band = Image.new('RGBA', (width, 256 + 40), background)
    x = 40
    for size in sizes:
        scaled = icon.resize((size, size), Image.LANCZOS)
        band.alpha_composite(scaled, (x, 20 + (256 - size) // 2))
        x += size + 40
    canvas.paste(band, (0, row * (256 + 40)))
canvas.save(sys.argv[2])
