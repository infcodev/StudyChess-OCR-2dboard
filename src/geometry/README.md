# Board geometry attribution

The board detector and crop selection are based on [`@scoriiu/fenshot` 0.1.6](https://www.npmjs.com/package/@scoriiu/fenshot/v/0.1.6). [Fenshot source](https://github.com/scoriiu/fenshot) · [Fenshot MIT notice](LICENSE-fenshot.txt)

- `detect.js` reproduces the published `dist/detect.js` byte for byte. SHA-256 `8136b159617a7da230bada4c6491628b74c85dd5a56dba861ef83179b2dd6508`.
- `index.js` adapts `recognizeGray` and its helpers from `dist/recognize.js`, whose SHA-256 is `3dfcefcfce81eaf1a9f3b3cb87c43f9719c56e5f473c9b3a21b022b38711eae9`. The adapter receives a classifier from the caller and retains the search, crop selection and reliability rules. Image decoding and ONNX inference run outside the geometry module.

Fenshot derives its detector from `chessboard_finder.py` in [TensorFlow Chessbot](https://github.com/Elucidation/tensorflow_chessbot). [TensorFlow Chessbot MIT notice](LICENSE-tensorflow-chessbot.txt)
