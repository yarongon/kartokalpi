from __future__ import annotations

from pathlib import Path

from fastapi import Depends, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .data_repository import ROOT_DIR, DataRepository, get_repository


app = FastAPI(
    title="Karto-Kalpi API",
    description="Explore Israeli Knesset election results through a map-friendly API.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/elections")
def list_elections(repository: DataRepository = Depends(get_repository)) -> dict[str, object]:
    return {"elections": repository.get_elections()}


@app.get("/api/map-markers")
def list_map_markers(
    knesset_number: int,
    party_sign: str | None = None,
    min_lat: float | None = None,
    max_lat: float | None = None,
    min_lng: float | None = None,
    max_lng: float | None = None,
    repository: DataRepository = Depends(get_repository),
) -> dict[str, object]:
    return {
        "knesset_number": knesset_number,
        "party_sign": party_sign,
        "markers": repository.get_map_markers(
            knesset_number=knesset_number,
            party_sign=party_sign,
            min_lat=min_lat,
            max_lat=max_lat,
            min_lng=min_lng,
            max_lng=max_lng,
        ),
    }


@app.get("/api/trends")
def get_party_trend(
    party_sign: str,
    location_ids: list[str] = Query(default=[]),
    repository: DataRepository = Depends(get_repository),
) -> dict[str, object]:
    return repository.get_trend(party_sign=party_sign, location_ids=location_ids)


frontend_dist = ROOT_DIR / "src" / "frontend" / "dist"
if frontend_dist.exists():
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")