import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const INITIAL_CENTER = [31.4117, 35.0818]
const INITIAL_ZOOM = 8
const MIN_MARKER_ZOOM = 10
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
    <div className="history-bars" role="img" aria-label="המפלגה הנבחרת לאורך בחירות">
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

function MapViewportWatcher({ onViewportChange }) {
  const lastViewportKey = useRef('')

  const emitViewport = (map) => {
    const bounds = map.getBounds()
    const nextViewport = {
      bounds: {
        minLat: Number(bounds.getSouth().toFixed(5)),
        maxLat: Number(bounds.getNorth().toFixed(5)),
        minLng: Number(bounds.getWest().toFixed(5)),
        maxLng: Number(bounds.getEast().toFixed(5)),
      },
      zoom: Number(map.getZoom().toFixed(2)),
    }
    const nextKey = JSON.stringify(nextViewport)
    if (lastViewportKey.current !== nextKey) {
      lastViewportKey.current = nextKey
      onViewportChange(nextViewport)
    }
  }

  useMapEvents({
    load(event) {
      emitViewport(event.target)
    },
    moveend(event) {
      emitViewport(event.target)
    },
    zoomend(event) {
      emitViewport(event.target)
    },
  })

  return null
}

function TrendChart({ trend }) {
  if (!trend) {
    return <div className="chart-empty">בחרו מפלגה כדי להציג מגמה היסטורית.</div>
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
          <p className="eyebrow">מגמה היסטורית</p>
          <h2>{trend.party_sign}</h2>
        </div>
        <p>
          {formatNumber(trend.selection.ballot_count)} קלפיות ב־{formatNumber(trend.selection.location_count)} מיקומים ממופים
        </p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="trend-chart" role="img" aria-label="מגמת אחוז קולות למפלגה">
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
            <strong>כנסת {point.knesset_number}</strong>
            <span>{point.party_name || trend.party_sign}</span>
            <span>{formatNumber(point.party_votes)} קולות</span>
            <span>{formatPercent(point.vote_share)} נתח</span>
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
  const [headerMinimized, setHeaderMinimized] = useState(false)
  const [mapViewport, setMapViewport] = useState({
    bounds: INITIAL_BOUNDS,
    zoom: INITIAL_ZOOM,
  })

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
    if (!election || !mapViewport) return

    if (mapViewport.zoom < MIN_MARKER_ZOOM) {
      setMarkers([])
      setLoadingMap(false)
      return
    }

    const abortController = new AbortController()
    setLoadingMap(true)

    const params = new URLSearchParams({ knesset_number: election })
    if (party) params.set('party_sign', party)
    params.set('min_lat', String(mapViewport.bounds.minLat))
    params.set('max_lat', String(mapViewport.bounds.maxLat))
    params.set('min_lng', String(mapViewport.bounds.minLng))
    params.set('max_lng', String(mapViewport.bounds.maxLng))

    fetch(`/api/map-markers?${params.toString()}`, { signal: abortController.signal })
      .then((response) => response.json())
      .then((payload) => {
        if (abortController.signal.aborted) return
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
      .catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('Failed to load map markers', error)
        }
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setLoadingMap(false)
        }
      })

    return () => abortController.abort()
  }, [election, party, mapViewport])

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
  const shouldLoadMarkers = mapViewport.zoom >= MIN_MARKER_ZOOM

  return (
    <div className="app-shell">
      <header className={`hero ${headerMinimized ? 'hero-minimized' : ''}`}>
        <button className="minimize-button" onClick={() => setHeaderMinimized(!headerMinimized)} aria-label="Toggle header">
          {headerMinimized ? '▼' : '▲'}
        </button>
        <h1>קרטו-קלפי</h1>
        <div className="hero-content">
          <p className="eyebrow">סייר תוצאות בחירות לכנסת</p>
          <p className="hero-copy">
            בחנו תוצאות בחירות ברמת קלפי על גבי מפה, השוו עוצמת מפלגות לפי מיקום ועקבו אחר מגמות בין-מחזוריות לכל קבוצת קלפיות שתבחרו.
          </p>
          <p className="hero-links">
            <a href="https://data.gov.il/he/datasets/central-election-committee/votes-knesset" target="_blank" rel="noopener noreferrer">
              נתונים מועדת הבחירות המרכזית
            </a>
            <span> • </span>
            <a href="https://github.com/yarongon/kartokalpi/" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </p>
        </div>
        <div className="hero-metrics">
          <article>
            <span>בחירות</span>
            <strong>{election || '—'}</strong>
          </article>
          <article>
            <span>מפלגה</span>
            <strong>{selectedPartyMeta ? `${selectedPartyMeta.party_name} (${selectedPartyMeta.party_sign})` : '—'}</strong>
          </article>
          <article>
            <span>מיקומים נבחרים</span>
            <strong>{formatNumber(selectedLocations.length)}</strong>
          </article>
        </div>
      </header>

      <main className="layout">
        <aside className="control-panel">
          <section className="panel-section">
            <label>
              <span>מחזור כנסת</span>
              <select value={election} onChange={(event) => setElection(event.target.value)}>
                {elections.map((item) => (
                  <option key={item.knesset_number} value={item.knesset_number}>
                    כנסת {item.knesset_number}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>מפלגה</span>
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
              <h2>סקירת בחירות</h2>
              <span>{selectedElection?.total_mandates ?? 0} מנדטים</span>
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
            {loadingMap ? <div className="map-loading">טוען נתוני מפה…</div> : null}
            {!shouldLoadMarkers ? (
              <div className="map-hint">התקרבו לרמה {MIN_MARKER_ZOOM} או יותר כדי לטעון קלפיות באזור זה.</div>
            ) : null}
            <MapContainer center={INITIAL_CENTER} zoom={INITIAL_ZOOM} scrollWheelZoom className="map-canvas">
              <MapViewportWatcher onViewportChange={setMapViewport} />
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
                        <p>{marker.ballot_count} קלפיות במיקום זה</p>
                        <dl>
                          <div>
                            <dt>סך מצביעים</dt>
                            <dd>{formatNumber(marker.stats.total_voters)}</dd>
                          </div>
                          <div>
                            <dt>קולות כשרים</dt>
                            <dd>{formatNumber(marker.stats.valid_votes)}</dd>
                          </div>
                          <div>
                            <dt>קולות פסולים</dt>
                            <dd>{formatNumber(marker.stats.invalid_votes)}</dd>
                          </div>
                          <div>
                            <dt>נתח מפלגה</dt>
                            <dd>{formatPercent(marker.stats.party_vote_share)}</dd>
                          </div>
                        </dl>
                        <div className="popup-block">
                          <strong>המפלגות המובילות בבחירות אלה</strong>
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
                            <strong>המפלגה הנבחרת לאורך הבחירות</strong>
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
              <h2>בחירה</h2>
              <button className="ghost-button" onClick={() => setSelectedLocations([])} type="button">
                נקה
              </button>
            </div>
            <p className="helper-copy">
              לחצו על סמני המפה כדי לבנות קבוצת קלפיות מותאמת אישית לתרשים המגמה ההיסטורית.
            </p>
            <div className="selection-list">
              {selectedLocations.length === 0 ? (
                <span className="empty-state">לא נבחרו מיקומים. המגמה מציגה את התמונה הארצית הממופה.</span>
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
            <span><i className="swatch share-high" /> נתח מפלגה גבוה</span>
            <span><i className="swatch share-mid" /> נתח בינוני</span>
            <span><i className="swatch share-low" /> נתח נמוך</span>
            <span><i className="swatch share-none" /> אין נתח מתועד</span>
            <span>גודל הסמן משקף את אחוז ההצבעה באזור המוצג</span>
          </div>
        </section>
      </main>

      <TrendChart trend={trend} />
    </div>
  )
}