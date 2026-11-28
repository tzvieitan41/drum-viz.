# Learned drum classifier

A small neural network (46 → 64 → 32 → 9) that decides which drums each detected hit contains
(kick, snare, closed/open hi-hat, high/mid/low tom, ride, crash). It runs inside the app's detector
on the separated drum track. Its weights are embedded in `index.html` (`var MODEL=…`).

## Training data
Generated drum tracks built from CC0 / public-domain one-shots, so every hit's label is known:
- Sonic Pi samples (CC0): https://github.com/sonic-pi-net/sonic-pi (etc/samples)
- Public-domain drum machines: https://github.com/smpldsnds/drum-machines (LM-2, TR-808, MFB-512, CR-8000, Drumtraks)

Only the trained weights ship with the app; the samples used for training do not.

## Steps
1. `python3 bank.py` – labelled sample bank (expects the two repositories cloned locally; paths at the top)
2. `python3 gen.py data/train 420 7 train` and `python3 gen.py data/test 40 999 holdout`
   (the test set uses kits held out of training: Sonic Pi acoustic kit + Drumtraks)
3. `node feats.js data/train train.csv` and the same for test – runs the app's own detector to get features
4. `python3 train.py` – trains and writes `model.json`; paste it into `index.html` as `var MODEL=…`
5. `node e2e.js data/test` – end-to-end comparison with the hand-written rules

## Results (held-out kits, Nov 2026)
Overall F1: hand rules 53.8% → network 80.9%.
