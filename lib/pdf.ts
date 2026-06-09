"use client"

import React from "react"
import type { InvoiceFormData, AppConfig } from "@/types"
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
  a.download = `faktura-${invoice.invoice_number}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
