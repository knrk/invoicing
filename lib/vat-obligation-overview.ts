import type { Cost, Currency, Invoice } from "@/types"

/** Jedna kvalifikující se přijatá faktura (pořízení z EU / přenesená DP). */
export interface ReceivedObligationCost {
  id: string
  supplier_name: string
  invoice_number: string
  total: number
  currency: Currency
  is_eu_supplier: boolean
  reverse_charge: boolean
}

/** Souhrn přijaté strany za jeden měsíc. */
export interface ReceivedObligationData {
  rok: number
  mesic: number
  costs: ReceivedObligationCost[]
  totalCzk: number
  totalEur: number
}

/** Náklad zakládá povinnost, když je z EU nebo v režimu přenesené DP. */
function isObligationCost(cost: Cost): boolean {
  return cost.is_eu_supplier || cost.reverse_charge
}

/**
 * Filtruje náklady daného měsíce (podle issue_date) na kvalifikující se
 * (pořízení z EU / přenesená DP) a vrací souhrn zvlášť per měna — tržby a
 * náklady se nikdy nesčítají dohromady.
 */
export function buildReceivedObligationData(
  costs: Cost[],
  rok: number,
  mesic: number
): ReceivedObligationData {
  const pad = (n: number) => String(n).padStart(2, "0")
  const prefix = `${rok}-${pad(mesic)}`

  const qualifying = costs.filter(
    (c) => c.issue_date.startsWith(prefix) && isObligationCost(c)
  )

  let totalCzk = 0
  let totalEur = 0
  for (const c of qualifying) {
    if (c.currency === "EUR") totalEur += c.total
    else totalCzk += c.total
  }

  return {
    rok,
    mesic,
    costs: qualifying.map((c) => ({
      id: c.id,
      supplier_name: c.supplier.name,
      invoice_number: c.invoice_number,
      total: c.total,
      currency: c.currency,
      is_eu_supplier: c.is_eu_supplier,
      reverse_charge: c.reverse_charge,
    })),
    totalCzk,
    totalEur,
  }
}

/**
 * Sjednocení dokončených měsíců (ym < aktuální měsíc) napříč vydanými fakturami
 * i přijatými náklady, newest-first. Doklad bez issue_date se přeskočí.
 */
export function completedMonths(
  invoices: Invoice[],
  costs: Cost[]
): { rok: number; mesic: number }[] {
  const now = new Date()
  const currentYM = now.getFullYear() * 100 + (now.getMonth() + 1)

  const seen = new Set<number>()
  const collect = (dates: string[]) => {
    for (const d of dates) {
      if (!d) continue
      const [y, m] = d.split("-").map(Number)
      if (!y || !m) continue
      const ym = y * 100 + m
      if (ym < currentYM) seen.add(ym)
    }
  }
  collect(invoices.map((inv) => inv.issue_date))
  collect(costs.map((c) => c.issue_date))

  return [...seen]
    .sort((a, b) => b - a)
    .map((ym) => ({ rok: Math.floor(ym / 100), mesic: ym % 100 }))
}
