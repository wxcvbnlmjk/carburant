export type CitySuggestion = {
  label: string
  city: string
  citycode: string
  postcode: string
  latitude: number
  longitude: number
}

type BanFeature = {
  geometry?: {
    coordinates?: [number, number]
  }
  properties?: {
    label?: string
    city?: string
    citycode?: string
    postcode?: string
  }
}

type BanResponse = {
  features?: BanFeature[]
}

export async function searchCities(params: {
  q: string
  limit?: number
}): Promise<CitySuggestion[]> {
  const { q, limit = 8 } = params

  const url = new URL('https://api-adresse.data.gouv.fr/search/')
  url.searchParams.set('q', q)
  url.searchParams.set('type', 'municipality')
  url.searchParams.set('limit', String(limit))

  const res = await fetch(url.toString(), {
    headers: {
      accept: 'application/json',
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`BAN HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`)
  }

  const data = (await res.json()) as BanResponse

  const suggestions: CitySuggestion[] = []

  for (const f of data.features ?? []) {
    const label = f.properties?.label
    const city = f.properties?.city
    const citycode = f.properties?.citycode
    const postcode = f.properties?.postcode
    const coords = f.geometry?.coordinates
    const longitude = Array.isArray(coords) ? coords[0] : undefined
    const latitude = Array.isArray(coords) ? coords[1] : undefined

    if (!label || !city || !citycode || !postcode) continue
    if (typeof latitude !== 'number' || typeof longitude !== 'number') continue

    suggestions.push({ label, city, citycode, postcode, latitude, longitude })
  }

  return suggestions
}

export async function getCityPostcodes(params: {
  city: string
  citycode: string
  limit?: number
}): Promise<string[]> {
  const { city, citycode, limit = 20 } = params

  const url = new URL('https://api-adresse.data.gouv.fr/search/')
  url.searchParams.set('q', city)
  url.searchParams.set('type', 'municipality')
  url.searchParams.set('citycode', citycode)
  url.searchParams.set('limit', String(limit))

  const res = await fetch(url.toString(), {
    headers: {
      accept: 'application/json',
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`BAN HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`)
  }

  const data = (await res.json()) as BanResponse
  const set = new Set<string>()

  for (const f of data.features ?? []) {
    const pc = f.properties?.postcode
    if (pc) set.add(pc)
  }

  return [...set]
}
