#!/usr/bin/env python3
"""Generate original binary assets for the drum visualizer PWA.

Writes, next to the repo root:

  demo-beat.wav         mono 44.1 kHz 16-bit, ~8.8 s, 115 BPM, 4 bars
  icon-192.png          192x192
  icon-512.png          512x512
  apple-touch-icon.png  180x180

The groove is synthesized from sines and noise. No recorded or
copyrighted audio is used.

Requires numpy and Pillow.
"""

from __future__ import annotations

import math
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]

SR = 44100
BPM = 115
BEAT = 60.0 / BPM
EIGHTH = BEAT / 2.0
DURATION = 8.8  # 4 bars at 115 BPM is ~8.35 s; the rest is cymbal/tom ring-out


def one_pole_highpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    dt = 1.0 / SR
    rc = 1.0 / (2.0 * math.pi * cutoff)
    a = rc / (rc + dt)
    y = np.empty_like(x)
    prev_y = 0.0
    prev_x = 0.0
    for i, sample in enumerate(x):
        prev_y = a * (prev_y + float(sample) - prev_x)
        prev_x = float(sample)
        y[i] = prev_y
    return y


def highpass(x: np.ndarray, cutoff: float, stages: int = 2) -> np.ndarray:
    y = x
    for _ in range(stages):
        y = one_pole_highpass(y, cutoff)
    return y


def lowpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    dt = 1.0 / SR
    rc = 1.0 / (2.0 * math.pi * cutoff)
    a = dt / (rc + dt)
    y = np.empty_like(x)
    prev = 0.0
    for i, sample in enumerate(x):
        prev = prev + a * (float(sample) - prev)
        y[i] = prev
    return y


def env_exp(n: int, decay: float, attack: float = 0.0015) -> np.ndarray:
    t = np.arange(n, dtype=np.float64) / SR
    attack_n = max(1, int(attack * SR))
    curve = np.exp(-t / decay)
    fade = np.minimum(1.0, np.arange(n, dtype=np.float64) / attack_n)
    return curve * fade


def mix(buf: np.ndarray, t: float, sig: np.ndarray, gain: float) -> None:
    i0 = int(round(t * SR))
    if i0 >= len(buf) or gain == 0.0:
        return
    n = min(sig.shape[0], buf.shape[0] - i0)
    buf[i0 : i0 + n] += sig[:n] * gain


def synth_kick(rng: np.random.Generator) -> np.ndarray:
    """Pitched sine sweep, about 150 Hz down to 50 Hz."""
    dur = 0.38
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float64) / SR
    freq = 50.0 + 100.0 * np.exp(-t / 0.045)
    phase = 2.0 * math.pi * np.cumsum(freq) / SR
    body = np.sin(phase) * env_exp(n, 0.09, attack=0.001)
    # Short low thump so the attack reads as a drum, still under the hat band.
    click = lowpass(rng.uniform(-1.0, 1.0, n), 400.0) * env_exp(n, 0.004, attack=0.0004)
    return body * 0.95 + click * 0.18


def synth_snare(rng: np.random.Generator) -> np.ndarray:
    """Noise plus a 180 Hz tone."""
    dur = 0.28
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float64) / SR
    noise = rng.uniform(-1.0, 1.0, n)
    noise = highpass(noise, 900.0, stages=2)
    noise = lowpass(noise, 5000.0)
    peak = np.max(np.abs(noise)) or 1.0
    noise = noise / peak
    tone = np.sin(2.0 * math.pi * 180.0 * t)
    return noise * env_exp(n, 0.05, attack=0.001) * 1.05 + tone * env_exp(n, 0.11, attack=0.002) * 0.48


def synth_hat(rng: np.random.Generator, decay: float, dur: float, cutoff: float) -> np.ndarray:
    """High-passed noise. Closed hats use a short decay; the open hat is longer."""
    n = int(dur * SR)
    noise = rng.uniform(-1.0, 1.0, n)
    noise = highpass(noise, cutoff, stages=3)
    peak = np.max(np.abs(noise)) or 1.0
    return (noise / peak) * env_exp(n, decay, attack=0.0008)


def synth_crash(rng: np.random.Generator) -> np.ndarray:
    """Bright high-passed noise with a few inharmonic partials, bar-1 crash."""
    dur = 1.7
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float64) / SR
    noise = highpass(rng.uniform(-1.0, 1.0, n), 3800.0, stages=2)
    peak = np.max(np.abs(noise)) or 1.0
    noise = noise / peak
    partials = np.zeros(n, dtype=np.float64)
    for freq, amp in ((3400.0, 0.18), (5300.0, 0.14), (7900.0, 0.1), (10400.0, 0.06)):
        partials += amp * np.sin(2.0 * math.pi * freq * t)
    return (noise * 0.8 + partials) * env_exp(n, 0.48, attack=0.002)


