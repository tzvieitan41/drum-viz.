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

## App audio

The built-in `demo-beat.wav` is synthesized for this project (no sampled recording). Accuracy notes in development used Kevin MacLeod’s “Noise Attack” (incompetech.com), CC BY 3.0, which is not bundled in the repository.
