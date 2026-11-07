from PIL import Image, ImageDraw, ImageFilter
import sys
W = 1024  # 4 倍で描いて 256 に縮小する
img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

def rr(box, r, fill):
    d.rounded_rectangle(box, radius=r, fill=fill)

# 背景（角丸の正方形）
rr((0, 0, W - 1, W - 1), 190, (17, 24, 39, 255))

def grad_layer(box, r, top, bottom):
    x0, y0, x1, y1 = box
    g = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)
    for y in range(y0, y1 + 1):
        t = (y - y0) / max(1, y1 - y0)
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,)
        gd.line((x0, y, x1, y), fill=c)
    m = Image.new('L', (W, W), 0)
    ImageDraw.Draw(m).rounded_rectangle(box, radius=r, fill=255)
    img.paste(g, (0, 0), m)

def shadow(box, r, offset=18, blur=28, alpha=110):
    s = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    x0, y0, x1, y1 = box
    ImageDraw.Draw(s).rounded_rectangle((x0, y0 + offset, x1, y1 + offset), radius=r, fill=(0, 0, 0, alpha))
    img.alpha_composite(s.filter(ImageFilter.GaussianBlur(blur)))

# フォルダ（奥）: タブ付き
shadow((150, 250, 874, 800), 70)
d.rounded_rectangle((150, 250, 470, 400), radius=60, fill=(21, 101, 192, 255))
d.polygon([(400, 250), (470, 250), (540, 330), (400, 330)], fill=(21, 101, 192, 255))
rr((150, 320, 874, 800), 70, (25, 118, 210, 255))
# フォルダ（手前）
grad_layer((150, 400, 874, 800), 70, (100, 181, 246), (30, 136, 229))

# 書類
doc = (430, 330, 790, 800)
shadow(doc, 40, offset=14, blur=22, alpha=90)
x0, y0, x1, y1 = doc
fold = 110
page = Image.new('L', (W, W), 0)
pd = ImageDraw.Draw(page)
pd.rounded_rectangle(doc, radius=40, fill=255)
pd.polygon([(x1 - fold, y0 - 2), (x1 + 2, y0 - 2), (x1 + 2, y0 + fold)], fill=0)
img.paste((245, 247, 250, 255), (0, 0), page)
d.polygon([(x1 - fold, y0), (x1 - fold, y0 + fold), (x1, y0 + fold)], fill=(207, 216, 226, 255))
for i, w in enumerate((200, 150, 180)):
    y = y0 + 170 + i * 80
    d.rounded_rectangle((x0 + 60, y, x0 + 60 + w, y + 36), radius=18, fill=(144, 164, 190, 255))

# プラスのバッジ
cx, cy, R = 770, 770, 170
s = Image.new('RGBA', (W, W), (0, 0, 0, 0))
ImageDraw.Draw(s).ellipse((cx - R, cy - R + 16, cx + R, cy + R + 16), fill=(0, 0, 0, 120))
img.alpha_composite(s.filter(ImageFilter.GaussianBlur(24)))
d.ellipse((cx - R - 16, cy - R - 16, cx + R + 16, cy + R + 16), fill=(17, 24, 39, 255))
d.ellipse((cx - R, cy - R, cx + R, cy + R), fill=(38, 166, 154, 255))
t, L = 44, 100
d.rounded_rectangle((cx - L, cy - t // 2 - 0, cx + L, cy + t // 2), radius=t // 2, fill=(255, 255, 255, 255))
d.rounded_rectangle((cx - t // 2, cy - L, cx + t // 2, cy + L), radius=t // 2, fill=(255, 255, 255, 255))

out = img.resize((256, 256), Image.LANCZOS)
out.save(sys.argv[1])
out.resize((128, 128), Image.LANCZOS).save(sys.argv[1].replace('.png', '-128.png'))
