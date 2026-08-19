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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  backfillGmailReceivedDates,
  disconnectGmail,
  listGmailLabels,
  reimportAllGmail,
  setGmailLabel,
  syncGmailCosts,
} from "@/lib/gmail"
import type { GmailLabel, GmailStatus } from "@/lib/gmail-api"
import { cn } from "@/lib/utils"
import { CalendarClock, Mail, RefreshCw, Unplug } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

interface Props {
  status: GmailStatus
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("cs-CZ", { dateStyle: "medium", timeStyle: "short" })
}

export default function GmailIntegrationSettings({ status }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [labels, setLabels] = useState<GmailLabel[]>([])
  const [selectedLabel, setSelectedLabel] = useState(status.labelId ?? "")
  const [loadingLabels, setLoadingLabels] = useState(false)
  const [savingLabel, setSavingLabel] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const [reimporting, setReimporting] = useState(false)
  const [confirmReimport, setConfirmReimport] = useState(false)
  const [needsReconnect, setNeedsReconnect] = useState(false)
  const toastedParam = useRef(false)

  const loadLabels = useCallback(async () => {
    setLoadingLabels(true)
    const res = await listGmailLabels()
    setLoadingLabels(false)
    if (res.needsReconnect) {
      setNeedsReconnect(true)
      return
    }
    if (res.error) {
      toast.error("Nepodařilo se načíst labely", { description: res.error })
      return
    }
    setLabels(res.labels ?? [])
  }, [])

  // Toast podle návratu z OAuth (?gmail=connected|error)
  useEffect(() => {
    if (toastedParam.current) return
    const g = searchParams.get("gmail")
    if (g === "connected") {
      toast.success("Gmail připojen")
      toastedParam.current = true
    } else if (g === "error") {
      toast.error("Připojení Gmailu selhalo")
      toastedParam.current = true
    }
  }, [searchParams])

  useEffect(() => {
    if (status.connected) loadLabels()
  }, [status.connected, loadLabels])

  function connect() {
    window.location.href = "/api/integrations/gmail/connect"
  }

  async function handleSaveLabel() {
    const label = labels.find((l) => l.id === selectedLabel)
    if (!label) {
      toast.error("Vyber prosím label")
      return
    }
    setSavingLabel(true)
    const res = await setGmailLabel(label.id, label.name)
    setSavingLabel(false)
    if (res.error) toast.error("Uložení labelu selhalo", { description: res.error })
    else {
      toast.success("Label uložen")
      router.refresh()
    }
  }

  async function handleSync() {
    setSyncing(true)
    const res = await syncGmailCosts()
    setSyncing(false)
    if (res.needsReconnect) {
      setNeedsReconnect(true)
      toast.error("Přístup vypršel", { description: "Připoj Gmail znovu." })
      return
    }
    if (res.error) {
      toast.error("Kontrola Gmailu selhala", { description: res.error })
      return
    }
    toast.success(
      `Hotovo: ${res.imported} nových, ${res.skipped} přeskočeno` +
        (res.errors.length ? `, ${res.errors.length} chyb` : "")
    )
    if (res.errors.length) {
      toast.error("Některé přílohy se nenahrály", { description: res.errors.slice(0, 3).join("; ") })
    }
    router.refresh()
  }

  async function handleBackfill() {
    setBackfilling(true)
    const res = await backfillGmailReceivedDates()
    setBackfilling(false)
    if (res.needsReconnect) {
      setNeedsReconnect(true)
      toast.error("Přístup vypršel", { description: "Připoj Gmail znovu." })
      return
    }
    if (res.error) {
      toast.error("Doplnění datumů selhalo", { description: res.error })
      return
    }
    toast.success(`Datumy doplněny u ${res.updated} nákladů`)
    if (res.errors.length) {
      toast.error("Některé se nepodařilo", { description: res.errors.slice(0, 3).join("; ") })
    }
    router.refresh()
  }

  async function handleReimport() {
    setReimporting(true)
    const res = await reimportAllGmail()
    setReimporting(false)
    setConfirmReimport(false)
    if (res.needsReconnect) {
      setNeedsReconnect(true)
      toast.error("Přístup vypršel", { description: "Připoj Gmail znovu." })
      return
    }
    if (res.error) {
      toast.error("Přeimport selhal", { description: res.error })
      return
    }
    toast.success(`Přeimportováno: ${res.imported} nákladů`)
    if (res.errors.length) {
      toast.error("Některé se nepodařily", { description: res.errors.slice(0, 3).join("; ") })
    }
    router.refresh()
  }

  async function handleDisconnect() {
    const res = await disconnectGmail()
    if (res.error) toast.error("Odpojení selhalo", { description: res.error })
    else {
      toast.success("Gmail odpojen")
      router.refresh()
    }
  }

  return (
    <div className="mt-10 rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-1 text-[15px] font-semibold text-text">Napojení Gmailu</h2>
      <p className="mb-4 text-sm text-text-secondary">
        Pravidelná kontrola jednoho labelu — PDF přílohy se importují jako náklady.
      </p>

      {!status.connected ? (
        <Button variant="dark" onClick={connect}>
          Připojit Gmail
        </Button>
      ) : needsReconnect ? (
        <div className="space-y-3">
          <p className="text-sm text-danger">Přístup ke Gmailu vypršel.</p>
          <Button variant="dark" onClick={connect}>
            Připojit znovu
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-text">
            Připojeno jako <span className="font-medium">{status.email}</span>
          </p>

          <div>
            <label htmlFor="gmail-label" className="mb-1 block text-sm text-text-secondary">
              Sledovaný label
            </label>
            <div className="flex items-center gap-2">
              <Select
                value={selectedLabel}
                onValueChange={setSelectedLabel}
                disabled={loadingLabels}
              >
                <SelectTrigger id="gmail-label" className="flex-1">
                  <SelectValue placeholder={loadingLabels ? "Načítám…" : "— vyber label —"} />
                </SelectTrigger>
                <SelectContent>
                  {labels.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={handleSaveLabel} disabled={savingLabel}>
                {savingLabel ? "Ukládám…" : "Uložit"}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="dark"
              size="icon"
              onClick={handleSync}
              disabled={syncing || !status.labelId}
              title="Zkontrolovat teď"
              aria-label="Zkontrolovat teď"
            >
              <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
            </Button>
            <Button variant="outline" onClick={handleBackfill} disabled={backfilling}>
              <CalendarClock className="mr-1.5 h-4 w-4" />
              {backfilling ? "Doplňuji…" : "Doplnit datumy"}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setConfirmReimport(true)}
              disabled={reimporting || !status.labelId}
              title="Přeimportovat vše z Gmailu"
              aria-label="Přeimportovat vše z Gmailu"
            >
              <Mail className={cn("h-4 w-4", reimporting && "animate-pulse")} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleDisconnect}
              title="Odpojit"
              aria-label="Odpojit"
            >
              <Unplug className="h-4 w-4" />
            </Button>
            {status.lastSyncAt && (
              <span className="ml-auto text-xs text-text-secondary">
                Naposledy: {fmtDateTime(status.lastSyncAt)}
              </span>
            )}
          </div>
          {!status.labelId && (
            <p className="text-xs text-text-secondary">
              Nejdřív vyber a ulož label, pak půjde spustit kontrola.
            </p>
          )}
        </div>
      )}

      <Dialog open={confirmReimport} onOpenChange={(o) => !o && setConfirmReimport(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Přeimportovat vše z Gmailu?</DialogTitle>
            <DialogDescription>
              Smaže stávající náklady načtené z Gmailu (ruční uploady zůstanou) a naimportuje je
              znovu z labelu s aktuálním předvyplněním. Nevratné.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReimport(false)}>
              Zrušit
            </Button>
            <Button variant="destructive" disabled={reimporting} onClick={handleReimport}>
              {reimporting ? "Přeimportuji…" : "Přeimportovat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
