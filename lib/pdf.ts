"use client"

import { generateQRCode } from "@/lib/qr"
import type { AppConfig, Invoice, InvoiceFormData } from "@/types"
import type { DocumentProps } from "@react-pdf/renderer"
import React from "react"

export async function exportToPDF(invoice: InvoiceFormData, config: AppConfig): Promise<void> {
  const [qrImage, { pdf }, { InvoicePDF }] = await Promise.all([
    generateQRCode(invoice.total, invoice.invoice_number, invoice.language, config).catch(
      () => null
    ),
    import("@react-pdf/renderer"),
    import("./InvoicePDF"),
  ])

  const element = React.createElement(InvoicePDF, { invoice, config, qrImage }) as React.ReactElement<DocumentProps>
  const blob = await pdf(element).toBlob()

  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  const vs = invoice.invoice_number.replace(/^[A-Za-z]+/, "")
  a.download = `${vs}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function exportAllToPDF(
  invoices: Invoice[],
  config: AppConfig,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const [{ pdf }, { InvoicePDF }, JSZip] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./InvoicePDF"),
    import("jszip").then((m) => m.default),
  ])

  const zip = new JSZip()
  const total = invoices.length

  for (let i = 0; i < total; i++) {
    const invoice = invoices[i]
    const qrImage = await generateQRCode(
      invoice.total,
      invoice.invoice_number,
      invoice.language,
      config
    ).catch(() => null)

    const element = React.createElement(InvoicePDF, { invoice, config, qrImage }) as React.ReactElement<DocumentProps>
    const blob = await pdf(element).toBlob()
    const filename = `${invoice.invoice_number.replace(/^[A-Za-z]+/, "")}.pdf`
    zip.file(filename, blob)
    onProgress?.(i + 1, total)
  }

  const zipBlob = await zip.generateAsync({ type: "blob" })
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement("a")
  a.href = url
  const year = new Date().getFullYear()
  a.download = `faktury-${year}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
