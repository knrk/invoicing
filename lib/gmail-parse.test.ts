import { describe, expect, it } from "vitest"
import type { GmailMessage } from "@/lib/gmail-api"
import { buildPendingDrafts, isFromYear, pendingKey } from "@/lib/gmail-parse"

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url")

function msgWithPdf(): GmailMessage {
  return {
    id: "m1",
    internalDate: "1700000000000",
    payload: {
      headers: [
        { name: "From", value: "Dodavatel s.r.o. <fakturace@dodavatel.cz>" },
        { name: "Subject", value: "Faktura 2024001" },
      ],
      parts: [
        { mimeType: "text/plain", body: { data: b64url("Variabilní symbol 12345") } },
        { mimeType: "application/pdf", filename: "faktura.pdf", body: { attachmentId: "att1" } },
      ],
    },
  }
}

function msgHtmlOnly(): GmailMessage {
  return {
    id: "m2",
    internalDate: "1700000000000",
    payload: {
      headers: [
        { name: "From", value: "Apple <no_reply@apple.com>" },
        { name: "Subject", value: "Your receipt" },
      ],
      parts: [{ mimeType: "text/html", body: { data: b64url("<p>Receipt</p>") } }],
    },
  }
}

function msgNoContent(): GmailMessage {
  return { id: "m3", internalDate: "1700000000000", payload: { headers: [], parts: [] } }
}

describe("buildPendingDrafts", () => {
  it("vytvoří draft na PDF přílohu s parsovaným VS", () => {
    const drafts = buildPendingDrafts(msgWithPdf(), [], new Set())
    expect(drafts).toHaveLength(1)
    expect(drafts[0].attachment_id).toBe("att1")
    expect(drafts[0].has_pdf).toBe(true)
    expect(drafts[0].attachment_name).toBe("faktura.pdf")
    expect(drafts[0].parsed.variable_symbol).toBe("12345")
    expect(drafts[0].parsed.source).toBe("gmail")
  })

  it("bez PDF vytvoří body draft z HTML těla", () => {
    const drafts = buildPendingDrafts(msgHtmlOnly(), [], new Set())
    expect(drafts).toHaveLength(1)
    expect(drafts[0].attachment_id).toBe("body")
    expect(drafts[0].has_pdf).toBe(false)
    expect(drafts[0].attachment_name).toBeNull()
  })

  it("přeskočí už známé dvojice", () => {
    const known = new Set([pendingKey("m1", "att1")])
    expect(buildPendingDrafts(msgWithPdf(), [], known)).toHaveLength(0)
  })

  it("bez PDF a bez těla nevytvoří nic", () => {
    expect(buildPendingDrafts(msgNoContent(), [], new Set())).toHaveLength(0)
  })
})

describe("isFromYear", () => {
  // internalDate 1700000000000 = 2023-11-14
  it("sedí na rok e-mailu", () => {
    expect(isFromYear("1700000000000", 2023)).toBe(true)
  })

  it("odmítne jiný rok", () => {
    expect(isFromYear("1700000000000", 2024)).toBe(false)
    expect(isFromYear("1700000000000", 2022)).toBe(false)
  })

  it("chybějící internalDate bere jako aktuální rok", () => {
    expect(isFromYear(undefined, new Date().getFullYear())).toBe(true)
  })
})
