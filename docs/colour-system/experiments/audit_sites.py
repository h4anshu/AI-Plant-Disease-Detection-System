"""Competitor colour audit: fetch each homepage and its stylesheets, count colour declarations, report the chromatic ones.
Run:  python -I audit_sites.py        (needs network; the sites change, so RESULTS.txt keeps the 2026-10-09 snapshot)
Proxy only: counts declarations in CSS, not rendered area. AgroStar is left out: its #116DFF / #1A6AFF is the Wix default blue."""
import re, sys, math, urllib.request, urllib.parse, pathlib, collections

def lin(c): c /= 255; return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def oklch(r, g, b):
    r, g, b = lin(r), lin(g), lin(b)
    l = (0.4122214708*r + 0.5363325363*g + 0.0514459929*b) ** (1/3)
    m = (0.2119034982*r + 0.6806995451*g + 0.1073969566*b) ** (1/3)
    s = (0.0883024619*r + 0.2817188376*g + 0.6299787005*b) ** (1/3)
    L = 0.2104542553*l + 0.7936177850*m - 0.0040720468*s
    a = 1.9779984951*l - 2.4285922050*m + 0.4505937099*s
    bb = 0.0259040371*l + 0.7827717662*m - 0.8086757660*s
    return L, math.hypot(a, bb), math.degrees(math.atan2(bb, a)) % 360

HEX = re.compile(r'#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b')
RGB = re.compile(r'rgba?\(\s*(\d{1,3})[ ,]+(\d{1,3})[ ,]+(\d{1,3})')
FAM = [(45,'red'),(80,'orange'),(112,'yellow'),(135,'lime'),(165,'green'),(200,'teal'),(235,'cyan'),(275,'blue'),(330,'purple'),(361,'pink')]
def fam(h):
    for lim, n in FAM:
        if h < lim: return n

def fetch(u):
    try:
        req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'})
        return urllib.request.urlopen(req, timeout=20).read(3_000_000).decode('utf8', 'ignore')
    except Exception:
        return ''

bases = {'plantix_net': 'https://plantix.net/', 'cropin_com': 'https://cropin.com/', 'dehaat_in': 'https://dehaat.in/',
         'bighaat_com': 'https://bighaat.com/', 'fasal_co': 'https://fasal.co/', 'syngenta_com': 'https://syngenta.com/'}
for name in sorted(bases):
    html = fetch(bases[name])
    css = ' '.join(re.findall(r'<style[^>]*>(.*?)</style>', html, re.S))
    for h in re.findall(r'<link[^>]+rel=["\']stylesheet["\'][^>]*>', html):
        m = re.search(r'href=["\']([^"\']+)', h)
        if m: css += fetch(urllib.parse.urljoin(bases[name], m.group(1)))
    css += html  # inline style attributes
    cnt = collections.Counter()
    for m in HEX.finditer(css):
        x = m.group(1); x = ''.join(c*2 for c in x) if len(x) == 3 else x
        cnt[tuple(int(x[i:i+2], 16) for i in (0, 2, 4))] += 1
    for m in RGB.finditer(css):
        t = tuple(min(255, int(v)) for v in m.groups()); cnt[t] += 1
    chrom = []
    for rgb, n in cnt.items():
        L, C, h = oklch(*rgb)
        if C >= 0.04 and 0.15 < L < 0.97: chrom.append((n, rgb, L, C, h))
    chrom.sort(reverse=True)
    tot = sum(n for n, *_ in chrom) or 1
    hist = collections.Counter()
    for n, rgb, L, C, h in chrom: hist[fam(h)] += n
    print(f'\n== {name}: {len(css)//1000}KB css, {len(chrom)} chromatic colours')
    print('   hue families:', ', '.join(f'{k} {100*v//tot}%' for k, v in hist.most_common(5)))
    for n, rgb, L, C, h in chrom[:6]:
        print(f'   #{rgb[0]:02X}{rgb[1]:02X}{rgb[2]:02X}  x{n:<4} L{L:.2f} C{C:.2f} h{h:3.0f} {fam(h)}')
