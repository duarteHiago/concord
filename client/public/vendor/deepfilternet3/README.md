# DeepFilterNet3 (supressão de ruído)

Servido pelo próprio Concord (sem depender de CDN de terceiros).

- `v3/models/DeepFilterNet3_onnx.tar.gz`: modelo oficial do DeepFilterNet3
  (https://github.com/Rikorose/DeepFilterNet, `models/DeepFilterNet3_onnx.tar.gz`),
  sha256 `c94d91f70911001c946e0fabb4aa9adc37045f45a03b56008cb0c8244cb63616`.
- `v3/pkg/df_bg.wasm`: libDF compilado para WebAssembly (SIMD) pelo pacote
  `deepfilternet3-noise-filter@1.3.0`, que traz o código JavaScript correspondente.

Licença: MIT ou Apache-2.0 (à sua escolha), como o projeto original.
Autor original: Hendrik Schröter — "DeepFilterNet: Perceptually Motivated Real-Time Speech Enhancement".
