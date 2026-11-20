"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { sendVatRecapToAccountant } from "@/lib/actions"
import { buildAccountantEmailTemplate } from "@/lib/email-template"
import { generateInvoicePdfBlob, invoicePdfFilename } from "@/lib/pdf"
import type { VatReportSend } from "@/lib/vat-report-sends"
import type { AppConfig, Invoice } from "@/types"
import { FileText, LoaderCircle, Send } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

const CZ_MONTHS = [
  "", "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
  "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
]

/** Server action přijme max 4 MB těla; base64 přidává ~33 %, nechávám rezervu. */
const MAX_PDF_BYTES = 2.8 * 1024 * 1024

export interface MonthTarget {
  rok: number
  mesic: number
  /** Faktury vystavené do EU, kterých se souhrnné hlášení týká. */
  invoices: Invoice[]
}

interface Props {
  /** Měsíc k odeslání; null = dialog zavřený. */
  target: MonthTarget | null
  config: AppConfig
  onClose: () => void
  onSent: (send: VatReportSend) => void
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve((reader.result as string).split(",")[1] ?? "")
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export default function SendToAccountantDialog({ target, config, onClose, onSent }: Props) {
  const [to, setTo] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [sending, setSending] = useState(false)
  const wasOpen = useRef(false)

  const open = target !== null

  // Předvyplnění jen při přechodu zavřeno → otevřeno, aby se neztratily úpravy uživatele.
  useEffect(() => {
    if (open && !wasOpen.current && target) {
      const tpl = buildAccountantEmailTemplate(target.rok, target.mesic, config)
      setTo(config.tax.accountant_email)
      setSubject(tpl.subject)
      setBody(tpl.body)
    }
    wasOpen.current = open
  }, [open, target, config])

  async function handleSend() {
    if (!target) return
    if (!to.trim()) {
      toast.error("Zadejte e-mail účetní.")
      return
    }
    setSending(true)
    try {
      const blobs = await Promise.all(target.invoices.map((inv) => generateInvoicePdfBlob(inv, config)))
      const totalBytes = blobs.reduce((sum, b) => sum + b.size, 0)
      if (totalBytes > MAX_PDF_BYTES) {
        toast.error("Přílohy jsou příliš velké", {
          description: "Faktury za měsíc překračují limit e-mailu, odešlete je po částech.",
        })
        return
      }
      const attachments = await Promise.all(
        target.invoices.map(async (inv, i) => ({
          filename: invoicePdfFilename(inv),
          pdfBase64: await blobToBase64(blobs[i]),
        }))
      )
      const result = await sendVatRecapToAccountant({
        rok: target.rok,
        mesic: target.mesic,
        to: to.trim(),
        subject,
        body,
        attachments,
      })
      if (result.error || !result.send) {
        toast.error("E-mail se nepodařilo odeslat", { description: result.error })
        return
      }
      onSent(result.send)
      toast.success("Faktury odeslány účetní", { description: to.trim() })
      onClose()
    } catch (err) {
      toast.error("E-mail se nepodařilo odeslat", {
        description: err instanceof Error ? err.message : "Neznámá chyba",
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !sending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Odeslat účetní</DialogTitle>
          <DialogDescription>
            {target ? `${CZ_MONTHS[target.mesic]} ${target.rok} — faktury vystavené do EU` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="accountant-to">Komu</Label>
            <Input
              id="accountant-to"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="ucetni@firma.cz"
            />
            {!config.tax.accountant_email && (
              <p className="mt-1 text-xs text-text-secondary">
                E-mail účetní si můžete uložit v{" "}
                <a href="/settings" className="underline">
                  Nastavení
                </a>
                .
              </p>
            )}
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold text-text">Přílohy</span>
            <ul className="space-y-1.5">
              {(target?.invoices ?? []).map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center gap-3 rounded-lg bg-subtle px-3 py-2 text-sm"
                >
                  <FileText className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
                  <span className="flex-1 truncate">{invoicePdfFilename(inv)}</span>
                  <span className="truncate text-xs text-text-secondary">{inv.customer.name}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <Label htmlFor="accountant-subject">Předmět</Label>
            <Input
              id="accountant-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="accountant-body">Zpráva</Label>
            <Textarea
              id="accountant-body"
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Zrušit
          </Button>
          <Button variant="dark" onClick={handleSend} disabled={sending}>
            {sending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {sending ? "Odesílám…" : "Odeslat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