def synth_tom(f_start: float, f_end: float, decay: float, dur: float) -> np.ndarray:
    """Pitched sine with a small downward sweep so it speaks like a tom."""
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float64) / SR
    freq = f_end + (f_start - f_end) * np.exp(-t / 0.08)
    phase = 2.0 * math.pi * np.cumsum(freq) / SR
    return np.sin(phase) * env_exp(n, decay, attack=0.0012)


def eighth_time(bar: int, eighth: int) -> float:
    return (bar * 8 + eighth) * EIGHTH


def render_groove() -> np.ndarray:
    rng = np.random.default_rng(115)
    n = int(round(DURATION * SR))
    buf = np.zeros(n, dtype=np.float64)

    kick = synth_kick(rng)
    snare = synth_snare(rng)
    hat_closed = synth_hat(rng, decay=0.018, dur=0.07, cutoff=7500.0)
    hat_open = synth_hat(rng, decay=0.13, dur=0.42, cutoff=5200.0)
    crash = synth_crash(rng)
    rack = synth_tom(230.0, 185.0, decay=0.22, dur=0.4)  # ~200 Hz
    floor = synth_tom(125.0, 98.0, decay=0.32, dur=0.55)  # ~110 Hz

    # Bars 1–3: backbeat groove. Kicks on 1 and 3, plus a few 8th-note pickups.
    # Eighth index: 0=1, 1=&, 2=2, 3=&, 4=3, 5=&, 6=4, 7=&.
    for bar in range(3):
        mix(buf, eighth_time(bar, 0), kick, 1.0)
        mix(buf, eighth_time(bar, 4), kick, 0.96)
        mix(buf, eighth_time(bar, 2), snare, 0.92)
        mix(buf, eighth_time(bar, 6), snare, 0.9)
        for eighth in range(8):
            accent = 1.2 if eighth % 2 == 0 else 0.95
            if eighth == 7:
                mix(buf, eighth_time(bar, eighth), hat_open, 1.35)
            else:
                mix(buf, eighth_time(bar, eighth), hat_closed, accent)

    # 8th-note kick pickups: "&" of 2 into beat 3, and one "&" of 4 into the next bar.
    mix(buf, eighth_time(0, 3), kick, 0.62)
    mix(buf, eighth_time(1, 3), kick, 0.58)
    mix(buf, eighth_time(1, 7), kick, 0.55)
    mix(buf, eighth_time(2, 3), kick, 0.6)

    # Crash with the first downbeat.
    mix(buf, eighth_time(0, 0), crash, 0.95)

    # Bar 4: groove for beats 1–2, then rack tom followed by floor tom.
    mix(buf, eighth_time(3, 0), kick, 1.0)
    mix(buf, eighth_time(3, 3), kick, 0.5)  # pickup into the fill
    mix(buf, eighth_time(3, 2), snare, 0.88)
    for eighth in range(4):
        accent = 1.15 if eighth % 2 == 0 else 0.9
        mix(buf, eighth_time(3, eighth), hat_closed, accent)
    mix(buf, eighth_time(3, 4), rack, 0.9)
    mix(buf, eighth_time(3, 5), rack, 0.78)
    mix(buf, eighth_time(3, 6), floor, 0.98)
    mix(buf, eighth_time(3, 7), floor, 0.9)

    peak = np.max(np.abs(buf)) or 1.0
    buf *= 0.92 / peak
    return buf


def write_wav(path: Path, audio: np.ndarray) -> None:
    pcm = np.clip(audio, -1.0, 1.0)
    frames = (pcm * 32767.0).astype(np.int16)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(SR)
        handle.writeframes(frames.tobytes())


def make_background(size: int) -> Image.Image:
    yy, xx = np.ogrid[0:size, 0:size]
    cx = (size - 1) / 2.0
    cy = size * 0.36
    radius = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / (size * 0.85)
    radius = np.clip(radius, 0.0, 1.0)
    radius = radius * radius * (3.0 - 2.0 * radius)
    mid = np.array([54.0, 36.0, 122.0])  # indigo
    edge = np.array([11.0, 14.0, 26.0])  # #0b0e1a
    img = edge + (mid - edge) * (1.0 - radius)[..., None]
    glow_y = size * 0.58
    glow = np.sqrt((xx - cx) ** 2 + (yy - glow_y) ** 2) / (size * 0.5)
    glow = np.clip(1.0 - glow, 0.0, 1.0) ** 2
    img += np.array([255.0, 107.0, 74.0]) * (glow[..., None] * 0.07)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")


