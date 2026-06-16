/** A day's forecast for an event (from Open-Meteo, via /api/weather). When
 *  `available` is false the forecast couldn't be resolved (no location, outside
 *  the ~16-day window, or the upstream call failed) and the rest is null. */
export interface Forecast {
  available: boolean
  high: number | null
  low: number | null
  precipProbability: number | null
  code: number | null
  place: string | null
}
