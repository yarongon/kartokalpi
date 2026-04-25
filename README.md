# Karto-Kalpi

## Overview

Karto-Kalpi is an interactive visualization platform that enables users to explore Israel's Knesset general election results through a geographical map interface.

## Features

- **General Elections Overview**:
  Users can select a specific Knesset election from a dropdown menu to view the overall results for that cycle.
- **View Parties Over the Elections**:
  Users can track a specific political party's performance across multiple election cycles.
- **Interactive Map Display**:
  - An interactive map displays all ballot locations ("Kalpi"). Users can browse the map, click on a ballot, select an election cycle, and view the vote distribution for that specific location.
  - Users can select single or multiple ballots along with a specific party to analyze the party's historical performance in those chosen areas.

## Data

The project utilizes election results data from Knesset election cycles 18 through 25.
The data is sourced from the Israeli Central Elections Committee.
https://data.gov.il/he/datasets/central-election-committee/votes-knesset

All the data files are located in the `data/` directory:

- **normalized_election_results_18_to_25.csv**: Voting results per ballot for each elections cycle. 
  - `knesset_number`: The Knesset number (election cycle).
  - `locality_id`: An identifier for the city, town, kibbutz, etc.
  - `kalpi_id`: An identifier for the ballot box within the locality.
  - `party_sign`: A 1-4 character string representing the party.
  - `votes`: The number of votes the party received in this ballot.
- **knesset_election_results_18_to_25.csv**: Lists the parties that passed the electoral threshold in each cycle.
  - `knesset_number`: The Knesset number (election cycle).
  - `party_name`: The full name of the party.
  - `party_sign`: A 1-4 character string representing the party.
  - `mandates`: The number of seats the party won.
- **kalpi_address_with_coords.csv**: Ballot location details used to automatically position ballots on the map and populate popup information.
  - `locality_id`: An identifier for the city, town, kibbutz, etc.
  - `locality_name`: The name of the locality.
  - `kalpi_id`: An identifier for the ballot box.
  - `kalpi_address`: The street address of the ballot.
  - `kalpi_location`: The specific venue name (e.g., school, community center). If multiple ballots share a venue, all are displayed together.
  - `coordinates`: A tuple containing latitude and longitude.

## Technology Stack

- **Frontend**: React
- **Backend**: Python using Fastapi
- **Mapping Library**: Leaflet
- **Data Processing**: Pandas

## Project Structure

```
kartokalpi/
├── data/             # Election data CSV files
├── src/              # Source code
│   ├── frontend
│   └── backend
├── tests/            # Test files
├── research/         # Notebooks and scripts used for preprocessing the data
├── Dockerfile         # Docker configuration
├── pyproject.toml
└── README.md         # This file
```

## Getting Started

### Prerequisites
- Python 3.13+
- Node.js 24+
- Docker (optional)

### Running the Project

#### Local Development
```bash
# Backend
uv run uvicorn src.backend.main:app --host 0.0.0.0 --port 8000
```

In a separate terminal:
```bash
# Frontend
cd src/frontend
npm start
```

The application will be available at `http://localhost:[PORT]`

### Geocoding
The system will automatically use coordinates from `data/kalpi_address_with_coords.csv` to geocode exact ballot locations.

#### Using Docker
```bash
docker build -t kartokalpi .
docker run -p [PORT]:[PORT] kartokalpi
```

## Usage

- **Navigate the Map**: Click on ballot markers to see detailed information including:
  - Ballot address and specific location name (e.g., school name)
  - Total number of ballots in that location
  - Voter statistics (total voters, valid votes, invalid votes)
  - Election results for the selected party per different elections

- **Select Different Elections**: Use the dropdown to view results from different Knesset sessions (21-25)

- **View Party Results**: Choose a party from the dropdown to see voting patterns across the map
  - Marker colors indicate voting strength for the selected party
  - Marker size indicates total voter turnout
  - The trend chart shows the party's performance over time

- **Analyze Trends**: The trend chart at the bottom shows how a party's vote share changed across different election cycles

## Testing

Run tests with:
```bash
uv run pytest
```

## Development

### Code Style
- Follow Black formatting for Python
- Use ESLint defaults for React

### Adding New Features
- Add new election data CSVs in data/
- Update `DataProcessor.KNESSET_INFO` in `src/backend/data_processor.py`

### Ballot Address Data
The `kalpi_address_with_coords.csv` file contains detailed information about each ballot location:
- **coordinates**: a tuples (lat/long).
- **Street addresses**: to display when clicking on the ballot.
- **Location details**: Specific venue names (schools, community centers, etc.), to display when clicking on the ballot.

The system automatically uses this data to:
1. Position the ballots on the map
1. Populate popup information on the map with addresses and venue names
1. If more than one ballot is in the same venue, display all ballots in this venue

## License

MIT License

## Author

Yaron Gonen

## Contact

yaron.gonen@gmail.com
