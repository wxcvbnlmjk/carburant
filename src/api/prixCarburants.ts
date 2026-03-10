export type DateTime = {
  value?: string
  text?: string
}

export type Price = {
  value?: number
  currency?: string
  unit?: string
  text?: string
}

export type Brand = {
  id: number
  name?: string
  short_name?: string
}

export type StationAddress = {
  street_line?: string
  city_line?: string
}

export type StationFuelPrice = {
  id: number
  name?: string
  short_name?: string
  type?: 'D' | 'E' | 'G'
  picto?: string
  Update?: DateTime
  rupture?: boolean
  Price?: Price
}

export type Station = {
  id: number
  Brand?: Brand
  type?: 'R' | 'A'
  name?: string
  Address?: StationAddress
  Fuels?: StationFuelPrice[]
  LastUpdate?: DateTime
}

export type StationD = Station & {
  Distance?: {
    value?: number
    text?: string
  }
}

export type StationType = 'R' | 'A'

const API_BASE = 'https://api.prix-carburants.2aaz.fr'

async function fetchJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`)
  }

  return (await res.json()) as T
}

async function fetchJsonOrNull<T>(
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (res.status === 416) return null

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`)
  }

  return (await res.json()) as T
}

export async function getStationsAround(params: {
  latitude: number
  longitude: number
  types?: StationType | StationType[]
  responseFields?: string
  range?: string
}): Promise<StationD[]> {
  const { latitude, longitude, types, responseFields, range } = params

  const query = new URLSearchParams()
  if (types) query.set('types', Array.isArray(types) ? types.join(',') : types)
  if (responseFields) query.set('responseFields', responseFields)

  return fetchJson<StationD[]>(`/stations/around/${latitude},${longitude}?${query.toString()}`, {
    headers: {
      ...(range ? { Range: range } : {}),
    },
  })
}

export async function getStations(params: {
  q: string
  types?: StationType | StationType[]
  responseFields?: string
  range?: string
}): Promise<Station[]> {
  const { q, types, responseFields, range } = params

  const query = new URLSearchParams()
  query.set('q', q)
  if (types) query.set('types', Array.isArray(types) ? types.join(',') : types)
  if (responseFields) query.set('responseFields', responseFields)

  return fetchJson<Station[]>(`/stations/?${query.toString()}`, {
    headers: {
      ...(range ? { Range: range } : {}),
    },
  })
}

export async function getStationsAll(params: {
  q: string
  types?: StationType | StationType[]
  responseFields?: string
  pageSize?: number
  maxPages?: number
}): Promise<Station[]> {
  const { q, types, responseFields, pageSize = 20, maxPages = 15 } = params

  const out: Station[] = []

  for (let page = 0; page < maxPages; page += 1) {
    const start = page * pageSize + 1
    const end = start + pageSize - 1
    const range = `station=${start}-${end}`

    const query = new URLSearchParams()
    query.set('q', q)
    if (types) query.set('types', Array.isArray(types) ? types.join(',') : types)
    if (responseFields) query.set('responseFields', responseFields)

    const data = await fetchJsonOrNull<Station[]>(`/stations/?${query.toString()}`, {
      headers: {
        Range: range,
      },
    })

    if (!data || data.length === 0) break

    out.push(...data)

    if (data.length < pageSize) break
  }

  return out
}

export async function getStation(id: number): Promise<Station> {
  return fetchJson<Station>(`/station/${id}`)
}

export async function getStationOpendata(
  id: number,
  opendata: 'v1' | 'v2' = 'v1',
): Promise<unknown> {
  return fetchJson<unknown>(`/station/${id}?opendata=${encodeURIComponent(opendata)}`)
}
