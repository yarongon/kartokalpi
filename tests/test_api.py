from fastapi.testclient import TestClient

from src.backend.data_repository import get_repository
from src.backend.main import app


client = TestClient(app)


def test_healthcheck() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_elections_endpoint_returns_parties() -> None:
    response = client.get("/api/elections")
    assert response.status_code == 200
    payload = response.json()
    assert payload["elections"]
    latest = payload["elections"][0]
    assert latest["knesset_number"] == 25
    assert latest["parties"]
    assert {"party_name", "party_sign", "mandates"}.issubset(latest["parties"][0])


def test_map_markers_endpoint_returns_marker_stats() -> None:
    repository = get_repository()
    election = repository.election_numbers[-1]
    party_sign = repository.parties[repository.parties["knesset_number"] == election].iloc[0]["party_sign"]

    response = client.get(
        "/api/map-markers",
        params={"knesset_number": election, "party_sign": party_sign},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["markers"]
    marker = payload["markers"][0]
    assert {"location_id", "latitude", "longitude", "stats", "top_parties", "ballots"}.issubset(marker)
    assert {"total_voters", "valid_votes", "party_vote_share"}.issubset(marker["stats"])


def test_map_markers_endpoint_filters_by_bounds() -> None:
    repository = get_repository()
    election = repository.election_numbers[-1]
    location = repository.locations.iloc[0]

    response = client.get(
        "/api/map-markers",
        params={
            "knesset_number": election,
            "min_lat": float(location["latitude"]) - 0.0001,
            "max_lat": float(location["latitude"]) + 0.0001,
            "min_lng": float(location["longitude"]) - 0.0001,
            "max_lng": float(location["longitude"]) + 0.0001,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["markers"]
    assert len(payload["markers"]) == 1
    assert payload["markers"][0]["location_id"] == location["location_id"]


def test_trends_endpoint_returns_series() -> None:
    repository = get_repository()
    election = repository.election_numbers[-1]
    party_sign = repository.parties[repository.parties["knesset_number"] == election].iloc[0]["party_sign"]
    locations = repository.locations["location_id"].head(3).tolist()

    response = client.get("/api/trends", params=[("party_sign", party_sign), *[("location_ids", location_id) for location_id in locations]])
    assert response.status_code == 200
    payload = response.json()
    assert payload["series"]
    assert payload["series"][0]["knesset_number"] == 18
    assert payload["selection"]["location_count"] == len(locations)