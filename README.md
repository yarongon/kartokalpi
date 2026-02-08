# Karto-Kalpi

## Overview

Karto-Kalpi is an interactive visualization platform that enables users to explore Israel's election results on a geographical map. The platform displays voting patterns and trends across different ballots, allowing users to analyze electoral data by location and track changes across multiple election cycles (Knesset 21-25).

## Features

- **Interactive Map Display**: View election results per ballot location on an interactive map
- **Multi-Knesset Analysis**: Compare results across Knesset sessions 21 through 25
- **Trend Analysis**: Track trends of specific parties in ballots, neighorhoods and cities.

## Data

The project uses election data from the following Knesset sessions:
- Knesset 21: 9/4/2019
- Knesset 22: 17/9/2019
- Knesset 23: 2/3/2020
- Knesset 24: 23/3/2021
- Knesset 25: 1/11/2022

Data files are located in the `data/` directory as CSV files containing voting results per ballot.

## Technology Stack

- **Frontend**: React
- **Backend**: Python using Fastapi
- **Mapping Library**: Leaflet
- **Data Processing**: Pandas

## Project Structure

```
kartokalpi/
├── data/              # Election data CSV files
├── src/               # Source code
│   ├── frontend
│   └── backend
├── tests/             # Test files
├── Dockerfile         # Docker configuration
└── README.md          # This file
```

## Getting Started

### Prerequisites
- [List required dependencies - e.g., Node.js, Python 3.x, Docker, etc.]
- [Any other prerequisites]

### Installation

1. Clone the repository:
```bash
git clone [repository URL]
cd kartokalpi
```

2. [Add specific installation steps for your project]

3. [Additional setup steps if needed]

### Running the Project

#### Local Development
```bash
[Add command to start development server]
```

The application will be available at `http://localhost:[PORT]`

#### Using Docker
```bash
docker build -t kartokalpi .
docker run -p [PORT]:[PORT] kartokalpi
```

## Usage

[Describe how users can interact with the application, including:]
- How to navigate the map
- How to select different elections/Knesset sessions
- How to view trends
- [Any other key user interactions]

## Testing

Run tests with:
```bash
[Add test command]
```

## Development

### Code Style
[Describe code style guidelines if applicable]

### Adding New Features
[Describe process for adding new features or election data]

## Deployment

[Describe deployment instructions for production environment]

## Contributing

[Describe how others can contribute to the project]

## License

MIT License

## Author

Yaron Gonen

## Contact

yaron.gonen@gmail.com
