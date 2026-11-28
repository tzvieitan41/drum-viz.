# Credits and licences

This app ships third-party components so drum separation can run entirely in the browser. No network call is made at playback time after the files have been downloaded with the site.

## Open-Unmix UMX-HQ drums

- What: the drums network from Open-Unmix UMX-HQ, weights published by Inria / SigSep (Fabian-Robert Stöter, Antoine Liutkus and co-authors), trained on MUSDB18-HQ.
- File in this repo: `models/umxhq-drums.onnx` (35,623,507 bytes).
- SHA-256: `471628e1e48138a634f962a89f622929980cf5485ed0a4e6e648e9dfcd1145d9`
- Source weights: [Zenodo 3370489](https://doi.org/10.5281/zenodo.3370489), file `drums-9619578f.pth`.
- ONNX export used here: [MixDirective/open-unmix-umxhq-drums-onnx](https://huggingface.co/MixDirective/open-unmix-umxhq-drums-onnx) (weights unchanged, STFT left outside the graph).
- Licence: **MIT**. Copyright (c) 2019 Inria. See `models/UMX-LICENSE`.
- Commercial use: **allowed**. MIT permits use, modification, and sale. It does not grant any rights in the songs a user uploads; those stay with their owners.
- The heavier `umxl` weights are CC BY-NC-SA and are **not** included.

Please cite Stöter, Uhlich, Liutkus, Mitsufuji, “Open-Unmix — A Reference Implementation for Music Source Separation”, Journal of Open Source Software, 2019.

## ONNX Runtime Web

- Files: `vendor/ort.wasm.min.js`, `vendor/ort-wasm-simd-threaded.mjs`, `vendor/ort-wasm-simd-threaded.wasm`.
- Package: onnxruntime-web 1.19.2.
- Licence: **MIT**. Copyright Microsoft. Commercial use is allowed.
- Loaded only when a song is separated, not during service-worker install.

## Drum sounds (tap to play)

- Files: `sounds/*.wav` — trimmed, faded and level-matched copies of the Sonic Pi drum samples (`drum_bass_hard`, `drum_snare_hard`, `drum_cymbal_closed`, `drum_cymbal_open`, `drum_cymbal_pedal`, `drum_tom_hi_hard`, `drum_tom_mid_hard`, `drum_tom_lo_hard`, `drum_cymbal_soft`, `drum_cymbal_hard`, `drum_splash_hard`).
- Source: [sonic-pi-net/sonic-pi](https://github.com/sonic-pi-net/sonic-pi), `etc/samples`. Originally recorded by menegass on freesound.org.
- Licence: **CC0 1.0** (public domain). Commercial use: **allowed**. The Sonic Pi samples README is kept as `sounds/SONIC-PI-SAMPLES-README.md`.
- The ride uses the soft crash recording played slower; the library has no ride cymbal.

## Drum kit picture

`kit.jpg` is an AI-generated image supplied by the project owner. Manufacturer logos on the cymbals and drum heads were removed. A fully original rendering is planned before a commercial release.

## Test audio

The test songs in `test/` are synthesized by `test/synth.js` (no sampled recordings).
