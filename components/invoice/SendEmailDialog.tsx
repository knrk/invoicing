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
import { sendInvoiceEmail } from "@/lib/actions"
import { buildInvoiceEmailTemplate } from "@/lib/email-template"
import { generateInvoicePdfBlob, invoicePdfFilename } from "@/lib/pdf"
import type { AppConfig, InvoiceFormData } from "@/types"
import { LoaderCircle } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: InvoiceFormData
  config: AppConfig
  defaultEmail: string
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve((reader.result as string).split(",")[1] ?? "")
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export function SendEmailDialog({ open, onOpenChange, invoice, config, defaultEmail }: Props) {
  const [to, setTo] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [sending, setSending] = useState(false)
  const wasOpen = useRef(false)

  // Prefill fields when the dialog opens (only on the closed→open transition,
  // so the user's edits are not overwritten by parent re-renders).
  useEffect(() => {
    if (open && !wasOpen.current) {
      const tpl = buildInvoiceEmailTemplate(invoice, config)
      setTo(defaultEmail)
      setSubject(tpl.subject)
      setBody(tpl.body)
    }
    wasOpen.current = open
  }, [open, invoice, config, defaultEmail])

  async function handleSend() {
    if (!to.trim()) {
      toast.error("Zadejte e-mail příjemce.")
      return
    }
    setSending(true)
    try {
      const blob = await generateInvoicePdfBlob(invoice, config)
      const pdfBase64 = await blobToBase64(blob)
      const result = await sendInvoiceEmail({
        to: to.trim(),
        subject,
        body,
        pdfBase64,
        filename: invoicePdfFilename(invoice),
      })
      if (result.error) {
        toast.error("E-mail se nepodařilo odeslat", { description: result.error })
      } else {
        toast.success("Faktura odeslána", { description: to.trim() })
        onOpenChange(false)
      }
    } catch (err) {
      toast.error("E-mail se nepodařilo odeslat", {
        description: err instanceof Error ? err.message : "Neznámá chyba",
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Zaslat fakturu e-mailem</DialogTitle>
          <DialogDescription>
            Faktura {invoice.invoice_number} bude odeslána jako PDF příloha.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="email-to">Příjemce</Label>
            <Input
              id="email-to"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="odberatel@firma.cz"
            />
          </div>
          <div>
            <Label htmlFor="email-subject">Předmět</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="email-body">Zpráva</Label>
            <Textarea
              id="email-body"
              rows={9}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Zrušit
          </Button>
          <Button variant="dark" onClick={handleSend} disabled={sending}>
            {sending && <LoaderCircle size={16} className="animate-spin" />}
            {sending ? "Odesílám…" : "Odeslat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
