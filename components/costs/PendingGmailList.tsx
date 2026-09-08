"use client"

import CostForm from "@/components/costs/CostForm"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { approvePending, getPendingAttachmentPreview, rejectPending } from "@/lib/gmail"
import type { CostFormData, GmailPending } from "@/types"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { toast } from "sonner"

interface Props {
  pending: GmailPending[]
}

type Preview =
  | { kind: "loading" }
  | { kind: "pdf"; base64: string }
  | { kind: "html"; html: string }
  | { kind: "error"; message: string }

export default function PendingGmailList({ pending }: Props) {
  const router = useRouter()
  const [active, setActive] = useState<GmailPending | null>(null)
  const [form, setForm] = useState<CostFormData | null>(null)
  const [preview, setPreview] = useState<Preview>({ kind: "loading" })
  const [busy, setBusy] = useState(false)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  // Generace požadavku na náhled — zahodí odpověď staršího řádku, když už je
  // otevřený jiný (nebo zavřeno), aby náhled neseděl na jiné faktuře než formulář.
  const previewReq = useRef(0)

  async function openRow(row: GmailPending) {
    const req = ++previewReq.current
    setActive(row)
    setForm(row.parsed)
    setPreview({ kind: "loading" })
    const res = await getPendingAttachmentPreview(row.id)
    if (previewReq.current !== req) return
    if ("error" in res) setPreview({ kind: "error", message: res.error })
    else setPreview(res)
  }

  function close() {
    previewReq.current++
    setActive(null)
    setForm(null)
  }

  async function handleApprove() {
    if (!active || !form) return
    setBusy(true)
    const res = await approvePending(active.id, form)
    setBusy(false)
    if (res.error) {
      toast.error("Schválení selhalo", { description: res.error })
      return
    }
    toast.success("Faktura schválena a uložena")
    close()
    router.refresh()
  }

  async function handleReject(id: string) {
    setRejectingId(id)
    const res = await rejectPending(id)
    setRejectingId(null)
    if (res.error) {
      toast.error("Odmítnutí selhalo", { description: res.error })
      return
    }
    toast.success("Faktura odmítnuta")
    if (active?.id === id) close()
    router.refresh()
  }

  if (pending.length === 0) return null

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <h2 className="text-base font-semibold text-text">Ke schválení z Gmailu</h2>
        <span className="inline-flex items-center rounded-full border border-border bg-subtle px-2 py-0.5 text-xs font-semibold tabular-nums text-text-secondary">
          {pending.length}
        </span>
      </div>
      <ul className="divide-y divide-border">
        {pending.map((row) => (
          <li key={row.id} className="flex items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-text">
                {row.parsed.supplier.name || row.email_from || "—"}
              </div>
              <div className="truncate text-xs text-text-secondary">
                {row.email_subject || "(bez předmětu)"}
              </div>
            </div>
            <Badge variant="blue" className="rounded-full normal-case tracking-normal">
              {row.has_pdf ? "PDF" : "E-mail"}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => openRow(row)}>
              Zkontrolovat
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={rejectingId === row.id}
              onClick={() => handleReject(row.id)}
              className="text-danger hover:bg-danger/10 hover:text-danger"
            >
              {rejectingId === row.id ? "Odmítám…" : "Odmítnout"}
            </Button>
          </li>
        ))}
      </ul>

      <Dialog open={!!active} onOpenChange={(o) => !o && close()}>
        <DialogContent className="flex max-h-[90vh] w-full max-w-[60rem] flex-col overflow-hidden p-0">
          <DialogHeader className="mb-0 shrink-0 border-b border-border px-6 py-4">
            <DialogTitle>Zkontrolovat fakturu z Gmailu</DialogTitle>
          </DialogHeader>
          <div className="grid flex-1 grid-cols-2 overflow-hidden">
            <div className="overflow-y-auto border-r border-border bg-subtle p-2">
              {preview.kind === "loading" && (
                <p className="p-4 text-sm text-text-secondary">Načítám náhled…</p>
              )}
              {preview.kind === "error" && (
                <p className="p-4 text-sm text-danger">{preview.message}</p>
              )}
              {preview.kind === "pdf" && (
                <iframe
                  title="Náhled PDF"
                  src={`data:application/pdf;base64,${preview.base64}`}
                  className="h-full min-h-[70vh] w-full rounded-md bg-white"
                />
              )}
              {preview.kind === "html" && (
                <iframe
                  title="Náhled e-mailu"
                  sandbox=""
                  srcDoc={preview.html}
                  className="h-full min-h-[70vh] w-full rounded-md bg-white"
                />
              )}
            </div>
            <div className="overflow-y-auto p-6">
              {form && <CostForm value={form} onChange={setForm} />}
            </div>
          </div>
          <DialogFooter className="mt-0 shrink-0 items-center border-t border-border px-6 py-4">
            <Button
              variant="ghost"
              disabled={busy || !active}
              onClick={() => active && handleReject(active.id)}
              className="mr-auto text-danger hover:bg-danger/10 hover:text-danger"
            >
              Odmítnout
            </Button>
            <Button variant="outline" onClick={close} disabled={busy}>
              Zrušit
            </Button>
            <Button variant="dark" onClick={handleApprove} disabled={busy || !form}>
              {busy ? "Schvaluji…" : "Schválit a uložit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
