"use client"

import { Button } from "@/components/ui/button"
import {
  disconnectGmail,
  listGmailLabels,
  setGmailLabel,
  syncGmailCosts,
} from "@/lib/gmail"
import type { GmailLabel, GmailStatus } from "@/lib/gmail-api"
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
              <select
                id="gmail-label"
                value={selectedLabel}
                onChange={(e) => setSelectedLabel(e.target.value)}
                disabled={loadingLabels}
                className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="">{loadingLabels ? "Načítám…" : "— vyber label —"}</option>
                {labels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <Button variant="outline" onClick={handleSaveLabel} disabled={savingLabel}>
                {savingLabel ? "Ukládám…" : "Uložit"}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="dark" onClick={handleSync} disabled={syncing || !status.labelId}>
              {syncing ? "Kontroluji…" : "Zkontrolovat teď"}
            </Button>
            <Button variant="outline" onClick={handleDisconnect}>
              Odpojit
            </Button>
            {status.lastSyncAt && (
              <span className="text-xs text-text-secondary">
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
    </div>
  )
}
