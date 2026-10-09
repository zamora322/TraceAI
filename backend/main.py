"""API Backend de TraceAI.

Servicio SaaS de alto rendimiento para vectorización inteligente de imágenes a SVG (competidor de Vector Magic).
Incluye eliminación de fondo con IA (rembg), cuantización de color K-Means (scikit-learn),
preprocesamiento avanzado y vectorización configurable con curvas Bézier (vtracer).
"""

import logging
import os
import re
import tempfile
from enum import Enum
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from PIL import Image
from rembg import new_session, remove
from sklearn.cluster import KMeans
import vtracer

from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

# Configuración de registro (logging)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("traceai.api")

tags_metadata = [
    {
        "name": "Vectorización",
        "description": "Pipeline profesional de procesamiento y vectorización de imágenes a SVG.",
    },
    {
        "name": "Comprobación de Estado",
        "description": "Diagnóstico y verificación de disponibilidad de la API.",
    },
]

app = FastAPI(
    title="TraceAI API",
    description=(
        "API profesional de TraceAI para vectorización de imágenes a gráficos SVG escalables con IA. "
        "Permite eliminación de fondo, cuantización de paleta con K-Means y ajuste dinámico de detalle."
    ),
    version="0.2.0",
    openapi_tags=tags_metadata,
)

# Habilitar CORS para clientes frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Constantes y configuraciones de seguridad
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
ALLOWED_MIME_TYPES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/bmp",
    "image/x-ms-bmp",
}
MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB
CHUNK_SIZE = 1024 * 1024  # 1 MB

# Sesión cacheada de rembg (modelo u2netp optimizado para velocidad en CPU)
_rembg_session = None


def get_rembg_session():
    """Obtiene o inicializa de forma diferida la sesión de IA para remoción de fondo."""
    global _rembg_session
    if _rembg_session is None:
        try:
            logger.info("Inicializando modelo rembg (u2netp)...")
            _rembg_session = new_session("u2netp")
        except Exception as exc:
            logger.warning(f"No se pudo cargar u2netp, intentando modelo predeterminado: {exc}")
            _rembg_session = new_session()
    return _rembg_session


# ---------------------------------------------------------------------------
# Modelos de Datos (Pydantic & FastAPI Form)
# ---------------------------------------------------------------------------


