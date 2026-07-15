"use client"

import { useState } from "react"

export interface AresData {
  obchodniJmeno: string
  dic: string
  street: string
  zip: string
  city: string
}

interface UseAresLookup {
  aresLoading: boolean
  /**
   * Fetches subject data from ARES for the given IČ. Returns the parsed data,
   * or `null` when the IČ is empty or the lookup fails (in which case `onError`
   * is invoked with a human-readable message). Applying the data to a form is
   * left to the caller, since form shapes differ.
   */
  lookupAres: (ico: string) => Promise<AresData | null>
}

export function useAresLookup(onError: (message: string) => void): UseAresLookup {
  const [aresLoading, setAresLoading] = useState(false)

  async function lookupAres(ico: string): Promise<AresData | null> {
    const clean = ico.trim()
    if (!clean) return null
    setAresLoading(true)
    try {
      const res = await fetch(`/api/ares/${clean}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        onError(body.error ?? `ARES ${res.status}`)
        return null
      }
      return (await res.json()) as AresData
    } catch {
      onError("Nepodařilo se spojit s ARESem")
      return null
    } finally {
      setAresLoading(false)
    }
  }

  return { aresLoading, lookupAres }
}
