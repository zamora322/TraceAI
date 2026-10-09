"""API Backend de TraceAI.

Aplicación FastAPI para el servicio SaaS de vectorización de imágenes impulsado por IA.
Convierte imágenes de mapa de bits (PNG, JPG, WEBP, BMP) en gráficos vectoriales escalables (SVG).
"""

import logging
import os
import re
import tempfile
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import vtracer
from fastapi import (
    BackgroundTasks,
    FastAPI,
    File,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

# Configuración de registro (logging)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("traceai.api")

tags_metadata = [
    {
        "name": "Vectorización",
        "description": "Operaciones para transformar imágenes de mapa de bits a gráficos vectoriales SVG escalables.",
    },
    {
        "name": "Comprobación de Estado",
        "description": "Endpoints de diagnóstico y monitoreo de salud del servicio.",
    },
]

app = FastAPI(
    title="TraceAI API",
    description="API backend de TraceAI - Servicio SaaS de vectorización inteligente de imágenes a SVG.",
    version="0.1.0",
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
MAX_FILE_SIZE = 15 * 1024 * 1024  # Límite de 15 MB
CHUNK_SIZE = 1024 * 1024  # Fragmentos de 1 MB


def cleanup_files(*paths: Optional[str]) -> None:
    """Función auxiliar para eliminar archivos temporales de forma segura tras enviar la respuesta."""
    for path in paths:
        if path and os.path.exists(path):
            try:
                os.remove(path)
                logger.info(f"Archivo temporal eliminado correctamente: {path}")
            except OSError as exc:
                logger.warning(f"Error al eliminar archivo temporal '{path}': {exc}")


def validate_image_header(header: bytes) -> bool:
    """Valida los bytes mágicos iniciales para verificar que el archivo sea una imagen real."""
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return True
    if header.startswith(b"\xff\xd8\xff"):
        return True
    if header.startswith(b"RIFF") and len(header) >= 12 and header[8:12] == b"WEBP":
        return True
    if header.startswith(b"BM"):
        return True
    return False


def preprocess_image(input_path: str, output_path: str) -> None:
    """Preprocesa la imagen usando Mean Shift Filtering (cv2.pyrMeanShiftFiltering).

    - Convierte el espacio de color de BGR a RGB para no invertir tonalidades.
    - Aplica agrupamiento de colores (Mean Shift Segmentation) con sp=15 y sr=40
      para aplanar texturas y gradientes complejos en regiones de colores sólidos (estilo Vector Magic).
    - Preserva el canal alfa (transparencia) si la imagen contiene canal Alpha.
    - Convierte de RGB a BGR antes del guardado para mantener la fidelidad cromática con cv2.imwrite.
    """
    img = cv2.imread(input_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"No fue posible cargar la imagen con OpenCV desde '{input_path}'.")

    has_alpha = False
    alpha = None

    if len(img.shape) == 3 and img.shape[2] == 4:
        has_alpha = True
        bgr = img[:, :, :3]
        alpha = img[:, :, 3]
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    elif len(img.shape) == 3 and img.shape[2] == 3:
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    elif len(img.shape) == 2:
        rgb = cv2.cvtColor(img, cv2.COLOR_GRAY2RGB)
    else:
        raise ValueError(f"Estructura o canales de imagen no soportados: {img.shape}")

    # Agrupamiento de colores con Mean Shift Filtering (sp=15 radio espacial, sr=40 radio de color)
    filtered_rgb = cv2.pyrMeanShiftFiltering(rgb, sp=15, sr=40)

    # Conversión de vuelta a BGR para guardar fielmente mediante cv2.imwrite
    filtered_bgr = cv2.cvtColor(filtered_rgb, cv2.COLOR_RGB2BGR)

    if has_alpha and alpha is not None:
        processed = cv2.merge([
            filtered_bgr[:, :, 0],
            filtered_bgr[:, :, 1],
            filtered_bgr[:, :, 2],
            alpha,
        ])
    else:
        processed = filtered_bgr

    success = cv2.imwrite(output_path, processed)
    if not success:
        raise IOError(f"No fue posible guardar la imagen preprocesada en '{output_path}'.")


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
    summary="Vectorizar imagen a SVG",
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
            "description": "Error interno del servidor: fallo en el preprocesamiento de OpenCV o en el motor de vectorización.",
        },
    },
)
async def vectorize_image(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(
        ...,
        description="Archivo de imagen rasterizada a vectorizar (formatos soportados: PNG, JPG, JPEG, WEBP, BMP; máx. 15 MB)",
    ),
) -> FileResponse:
    """Convierte una imagen de mapa de bits (rasterizada) a formato vectorial SVG de alta precisión.

    - **Validaciones de Seguridad:** Comprueba extensión permitida, tipo MIME, tamaño y firmas binarias (*magic bytes*).
    - **Almacenamiento Temporal Seguro:** Guarda la imagen temporalmente en disco mediante un identificador seguro.
    - **Preprocesamiento con Mean Shift (OpenCV):** Agrupamiento de color con `pyrMeanShiftFiltering` (sp=15, sr=40) para transformar degradados y texturas complejas en regiones sólidas y limpias, preservando el canal Alpha.
    - **Vectorización Optimizada (`vtracer`):** Configurado con `filter_speckle=10` para descartar artefactos pequeños, `color_precision=4` y modo `spline` para curvas Bézier exactas.
    - **Limpieza Automática:** Tarea en segundo plano (*BackgroundTasks*) que elimina de inmediato los archivos temporales tras la transmisión al cliente.
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
    preprocessed_temp_path: Optional[str] = None
    output_svg_path: Optional[str] = None

    try:
        # Crear archivo temporal seguro en disco para la imagen de entrada
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

        # Generar ruta temporal para la imagen preprocesada con OpenCV
        preprocessed_temp_path = f"{input_temp_path}_preprocessed{file_ext}"

        # Ejecutar preprocesamiento con OpenCV (Filtro bilateral + Afilado de bordes)
        logger.info(f"Preprocesando imagen con OpenCV: {file.filename}")
        preprocess_image(input_temp_path, preprocessed_temp_path)

        # Ruta temporal de destino para el archivo SVG resultante
        output_svg_path = f"{input_temp_path}.svg"

        # Ejecutar proceso de vectorización con la imagen preprocesada
        logger.info(f"Vectorizando imagen con vtracer: {file.filename} ({total_bytes} bytes)")
        vtracer.convert_image_to_svg_py(
            preprocessed_temp_path,
            output_svg_path,
            colormode="color",
            hierarchical="stacked",
            mode="spline",
            filter_speckle=10,
            color_precision=4,
            layer_difference=16,
            corner_threshold=60,
            length_threshold=4.0,
            max_iterations=10,
            splice_threshold=45,
            path_precision=8,
        )

        if not os.path.exists(output_svg_path) or os.path.getsize(output_svg_path) == 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="El motor de vectorización no pudo generar un archivo SVG válido.",
            )

        # Programar la limpieza asíncrona de todos los archivos temporales tras el envío
        background_tasks.add_task(
            cleanup_files, input_temp_path, preprocessed_temp_path, output_svg_path
        )

        # Generar nombre de descarga seguro
        safe_stem = re.sub(r"[^\w\-]", "_", Path(file.filename).stem) or "vectorized"
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
        # En caso de error HTTP, limpiar temporales inmediatamente
        cleanup_files(input_temp_path, preprocessed_temp_path, output_svg_path)
        raise

    except Exception as exc:
        # En caso de excepción no controlada, limpiar temporales y reportar error
        cleanup_files(input_temp_path, preprocessed_temp_path, output_svg_path)
        logger.error(f"Error durante el procesamiento o vectorización: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Fallo en el procesamiento o vectorización: {str(exc)}",
        ) from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
