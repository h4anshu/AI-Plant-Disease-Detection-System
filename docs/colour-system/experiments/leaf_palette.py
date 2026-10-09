"""Domain palette: cluster the colours of real in-the-wild leaf photos (PlantDoc) in OKLab.
Run:  python -I leaf_palette.py "<path>/PlantDoc-Dataset-master.zip" 12     (12 random images per class; numpy, scikit-learn, Pillow)
Reads straight from the zip (nothing is extracted). Seeded, so the numbers are reproducible."""
import zipfile, random, io, re, sys, math, collections
import numpy as np
from PIL import Image
from sklearn.cluster import KMeans

ZIP = sys.argv[1]
PER_CLASS = int(sys.argv[2]) if len(sys.argv) > 2 else 12
DIS = re.compile(r'scab|rust|spot|blight|mold|mildew|virus|mosaic|curl|bacterial|septoria|mite|black|rot|yellow', re.I)

def to_oklab(rgb):  # rgb float 0..1, shape (n,3)
    c = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    m1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929], [0.2119034982, 0.6806995451, 0.1073969566], [0.0883024619, 0.2817188376, 0.6299787005]])
    lms = np.cbrt(c @ m1.T)
    m2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468], [1.9779984951, -2.4285922050, 0.4505937099], [0.0259040371, 0.7827717662, -0.8086757660]])
    return lms @ m2.T

def from_oklab(lab):
    m2i = np.linalg.inv(np.array([[0.2104542553, 0.7936177850, -0.0040720468], [1.9779984951, -2.4285922050, 0.4505937099], [0.0259040371, 0.7827717662, -0.8086757660]]))
    lms = (lab @ m2i.T) ** 3
    m1i = np.linalg.inv(np.array([[0.4122214708, 0.5363325363, 0.0514459929], [0.2119034982, 0.6806995451, 0.1073969566], [0.0883024619, 0.2817188376, 0.6299787005]]))
    c = np.clip(lms @ m1i.T, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)

z = zipfile.ZipFile(ZIP)
files = collections.defaultdict(list)
for n in z.namelist():
    if n.lower().endswith(('.jpg', '.jpeg', '.png')) and n.count('/') >= 3:
        files[n.split('/')[-2]].append(n)
random.seed(7)
groups = {'healthy': [], 'diseased': []}
print('classes:', {k: len(v) for k, v in sorted(files.items())})
for cls, names in files.items():
    g = 'diseased' if DIS.search(cls) else 'healthy'
    for n in random.sample(names, min(PER_CLASS, len(names))):
        try:
            im = Image.open(io.BytesIO(z.read(n))); im.draft('RGB', (160, 160)); im = im.convert('RGB'); im.thumbnail((80, 80))
        except Exception:
            continue
        px = np.asarray(im, dtype=float).reshape(-1, 3) / 255
        lab = to_oklab(px); C = np.hypot(lab[:, 1], lab[:, 2])
        keep = (C >= 0.04) & (lab[:, 0] > 0.15) & (lab[:, 0] < 0.92)  # drop greys, sky, deep shadow
        groups[g].append(px[keep])
for g, parts in groups.items():
    px = np.concatenate(parts); lab = to_oklab(px)
    km = KMeans(n_clusters=6, n_init=4, random_state=7).fit(lab)
    w = np.bincount(km.labels_) / len(lab)
    order = np.argsort(-w)
    print(f'\n[{g}] {len(parts)} images, {len(px)} px')
    for i in order:
        L, a, b = km.cluster_centers_[i]; C = math.hypot(a, b); h = math.degrees(math.atan2(b, a)) % 360
        rgb = (from_oklab(km.cluster_centers_[i][None])[0] * 255).round().astype(int)
        print(f'  {w[i]*100:4.1f}%  #{rgb[0]:02X}{rgb[1]:02X}{rgb[2]:02X}  L{L:.2f} C{C:.3f} h{h:3.0f}')

# Lesion palette: in the diseased photos, keep only the non-leaf-green pixels (hue outside 100-150) and cluster those
px = np.concatenate(groups['diseased']); lab = to_oklab(px)
C = np.hypot(lab[:, 1], lab[:, 2]); H = np.degrees(np.arctan2(lab[:, 2], lab[:, 1])) % 360
les = lab[(H > 15) & (H < 98) & (C > 0.05)]
km = KMeans(n_clusters=5, n_init=4, random_state=7).fit(les)
w = np.bincount(km.labels_) / len(les)
print(f'\n[lesion pixels: hue 15-98, {len(les)} px = {100*len(les)/len(lab):.1f}% of diseased-photo pixels]')
for i in np.argsort(-w):
    L, a, b = km.cluster_centers_[i]; Cc = math.hypot(a, b); h = math.degrees(math.atan2(b, a)) % 360
    rgb = (from_oklab(km.cluster_centers_[i][None])[0] * 255).round().astype(int)
    print(f'  {w[i]*100:4.1f}%  #{rgb[0]:02X}{rgb[1]:02X}{rgb[2]:02X}  L{L:.2f} C{Cc:.3f} h{h:3.0f}')
