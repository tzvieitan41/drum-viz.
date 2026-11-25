#!/usr/bin/env python3
"""Score drum hit times against librosa onsets for a real recording."""
import json
import subprocess
import sys

import librosa
import numpy as np
from scipy.signal import butter, sosfilt


def band_onsets(y, sr, lo, hi, highpass=False):
    if highpass:
        sos = butter(4, lo, btype="highpass", fs=sr, output="sos")
    else:
        sos = butter(4, [lo, hi], btype="bandpass", fs=sr, output="sos")
    yb = sosfilt(sos, y)
    env = librosa.onset.onset_strength(y=yb, sr=sr, hop_length=512)
    times = librosa.onset.onset_detect(
        onset_envelope=env, sr=sr, hop_length=512, units="time", backtrack=True
    )
    return np.asarray(times, dtype=float)


def match_offsets(pred, ref, window=0.12):
    """Signed (pred - ref) for predictions that have a reference within window."""
    if len(pred) == 0 or len(ref) == 0:
        return np.array([])
    ref = np.sort(ref)
    offs = []
    for t in pred:
        i = np.searchsorted(ref, t)
        best = None
        for j in (i - 1, i):
            if 0 <= j < len(ref):
                d = t - ref[j]
                if best is None or abs(d) < abs(best):
                    best = d
        if best is not None and abs(best) <= window:
            offs.append(best)
    return np.asarray(offs, dtype=float)


def prf(pred, ref, tol=0.05):
    ref = np.sort(np.asarray(ref, dtype=float))
    pred = np.sort(np.asarray(pred, dtype=float))
    used = np.zeros(len(pred), dtype=bool)
    tp = 0
    for g in ref:
        if len(pred) == 0:
            break
        i = np.searchsorted(pred, g)
        best = None
        best_dt = tol + 1
        for j in (i - 1, i):
            if 0 <= j < len(pred) and not used[j]:
                dt = abs(pred[j] - g)
                if dt <= tol and dt < best_dt:
                    best_dt = dt
                    best = j
        if best is not None:
            used[best] = True
            tp += 1
    fp = int((~used).sum()) if len(pred) else 0
    fn = len(ref) - tp
    prec = tp / len(pred) if len(pred) else 0.0
    rec = tp / len(ref) if len(ref) else 0.0
    return {"tp": tp, "fp": fp, "fn": fn, "nPred": int(len(pred)), "nRef": int(len(ref)), "prec": prec, "rec": rec}


def stats(offs):
    if len(offs) == 0:
        return {"n": 0, "median_ms": None, "p90_abs_ms": None, "median_abs_ms": None}
    abs_ms = np.abs(offs) * 1000
    return {
        "n": int(len(offs)),
        "median_ms": float(np.median(offs) * 1000),
        "median_abs_ms": float(np.median(abs_ms)),
        "p90_abs_ms": float(np.percentile(abs_ms, 90)),
    }


def main():
    wav = sys.argv[1]
    y, sr = librosa.load(wav, sr=22050, mono=True)
    # Score the first 60s so the reference stays about the drum-heavy body of the track.
    y = y[: sr * 60]
    mix = librosa.onset.onset_detect(y=y, sr=sr, units="time", backtrack=True)
    refs = {
        "kick": band_onsets(y, sr, 40, 150),
        "snare": band_onsets(y, sr, 180, 2500),
        "hats": band_onsets(y, sr, 6000, 10000, highpass=True),
    }
    print(f"librosa mix onsets {len(mix)}  kick {len(refs['kick'])} snare {len(refs['snare'])} hats {len(refs['hats'])}")

    # Write a temporary 60s wav for the JS detectors.
    import soundfile as sf
    clip = "/tmp/noise-score.wav"
    sf.write(clip, y, sr)

    for label, which in (("OLD", "old"), ("NEW", "new")):
        raw = subprocess.check_output(["node", "tools/dump_hits.js", clip, which], cwd="/workspace")
        data = json.loads(raw)
        hits = data["hits"]
        times = np.array([h["time"] for h in hits], dtype=float)
        print(f"\n=== {label}  hits {len(hits)}  analyze {data['ms']} ms ===")
        print("timing vs librosa mix onsets", json.dumps(stats(match_offsets(times, mix))))
        groups = {
            "kick": [h["time"] for h in hits if h["piece"] == "kick"],
            "snare": [h["time"] for h in hits if h["piece"] == "snare"],
            "hats": [h["time"] for h in hits if h["piece"] in ("hatClosed", "hatOpen")],
        }
        for name in ("kick", "snare", "hats"):
            row = prf(groups[name], refs[name], 0.05)
            print(f"  {name:6} P {row['prec']:.2f} R {row['rec']:.2f}  pred {row['nPred']:4} ref {row['nRef']:4} tp {row['tp']:4} fp {row['fp']:4} fn {row['fn']:4}")


if __name__ == "__main__":
    main()
