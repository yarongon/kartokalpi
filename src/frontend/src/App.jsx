import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const INITIAL_CENTER = [31.4117, 35.0818]
const INITIAL_BOUNDS = {
  minLat: 29.0,
  maxLat: 33.6,
  minLng: 34.0,
  maxLng: 35.95,
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value ?? 0)
}

function markerRadius(marker) {
  const turnout = marker.stats.turnout_rate || 0
  return 6 + Math.round(turnout * 16) + Math.min(marker.ballot_count, 5)
}

function markerColor(marker) {
  const share = marker.stats.party_vote_share || 0
  if (share >= 0.45) return '#bc4c2a'
  if (share >= 0.3) return '#e3874f'
  if (share >= 0.18) return '#f0c987'
  if (share > 0) return '#8dbfa3'
  return '#9caab5'
}

function PopupHistoryBars({ history, partySign }) {
  const maxVotes = Math.max(...history.map((item) => item.votes), 1)

  return (
    <div className="history-bars" role="img" aria-label="Selected party across elections">
      {history.map((item) => (
        <div className="history-row" key={`${partySign}-${item.knesset_number}`}>
          <span className="history-year">{item.knesset_number}</span>
          <div className="history-track">
            <div
              className="history-bar"
              style={{ width: `${Math.max((item.votes / maxVotes) * 100, item.votes > 0 ? 8 : 0)}%` }}
            />
          </div>
          <span className="history-value">{formatNumber(item.votes)}</span>
        </div>
      ))}
    </div>
  )
}

function MapViewportWatcher({ onBoundsChange }) {
  const lastBoundsKey = useRef('')

  useMapEvents({
    load(event) {
      const bounds = event.target.getBounds()
      const nextBounds = {
        minLat: Number(bounds.getSouth().toFixed(5)),
        maxLat: Number(bounds.getNorth().toFixed(5)),
        minLng: Number(bounds.getWest().toFixed(5)),
        maxLng: Number(bounds.getEast().toFixed(5)),
      }
      const nextKey = JSON.stringify(nextBounds)
      if (lastBoundsKey.current !== nextKey) {
        lastBoundsKey.current = nextKey
        onBoundsChange(nextBounds)
      }
    },
    moveend(event) {
      const bounds = event.target.getBounds()
      const nextBounds = {
        minLat: Number(bounds.getSouth().toFixed(5)),
        maxLat: Number(bounds.getNorth().toFixed(5)),
        minLng: Number(bounds.getWest().toFixed(5)),
        maxLng: Number(bounds.getEast().toFixed(5)),
      }
      const nextKey = JSON.stringify(nextBounds)
      if (lastBoundsKey.current !== nextKey) {
        lastBoundsKey.current = nextKey
        onBoundsChange(nextBounds)
      }
    },
  })

  return null
}

