"""
Gera os ícones do app (roleta de 7 fatias com aro dourado sobre o veludo azul).
Uso: python3 apps/mobile/scripts/make-icons.py   (requer Pillow)
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "assets" / "images"
VELVET = "#16255F"
GOLD = "#E8B830"
GOLD_DEEP = "#B98A12"
SLICES = ["#B4233F", "#6B45C2", "#0F7E73", "#D9822B", "#2E7D3A", "#2774C0", GOLD]


def wheel(size: int, scale: float, background: str | None, mono: bool = False) -> Image.Image:
    ss = 4  # supersampling para bordas suaves
    S = size * ss
    img = Image.new("RGBA", (S, S), background or (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = S / 2
    R = S * scale / 2
    rim = R * 0.11
    hub = R * 0.24
    fill_rim = "#FFFFFF" if mono else GOLD
    d.ellipse([c - R, c - R, c + R, c + R], fill=fill_rim, outline=None if mono else GOLD_DEEP, width=int(S * 0.006))
    r1 = R - rim
    n = len(SLICES)
    for i, color in enumerate(SLICES):
        start = -90 + i * 360 / n
        end = start + 360 / n
        d.pieslice([c - r1, c - r1, c + r1, c + r1], start, end, fill=("#FFFFFF" if mono else color), outline=(None if mono else "#F5F6FA"), width=int(S * 0.008))
    if mono:
        # linhas de divisão vazadas no ícone monocromático
        for i in range(n):
            a = math.radians(-90 + i * 360 / n)
            d.line([c, c, c + r1 * math.cos(a), c + r1 * math.sin(a)], fill=(0, 0, 0, 0), width=int(S * 0.02))
    for i in range(n):
        a = math.radians(-90 + i * 360 / n)
        x, y = c + (R - rim / 2) * math.cos(a), c + (R - rim / 2) * math.sin(a)
        r = rim * 0.26
        d.ellipse([x - r, y - r, x + r, y + r], fill=((0, 0, 0, 0) if mono else VELVET))
    d.ellipse([c - hub, c - hub, c + hub, c + hub], fill=((0, 0, 0, 0) if mono else VELVET), outline=fill_rim, width=int(S * 0.018))
    d.ellipse([c - hub * 0.3, c - hub * 0.3, c + hub * 0.3, c + hub * 0.3], fill=fill_rim)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    wheel(1024, 0.78, VELVET).convert("RGB").save(OUT / "icon.png")
    # Android adaptativo: o desenho precisa caber na zona segura (66% central).
    wheel(1024, 0.58, None).save(OUT / "android-icon-foreground.png")
    wheel(1024, 0.58, None, mono=True).save(OUT / "android-icon-monochrome.png")
    wheel(512, 0.9, None).save(OUT / "splash-icon.png")
    wheel(48, 0.92, VELVET).save(OUT / "favicon.png")
    print("ícones gerados em", OUT)


if __name__ == "__main__":
    main()
