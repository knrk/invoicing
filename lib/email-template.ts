import { fmtNum, formatDate } from "@/lib/invoice"
import type { AppConfig, InvoiceFormData } from "@/types"

export interface EmailTemplate {
  subject: string
  body: string
}

/**
 * Default subject + body prefilled into the "send by e-mail" dialog. The
 * language follows the invoice language (cs/en).
 */
export function buildInvoiceEmailTemplate(
  invoice: InvoiceFormData,
  config: AppConfig
): EmailTemplate {
  const number = invoice.invoice_number
  const amount = `${fmtNum(invoice.total)} ${invoice.currency === "CZK" ? "Kč" : "€"}`
  const due = formatDate(invoice.due_date, invoice.language)
  const supplier = config.supplier.name

  if (invoice.language === "en") {
    return {
      subject: `Invoice ${number}`,
      body: `Hello,

Please find attached invoice no. ${number}, due on ${due}, for the amount of ${amount}.

Thank you.

Best regards,
${supplier}`,
    }
  }

  return {
    subject: `Faktura ${number}`,
    body: `Dobrý den,

v příloze zasílám fakturu č. ${number} se splatností ${due} na částku ${amount}.

Děkuji.

S pozdravem,
${supplier}`,
  }
}