function TrendChart({ trend }) {
  if (!trend) {
    return <div className="chart-empty">Pick a party to display a historical trend.</div>
  }

  const points = trend.series
  const maxShare = Math.max(...points.map((point) => point.vote_share), 0.01)
  const width = 700
  const height = 220
  const padX = 48
  const padY = 28
  const step = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0
  const polyline = points
    .map((point, index) => {
      const x = padX + index * step
      const y = height - padY - (point.vote_share / maxShare) * (height - padY * 2)
      return `${x},${y}`
    })
    .join(' ')

  return (
    <section className="trend-panel">
      <div className="trend-header">
        <div>
          <p className="eyebrow">Historical trend</p>
          <h2>{trend.party_sign}</h2>
        </div>
        <p>
          {formatNumber(trend.selection.ballot_count)} ballots across {formatNumber(trend.selection.location_count)} mapped
          locations
        </p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="trend-chart" role="img" aria-label="Party vote share trend">
        <line x1="48" y1={height - padY} x2={width - padX} y2={height - padY} className="axis" />
        <line x1="48" y1={padY} x2="48" y2={height - padY} className="axis" />
        <polyline points={polyline} className="trend-line" />
        {points.map((point, index) => {
          const x = padX + index * step
          const y = height - padY - (point.vote_share / maxShare) * (height - padY * 2)
          return (
            <g key={point.knesset_number}>
              <circle cx={x} cy={y} r="5" className="trend-point" />
              <text x={x} y={height - 8} textAnchor="middle" className="axis-label">
                {point.knesset_number}
              </text>
              <text x={x} y={y - 12} textAnchor="middle" className="value-label">
                {formatPercent(point.vote_share)}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="trend-grid">
        {points.map((point) => (
          <article className="trend-card" key={point.knesset_number}>
            <strong>Knesset {point.knesset_number}</strong>
            <span>{point.party_name || trend.party_sign}</span>
            <span>{formatNumber(point.party_votes)} votes</span>
            <span>{formatPercent(point.vote_share)} share</span>
          </article>
        ))}
      </div>
    </section>
  )
}

export default function App() {
  const [elections, setElections] = useState([])
  const [election, setElection] = useState('')
  const [party, setParty] = useState('')
  const [markers, setMarkers] = useState([])
  const [selectedLocations, setSelectedLocations] = useState([])
  const [selectedLocationMeta, setSelectedLocationMeta] = useState({})
  const [trend, setTrend] = useState(null)
  const [loadingMap, setLoadingMap] = useState(false)
  const [mapBounds, setMapBounds] = useState(INITIAL_BOUNDS)

  useEffect(() => {
    fetch('/api/elections')
      .then((response) => response.json())
      .then((payload) => {
        setElections(payload.elections)
        if (payload.elections?.length) {
          const firstElection = String(payload.elections[0].knesset_number)
          setElection(firstElection)
          setParty(payload.elections[0].parties[0]?.party_sign ?? '')
        }
      })
  }, [])

  const selectedElection = useMemo(
    () => elections.find((item) => String(item.knesset_number) === election),
    [elections, election],
  )

  useEffect(() => {
    if (!selectedElection) return
    if (!selectedElection.parties.some((item) => item.party_sign === party)) {
      setParty(selectedElection.parties[0]?.party_sign ?? '')
    }
  }, [selectedElection, party])

  useEffect(() => {
    if (!election || !mapBounds) return
    setLoadingMap(true)
    const params = new URLSearchParams({ knesset_number: election })
    if (party) params.set('party_sign', party)
    params.set('min_lat', String(mapBounds.minLat))
    params.set('max_lat', String(mapBounds.maxLat))
    params.set('min_lng', String(mapBounds.minLng))
    params.set('max_lng', String(mapBounds.maxLng))
    fetch(`/api/map-markers?${params.toString()}`)
      .then((response) => response.json())
      .then((payload) => {
        setMarkers(payload.markers ?? [])
        setSelectedLocationMeta((current) => {
          const next = { ...current }
          for (const marker of payload.markers ?? []) {
            next[marker.location_id] = {
              localityName: marker.locality_name,
              locationName: marker.location_name,
              address: marker.address,
            }
          }
          return next
        })
      })
      .finally(() => setLoadingMap(false))
  }, [election, party, mapBounds])

  useEffect(() => {
    if (!party) {
      setTrend(null)
      return
    }

    const params = new URLSearchParams({ party_sign: party })
    selectedLocations.forEach((locationId) => params.append('location_ids', locationId))
    fetch(`/api/trends?${params.toString()}`)
      .then((response) => response.json())
      .then((payload) => setTrend(payload))
  }, [party, selectedLocations])

  const toggleLocation = (locationId) => {
    setSelectedLocations((current) =>
      current.includes(locationId)
        ? current.filter((value) => value !== locationId)
        : [...current, locationId],
    )
  }

  const selectedPartyMeta = selectedElection?.parties.find((item) => item.party_sign === party)

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Knesset election explorer</p>
          <h1>Karto-Kalpi</h1>
          <p className="hero-copy">
            Inspect ballot-level election results on a map, compare party strength by location, and track
            multi-election trends for any selected set of ballot venues.
          </p>
        </div>
        <div className="hero-metrics">
          <article>
            <span>Election</span>
            <strong>{election || '—'}</strong>
          </article>
          <article>
            <span>Party</span>
            <strong>{selectedPartyMeta ? `${selectedPartyMeta.party_name} (${selectedPartyMeta.party_sign})` : '—'}</strong>
          </article>
          <article>
            <span>Selected locations</span>
            <strong>{formatNumber(selectedLocations.length)}</strong>
          </article>
        </div>
      </header>

      <main className="layout">
        <aside className="control-panel">
          <section className="panel-section">
            <label>
              <span>Knesset cycle</span>
              <select value={election} onChange={(event) => setElection(event.target.value)}>
                {elections.map((item) => (
                  <option key={item.knesset_number} value={item.knesset_number}>
                    Knesset {item.knesset_number}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Party</span>
              <select value={party} onChange={(event) => setParty(event.target.value)}>
                {selectedElection?.parties.map((item) => (
                  <option key={item.party_sign} value={item.party_sign}>
                    {item.party_name} ({item.party_sign})
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="panel-section standings">
            <div className="section-title">
              <h2>Election overview</h2>
              <span>{selectedElection?.total_mandates ?? 0} mandates</span>
            </div>
            <div className="party-list">
              {selectedElection?.parties.map((item) => (
                <button
                  key={item.party_sign}
                  className={`party-chip ${item.party_sign === party ? 'active' : ''}`}
                  onClick={() => setParty(item.party_sign)}
                  type="button"
                >
                  <span>{item.party_name}</span>
                  <strong>{item.mandates}</strong>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section className="map-panel">
          <div className="map-frame">
            {loadingMap ? <div className="map-loading">Loading map data…</div> : null}
            <MapContainer center={INITIAL_CENTER} zoom={8} scrollWheelZoom className="map-canvas">
              <MapViewportWatcher onBoundsChange={setMapBounds} />
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {markers.map((marker) => {
                const selected = selectedLocations.includes(marker.location_id)
                return (
                  <CircleMarker
                    key={marker.location_id}
                    center={[marker.latitude, marker.longitude]}
                    radius={markerRadius(marker)}
                    pathOptions={{
                      color: selected ? '#fffdf7' : '#41566b',
                      weight: selected ? 3 : 1.5,
                      fillColor: markerColor(marker),
                      fillOpacity: 0.82,
                    }}
                    eventHandlers={{ click: () => toggleLocation(marker.location_id) }}
                  >
                    <Popup>
                      <div className="popup-card">
                        <h3>{marker.locality_name}</h3>
                        <p>{marker.location_name || marker.address}</p>
                        <p>{marker.address}</p>
                        <p>{marker.ballot_count} ballots at this venue</p>
                        <dl>
                          <div>
                            <dt>Total voters</dt>
                            <dd>{formatNumber(marker.stats.total_voters)}</dd>
                          </div>
                          <div>
                            <dt>Valid votes</dt>
                            <dd>{formatNumber(marker.stats.valid_votes)}</dd>
                          </div>
                          <div>
                            <dt>Invalid votes</dt>
                            <dd>{formatNumber(marker.stats.invalid_votes)}</dd>
                          </div>
                          <div>
                            <dt>Party share</dt>
                            <dd>{formatPercent(marker.stats.party_vote_share)}</dd>
                          </div>
                        </dl>
                        <div className="popup-block">
                          <strong>Top parties in this election</strong>
                          <ul>
                            {marker.top_parties.map((item) => (
                              <li key={`${marker.location_id}-${item.party_sign}`}>
                                {item.party_name} ({item.party_sign}) · {formatNumber(item.votes)}
                              </li>
                            ))}
                          </ul>
                        </div>
                        {marker.party_history.length > 0 ? (
                          <div className="popup-block">
                            <strong>Selected party across elections</strong>
                            <PopupHistoryBars history={marker.party_history} partySign={party} />
                          </div>
                        ) : null}
                      </div>
                    </Popup>
                  </CircleMarker>
                )
              })}
            </MapContainer>
          </div>
          <section className="selection-panel">
            <div className="section-title">
              <h2>Selection</h2>
              <button className="ghost-button" onClick={() => setSelectedLocations([])} type="button">
                Clear
              </button>
            </div>
            <p className="helper-copy">
              Click map markers to build a custom set of ballot venues for the historical trend chart.
            </p>
            <div className="selection-list">
              {selectedLocations.length === 0 ? (
                <span className="empty-state">No locations selected. Trend shows the mapped national picture.</span>
              ) : (
                selectedLocations.map((locationId) => {
                  const marker = selectedLocationMeta[locationId]
                  if (!marker) return null
                  return (
                    <button
                      key={locationId}
                      className="selection-chip"
                      onClick={() => toggleLocation(locationId)}
                      type="button"
                    >
                      {marker.localityName} · {marker.locationName || marker.address}
                    </button>
                  )
                })
              )}
            </div>
          </section>
          <div className="legend-row">
            <span><i className="swatch share-high" /> strong party share</span>
            <span><i className="swatch share-mid" /> medium share</span>
            <span><i className="swatch share-low" /> low share</span>
            <span><i className="swatch share-none" /> no recorded share</span>
            <span>marker size reflects turnout in the visible map area</span>
          </div>
        </section>
      </main>

      <TrendChart trend={trend} />
    </div>
  )
}