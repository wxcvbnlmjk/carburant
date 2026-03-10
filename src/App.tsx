import { useEffect, useMemo, useState } from 'react'
import {
  getStation,
  getStationOpendata,
  getStationsAround,
  type StationD,
  type Station,
} from '@/api/prixCarburants'
import { searchCities, type CitySuggestion } from '@/api/ban'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type DisplayPrice = {
  nom: string
  valeur: string
  maj: string
}

function asDisplayPricesFromOpendata(payload: unknown): DisplayPrice[] {
  const candidates: unknown[] = []

  const p = payload as Record<string, unknown> | null
  if (!p || typeof p !== 'object') return []

  // Most likely shapes (observed in various opendata formats)
  const directPrix = (p as { prix?: unknown }).prix
  const directPrix2 = (p as { Prix?: unknown }).Prix
  const nestedPdv = (p as { pdv?: unknown }).pdv
  const nestedPdvPrix =
    nestedPdv && typeof nestedPdv === 'object'
      ? ((nestedPdv as Record<string, unknown>).prix ?? (nestedPdv as Record<string, unknown>).Prix)
      : undefined

  for (const v of [directPrix, directPrix2, nestedPdvPrix]) {
    if (Array.isArray(v)) candidates.push(...v)
  }

  const out: DisplayPrice[] = []

  for (const raw of candidates) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>

    const nom =
      (typeof r.nom === 'string' && r.nom) ||
      (typeof r.name === 'string' && r.name) ||
      (typeof r['@nom'] === 'string' && (r['@nom'] as string)) ||
      ''

    const valeurNum =
      typeof r.valeur === 'number'
        ? r.valeur
        : typeof r.value === 'number'
          ? r.value
          : typeof r['@valeur'] === 'number'
            ? r['@valeur']
            : undefined
    const valeurStr =
      typeof r.valeur === 'string'
        ? r.valeur
        : typeof r.value === 'string'
          ? r.value
          : typeof r['@valeur'] === 'string'
            ? (r['@valeur'] as string)
            : undefined

    const maj =
      (typeof r.maj === 'string' && r.maj) ||
      (typeof r.Update === 'string' && r.Update) ||
      (typeof r['@maj'] === 'string' && (r['@maj'] as string)) ||
      ''

    const valeur =
      typeof valeurNum === 'number'
        ? valeurNum.toFixed(3)
        : typeof valeurStr === 'string'
          ? valeurStr
          : ''

    if (!nom && !valeur && !maj) continue

    out.push({
      nom: nom || '—',
      valeur: valeur || '—',
      maj: maj || '—',
    })
  }

  return out
}

type StationWithPrices = {
  station: StationD
  details?: Station
  opendata?: unknown
  error?: string
}

type CitySelection = {
  label: string
  latitude: number
  longitude: number
}

type AggregatedPriceRow = {
  fuel: string
  stationId: number
  brand: string
  address: string
  valeur: string
  maj: string
}

