"""
Gera os efeitos sonoros do jogo (assets/sounds/*.wav), sintetizados do zero.

Nada de amostras de terceiros: cada som é uma soma de senoides com envelope, então
não há licença a respeitar e o arquivo pode ser refeito a qualquer momento.
Direção: sons curtos e quentes, de sino e madeira, nada de "arcade" estridente.

Uso: python3 scripts/make-sounds.py  (precisa de numpy)
"""
from pathlib import Path
import wave

import numpy as np

RATE = 22050
OUT = Path(__file__).resolve().parent.parent / "assets" / "sounds"


def t(seconds: float) -> np.ndarray:
    return np.arange(int(RATE * seconds)) / RATE


def env(n: int, attack: float = 0.004, decay: float = 8.0) -> np.ndarray:
    """Ataque curto e queda exponencial."""
    x = np.arange(n) / RATE
    a = np.clip(x / attack, 0, 1)
    return a * np.exp(-decay * x)


def bell(freq: float, seconds: float, decay: float = 6.0, bright: float = 0.35) -> np.ndarray:
    x = t(seconds)
    tone = np.sin(2 * np.pi * freq * x) + bright * np.sin(2 * np.pi * freq * 2.01 * x) + 0.12 * np.sin(2 * np.pi * freq * 3.02 * x)
    return tone * env(len(x), decay=decay)


def place(track: np.ndarray, sound: np.ndarray, at: float) -> None:
    i = int(at * RATE)
    end = min(len(track), i + len(sound))
    track[i:end] += sound[: end - i]


def note(name: str) -> float:
    names = {"C": -9, "D": -7, "E": -5, "F": -4, "G": -2, "A": 0, "B": 2}
    semis = names[name[0]] + (1 if "#" in name else 0) + 12 * (int(name[-1]) - 4)
    return 440.0 * 2 ** (semis / 12)


def save(name: str, samples: np.ndarray, volume: float) -> None:
    samples = samples / (np.max(np.abs(samples)) or 1) * volume
    # Fade de 3 ms no fim para não estalar.
    fade = min(len(samples), int(0.003 * RATE))
    samples[-fade:] *= np.linspace(1, 0, fade)
    data = (samples * 32767).astype("<i2").tobytes()
    OUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(data)
    print(f"{name}.wav  {len(samples) / RATE * 1000:.0f} ms")


rng = np.random.default_rng(7)

# Tique da roleta: um estalo de madeira (ruído curto + um tom agudo abafado).
x = t(0.03)
tick = 0.6 * rng.standard_normal(len(x)) * env(len(x), 0.0005, 260) + np.sin(2 * np.pi * 1900 * x) * env(len(x), 0.0005, 140)
save("tick", tick, 0.45)

# Toque em botão de jogo: um "pop" curto que sobe.
x = t(0.07)
freq = np.linspace(520, 880, len(x))
pop = np.sin(2 * np.pi * np.cumsum(freq) / RATE) * env(len(x), 0.002, 55)
save("pop", pop, 0.5)

# Revelação da categoria: arpejo ascendente de sino.
track = np.zeros(int(RATE * 0.75))
for i, n in enumerate(["C5", "E5", "G5", "C6"]):
    place(track, bell(note(n), 0.5, decay=7), i * 0.07)
save("reveal", track, 0.6)

# Acerto: duas notas de sino, a segunda mais alta e mais longa.
track = np.zeros(int(RATE * 0.9))
place(track, bell(note("G5"), 0.4, decay=9), 0)
place(track, bell(note("C6"), 0.8, decay=4.5) + 0.5 * bell(note("E6"), 0.8, decay=5), 0.09)
save("correct", track, 0.7)

# Erro: duas notas graves, descendo, com timbre de madeira (sem buzina).
track = np.zeros(int(RATE * 0.5))
for i, n in enumerate(["E4", "C4"]):
    x = t(0.3)
    tri = 2 / np.pi * np.arcsin(np.sin(2 * np.pi * note(n) * x))
    place(track, tri * env(len(x), 0.003, 11), i * 0.12)
