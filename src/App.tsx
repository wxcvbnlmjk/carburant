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
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  Link,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'

type DisplayPrice = {
  nom: string
  valeur: string
  maj: string
}

function parseMajToDate(maj: string): Date | null {
  const raw = maj.trim()
  if (!raw || raw === '—') return null

  const iso = new Date(raw)
  if (!Number.isNaN(iso.getTime())) return iso

  const m = raw.match(/(\d{4})-(\d{2})-(\d{2})/) ?? raw.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return null

  if (m[1].length === 4) {
    const year = Number(m[1])
    const month = Number(m[2])
    const day = Number(m[3])
    const d = new Date(year, month - 1, day)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  const d = new Date(year, month - 1, day)
  return Number.isNaN(d.getTime()) ? null : d
}

function daysDiffFromToday(date: Date): number {
  const today = new Date()
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const b = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  return Math.round((a - b) / (24 * 60 * 60 * 1000))
}

function majTextColor(maj: string): 'success.main' | 'warning.main' | 'error.main' | 'text.secondary' {
  const d = parseMajToDate(maj)
  if (!d) return 'text.secondary'
  const diff = daysDiffFromToday(d)
  if (diff <= 0) return 'success.main'
  if (diff === 1) return 'warning.main'
  return 'error.main'
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
  city: string
  postcode: string
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
    return `Stations carburant — ${selectedCity.city} (${selectedCity.postcode})`
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
  }, [cityQuery, cityDropdownOpen])

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
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary' }}>
      <Box sx={{ mx: 'auto', maxWidth: 960, p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" alignItems="center">
          <Typography variant="h5" fontWeight={600}>
            {title}
          </Typography>
          <Link href="https://github.com/wxcvbnlmjk/carburant" target="_blank" rel="noreferrer">
            <img alt="last commit" src="https://img.shields.io/github/last-commit/wxcvbnlmjk/carburant" />
          </Link>
          <Link href="https://github.com/wxcvbnlmjk/carburant" target="_blank" rel="noreferrer">
            <img
              alt="github carburant"
              src="https://img.shields.io/badge/github-carburant-blue?logo=github"
            />
          </Link>
          <Link href="https://api.prix-carburants.2aaz.fr/" target="_blank" rel="noreferrer">
            <img alt="api prix carburants" src="https://img.shields.io/badge/api-prix%20carburants-blue" />
          </Link>
        </Stack>

        <Box sx={{ position: 'relative', maxWidth: 560 }}>
          <Stack spacing={1}>
            <TextField
              label="Ville"
              value={cityQuery}
              onChange={(e) => {
                setCityQuery(e.target.value)
                setSelectedCity(null)
                setCityDropdownOpen(true)
              }}
              placeholder="Ex: Valence"
              autoComplete="off"
              size="small"
              onFocus={() => {
                setCityDropdownOpen(true)
              }}
            />
            <Typography variant="caption" color="text.secondary">
              {selectedCity
                ? `Latitude: ${selectedCity.latitude.toFixed(4)} — Longitude: ${selectedCity.longitude.toFixed(4)} — Rayon: 10km`
                : 'Sélectionne une ville pour afficher les prix.'}
            </Typography>
          </Stack>

          {cityDropdownOpen && (cityLoading || citySuggestions.length > 0) ? (
            <Paper
              elevation={4}
              sx={{ position: 'absolute', zIndex: 10, mt: 1, width: '100%', maxHeight: 320, overflow: 'auto' }}
            >
              {cityLoading ? (
                <Box sx={{ p: 1.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    Recherche…
                  </Typography>
                </Box>
              ) : null}

              {!cityLoading && citySuggestions.length === 0 ? (
                <Box sx={{ p: 1.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    Aucune suggestion.
                  </Typography>
                </Box>
              ) : null}

              {!cityLoading && citySuggestions.length > 0 ? (
                <List disablePadding>
                  {citySuggestions.map((s) => (
                    <ListItemButton
                      key={`${s.city}-${s.postcode}-${s.label}`}
                      onClick={() => {
                        setCityQuery(s.label)
                        setSelectedCity({
                          label: s.label,
                          city: s.city,
                          postcode: s.postcode,
                          latitude: s.latitude,
                          longitude: s.longitude,
                        })
                        setCityDropdownOpen(false)
                        setCitySuggestions([])
                      }}
                    >
                      <ListItemText primary={s.label} secondary={s.postcode} />
                    </ListItemButton>
                  ))}
                </List>
              ) : null}
            </Paper>
          ) : null}
        </Box>

        {selectedCity ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>
                Totalité des prix carburants (ville)
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Agrégé par carburant. Pour limiter la volumétrie, les détails/prix sont chargés pour maximum 100 stations.
              </Typography>
            </Box>

            {aggregatedPricesByFuel.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {loading ? 'Chargement…' : 'Aucun prix à afficher.'}
              </Typography>
            ) : (
              <Stack spacing={2}>
                {aggregatedPricesByFuel.map(([fuel, rows]) => (
                  <Card key={fuel} variant="outlined">
                    <CardHeader
                      title={<Typography variant="subtitle1">{fuel}</Typography>}
                      subheader={<Typography variant="caption">{rows.length} prix</Typography>}
                    />
                    <CardContent>
                      <Stack spacing={1.25}>
                        {rows.map((r) => (
                          <Paper
                            key={`${fuel}-${r.stationId}-${r.valeur}-${r.maj}`}
                            variant="outlined"
                            sx={{ p: 1.5 }}
                          >
                            <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="flex-start">
                              <Box sx={{ minWidth: 0 }}>
                                <Typography variant="body2" fontWeight={600} noWrap>
                                  {r.brand} (id: {r.stationId})
                                </Typography>
                                <Typography variant="caption" color="text.secondary" noWrap>
                                  {r.address}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  sx={{ color: majTextColor(r.maj), display: 'block' }}
                                  noWrap
                                >
                                  maj: {r.maj}
                                </Typography>
                              </Box>
                              <Chip label={r.valeur} color="primary" size="small" />
                            </Stack>
                          </Paper>
                        ))}
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </Box>
        ) : null}

        {selectedCity ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {error ? (
              <Paper
                variant="outlined"
                sx={{ p: 2, borderColor: 'error.light', bgcolor: 'rgba(211,47,47,0.08)' }}
              >
                <Typography variant="body2" color="error">
                  {error}
                </Typography>
              </Paper>
            ) : null}

            {loading && items.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Chargement…
              </Typography>
            ) : null}

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                gap: 2,
              }}
            >
              {items.map((item) => {
                const s = item.station
                const brand = s.Brand?.name ?? '—'
                const street = s.Address?.street_line ?? '—'
                const city = s.Address?.city_line ?? '—'
                const opendataPrices = asDisplayPricesFromOpendata(item.opendata)
                const fuels = item.details?.Fuels ?? []

                return (
                  <Card key={s.id} variant="outlined">
                    <CardHeader
                      title={<Typography variant="subtitle1">{brand}</Typography>}
                      subheader={
                        <Typography variant="caption" color="text.secondary">
                          id: {s.id} — {street} — {city}
                        </Typography>
                      }
                    />
                    <Divider />
                    <CardContent>
                      {item.error ? (
                        <Typography variant="body2" color="error">
                          {item.error}
                        </Typography>
                      ) : opendataPrices.length > 0 ? (
                        <Stack spacing={1.25}>
                          {opendataPrices.map((p, idx) => (
                            <Paper
                              key={`${p.nom}-${idx}`}
                              variant="outlined"
                              sx={{ p: 1.5 }}
                            >
                              <Stack direction="row" spacing={2} justifyContent="space-between">
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography
                                    variant="body2"
                                    fontWeight={600}
                                    noWrap
                                  >
                                    {p.nom}
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    sx={{ color: majTextColor(p.maj), display: 'block' }}
                                    noWrap
                                  >
                                    maj: {p.maj}
                                  </Typography>
                                </Box>
                                <Chip label={p.valeur} size="small" />
                              </Stack>
                            </Paper>
                          ))}
                        </Stack>
                      ) : fuels.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          {loading ? 'Prix en cours de chargement…' : 'Aucun prix disponible.'}
                        </Typography>
                      ) : (
                        <Stack spacing={1.25}>
                          {fuels.map((f) => (
                            <Paper key={f.id} variant="outlined" sx={{ p: 1.5 }}>
                              <Stack direction="row" spacing={2} justifyContent="space-between">
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography
                                    variant="body2"
                                    fontWeight={600}
                                    noWrap
                                  >
                                    {f.name ?? '—'}
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      color: majTextColor(
                                        String(f.Update?.value ?? f.Update?.text ?? '—')
                                      ),
                                      display: 'block',
                                    }}
                                    noWrap
                                  >
                                    maj: {f.Update?.value ?? f.Update?.text ?? '—'}
                                  </Typography>
                                </Box>
                                <Chip
                                  label={
                                    typeof f.Price?.value === 'number' ? f.Price.value.toFixed(3) : '—'
                                  }
                                  size="small"
                                />
                              </Stack>
                            </Paper>
                          ))}
                        </Stack>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </Box>
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Choisis une ville pour afficher les prix.
          </Typography>
        )}
      </Box>
    </Box>
  )
}

export default App
