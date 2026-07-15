import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest, { params }: { params: Promise<{ ico: string }> }) {
  const { ico } = await params
  const clean = ico.trim().replace(/\s+/g, "")
  if (!clean) return NextResponse.json({ error: "Chybí IČ" }, { status: 400 })

  try {
    const res = await fetch(
      `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${clean}`,
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Accept-Language": "cs-CZ,cs;q=0.9",
          "User-Agent": request.headers.get("user-agent") ?? "Mozilla/5.0",
          "X-Requested-With": "XMLHttpRequest",
          Referer: "https://ares.gov.cz/",
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
        },
      }
    )

    if (res.status === 404)
      return NextResponse.json({ error: "Subjekt v ARESu nenalezen" }, { status: 404 })
    if (!res.ok) return NextResponse.json({ error: `ARES ${res.status}` }, { status: 502 })

    const ct = res.headers.get("content-type") ?? ""
    if (!ct.includes("json")) {
      const preview = (await res.text()).slice(0, 120)
      return NextResponse.json(
        { error: `ARES vrátil neočekávaný formát: ${preview}` },
        { status: 502 }
      )
    }

    const json = await res.json()

    const addr = json.adresaDorucovaci ?? {}
    const sidlo = json.sidlo ?? {}

    // radekAdresy1 = "Ulice 123/4". The "PSČ Město" line is radekAdresy2 for
    // two-line addresses, but radekAdresy3 when a district sits on line 2.
    const street = addr.radekAdresy1 ?? ""
    const zipCityRe = /^(\d{3})\s?(\d{2})\s+(.+)$/
    const zipCityLine: string | undefined = [addr.radekAdresy3, addr.radekAdresy2].find(
      (line): line is string => typeof line === "string" && zipCityRe.test(line)
    )
    const zipCityMatch = zipCityLine?.match(zipCityRe)

    const fmtPsc = (psc: unknown): string => {
      const digits = String(psc ?? "").replace(/\s/g, "")
      return /^\d{5}$/.test(digits) ? `${digits.slice(0, 3)} ${digits.slice(3)}` : ""
    }

    const zip = zipCityMatch ? `${zipCityMatch[1]} ${zipCityMatch[2]}` : fmtPsc(sidlo.psc)
    const city = zipCityMatch ? zipCityMatch[3] : (sidlo.nazevObce ?? "")

    return NextResponse.json({
      obchodniJmeno: json.obchodniJmeno ?? "",
      dic: json.dic ?? "",
      street,
      zip,
      city,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Chyba: ${msg}` }, { status: 502 })
  }
}
