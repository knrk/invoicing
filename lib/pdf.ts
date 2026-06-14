"use client"

import React from "react"
import type { InvoiceFormData, AppConfig, Invoice } from "@/types"
import { generateQRCode } from "@/lib/qr"

/**
 * Generates a machine-readable PDF using @react-pdf/renderer (flexbox layout,
 * no bundler workarounds needed) and triggers a browser download.
 *
 * Both react-pdf and the InvoicePDF component are imported dynamically so they
 * are never included in the SSR bundle.
 */
export async function exportToPDF(
  invoice: InvoiceFormData,
  config: AppConfig
): Promise<void> {
  // Parallel: generate QR + load react-pdf + load component
  const [qrImage, { pdf }, { InvoicePDF }] = await Promise.all([
    generateQRCode(invoice.total, invoice.invoice_number, invoice.language, config).catch(
      () => null
    ),
    import("@react-pdf/renderer"),
    import("./InvoicePDF"),
  ])

  // Cast needed because React.createElement returns FunctionComponentElement<Props>
  // while pdf() expects ReactElement<DocumentProps> — the runtime type is correct.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(InvoicePDF, { invoice, config, qrImage }) as any
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

/**
 * Generates PDFs for all invoices and downloads them as a single ZIP archive.
 * onProgress(done, total) is called after each PDF is generated.
 */
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = React.createElement(InvoicePDF, { invoice, config, qrImage }) as any
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
