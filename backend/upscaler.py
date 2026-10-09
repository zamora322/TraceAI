"""
Módulo de Super-Resolución Neuronal con Real-ESRGAN (TraceAI).
Escala imágenes de baja resolución 4x preservando y reconstruyendo detalles nítidos
antes de la vectorización con vtracer.
"""

import os
import urllib.request
import logging
import cv2
import numpy as np
import onnxruntime as ort

logger = logging.getLogger("traceai.upscaler")

MODEL_URL = "https://huggingface.co/Heliosoph/realesrgan-onnx/resolve/main/realesr-general-x4v3.onnx"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "models")
MODEL_PATH = os.path.join(MODEL_DIR, "realesr-general-x4v3.onnx")

_session: ort.InferenceSession | None = None


def ensure_model_exists() -> str:
    """Descarga el modelo ONNX de Real-ESRGAN si no se encuentra en caché local."""
    if os.path.exists(MODEL_PATH) and os.path.getsize(MODEL_PATH) > 1_000_000:
        return MODEL_PATH

    os.makedirs(MODEL_DIR, exist_ok=True)
    temp_path = f"{MODEL_PATH}.tmp"
    logger.info("Descargando modelo Real-ESRGAN ONNX (~5 MB) desde Hugging Face...")
    try:
        urllib.request.urlretrieve(MODEL_URL, temp_path)
        os.replace(temp_path, MODEL_PATH)
        logger.info("Modelo Real-ESRGAN descargado exitosamente en: %s", MODEL_PATH)
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        logger.error("Error al descargar modelo Real-ESRGAN: %s", e)
        raise e

    return MODEL_PATH


def get_inference_session() -> ort.InferenceSession:
    """Retorna la sesión de inferencia de ONNX Runtime (singleton)."""
    global _session
    if _session is None:
        model_file = ensure_model_exists()
        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        opts.intra_op_num_threads = max(1, os.cpu_count() or 4)
        _session = ort.InferenceSession(
            model_file,
            sess_options=opts,
            providers=["CPUExecutionProvider"],
        )
    return _session


def _fallback_upscale_4x(image: np.ndarray) -> np.ndarray:
    """Upscaling alternativo con Lanczos4 + Unsharp Masking de alta definición."""
    h, w = image.shape[:2]
    upscaled = cv2.resize(image, (w * 4, h * 4), interpolation=cv2.INTER_LANCZOS4)
    # Filtro de enfoque adaptativo (Unsharp mask)
    gaussian = cv2.GaussianBlur(upscaled, (0, 0), sigmaX=1.5)
    sharpened = cv2.addWeighted(upscaled, 1.4, gaussian, -0.4, 0)
    return np.clip(sharpened, 0, 255).astype(np.uint8)


def _process_tile(
    session: ort.InferenceSession,
    input_name: str,
    tile_rgb: np.ndarray,
) -> np.ndarray:
    """Infiere un bloque individual a través de Real-ESRGAN."""
    # Convertir a float32 [0.0, 1.0] y formato NCHW
    tile_norm = tile_rgb.astype(np.float32) / 255.0
    tile_chw = np.transpose(tile_norm, (2, 0, 1))
    tile_batch = np.expand_dims(tile_chw, axis=0)

    out = session.run(None, {input_name: tile_batch})[0]
    out_sq = np.squeeze(out, axis=0)
    out_hwc = np.transpose(out_sq, (1, 2, 0))
    out_uint8 = np.clip(out_hwc * 255.0 + 0.5, 0, 255).astype(np.uint8)
    return out_uint8


def upscale_image_4x(image_bgr: np.ndarray) -> np.ndarray:
    """
    Aplica Super-Resolución 4x a una imagen BGR o BGRA usando Real-ESRGAN ONNX.

    Args:
        image_bgr: Imagen en formato BGR o BGRA (numpy array uint8).

    Returns:
        Imagen escalada 4x con resolución multiplicada en alto y ancho.
    """
    try:
        session = get_inference_session()
        input_name = session.get_inputs()[0].name

        has_alpha = image_bgr.shape[2] == 4 if len(image_bgr.shape) == 3 else False
        if has_alpha:
            bgr_channel = image_bgr[:, :, :3]
            alpha_channel = image_bgr[:, :, 3]
        else:
            bgr_channel = image_bgr
            alpha_channel = None

        rgb = cv2.cvtColor(bgr_channel, cv2.COLOR_BGR2RGB)
        h, w = rgb.shape[:2]

        tile_size = 512
        tile_overlap = 16

        # Si la imagen es pequeña o mediana, procesar de una sola vez
        if h <= tile_size and w <= tile_size:
            out_rgb = _process_tile(session, input_name, rgb)
        else:
            # Procesamiento por cuadrícula (tiling) con costuras ponderadas
            scale = 4
            out_h, out_w = h * scale, w * scale
            out_rgb = np.zeros((out_h, out_w, 3), dtype=np.uint8)

            for y in range(0, h, tile_size - tile_overlap):
                for x in range(0, w, tile_size - tile_overlap):
                    tile_x2 = min(x + tile_size, w)
                    tile_y2 = min(y + tile_size, h)
                    tile_x1 = max(0, tile_x2 - tile_size)
                    tile_y1 = max(0, tile_y2 - tile_size)

                    sub_tile = rgb[tile_y1:tile_y2, tile_x1:tile_x2]
                    sub_out = _process_tile(session, input_name, sub_tile)

                    # Coordenadas en la imagen resultante
                    out_x1, out_x2 = tile_x1 * scale, tile_x2 * scale
                    out_y1, out_y2 = tile_y1 * scale, tile_y2 * scale
                    out_rgb[out_y1:out_y2, out_x1:out_x2] = sub_out

        out_bgr = cv2.cvtColor(out_rgb, cv2.COLOR_RGB2BGR)

        if has_alpha and alpha_channel is not None:
            # Escalar canal alfa con interpolación Lanczos4 de alta definición
            out_alpha = cv2.resize(
                alpha_channel,
                (w * 4, h * 4),
                interpolation=cv2.INTER_LANCZOS4,
            )
            return cv2.merge([out_bgr[:, :, 0], out_bgr[:, :, 1], out_bgr[:, :, 2], out_alpha])

        return out_bgr

    except Exception as exc:
        logger.warning(
            "Inferencia de Real-ESRGAN falló o no pudo iniciarse (%s). Usando fallback Lanczos4 4x.",
            exc,
        )
        return _fallback_upscale_4x(image_bgr)
