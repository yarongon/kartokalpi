"""Geocoding utilities for mapping location names to coordinates."""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Optional, Tuple, Dict

import httpx


class GeocodingService:
    """Provides cached geocoding with optional remote lookup."""

    def __init__(
        self,
        cache_path: Path,
        enable_remote: Optional[bool] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        self.cache_path = cache_path
        self.cache: Dict[str, Tuple[float, float]] = {}
        self.lock = asyncio.Lock()
        self.enable_remote = (
            enable_remote
            if enable_remote is not None
            else os.getenv("ENABLE_GEOCODING", "0") == "1"
        )
        self.user_agent = user_agent or os.getenv(
            "GEOCODING_USER_AGENT", "kartokalpi/0.1"
        )
        self._load_cache()

    def _load_cache(self) -> None:
        if not self.cache_path.exists():
            return
        try:
            data = json.loads(self.cache_path.read_text(encoding="utf-8"))
            self.cache = {
                name: (float(coords[0]), float(coords[1]))
                for name, coords in data.items()
                if isinstance(coords, (list, tuple)) and len(coords) == 2
            }
        except Exception:
            self.cache = {}

    def _save_cache(self) -> None:
        try:
            serialized = {k: [v[0], v[1]] for k, v in self.cache.items()}
            self.cache_path.write_text(
                json.dumps(serialized, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except Exception:
            pass

    async def get_coordinates(self, location_name: str) -> Optional[Tuple[float, float]]:
        """Get coordinates for a location name, using cache and optional remote lookup."""
        if location_name in self.cache:
            return self.cache[location_name]

        if not self.enable_remote:
            return None

        async with self.lock:
            if location_name in self.cache:
                return self.cache[location_name]

            coords = await self._fetch_from_nominatim(location_name)
            if coords:
                self.cache[location_name] = coords
                self._save_cache()
            return coords

    async def _fetch_from_nominatim(self, location_name: str) -> Optional[Tuple[float, float]]:
        """Fetch coordinates from OpenStreetMap Nominatim API."""
        query = f"{location_name}, ישראל"
        url = "https://nominatim.openstreetmap.org/search"
        params = {"q": query, "format": "json", "limit": 1}

        async with httpx.AsyncClient(timeout=10.0, verify=False) as client:
            response = await client.get(
                url,
                params=params,
                headers={"User-Agent": self.user_agent},
            )
            response.raise_for_status()
            results = response.json()

        if not results:
            return None

        lat = float(results[0]["lat"])
        lon = float(results[0]["lon"])
        # Respect Nominatim usage policy
        await asyncio.sleep(1)
        return (lat, lon)

    async def get_address_coordinates(self, address: str, location_name: str = "") -> Optional[Tuple[float, float]]:
        """Get coordinates for a full address string.

        Args:
            address: Street address or location name
            location_name: City/location name for fallback if address fails
            
        Returns:
            (latitude, longitude) tuple or None if not found
        """
        # Try exact address first
        cached_addr = self.cache.get(address)
        if cached_addr:
            return cached_addr
        
        if not self.enable_remote:
            # Fall back to location name if address lookup is disabled
            return await self.get_coordinates(location_name) if location_name else None
        
        async with self.lock:
            # Double-check cache after acquiring lock
            cached_addr = self.cache.get(address)
            if cached_addr:
                return cached_addr
            
            # Try full address query
            coords = await self._fetch_from_nominatim(f"{address}, {location_name}, Israel")
            if coords:
                self.cache[address] = coords
                self._save_cache()
                return coords
            
            # Fall back to location name only
            coords = await self.get_coordinates(location_name)
            if coords:
                self.cache[address] = coords
                self._save_cache()
            return coords