def draw_icon(size: int) -> Image.Image:
    """Cartoon snare on a dark indigo field, orange shell, gold sticks."""
    scale = 4
    canvas = size * scale
    image = make_background(canvas).convert("RGBA")
    draw = ImageDraw.Draw(image)

    def s(value: float) -> float:
        return value / 512.0 * canvas

    outline = (30, 24, 59, 255)
    orange = (255, 107, 74, 255)
    orange_dark = (214, 72, 46, 255)
    orange_deep = (176, 58, 40, 255)
    cream = (255, 245, 228, 255)
    gold = (255, 209, 102, 255)
    gold_dark = (214, 158, 48, 255)

    # Soft floor shadow.
    draw.ellipse([s(118), s(404), s(394), s(454)], fill=(6, 7, 16, 180))

    # Tapered shell.
    draw.polygon(
        [(s(132), s(236)), (s(380), s(236)), (s(356), s(352)), (s(156), s(352))],
        fill=orange,
    )
    draw.polygon(
        [(s(132), s(236)), (s(176), s(236)), (s(186), s(352)), (s(156), s(352))],
        fill=orange_dark,
    )
    draw.line([(s(332), s(248)), (s(318), s(344))], fill=(255, 176, 140, 255), width=max(2, int(s(10))))

    # Bottom hoop.
    draw.ellipse([s(150), s(328), s(362), s(386)], fill=orange_deep)
    draw.ellipse([s(162), s(338), s(350), s(376)], fill=orange)

    # Top hoop and head.
    draw.ellipse([s(108), s(198), s(404), s(274)], fill=outline)
    draw.ellipse([s(120), s(206), s(392), s(266)], fill=cream)
    draw.ellipse([s(148), s(216), s(364), s(256)], outline=orange, width=max(2, int(s(8))))
    draw.ellipse([s(176), s(214), s(250), s(236)], fill=(255, 255, 255, 150))

    # Tension lugs.
    for lug_y in (258, 292, 326):
        for lug_x in (188, 300):
            draw.rounded_rectangle(
                [s(lug_x), s(lug_y), s(lug_x + 22), s(lug_y + 20)],
                radius=max(2, int(s(5))),
                fill=outline,
            )
            draw.ellipse(
                [s(lug_x + 6), s(lug_y + 5), s(lug_x + 16), s(lug_y + 15)],
                fill=gold_dark,
            )

    # Sticks, outlined so they stay readable at 180 px.
    stick_w = max(4, int(s(16)))
    edge_w = stick_w + max(3, int(s(8)))
    sticks = (
        ((150, 86), (292, 214)),
        ((362, 86), (220, 214)),
    )
    for (x0, y0), (x1, y1) in sticks:
        draw.line([(s(x0), s(y0)), (s(x1), s(y1))], fill=outline, width=edge_w)
    for (x0, y0), (x1, y1) in sticks:
        draw.line([(s(x0), s(y0)), (s(x1), s(y1))], fill=gold, width=stick_w)
    tip = s(12)
    for x, y in ((150, 86), (362, 86)):
        draw.ellipse([s(x) - tip, s(y) - tip, s(x) + tip, s(y) + tip], fill=outline)
        inner = tip * 0.62
        draw.ellipse([s(x) - inner, s(y) - inner, s(x) + inner, s(y) + inner], fill=gold)

    out = image.resize((size, size), Image.Resampling.LANCZOS).convert("RGB")
    return out


def write_icons() -> None:
    icons = {
        "icon-192.png": 192,
        "icon-512.png": 512,
        "apple-touch-icon.png": 180,
    }
    for name, size in icons.items():
        path = ROOT / name
        draw_icon(size).save(path, "PNG", optimize=True)
        print(f"wrote {path.name} ({size}x{size})")


def main() -> None:
    audio = render_groove()
    wav_path = ROOT / "demo-beat.wav"
    write_wav(wav_path, audio)
    seconds = audio.shape[0] / SR
    peak = float(np.max(np.abs(audio)))
    print(f"wrote {wav_path.name}  {seconds:.3f}s  peak {peak:.3f}  {SR} Hz mono")
    write_icons()


if __name__ == "__main__":
    main()
