from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd


ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT_DIR / "data"


def _normalize_locality_id(value: Any) -> str:
    if pd.isna(value):
        return ""
    text = str(value).strip()
    if not text:
        return ""
    try:
        return str(int(float(text)))
    except ValueError:
        return text


def _normalize_kalpi_id(value: Any) -> str:
    if pd.isna(value):
        return ""
    text = str(value).strip()
    if not text:
        return ""
    if text.endswith(".0"):
        return text[:-2]
    return text


def _parse_coordinates(value: Any) -> tuple[float | None, float | None]:
    if pd.isna(value):
        return (None, None)
    match = re.search(r"\(\s*([-0-9.]+)\s*,\s*([-0-9.]+)\s*\)", str(value))
    if not match:
        return (None, None)
    return (float(match.group(1)), float(match.group(2)))


def _numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce").fillna(0)


class DataRepository:
    """Loads and aggregates election data for the API layer."""

    def __init__(self, data_dir: Path = DATA_DIR) -> None:
        self.data_dir = data_dir
        self._load()

    def _load(self) -> None:
        self.parties = self._load_parties()
        self.addresses = self._load_addresses()
        self.turnout = self._load_turnout()
        self.votes = self._load_votes()
        self.addresses, self.locations, self.ballots_by_location = self._build_locations()
        self.location_turnout = self._build_location_turnout()
        self.location_party_votes = self._build_location_party_votes()
        self.election_numbers = sorted(
            self.parties["knesset_number"].dropna().astype(int).unique().tolist()
        )

    def _load_parties(self) -> pd.DataFrame:
        frame = pd.read_csv(self.data_dir / "knesset_election_results_18_to_25.csv")
        frame["knesset_number"] = _numeric(frame["knesset_number"]).astype(int)
        frame["mandates"] = _numeric(frame["mandates"]).astype(int)
        frame["party_sign"] = frame["party_sign"].fillna("").astype(str).str.strip()
        frame["party_name"] = frame["party_name"].fillna("").astype(str).str.strip()
        return frame.sort_values(["knesset_number", "mandates"], ascending=[True, False])

    def _load_addresses(self) -> pd.DataFrame:
        frame = pd.read_csv(self.data_dir / "kalpi_address_with_coords.csv")
        frame["locality_key"] = frame["locality_id"].map(_normalize_locality_id)
        frame["kalpi_key"] = frame["kalpi_id"].map(_normalize_kalpi_id)
        coords = frame["coordinates"].map(_parse_coordinates)
        frame["latitude"] = coords.map(lambda pair: pair[0])
        frame["longitude"] = coords.map(lambda pair: pair[1])
        frame["locality_name"] = frame["locality_name"].fillna("").astype(str).str.strip()
        frame["kalpi_address"] = frame["kalpi_address"].fillna("").astype(str).str.strip()
        frame["kalpi_location"] = frame["kalpi_location"].fillna("").astype(str).str.strip()
        frame = frame.dropna(subset=["latitude", "longitude"])
        return frame

    def _find_column(self, columns: pd.Index, *candidates: str) -> str:
        stripped = {str(column).strip(): column for column in columns}
        for candidate in candidates:
            if candidate in stripped:
                return stripped[candidate]
        raise KeyError(f"Missing required columns. Tried: {candidates}")

    def _load_turnout(self) -> pd.DataFrame:
        frames: list[pd.DataFrame] = []
        for path in sorted((self.data_dir / "original_data").glob("elections_*_results_utf8.csv")):
            match = re.search(r"elections_(\d+)_results_utf8\.csv", path.name)
            if not match:
                continue
            knesset_number = int(match.group(1))
            frame = pd.read_csv(path)
            locality_id_column = self._find_column(frame.columns, "סמל ישוב")
            locality_name_column = self._find_column(frame.columns, "שם ישוב")
            kalpi_id_column = self._find_column(frame.columns, "קלפי", "מספר קלפי", "סמל קלפי")
            registered_column = self._find_column(frame.columns, "בזב", "בז''ב")
            voters_column = self._find_column(frame.columns, "מצביעים")
            valid_column = self._find_column(frame.columns, "כשרים")
            invalid_column = self._find_column(frame.columns, "פסולים")

            subset = frame[
                [
                    locality_id_column,
                    locality_name_column,
                    kalpi_id_column,
                    registered_column,
                    voters_column,
                    valid_column,
                    invalid_column,
                ]
            ].copy()
            subset.columns = [
                "locality_id",
                "locality_name",
                "kalpi_id",
                "registered_voters",
                "total_voters",
                "valid_votes",
                "invalid_votes",
            ]
            subset["knesset_number"] = knesset_number
            subset["locality_key"] = subset["locality_id"].map(_normalize_locality_id)
            subset["kalpi_key"] = subset["kalpi_id"].map(_normalize_kalpi_id)
            for column in ["registered_voters", "total_voters", "valid_votes", "invalid_votes"]:
                subset[column] = _numeric(subset[column]).astype(int)
            frames.append(subset)

        if not frames:
            return pd.DataFrame(
                columns=[
                    "locality_id",
                    "locality_name",
                    "kalpi_id",
                    "registered_voters",
                    "total_voters",
                    "valid_votes",
                    "invalid_votes",
                    "knesset_number",
                    "locality_key",
                    "kalpi_key",
                ]
            )
        return pd.concat(frames, ignore_index=True)

    def _load_votes(self) -> pd.DataFrame:
        frame = pd.read_csv(self.data_dir / "normalized_election_results_18_to_25.csv")
        frame["knesset_number"] = _numeric(frame["knesset_number"]).astype(int)
        frame["votes"] = _numeric(frame["votes"]).astype(int)
        frame["party_sign"] = frame["party_sign"].fillna("").astype(str).str.strip()
        frame["locality_key"] = frame["locality_id"].map(_normalize_locality_id)
        frame["kalpi_key"] = frame["kalpi_id"].map(_normalize_kalpi_id)
        return frame

    def _build_locations(
        self,
    ) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, list[dict[str, str]]]]:
        addresses = self.addresses.copy().sort_values(
            ["locality_key", "kalpi_location", "latitude", "longitude", "kalpi_key"]
        )
        group_columns = ["locality_key", "kalpi_location", "latitude", "longitude"]
        addresses["location_id"] = (
            addresses.groupby(group_columns, dropna=False).ngroup().map(lambda idx: f"loc-{idx}")
        )

        ballot_rows = addresses[
            ["location_id", "kalpi_key", "kalpi_address", "kalpi_location", "locality_name"]
        ].drop_duplicates()
        ballots_by_location: dict[str, list[dict[str, str]]] = {}
        for location_id, group in ballot_rows.groupby("location_id"):
            ballots_by_location[location_id] = [
                {
                    "kalpi_id": row["kalpi_key"],
                    "address": row["kalpi_address"],
                    "location_name": row["kalpi_location"],
                    "locality_name": row["locality_name"],
                }
                for _, row in group.iterrows()
            ]

        locations = (
            addresses.groupby("location_id", as_index=False)
            .agg(
                locality_id=("locality_id", "first"),
                locality_key=("locality_key", "first"),
                locality_name=("locality_name", "first"),
                location_name=("kalpi_location", "first"),
                address=("kalpi_address", "first"),
                latitude=("latitude", "first"),
                longitude=("longitude", "first"),
                ballot_count=("kalpi_key", "nunique"),
            )
            .sort_values(["locality_name", "location_name", "address"])
        )
        return addresses, locations, ballots_by_location

    def _build_location_turnout(self) -> pd.DataFrame:
        keys = self.addresses[["locality_key", "kalpi_key", "location_id"]].drop_duplicates()
        merged = self.turnout.merge(keys, on=["locality_key", "kalpi_key"], how="inner")
        if merged.empty:
            return pd.DataFrame(
                columns=[
                    "knesset_number",
                    "location_id",
                    "registered_voters",
                    "total_voters",
                    "valid_votes",
                    "invalid_votes",
                ]
            )
        grouped = (
            merged.groupby(["knesset_number", "location_id"], as_index=False)
            .agg(
                registered_voters=("registered_voters", "sum"),
                total_voters=("total_voters", "sum"),
                valid_votes=("valid_votes", "sum"),
                invalid_votes=("invalid_votes", "sum"),
            )
            .sort_values(["knesset_number", "location_id"])
        )
        return grouped

    def _build_location_party_votes(self) -> pd.DataFrame:
        keys = self.addresses[["locality_key", "kalpi_key", "location_id"]].drop_duplicates()
        merged = self.votes.merge(keys, on=["locality_key", "kalpi_key"], how="inner")
        grouped = (
            merged.groupby(["knesset_number", "location_id", "party_sign"], as_index=False)
            .agg(votes=("votes", "sum"))
            .sort_values(["knesset_number", "location_id", "votes"], ascending=[True, True, False])
        )
        return grouped

    def get_elections(self) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        for knesset_number in sorted(self.election_numbers, reverse=True):
            parties = self.parties[self.parties["knesset_number"] == knesset_number]
            result.append(
                {
                    "knesset_number": knesset_number,
                    "parties": parties[["party_name", "party_sign", "mandates"]].to_dict("records"),
                    "total_mandates": int(parties["mandates"].sum()),
                }
            )
        return result

    def get_map_markers(
        self,
        knesset_number: int,
        party_sign: str | None = None,
        min_lat: float | None = None,
        max_lat: float | None = None,
        min_lng: float | None = None,
        max_lng: float | None = None,
    ) -> list[dict[str, Any]]:
        base = self.locations.copy()
        if None not in (min_lat, max_lat, min_lng, max_lng):
            base = base[
                base["latitude"].between(float(min_lat), float(max_lat))
                & base["longitude"].between(float(min_lng), float(max_lng))
            ]

        if base.empty:
            return []

        scoped_location_ids = base["location_id"].tolist()

        turnout = self.location_turnout[
            (self.location_turnout["knesset_number"] == knesset_number)
            & (self.location_turnout["location_id"].isin(scoped_location_ids))
        ].drop(columns=["knesset_number"])
        base = base.merge(turnout, on="location_id", how="left")

        election_votes = self.location_party_votes[
            (self.location_party_votes["knesset_number"] == knesset_number)
            & (self.location_party_votes["location_id"].isin(scoped_location_ids))
        ].copy()
        totals = (
            election_votes.groupby("location_id", as_index=False)
            .agg(total_votes=("votes", "sum"))
            .sort_values("location_id")
        )
        base = base.merge(totals, on="location_id", how="left")

        if party_sign:
            selected_party = election_votes[election_votes["party_sign"] == party_sign][
                ["location_id", "votes"]
            ].rename(columns={"votes": "selected_party_votes"})
            base = base.merge(selected_party, on="location_id", how="left")
        else:
            base["selected_party_votes"] = 0

        top_parties = (
            election_votes.merge(
                self.parties[self.parties["knesset_number"] == knesset_number][
                    ["party_sign", "party_name"]
                ],
                on="party_sign",
                how="left",
            )
            .sort_values(["location_id", "votes"], ascending=[True, False])
            .groupby("location_id")
            .head(5)
        )
        top_parties_map: dict[str, list[dict[str, Any]]] = {}
        for location_id, group in top_parties.groupby("location_id"):
            top_parties_map[location_id] = group[
                ["party_sign", "party_name", "votes"]
            ].to_dict("records")

        history_map: dict[str, list[dict[str, Any]]] = {}
        if party_sign:
            party_votes = self.location_party_votes[
                (self.location_party_votes["party_sign"] == party_sign)
                & (self.location_party_votes["location_id"].isin(scoped_location_ids))
            ]
            party_names = self.parties[self.parties["party_sign"] == party_sign][
                ["knesset_number", "party_name"]
            ].drop_duplicates()
            party_history = party_votes.merge(party_names, on="knesset_number", how="left")
            party_history = party_history.sort_values(["location_id", "knesset_number"])
            for location_id, group in party_history.groupby("location_id"):
                history_map[location_id] = group[
                    ["knesset_number", "party_name", "votes"]
                ].to_dict("records")

        for column in [
            "registered_voters",
            "total_voters",
            "valid_votes",
            "invalid_votes",
            "total_votes",
            "selected_party_votes",
        ]:
            if column not in base:
                base[column] = 0
            base[column] = base[column].fillna(0).astype(int)

        base["party_vote_share"] = base.apply(
            lambda row: round(
                (row["selected_party_votes"] / row["total_votes"]) if row["total_votes"] else 0,
                4,
            ),
            axis=1,
        )
        base["turnout_rate"] = base.apply(
            lambda row: round(
                (row["total_voters"] / row["registered_voters"]) if row["registered_voters"] else 0,
                4,
            ),
            axis=1,
        )

        base = base.sort_values(["total_voters", "ballot_count"], ascending=[False, False])
        markers: list[dict[str, Any]] = []
        for _, row in base.iterrows():
            location_id = row["location_id"]
            markers.append(
                {
                    "location_id": location_id,
                    "locality_id": _normalize_locality_id(row["locality_id"]),
                    "locality_name": row["locality_name"],
                    "location_name": row["location_name"],
                    "address": row["address"],
                    "latitude": float(row["latitude"]),
                    "longitude": float(row["longitude"]),
                    "ballot_count": int(row["ballot_count"]),
                    "ballots": self.ballots_by_location.get(location_id, []),
                    "stats": {
                        "registered_voters": int(row["registered_voters"]),
                        "total_voters": int(row["total_voters"]),
                        "valid_votes": int(row["valid_votes"]),
                        "invalid_votes": int(row["invalid_votes"]),
                        "total_votes": int(row["total_votes"]),
                        "selected_party_votes": int(row["selected_party_votes"]),
                        "party_vote_share": float(row["party_vote_share"]),
                        "turnout_rate": float(row["turnout_rate"]),
                    },
                    "top_parties": top_parties_map.get(location_id, []),
                    "party_history": history_map.get(location_id, []),
                }
            )
        return markers

    def get_trend(self, party_sign: str, location_ids: list[str] | None = None) -> dict[str, Any]:
        selected_location_ids = set(location_ids or self.locations["location_id"].tolist())
        selected_votes = self.location_party_votes[
            (self.location_party_votes["party_sign"] == party_sign)
            & (self.location_party_votes["location_id"].isin(selected_location_ids))
        ]
        total_votes = self.location_party_votes[
            self.location_party_votes["location_id"].isin(selected_location_ids)
        ]
        turnout = self.location_turnout[self.location_turnout["location_id"].isin(selected_location_ids)]
        selected_ballots = self.locations[self.locations["location_id"].isin(selected_location_ids)]

        vote_summary = selected_votes.groupby("knesset_number", as_index=False).agg(
            party_votes=("votes", "sum")
        )
        total_summary = total_votes.groupby("knesset_number", as_index=False).agg(
            total_votes=("votes", "sum")
        )
        turnout_summary = turnout.groupby("knesset_number", as_index=False).agg(
            total_voters=("total_voters", "sum")
        )
        party_names = self.parties[self.parties["party_sign"] == party_sign][
            ["knesset_number", "party_name"]
        ].drop_duplicates()

        trend = pd.DataFrame({"knesset_number": self.election_numbers})
        trend = trend.merge(vote_summary, on="knesset_number", how="left")
        trend = trend.merge(total_summary, on="knesset_number", how="left")
        trend = trend.merge(turnout_summary, on="knesset_number", how="left")
        trend = trend.merge(party_names, on="knesset_number", how="left")
        trend = trend.fillna({"party_votes": 0, "total_votes": 0, "total_voters": 0, "party_name": ""})
        trend["vote_share"] = trend.apply(
            lambda row: round((row["party_votes"] / row["total_votes"]) if row["total_votes"] else 0, 4),
            axis=1,
        )

        return {
            "party_sign": party_sign,
            "selection": {
                "location_count": int(selected_ballots.shape[0]),
                "ballot_count": int(selected_ballots["ballot_count"].sum()),
            },
            "series": [
                {
                    "knesset_number": int(row["knesset_number"]),
                    "party_name": row["party_name"],
                    "party_votes": int(row["party_votes"]),
                    "total_votes": int(row["total_votes"]),
                    "total_voters": int(row["total_voters"]),
                    "vote_share": float(row["vote_share"]),
                }
                for _, row in trend.sort_values("knesset_number").iterrows()
            ],
        }


@lru_cache(maxsize=1)
def get_repository() -> DataRepository:
    return DataRepository()