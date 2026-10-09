"""TraceAI Backend API.

FastAPI application for AI-powered image vectorization service.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="TraceAI API",
    description="Backend API for TraceAI - Image to SVG Vectorization SaaS",
    version="0.1.0",
)

# Enable CORS for all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["Health Check"])
async def root() -> dict[str, str]:
    """Health check endpoint to verify backend status."""
    return {"status": "TraceAI Backend API Online"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
