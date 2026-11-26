# ONNX classifier interface

StudyChess OCR 2D supplies the board detector, tile preprocessing and result interpretation. Provide an ONNX classifier that meets the interface below. `chess-board-classifier.onnx` is the example filename used in the documentation. You can use any filename when providing the model URL or selecting the local file in the demo.

| Tensor | Shape and type | Meaning |
| --- | --- | --- |
| `tiles` | `float32[64, 32, 32, 3]` | A batch of 64 RGB tiles in image order. Pixel values are in `[0, 255]`. Apply any model-specific normalization inside the graph. |
| `probs` | `float32[64, 13]` | Class probabilities in `[0, 1]`, in the order `.PNBRQKpnbrqk`. `.` is empty, uppercase is White and lowercase is Black. |

The input uses NHWC layout. Tile 0 is the top-left square of the detected grid and tile 63 is the bottom-right square. The engine expects an ONNX graph supported by the WebAssembly execution provider of ONNX Runtime Web 1.26.0.

This release distributes the MIT-licensed code and demo. Classifier weights are supplied separately by the caller. The release contains no model files or training data.
