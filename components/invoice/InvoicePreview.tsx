"use client"

import { useEffect, useState } from "react"
import type { Invoice, AppConfig } from "@/types"
import { LABELS, formatDate, getPaymentParts, ibanToCzDomestic, fmtNum } from "@/lib/invoice"
import { generateQRCode } from "@/lib/qr"
import s from "./InvoicePreview.module.css"

interface Props {
  invoice: Partial<Invoice>
  config: AppConfig
}

export default function InvoicePreview({ invoice, config }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("")
  const lang = invoice.language ?? "cs"
  const L = LABELS[lang]
  const currency = invoice.currency ?? "CZK"
  const total = invoice.total ?? 0
  const invoiceNumber = invoice.invoice_number ?? ""
  const locale = lang === "cs" ? "cs-CZ" : "en-GB"
  const kc = lang === "cs" ? "Kč" : currency
  const showQtyPrice = (invoice.lines ?? []).some((l) => l.quantity > 1)

  // Narrow dependencies to only the banking fields that affect QR generation
  const { account_czk, account_eur_iban, account_eur_bic, constant_symbol } = config.banking
  useEffect(() => {
    if (total > 0 && invoiceNumber) {
      generateQRCode(total, invoiceNumber, lang, config)
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(""))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, invoiceNumber, lang, account_czk, account_eur_iban, account_eur_bic, constant_symbol])

  const account = lang === "cs"
    ? ibanToCzDomestic(config.banking.account_czk)
    : config.banking.account_eur_iban
  const totalFormatted = fmtNum(total) + " " + kc
  const vs = invoice.variable_symbol || invoiceNumber.replace(/^[A-Za-z]+/, "")

  return (
    <div id="invoice-preview" className={`invoice-a4 ${s.invoice} flex text-black bg-white`}>

      {/* ── LEFT COLUMN ── */}
      <div className={`${s["invoice__left"]} shrink-0 flex flex-col justify-between py-10 pr-5 pl-10 bg-[rgba(216,216,216,0.75)]`}>

        {/* Top: title + meta fields */}
        <div className="flex flex-col gap-4">

          <div className="flex flex-col gap-[10px]">
            <div className={`${s["invoice__title-bar"]} bg-black`} />
            <p className={s["invoice__title"]}>{L.invoice}</p>
          </div>

          <MetaField label={lang === "cs" ? "ČÍSLO FAKTURY"     : "INVOICE NUMBER"} value={invoiceNumber.replace(/^[A-Za-z]+/, "")} />
          <MetaField label={lang === "cs" ? "DATUM VYSTAVENÍ"   : "ISSUE DATE"}     value={invoice.issue_date ? formatDate(invoice.issue_date, lang) : ""} />
          <MetaField label={lang === "cs" ? "DATUM SPLATNOSTI"  : "DUE DATE"}       value={invoice.due_date  ? formatDate(invoice.due_date,  lang) : ""} />
          <MetaField label={lang === "cs" ? "PLATBA"            : "PAYMENT"}        value={invoice.payment_method ?? L.payByTransfer} />
          {lang === "cs" && <MetaField label="NA ÚČET"           value={account} />}
          {lang === "cs" && <MetaField label="VARIABILNÍ SYMBOL" value={vs} />}
          {lang !== "cs" && invoice.reverse_charge && <MetaField label="MODE" value="Reverse Charge" />}
        </div>

        {/* Bottom: penalty notice + thanks */}
        <div className="flex flex-col gap-[80px]">
          <div className={s["invoice__notice"]}>
            <p className={s["invoice__notice-text"]}>
              {lang === "cs" ? config.footer.penalty_cs : config.footer.penalty_en}
              {"\n\n"}
              {lang === "cs" ? config.footer.note_cs : config.footer.note_en}
            </p>
          </div>

          <div className="flex items-center gap-1 leading-none">
            <svg
              width="10" height="9" viewBox="0 0 10 9"
              fill="none" xmlns="http://www.w3.org/2000/svg"
              className="block shrink-0"
            >
              <path
                d="M8.53944 0.350666C8.13457 0.128035 7.67018 0 7.17474 0C6.30059 0 5.51776 0.397595 5.00085 1.02105C4.4815 0.397595 3.6994 0 2.82407 0C2.32982 0 1.86628 0.128035 1.4605 0.350666C0.589879 0.831918 0 1.75718 0 2.82052C0 3.12494 0.0496298 3.41688 0.13952 3.69001C0.62429 5.86497 5.00085 8.60801 5.00085 8.60801C5.00085 8.60801 9.37452 5.86503 9.85997 3.69001C9.94986 3.41688 10 3.12454 10 2.82052C10 1.75758 9.41012 0.832598 8.53944 0.350666Z"
                fill="black"
              />
            </svg>
            <span className={s["invoice__thanks-text"]}>
              {lang === "cs" ? "Děkuji za důvěru." : "Thank you."}
            </span>
          </div>
        </div>
      </div>

      {/* ── RIGHT COLUMN ── */}
      <div className="flex-1 flex flex-col px-10 pt-9">

        {/* Parties: ODBĚRATEL / DODAVATEL */}
        <div className="flex gap-4 mb-[100px]">
          <Party
            role={L.customer}
            name={invoice.customer?.name || "—"}
            identifier={
              lang === "cs" && invoice.customer?.ico
                ? `IČ: ${invoice.customer.ico}`
                : undefined
            }
            vatId={
              lang !== "cs" && invoice.customer?.dic
                ? invoice.customer.dic
                : undefined
            }
            address={[
              invoice.customer?.street,
              invoice.customer?.zip && invoice.customer?.city
                ? `${invoice.customer.zip} ${localizeCzCity(invoice.customer.city ?? "", lang)}`
                : "",
              lang !== "cs"
                ? localizeCzCountry(invoice.customer?.country ?? "", lang)
                : "",
            ].filter(Boolean).join(lang !== "cs" ? "\n" : ", ")}
          />
          <Party
            role={L.supplier}
            name={config.supplier.name}
            identifier={lang === "cs" ? `${L.partyIcoLabel}: ${config.supplier.ico}` : undefined}
            vatId={lang !== "cs" && config.supplier.dic ? config.supplier.dic : undefined}
            address={[
              config.supplier.street,
              `${config.supplier.zip} ${localizeCzCity(config.supplier.city, lang)}`,
              lang !== "cs" ? "Czech Republic" : "",
            ].filter(Boolean).join(lang !== "cs" ? "\n" : ", ")}
          />
        </div>

        {/* Line items table */}
        <table className="w-full border-collapse mb-6">
          <thead>
            <tr>
              <th className={`${s["invoice__th"]} text-left border-t-[3px] border-b-[3px] border-black`}>
                {L.description}
              </th>
              {showQtyPrice && (
                <th className={`${s["invoice__th"]} ${s["invoice__th--center"]} text-center border-t-[3px] border-b-[3px] border-black`}>
                  {L.quantity}
                </th>
              )}
              {showQtyPrice && (
                <th className={`${s["invoice__th"]} ${s["invoice__th--right"]} text-right border-t-[3px] border-b-[3px] border-black`}>
                  {L.unitPrice}
                </th>
              )}
              <th className={`${s["invoice__th"]} ${s["invoice__th--right"]} text-right border-t-[3px] border-b-[3px] border-black`}>
                {L.total}
              </th>
            </tr>
          </thead>
          <tbody>
            {(invoice.lines ?? []).map((line, idx, arr) => (
              <tr key={line.id} style={idx < arr.length - 1 ? { borderBottom: "2px solid #D8D8D8" } : undefined}>
                <td className={`${s["invoice__td"]}`}>
                  {line.description}
                  {line.sub_description && (
                    <span className="block" style={{ fontFamily: "Roboto, sans-serif", fontSize: "10px", fontWeight: 400, color: "rgba(0,0,0,0.5)" }}>{line.sub_description}</span>
                  )}
                </td>
                {showQtyPrice && (
                  <td className={`${s["invoice__td"]} pt-3 text-center`}>
                    {line.quantity > 0 || line.unit ? `${line.quantity} ${line.unit}` : ""}
                  </td>
                )}
                {showQtyPrice && (
                  <td className={`${s["invoice__td"]} pt-3 text-right`}>{fmtNum(line.unit_price)} {kc}</td>
                )}
                <td className={`${s["invoice__td"]} pt-3 text-right${line.is_advance ? " text-[rgba(0,0,0,0.45)]" : ""}`}>
                  {line.is_advance ? "−" : ""}{fmtNum(Math.abs(line.total))} {kc}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              {showQtyPrice
                ? <>
                    <td colSpan={2} className="border-t-[3px] border-black py-[6px]" />
                    <td className={`${s["invoice__tfoot-label"]} text-right border-t-[3px] border-black pr-2`}>
                      {L.totalLabel}
                    </td>
                  </>
                : <td className={`${s["invoice__tfoot-label"]} text-right border-t-[3px] border-black pr-2`}>
                    {L.totalLabel}
                  </td>
              }
              <td className="border-t-[3px] border-black text-right">
                <span className={`${s["invoice__total-badge"]} bg-black text-white`}>
                  {fmtNum(total)}&nbsp;{kc}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>


        {/* Flexible spacer — pushes payment block toward the bottom */}
        <div className="flex-1" />

        {/* Payment instruction + QR code */}
        <div className="flex items-start gap-4 mb-[120px]">
          <p className={`${s["invoice__payment-text"]} flex-1`}>
            {getPaymentParts(lang, totalFormatted, account, vs, config.banking.constant_symbol).map((part, i) =>
              part.bold
                ? <span key={i} className={s["invoice__payment-bold"]}>{part.text}</span>
                : part.text
            )}
          </p>
          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="QR" width={70} height={70} className="shrink-0" />
          )}
        </div>

        {/* Footer */}
        <div className="grid grid-cols-3 pb-10">
          <FooterCol label="ADRESA"  lines={[config.supplier.street, `${config.supplier.zip} ${config.supplier.city}`]} />
          <FooterCol label="KONTAKT" lines={[config.supplier.phone, config.supplier.email]} />
          <FooterCol label="WEB"     lines={[config.supplier.web1, config.supplier.web2].filter(Boolean) as string[]} />
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <div className={s["invoice__meta-bar"]} />
      <p className={s["invoice__meta-label"]}>{label}</p>
      <p className={s["invoice__meta-value"]}>{value || "—"}</p>
    </div>
  )
}

function Party({
  role,
  name,
  identifier,
  address,
  vatId,
}: {
  role: string
  name: string
  /** CZ only: e.g. "IČ: 12345678" — shown before address */
  identifier?: string
  address: string
  /** EN only: shown below address with muted label */
  vatId?: string
}) {
  return (
    <div className="flex-1 flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <div className={`${s["invoice__party-bar"]} bg-black shrink-0`} />
        <p className={s["invoice__party-role"]}>{role}</p>
      </div>
      <div className="flex flex-col gap-1">
        <p className={s["invoice__party-name"]}>{name}</p>
        {identifier && <p className={s["invoice__party-meta"]}>{identifier}</p>}
        <p className={s["invoice__party-meta"]} style={{ whiteSpace: "pre-line" }}>{address}</p>
        {vatId && (
          <p className={s["invoice__party-meta"]}>
            <span style={{ color: "rgba(90,90,90,0.5)" }}>VAT ID: </span>
            <span style={{ color: "#5a5a5a" }}>{vatId}</span>
          </p>
        )}
      </div>
    </div>
  )
}

function localizeCzCity(city: string, lang: string): string {
  if (lang === "cs") return city
  return city.replace(/^Praha$/i, "Prague")
}

function localizeCzCountry(country: string, lang: string): string {
  if (lang === "cs") return country
  if (country === "CZ" || country === "Česká republika" || country === "Czech Republic") return "Czech Republic"
  return country
}

function FooterCol({ label, lines }: { label: string; lines: string[] }) {
  return (
    <div>
      <p className={s["invoice__footer-label"]}>{label}</p>
      {lines.filter(Boolean).map((line, i) => (
        <p key={i} className={s["invoice__footer-line"]}>{line}</p>
      ))}
    </div>
  )
}