function App() {
  const [items, setItems] = useState<StationWithPrices[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [cityQuery, setCityQuery] = useState('')
  const [citySuggestions, setCitySuggestions] = useState<CitySuggestion[]>([])
  const [cityLoading, setCityLoading] = useState(false)
  const [selectedCity, setSelectedCity] = useState<CitySelection | null>(null)
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false)
  const range = 'station=1-20'

  const title = useMemo(() => {
    if (!selectedCity) return 'Stations carburant'
    return `Stations carburant — ${selectedCity.label}`
  }, [selectedCity])

  const aggregatedPrices = useMemo(() => {
    const rows: AggregatedPriceRow[] = []

    for (const item of items) {
      const s = item.station
      const stationId = s.id
      const brand = s.Brand?.name ?? '—'
      const address = `${s.Address?.street_line ?? '—'} — ${s.Address?.city_line ?? '—'}`

      const opendataPrices = asDisplayPricesFromOpendata(item.opendata)
      if (opendataPrices.length > 0) {
        for (const p of opendataPrices) {
          rows.push({
            fuel: p.nom,
            stationId,
            brand,
            address,
            valeur: p.valeur,
            maj: p.maj,
          })
        }
        continue
      }

      const fuels = item.details?.Fuels ?? []
      for (const f of fuels) {
        rows.push({
          fuel: f.name ?? '—',
          stationId,
          brand,
          address,
          valeur: typeof f.Price?.value === 'number' ? f.Price.value.toFixed(3) : '—',
          maj: f.Update?.value ?? f.Update?.text ?? '—',
        })
      }
    }

    rows.sort((a, b) => a.fuel.localeCompare(b.fuel) || a.valeur.localeCompare(b.valeur))
    return rows
  }, [items])

  const aggregatedPricesByFuel = useMemo(() => {
    const map = new Map<string, AggregatedPriceRow[]>()
    for (const r of aggregatedPrices) {
      const list = map.get(r.fuel) ?? []
      list.push(r)
      map.set(r.fuel, list)
    }
    return [...map.entries()]
  }, [aggregatedPrices])

  useEffect(() => {
    let cancelled = false
    const q = cityQuery.trim()

    if (!cityDropdownOpen) {
      setCitySuggestions([])
      return
    }

    if (q.length < 2) {
      setCitySuggestions([])
      return
    }

    const t = window.setTimeout(async () => {
      setCityLoading(true)
      try {
        const result = await searchCities({ q, limit: 8 })
        if (!cancelled) setCitySuggestions(result)
      } catch {
        if (!cancelled) setCitySuggestions([])
      } finally {
        if (!cancelled) setCityLoading(false)
      }
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [cityQuery])

  useEffect(() => {
    let cancelled = false

    async function run() {
      if (!selectedCity) {
        setLoading(false)
        setError(null)
        setItems([])
        return
      }

      setLoading(true)
      setError(null)
      setItems([])

      try {
        const stations = await getStationsAround({
          latitude: selectedCity.latitude,
          longitude: selectedCity.longitude,
          types: ['R', 'A'],
          responseFields: 'Services',
          range: 'm=1-10000',
        })

        if (cancelled) return

        setItems(stations.map((s) => ({ station: s })))

        const MAX_STATIONS_FOR_PRICES = 100
        const stationsForPrices = stations.slice(0, MAX_STATIONS_FOR_PRICES)

        const details = await Promise.all(
          stationsForPrices.map(async (s) => {
            try {
              const [stationDetails, stationOpendata] = await Promise.all([
                getStation(s.id),
                getStationOpendata(s.id, 'v1'),
              ])

              return { id: s.id, stationDetails, stationOpendata } as const
            } catch (e) {
              const message = e instanceof Error ? e.message : String(e)
              return { id: s.id, error: message } as const
            }
          }),
        )

        if (cancelled) return

        setItems((prev) =>
          prev.map((item) => {
            const d = details.find((x) => x.id === item.station.id)
            if (!d) return item
            if ('error' in d) return { ...item, error: d.error }
            return { ...item, details: d.stationDetails, opendata: d.stationOpendata }
          }),
        )
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        if (!cancelled) setError(message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [range, selectedCity])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{title}</h1>
            <a
              href="https://github.com/wxcvbnlmjk/carburant"
              target="_blank"
              rel="noreferrer"
            >
              <img
                alt="last commit"
                src="https://img.shields.io/github/last-commit/wxcvbnlmjk/carburant"
              />
            </a>
            <a
              href="https://github.com/wxcvbnlmjk/carburant"
              target="_blank"
              rel="noreferrer"
            >
              <img
                alt="github carburant"
                src="https://img.shields.io/badge/github-carburant-blue?logo=github"
              />
            </a>
            <a
              href="https://api.prix-carburants.2aaz.fr/"
              target="_blank"
              rel="noreferrer"
            >
              <img
                alt="api prix carburants"
                src="https://img.shields.io/badge/api-prix%20carburants-blue"
              />
            </a>
          </div>
        </div>

        <div className="relative max-w-xl">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Ville</label>
            <input
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={cityQuery}
              onChange={(e) => {
                setCityQuery(e.target.value)
                setSelectedCity(null)
                setCityDropdownOpen(true)
              }}
              placeholder="Ex: Valence"
              autoComplete="off"
              onFocus={() => {
                setCityDropdownOpen(true)
              }}
            />
            <div className="text-xs text-muted-foreground">
              {selectedCity
                ? `Latitude: ${selectedCity.latitude.toFixed(4)} — Longitude: ${selectedCity.longitude.toFixed(4)} — Rayon: 10km`
                : 'Sélectionne une ville pour afficher les prix.'}
            </div>
          </div>

          {cityDropdownOpen && (cityLoading || citySuggestions.length > 0) ? (
            <div className="absolute z-10 mt-2 w-full overflow-hidden rounded-md border bg-popover shadow">
              {cityLoading ? (
                <div className="p-3 text-sm text-muted-foreground">Recherche…</div>
              ) : null}

              {!cityLoading && citySuggestions.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">Aucune suggestion.</div>
              ) : null}

              {!cityLoading && citySuggestions.length > 0 ? (
                <div className="max-h-72 overflow-auto">
                  {citySuggestions.map((s) => (
                    <button
                      key={`${s.city}-${s.postcode}-${s.label}`}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => {
                        setCityQuery(s.label)
                        setSelectedCity({
                          label: s.label,
                          latitude: s.latitude,
                          longitude: s.longitude,
                        })
                        setCityDropdownOpen(false)
                        setCitySuggestions([])
                      }}
                    >
                      <span className="truncate">{s.label}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{s.postcode}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {selectedCity ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="text-sm font-medium">Totalité des prix carburants (ville)</div>
              <div className="text-xs text-muted-foreground">
                Agrégé par carburant. Pour limiter la volumétrie, les détails/prix sont chargés pour maximum 100 stations.
              </div>
            </div>

            <div className="space-y-4">
              {aggregatedPricesByFuel.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  {loading ? 'Chargement…' : 'Aucun prix à afficher.'}
                </div>
              ) : (
                aggregatedPricesByFuel.map(([fuel, rows]) => (
                  <Card key={fuel}>
                    <CardHeader>
                      <CardTitle className="text-base">{fuel}</CardTitle>
                      <CardDescription>{rows.length} prix</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {rows.map((r) => (
                        <div
                          key={`${fuel}-${r.stationId}-${r.valeur}-${r.maj}`}
                          className="flex items-start justify-between gap-4 rounded-md border p-3"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {r.brand} (id: {r.stationId})
                            </div>
                            <div className="truncate text-xs text-muted-foreground">{r.address}</div>
                            <div className="truncate text-xs text-muted-foreground">maj: {r.maj}</div>
                          </div>
                          <div className="shrink-0 text-sm font-semibold">{r.valeur}</div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        ) : null}

        {selectedCity ? (
          <>
            {error ? (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm">
                {error}
              </div>
            ) : null}

            {loading && items.length === 0 ? (
              <div className="text-sm text-muted-foreground">Chargement…</div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              {items.map((item) => {
            const s = item.station
            const brand = s.Brand?.name ?? '—'
            const street = s.Address?.street_line ?? '—'
            const city = s.Address?.city_line ?? '—'
            const opendataPrices = asDisplayPricesFromOpendata(item.opendata)
            const fuels = item.details?.Fuels ?? []

            return (
              <Card key={s.id}>
                <CardHeader>
                  <CardTitle className="text-lg">{brand}</CardTitle>
                  <CardDescription>
                    id: {s.id} — {street} — {city}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {item.error ? (
                    <div className="text-sm text-destructive">{item.error}</div>
                  ) : opendataPrices.length > 0 ? (
                    <div className="space-y-2">
                      {opendataPrices.map((p, idx) => (
                        <div
                          key={`${p.nom}-${idx}`}
                          className="flex items-center justify-between gap-4 rounded-md border p-3"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{p.nom}</div>
                            <div className="truncate text-xs text-muted-foreground">maj: {p.maj}</div>
                          </div>
                          <div className="shrink-0 text-sm font-semibold">{p.valeur}</div>
                        </div>
                      ))}
                    </div>
                  ) : fuels.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      {loading ? 'Prix en cours de chargement…' : 'Aucun prix disponible.'}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {fuels.map((f) => (
                        <div
                          key={f.id}
                          className="flex items-center justify-between gap-4 rounded-md border p-3"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{f.name ?? '—'}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              maj: {f.Update?.value ?? f.Update?.text ?? '—'}
                            </div>
                          </div>
                          <div className="shrink-0 text-sm font-semibold">
                            {typeof f.Price?.value === 'number' ? f.Price.value.toFixed(3) : '—'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
              })}
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">Choisis une ville pour afficher les prix.</div>
        )}
      </div>
    </div>
  )
}

export default App