save("wrong", track, 0.55)

# Relógio nos últimos segundos: tique seco.
x = t(0.04)
clock = np.sin(2 * np.pi * 1250 * x) * env(len(x), 0.0005, 120) + 0.3 * rng.standard_normal(len(x)) * env(len(x), 0.0005, 300)
save("clock", clock, 0.4)

# Selo: batida grave de carimbo + brilho.
track = np.zeros(int(RATE * 1.0))
x = t(0.18)
thud = np.sin(2 * np.pi * np.cumsum(np.linspace(140, 55, len(x))) / RATE) * env(len(x), 0.001, 22)
place(track, thud + 0.4 * rng.standard_normal(len(x)) * env(len(x), 0.0005, 90), 0)
for i, n in enumerate(["G5", "C6", "E6"]):
    place(track, 0.6 * bell(note(n), 0.6, decay=6), 0.12 + i * 0.06)
save("seal", track, 0.75)

# Vitória: arpejo e acorde final com leve vibrato.
track = np.zeros(int(RATE * 1.6))
for i, n in enumerate(["C5", "E5", "G5"]):
    place(track, bell(note(n), 0.35, decay=8), i * 0.11)
x = t(1.2)
vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * x)
chord = sum(np.sin(2 * np.pi * note(n) * vib * x) + 0.3 * np.sin(4 * np.pi * note(n) * vib * x) for n in ["C5", "E5", "G5", "C6"])
place(track, chord * env(len(x), 0.02, 2.4), 0.36)
save("win", track, 0.7)

# ---------------------------------------------------------------------------
# Golem World: sons de 8 bits (onda quadrada suavizada), no espírito dos jogos de 16 bits.
# ---------------------------------------------------------------------------


def pulse(freqs: np.ndarray, duty: float = 0.25) -> np.ndarray:
    """Onda de pulso com a frequência variando a cada amostra, levemente arredondada."""
    phase = np.cumsum(freqs) / RATE
    wave_ = np.where((phase % 1.0) < duty, 1.0, -1.0)
    kernel = np.ones(6) / 6  # tira o chiado mais áspero
    return np.convolve(wave_, kernel, mode="same")


# Pulo: varredura que sobe.
x = t(0.16)
save("jump", pulse(np.linspace(330, 990, len(x)), 0.25) * env(len(x), 0.002, 14), 0.32)

# Moeda: duas notas rápidas (si, mi).
track = np.zeros(int(RATE * 0.32))
x = t(0.06)
place(track, pulse(np.full(len(x), note("B5")), 0.5) * env(len(x), 0.001, 6), 0)
x = t(0.26)
place(track, pulse(np.full(len(x), note("E6")), 0.5) * env(len(x), 0.001, 10), 0.06)
save("coin", track, 0.28)

# Tropeço no obstáculo: batida grave que desce.
x = t(0.22)
bump = pulse(np.linspace(220, 70, len(x)), 0.5) * env(len(x), 0.001, 16) + 0.3 * rng.standard_normal(len(x)) * env(len(x), 0.0005, 70)
save("bump", bump, 0.38)

# Caminho novo no mapa: um "ploc" por pedrinha.
x = t(0.05)
save("dot", pulse(np.full(len(x), note("A5")), 0.125) * env(len(x), 0.001, 40), 0.22)

# Poder de item: brilho subindo.
track = np.zeros(int(RATE * 0.4))
for i, n in enumerate(["C6", "E6", "G6", "C7"]):
    x = t(0.12)
    place(track, pulse(np.full(len(x), note(n)), 0.25) * env(len(x), 0.001, 18), i * 0.05)
save("power", track, 0.24)