class DetailLevel(str, Enum):
    """Niveles de detalle disponibles para la vectorización."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class VectorizeOptions(BaseModel):
    """Opciones dinámicas para el pipeline de vectorización de TraceAI."""

    remove_background: bool = Field(
        default=False,
        description="Indica si se debe remover el fondo de la imagen usando IA (rembg).",
    )
    color_count: int = Field(
        default=0,
        ge=0,
        le=64,
        description="Cantidad exacta de colores a cuantizar mediante K-Means (0 para automático, o entre 2 y 64).",
    )
    detail_level: DetailLevel = Field(
        default=DetailLevel.MEDIUM,
        description="Nivel de detalle de curvas y polígonos: 'low', 'medium' o 'high'.",
    )

    @classmethod
    def as_form(
        cls,
        remove_background: bool = Form(
            default=False,
            description="Remover el fondo de la imagen automáticamente usando IA (rembg).",
        ),
        color_count: int = Form(
            default=0,
            ge=0,
            le=64,
            description="Reducir paleta exacta con K-Means (0 para automático, o 2, 4, 8, 16 para serigrafía/logos).",
        ),
        detail_level: DetailLevel = Form(
            default=DetailLevel.MEDIUM,
            description="Nivel de fidelidad vectorial: 'low' (polígonos planos), 'medium' (curvas equilibradas) o 'high' (máxima fidelidad).",
        ),
    ) -> "VectorizeOptions":
        return cls(
            remove_background=remove_background,
            color_count=color_count,
            detail_level=detail_level,
        )


# ---------------------------------------------------------------------------
# Utilidades de Seguridad y Limpieza
# ---------------------------------------------------------------------------


def cleanup_files(*paths: Optional[str]) -> None:
    """Elimina de forma segura archivos temporales en disco."""
    for path in paths:
        if path and os.path.exists(path):
            try:
                os.remove(path)
                logger.info(f"Archivo temporal eliminado: {path}")
            except OSError as exc:
                logger.warning(f"Error al eliminar archivo temporal '{path}': {exc}")


def validate_image_header(header: bytes) -> bool:
    """Valida los bytes mágicos de la cabecera para garantizar que el archivo sea una imagen real."""
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return True
    if header.startswith(b"\xff\xd8\xff"):
        return True
    if header.startswith(b"RIFF") and len(header) >= 12 and header[8:12] == b"WEBP":
        return True
    if header.startswith(b"BM"):
        return True
    return False


# ---------------------------------------------------------------------------
# Pipeline de Procesamiento Avanzado
# ---------------------------------------------------------------------------


def clean_and_refine_alpha_matte(
    rgba_image: Image.Image,
    original_rgb: np.ndarray,
) -> Image.Image:
    """Refina y purifica la máscara alfa generada por rembg.

    - Detecta fondos sólidos o blancos en los vértices del lienzo y aplica floodFill
      multisemilla para eliminar al 100% el fondo exterior continuo.
    - Aplica un umbral estricto para descartar bordes translúcidos residuales que VTracer
      convertiría en polígonos blancos.
    - Aplica erosión morfológica de 1px (defringing) para eliminar halos blancos en los bordes.
    - Suprime y limpia los valores RGB en áreas transparentes para evitar fugas de color.
    """
    arr = np.array(rgba_image)
    if arr.shape[2] != 4:
        return rgba_image

    rgb = arr[:, :, :3]
    alpha = arr[:, :, 3].copy()
    h, w = arr.shape[:2]

    # 1. Detección de fondo claro o blanco en las 4 esquinas de la imagen original
    corners = [
        original_rgb[0, 0],
        original_rgb[0, w - 1],
        original_rgb[h - 1, 0],
        original_rgb[h - 1, w - 1],
    ]
    mean_corner = np.mean(corners, axis=0)
    is_white_bg = (
        np.all(mean_corner > 215)
        and max([np.linalg.norm(c - mean_corner) for c in corners]) < 40
    )

    if is_white_bg:
        # floodFill desde los 4 vértices para capturar todo el fondo exterior sin tocar el contenido interior
        mask = np.zeros((h + 2, w + 2), dtype=np.uint8)
        flood_img = np.copy(original_rgb)
        diff = (30, 30, 30)
        for pt in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
            cv2.floodFill(
                flood_img,
                mask,
                pt,
                (0, 0, 0),
                diff,
                diff,
                flags=4 | cv2.FLOODFILL_MASK_ONLY | (255 << 8),
            )

        flood_bg = mask[1 : h + 1, 1 : w + 1] == 255
        alpha[flood_bg] = 0

    # 2. Umbralización estricta: cualquier opacidad suave residual (<160) se descarta
    alpha = np.where(alpha >= 160, alpha, 0).astype(np.uint8)

    # 3. Defringing morfológico: erosión de 1px para erradicar el halo blanco exterior
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    alpha = cv2.erode(alpha, kernel, iterations=1)

    # 4. Eliminación de píxeles periféricos casi blancos pegados a la zona transparente
    white_pixels = (
        (rgb[:, :, 0] > 220) & (rgb[:, :, 1] > 220) & (rgb[:, :, 2] > 220)
    )
    transparent_area = (alpha == 0).astype(np.uint8)
    near_transparent = cv2.dilate(transparent_area, kernel, iterations=2).astype(bool)
    alpha[white_pixels & near_transparent] = 0

    # 5. Forzar negro puro en zonas transparentes para que VTracer no dibuje ningún residuo
    clean_rgb = np.copy(rgb)
    clean_rgb[alpha == 0] = [0, 0, 0]

    return Image.fromarray(np.dstack([clean_rgb, alpha]))


def step_a_remove_background(image: Image.Image) -> Image.Image:
    """Paso A: Elimina el fondo de la imagen utilizando rembg (IA) con purificación de bordes.

    - Aplica rembg con post-procesamiento de máscara.
    - Purifica la máscara alfa eliminando halos blancos y residuos periféricos.
    Devuelve una imagen en formato RGBA con fondo 100% transparente.
    """
    logger.info("Paso A: Ejecutando remoción de fondo con rembg...")
    session = get_rembg_session()

    original_rgb = np.array(image.convert("RGB"))
    result = remove(
        image,
        session=session,
        post_process_mask=True,
    )
    result_rgba = result.convert("RGBA")

    # Purificar la máscara alfa eliminando halos blancos y residuos
    refined_rgba = clean_and_refine_alpha_matte(result_rgba, original_rgb)
    return refined_rgba


def step_b_quantize_kmeans(image: Image.Image, color_count: int) -> Image.Image:
    """Paso B: Cuantización de color mediante K-Means de scikit-learn.

    - Agrupa los colores de la imagen en exactamente `color_count` centroides.
    - Preserva el canal Alfa (transparencia) aplicando el clustering únicamente a píxeles visibles.
    - Esencial para diseño de logotipos, serigrafía y trazado vectorial limpio.
    """
    logger.info(f"Paso B: Aplicando cuantización K-Means a {color_count} colores...")
    img_arr = np.array(image)
    has_alpha = len(img_arr.shape) == 3 and img_arr.shape[2] == 4

    if has_alpha:
        rgb = img_arr[:, :, :3]
        alpha = img_arr[:, :, 3]
        mask = alpha > 0
        if np.count_nonzero(mask) == 0:
            return image
        pixels_to_cluster = rgb[mask]
    else:
        rgb = img_arr[:, :, :3] if len(img_arr.shape) == 3 else img_arr
        alpha = None
        pixels_to_cluster = rgb.reshape(-1, 3)

    n_samples = len(pixels_to_cluster)
    if n_samples == 0:
        return image

    k = min(color_count, n_samples)
    kmeans = KMeans(n_clusters=k, random_state=42, n_init="auto", max_iter=20)
    labels = kmeans.fit_predict(pixels_to_cluster)
    centers = np.clip(kmeans.cluster_centers_, 0, 255).astype(np.uint8)
    quantized_pixels = centers[labels]

    if has_alpha and alpha is not None:
        out_rgb = np.copy(rgb)
        out_rgb[mask] = quantized_pixels
        out_rgb[alpha == 0] = [0, 0, 0]
        final_arr = np.dstack([out_rgb, alpha])
    else:
        final_arr = quantized_pixels.reshape(rgb.shape)

    return Image.fromarray(final_arr)


def apply_mean_shift_smoothing(image: Image.Image) -> Image.Image:
    """Suavizado Mean Shift con OpenCV cuando no se fuerza una paleta K-Means fija.

    Aflana texturas y degradados complejos en plastas sólidas de color manteniendo bordes.
    """
    img_arr = np.array(image)
    has_alpha = len(img_arr.shape) == 3 and img_arr.shape[2] == 4

    if has_alpha:
        bgr = cv2.cvtColor(img_arr[:, :, :3], cv2.COLOR_RGB2BGR)
        alpha = img_arr[:, :, 3]
    elif len(img_arr.shape) == 3 and img_arr.shape[2] == 3:
        bgr = cv2.cvtColor(img_arr, cv2.COLOR_RGB2BGR)
        alpha = None
    else:
        bgr = cv2.cvtColor(img_arr, cv2.COLOR_GRAY2BGR)
        alpha = None

    rgb_for_filter = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    filtered_rgb = cv2.pyrMeanShiftFiltering(rgb_for_filter, sp=15, sr=40)

    if has_alpha and alpha is not None:
        # Prevenir contaminación de color en píxeles transparentes
        filtered_rgb[alpha == 0] = [0, 0, 0]
        processed = np.dstack([filtered_rgb, alpha])
    else:
        processed = filtered_rgb

    return Image.fromarray(processed)


def step_c_vectorize(
    image_path: str,
    output_svg_path: str,
    detail_level: DetailLevel,
) -> None:
    """Paso C: Vectorización dinámica con vtracer adaptada al nivel de detalle solicitado.

    - 'low': filter_speckle=10, color_precision=3, mode='polygon' (ideal para logos planos).
    - 'medium': filter_speckle=4, color_precision=6, mode='spline' (equilibrado).
    - 'high': filter_speckle=1, color_precision=8, mode='spline' (arte complejo o fotos).
    """
    logger.info(f"Paso C: Vectorizando con VTracer en modo detail_level='{detail_level.value}'...")

    if detail_level == DetailLevel.LOW:
        filter_speckle = 10
        color_precision = 3
        mode = "polygon"
    elif detail_level == DetailLevel.HIGH:
        filter_speckle = 1
        color_precision = 8
        mode = "spline"
    else:
        filter_speckle = 4
        color_precision = 6
        mode = "spline"

    vtracer.convert_image_to_svg_py(
        image_path,
        output_svg_path,
        colormode="color",
        hierarchical="stacked",
        mode=mode,
        filter_speckle=filter_speckle,
        color_precision=color_precision,
        layer_difference=16,
        corner_threshold=60,
        length_threshold=4.0,
        max_iterations=10,
        splice_threshold=45,
        path_precision=8,
    )


# ---------------------------------------------------------------------------
# Endpoints de la API
# ---------------------------------------------------------------------------


@app.get(
    "/",
    tags=["Comprobación de Estado"],
    summary="Verificar estado de la API",
    response_description="Estado operativo actual del backend",
)
async def root() -> dict[str, str]:
    """Endpoint de comprobación de salud para verificar la disponibilidad del backend de TraceAI."""
    return {"status": "TraceAI Backend API Online"}


@app.post(
    "/api/vectorize",
    tags=["Vectorización"],
    summary="Pipeline profesional de vectorización a SVG",
    response_description="Archivo vectorial SVG generado exitosamente",
    responses={
        200: {
            "description": "Vectorización completada exitosamente. Devuelve el archivo SVG listo para descarga o renderizado.",
            "content": {"image/svg+xml": {}},
        },
        400: {
            "description": "Petición inválida: archivo vacío, extensión no permitida o contenido que no corresponde a una imagen válida.",
        },
        413: {
            "description": "Archivo demasiado pesado: excede el límite máximo permitido de 15 MB.",
        },
        500: {
            "description": "Error interno del servidor: fallo en alguna fase del pipeline de IA o vectorización.",
        },
    },
)
async def vectorize_image(
    background_tasks: BackgroundTasks,
    options: VectorizeOptions = Depends(VectorizeOptions.as_form),
    file: UploadFile = File(
        ...,
        description="Archivo de imagen rasterizada a procesar y vectorizar (formatos: PNG, JPG, JPEG, WEBP, BMP; máx. 15 MB).",
    ),
) -> FileResponse:
    """Orquesta el pipeline profesional de procesamiento y vectorización de imágenes.

    1. **Validaciones de Seguridad:** Comprobación de formato, tamaño y cabeceras binarias (*magic bytes*).
    2. **Paso A (Eliminación de fondo con IA):** Si `remove_background` es verdadero, aísla el sujeto principal y hace transparente el fondo (`rembg`).
    3. **Paso B (Cuantización K-Means / Suavizado):** Si `color_count > 0`, reduce la paleta exactamente a esa cantidad de colores con `KMeans`. Si es 0, aplica agrupamiento Mean Shift para evitar degradados irregulares.
    4. **Paso C (Vectorización Dinámica con VTracer):** Aplica la configuración óptima según `detail_level` ('low', 'medium', 'high').
    5. **Limpieza Asíncrona:** Elimina todos los archivos temporales generados una vez que el SVG ha sido enviado al cliente.
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nombre de archivo inválido o vacío.",
        )

    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Formato no permitido ('{file_ext}'). "
                f"Formatos soportados: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
            ),
        )

    if file.content_type and file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tipo MIME no válido: '{file.content_type}'.",
        )

    input_temp_path: Optional[str] = None
    processed_temp_path: Optional[str] = None
    output_svg_path: Optional[str] = None

    try:
        # Guardar archivo original en ubicación temporal segura
        with tempfile.NamedTemporaryFile(suffix=file_ext, delete=False) as temp_input:
            input_temp_path = temp_input.name
            total_bytes = 0
            header_validated = False

            while chunk := await file.read(CHUNK_SIZE):
                if not header_validated:
                    if not validate_image_header(chunk):
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="El contenido del archivo no corresponde a una imagen válida o está dañado.",
                        )
                    header_validated = True

                total_bytes += len(chunk)
                if total_bytes > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="El archivo excede el tamaño máximo permitido (15 MB).",
                    )

                temp_input.write(chunk)

            if total_bytes == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="El archivo proporcionado está vacío.",
                )

        logger.info(
            f"Iniciando pipeline para '{file.filename}' ({total_bytes} bytes). "
            f"Opciones: remove_background={options.remove_background}, "
            f"color_count={options.color_count}, detail_level={options.detail_level.value}"
        )

        # Cargar imagen en memoria con Pillow
        with Image.open(input_temp_path) as loaded_img:
            current_image = loaded_img.convert("RGBA" if options.remove_background or loaded_img.mode == "RGBA" else "RGB")

        # Paso A: Remover fondo si se solicitó
        if options.remove_background:
            current_image = step_a_remove_background(current_image)

        # Paso B: Cuantización de color K-Means o suavizado Mean Shift
        if options.color_count > 0:
            current_image = step_b_quantize_kmeans(current_image, options.color_count)
        else:
            current_image = apply_mean_shift_smoothing(current_image)

        # Guardar imagen procesada intermedia para VTracer
        output_img_ext = ".png" if current_image.mode == "RGBA" else file_ext
        with tempfile.NamedTemporaryFile(suffix=f"_processed{output_img_ext}", delete=False) as temp_proc:
            processed_temp_path = temp_proc.name
            current_image.save(processed_temp_path)

        # Paso C: Vectorización dinámica con VTracer
        output_svg_path = f"{processed_temp_path}.svg"
        step_c_vectorize(processed_temp_path, output_svg_path, options.detail_level)

        if not os.path.exists(output_svg_path) or os.path.getsize(output_svg_path) == 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="El motor de vectorización no pudo generar un archivo SVG válido.",
            )

        # Programar limpieza asíncrona de todos los archivos temporales
        background_tasks.add_task(
            cleanup_files, input_temp_path, processed_temp_path, output_svg_path
        )

        # Nombre de descarga seguro
        safe_stem = re.sub(r"[^\w\-]", "_", Path(file.filename).stem) or "vectorizado"
        download_filename = f"{safe_stem}.svg"

        return FileResponse(
            path=output_svg_path,
            media_type="image/svg+xml",
            filename=download_filename,
            headers={
                "Content-Disposition": f'attachment; filename="{download_filename}"'
            },
        )

    except HTTPException:
        cleanup_files(input_temp_path, processed_temp_path, output_svg_path)
        raise

    except Exception as exc:
        cleanup_files(input_temp_path, processed_temp_path, output_svg_path)
        logger.error(f"Error en el pipeline de vectorización: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Fallo en el pipeline de IA y vectorización: {str(exc)}",
        ) from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
