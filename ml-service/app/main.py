"""
Pure computation service: every hand-rolled predictive/analytics algorithm
from the original monolith backend (flight risk, sentiment/Tier-0, anomaly
detection, headcount forecast, ONA graph, compensation sandbox, shift
optimization, resource reallocation) lives here. It never touches Supabase —
the backend fetches data, POSTs it here as JSON, and gets the computed
result back. This is not exposed to the public internet; only the backend
container talks to it (see docker-compose.yml — no published host port).

Ported 1:1 from server.ts (Express) to FastAPI.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import CORS_ORIGIN
from app.routes.ml_routes import router as ml_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("hr-intel-ml-service")

app = FastAPI(title="hr-intel-ml-service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[CORS_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=400, content={"error": exc.errors()})


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, exc: Exception):
    logger.exception("Unhandled error")
    return JSONResponse(status_code=500, content={"error": str(exc) or "Internal server error"})


@app.get("/health")
def health():
    return {"ok": True, "service": "hr-intel-ml-service"}


app.include_router(ml_router)