# Fase concluída: fanfarra curta.
track = np.zeros(int(RATE * 1.5))
for i, (n, d) in enumerate([("G4", 0.12), ("C5", 0.12), ("E5", 0.12), ("G5", 0.24), ("E5", 0.12), ("G5", 0.6)]):
    x = t(d + 0.08)
    start = sum(dd for _, dd in [("G4", 0.12), ("C5", 0.12), ("E5", 0.12), ("G5", 0.24), ("E5", 0.12)][:i])
    tone = pulse(np.full(len(x), note(n)), 0.5) + 0.6 * pulse(np.full(len(x), note(n) / 2), 0.25)
    place(track, tone * env(len(x), 0.004, 3.5 if d > 0.3 else 9), start)
save("clear", track, 0.3)

# ---------------------------------------------------------------------------
# Sevivon (madeira na mesa). Os tempos seguem lib/sevivon.ts: a mão solta o pião aos 0 ms,
# a ponta toca a mesa aos 260 ms (hopMs) e ele gira desacelerando. O arquivo cobre a parte
# rápida do giro; dali em diante o app toca um tique por face que passa (contado na tela),
# então o som nunca se adianta nem se atrasa em relação ao que se vê.
# ---------------------------------------------------------------------------

HOP = 0.26          # hopMs
TOTAL = 3.33        # hop + spin + fall de um giro típico (spinMs ≈ 2550)
SPAN = 4 * 2 * np.pi + np.pi  # ψ percorrido num giro típico (4 voltas e meia)
FACES = 8


def knock(freq: float, seconds: float, decay: float, noise: float = 0.5) -> np.ndarray:
    """Batida de madeira: tom grave com um parcial inarmônico e um estalo de ruído."""
    x = t(seconds)
    tone = np.sin(2 * np.pi * freq * x) + 0.45 * np.sin(2 * np.pi * freq * 2.76 * x) * np.exp(-decay * 1.8 * x)
    return tone * env(len(x), 0.0008, decay) + noise * rng.standard_normal(len(x)) * env(len(x), 0.0004, decay * 6)


def lowpass(signal: np.ndarray, width: int) -> np.ndarray:
    return np.convolve(signal, np.ones(width) / width, mode="same")


# Giro: cai na mesa ("toc") e zune, com um estalo a cada face que passa, cada vez mais espaçados.
length = 1.45
track = np.zeros(int(RATE * length))
place(track, 0.9 * knock(190, 0.12, 38), HOP)
ms = np.arange(int(RATE * length)) / RATE
u = np.clip(ms / TOTAL, 0, 1)
yaw = SPAN * (1 - (1 - u) ** 2.6)  # a mesma curva de poseAt (p = 1,6)
crossings = np.nonzero(np.diff(np.floor(yaw / (2 * np.pi / FACES))))[0]
click = rng.standard_normal(int(RATE * 0.012)) * env(int(RATE * 0.012), 0.0003, 420)
for i in crossings:
    at = i / RATE
    if at < HOP:
        continue
    place(track, 0.32 * click, at)
# Zumbido da ponta na madeira: ruído abafado que perde força junto com o giro.
bed = lowpass(rng.standard_normal(len(ms)), 9) - lowpass(rng.standard_normal(len(ms)), 40)
speed = (1 - u) ** 1.6
bed_env = np.clip((ms - HOP) / 0.04, 0, 1) * speed ** 1.5
track += 0.55 * bed * bed_env
# Some aos poucos onde os tiques do app assumem.
fade = np.clip((length - ms) / 0.32, 0, 1)
save("spin", track * fade, 0.5)

# Tombo: bate deitado na mesa e quica duas vezes, cada vez mais fraco (o "settle" de poseAt).
track = np.zeros(int(RATE * 0.7))
place(track, knock(150, 0.22, 26, 0.7), 0)
place(track, 0.35 * knock(175, 0.14, 34), 0.258)
place(track, 0.12 * knock(190, 0.1, 40), 0.516)
save("topple", track, 0.6)
