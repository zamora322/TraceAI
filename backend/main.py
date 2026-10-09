"""TraceAI Backend API.

FastAPI application for AI-powered image vectorization service.
Converts bitmap images (PNG, JPG, WEBP, BMP) into scalable vector graphics (SVG).
"""

import logging
import os
import re
import tempfile
from pathlib import Path
from typing import Optional

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

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("traceai.api")

app = FastAPI(
    title="TraceAI API",
    description="Backend API for TraceAI - Image to SVG Vectorization SaaS",
    version="0.1.0",
)

# Enable CORS for frontend clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Constants & Security Configurations
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
ALLOWED_MIME_TYPES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/bmp",
    "image/x-ms-bmp",
}
MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB limit
CHUNK_SIZE = 1024 * 1024  # 1 MB chunk


def cleanup_files(*paths: Optional[str]) -> None:
    """Helper function to remove temporary files after response is sent."""
    for path in paths:
        if path and os.path.exists(path):
            try:
                os.remove(path)
                logger.info(f"Temporary file cleaned up: {path}")
            except OSError as exc:
                logger.warning(f"Error deleting temporary file '{path}': {exc}")


def validate_image_header(header: bytes) -> bool:
    """Validate binary magic bytes to ensure file is genuinely an image."""
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return True
    if header.startswith(b"\xff\xd8\xff"):
        return True
    if header.startswith(b"RIFF") and len(header) >= 12 and header[8:12] == b"WEBP":
        return True
    if header.startswith(b"BM"):
        return True
    return False


@app.get("/", tags=["Health Check"])
async def root() -> dict[str, str]:
    """Health check endpoint to verify backend status."""
    return {"status": "TraceAI Backend API Online"}


@app.post("/api/vectorize", tags=["Vectorization"])
async def vectorize_image(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="Imagen a vectorizar (PNG, JPG, JPEG, WEBP, BMP)"),
) -> FileResponse:
    """Convert an uploaded raster image to SVG vector format.

    - Validates file format, MIME type, size, and binary magic bytes.
    - Saves image to a secure temporary file.
    - Converts to SVG using vtracer with spline curves and noise filtering.
    - Cleans up temporary files asynchronously via BackgroundTasks.
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
    output_svg_path: Optional[str] = None

    try:
        # Create a secure temporary file on disk for the input image
        with tempfile.NamedTemporaryFile(suffix=file_ext, delete=False) as temp_input:
            input_temp_path = temp_input.name
            total_bytes = 0
            header_validated = False

            while chunk := await file.read(CHUNK_SIZE):
                if not header_validated:
                    if not validate_image_header(chunk):
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="El contenido del archivo no corresponde a una imagen válida.",
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

        # Define temporary destination path for generated SVG
        output_svg_path = f"{input_temp_path}.svg"

        # Execute vectorization with professional settings
        logger.info(f"Vectorizing image: {file.filename} ({total_bytes} bytes)")
        vtracer.convert_image_to_svg_py(
            input_temp_path,
            output_svg_path,
            colormode="color",
            hierarchical="stacked",
            mode="spline",
            filter_speckle=4,
            color_precision=6,
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

        # Register asynchronous cleanup of temporary files
        background_tasks.add_task(cleanup_files, input_temp_path, output_svg_path)

        # Generate safe filename for client download
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
        # Cleanup temporary files immediately on HTTP exceptions
        cleanup_files(input_temp_path, output_svg_path)
        raise

    except Exception as exc:
        # Cleanup temporary files and report engine failure
        cleanup_files(input_temp_path, output_svg_path)
        logger.error(f"Error during vectorization: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Fallo en el motor de vectorización: {str(exc)}",
        ) from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
