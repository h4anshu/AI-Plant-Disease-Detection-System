"""Probe the generated hero image (../hero-reference.jpg): is the stated palette what the pixels really are, where is Rust used,
and does the illustration's own background show as a seam on the page?
Run:  python -I hero_image_probe.py [path-to-image]      (numpy, scikit-learn, Pillow)"""
import sys, math, pathlib, numpy as np
from PIL import Image
from sklearn.cluster import KMeans

path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parent.parent / 'hero-reference.jpg'
im = Image.open(path).convert('RGB'); a = np.asarray(im, dtype=float); W, H = im.size
STATED = {'Pine': (0x19, 0x3D, 0x2B), 'Leaf': (0x6C, 0x85, 0x4D), 'Sage': (0xDC, 0xE4, 0xD1), 'Parchment': (0xF5, 0xF0, 0xE2), 'Rust': (0xD8, 0x5D, 0x2D)}
hx = lambda c: '#%02X%02X%02X' % tuple(int(round(v)) for v in c)
def lin(c): c = np.asarray(c, dtype=float) / 255; return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def oklab(rgb):
    r, g, b = lin(rgb); l = np.cbrt(0.4122214708*r+0.5363325363*g+0.0514459929*b); m = np.cbrt(0.2119034982*r+0.6806995451*g+0.1073969566*b); s = np.cbrt(0.0883024619*r+0.2817188376*g+0.6299787005*b)
    return np.array([0.2104542553*l+0.7936177850*m-0.0040720468*s, 1.9779984951*l-2.4285922050*m+0.4505937099*s, 0.0259040371*l+0.7827717662*m-0.8086757660*s])
dE = lambda p, q: 100 * np.linalg.norm(oklab(p) - oklab(q))
def lch(rgb): L, A, B = oklab(rgb); return L, math.hypot(A, B), math.degrees(math.atan2(B, A)) % 360
nearest = lambda p: min(STATED, key=lambda g: dE(p, STATED[g]))
print('image', im.size)

# 1. background and the large flat areas
border = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
bg = np.median(border, 0); print(f'background (border median) {hx(bg)}  vs stated Parchment: dE {dE(bg, STATED["Parchment"]):.1f}  (1 JND is about 2)')
# coordinates are in a 1536x1024 layout and scaled
sx, sy = W / 1536, H / 1024
def box(x0, y0, x1, y1): return a[int(y0*sy):int(y1*sy), int(x0*sx):int(x1*sx)].reshape(-1, 3)
def report(name, px, pick):
    L = np.array([lch(p)[0] for p in px]); C = np.array([lch(p)[1] for p in px]); sel = px[pick(L, C)]; m = np.median(sel, 0); l, c, h = lch(m)
    print(f'{name:36s} {hx(m)}  L{l:.2f} C{c:.3f} h{h:3.0f}  nearest stated {nearest(m):9s} dE {dE(m, STATED[nearest(m)]):.1f}')
report('CTA button fill', box(90, 560, 350, 608), lambda L, C: L < 0.4)
report('care-plan card', box(1165, 480, 1485, 520), lambda L, C: L < 0.4)
report('eyebrow text (most chromatic 8%)', box(85, 155, 415, 173)[::2], lambda L, C: C >= np.percentile(C, 92))
report('MODERATE badge fill', box(1165, 229, 1273, 250), lambda L, C: (C > 0.10) & (L < 0.75))
report('headline pine (darkest 10%)', box(85, 200, 430, 350)[::3], lambda L, C: L <= np.percentile(L, 10))
report('headline italic (darkest 10%)', box(85, 360, 625, 440)[::3], lambda L, C: L <= np.percentile(L, 10))
report('lesions on the leaf (C > 0.12)', box(1010, 430, 1115, 545), lambda L, C: C > 0.12)

# 2. clusters
px = a.reshape(-1, 3)[::21]; L = np.array([oklab(p) for p in px]); km = KMeans(n_clusters=10, n_init=3, random_state=3).fit(L); w = np.bincount(km.labels_) / len(L)
print('\nk-means clusters (share, nearest stated colour):')
M2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468], [1.9779984951, -2.4285922050, 0.4505937099], [0.0259040371, 0.7827717662, -0.8086757660]]); M1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929], [0.2119034982, 0.6806995451, 0.1073969566], [0.0883024619, 0.2817188376, 0.6299787005]])
for i in np.argsort(-w):
    c = km.cluster_centers_[i]; rl = np.clip(np.linalg.inv(M1) @ ((np.linalg.inv(M2) @ c) ** 3), 0, 1); rgb = 255 * np.where(rl <= 0.0031308, 12.92 * rl, 1.055 * rl ** (1 / 2.4) - 0.055)
    print(f'  {w[i]*100:4.1f}%  {hx(rgb)}  L{c[0]:.2f} C{math.hypot(c[1], c[2]):.3f}  nearest {nearest(rgb):9s} dE {dE(rgb, STATED[nearest(rgb)]):.1f}')

# 3. seam: the plant crop on the stated Parchment
crop = a[int(60*sy):int(840*sy), int(620*sx):int(1140*sx)]; edge = np.concatenate([crop[:4].reshape(-1, 3), crop[-4:].reshape(-1, 3), crop[:, :4].reshape(-1, 3), crop[:, -4:].reshape(-1, 3)])
print(f'\nseam: crop edge {hx(np.median(edge, 0))} vs Parchment dE {dE(np.median(edge, 0), STATED["Parchment"]):.1f}; spread inside the edge (p5..p95) dE {dE(np.percentile(edge, 5, 0), np.percentile(edge, 95, 0)):.1f}')
