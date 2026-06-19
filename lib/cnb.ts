const CNB_BASE = "https://api.cnb.cz/cnbapi/exrates/daily"

interface CnbRate {
  validFor: string
  order: number
  country: string
  currency: string
  amount: number
  currencyCode: string
  rate: number
}

interface CnbResponse {
  rates: CnbRate[]
}

/**
 * Returns the EUR→CZK exchange rate for the given date (YYYY-MM-DD).
 * Falls back to the most recent available rate if the date is a weekend/holiday.
 */
export async function getEurCzkRate(date: string): Promise<number> {
  const url = `${CNB_BASE}?date=${date}&lang=EN`
  const res = await fetch(url, { next: { revalidate: 86400 } })
  if (!res.ok) throw new Error(`CNB API error ${res.status} for date ${date}`)

  const data: CnbResponse = await res.json()
  const eur = data.rates.find((r) => r.currencyCode === "EUR")
  if (!eur) throw new Error(`EUR rate not found in CNB response for ${date}`)

  // rate is per `amount` units (usually 1 for EUR)
  return eur.rate / eur.amount
}
