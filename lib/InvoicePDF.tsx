import React from "react"
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  Font,
  Svg,
  Path,
} from "@react-pdf/renderer"
import type { InvoiceFormData, AppConfig } from "@/types"
import { LABELS, formatDate, getPaymentParts, ibanToCzDomestic, fmtNum } from "@/lib/invoice"

Font.register({
  family: "Roboto",
  fonts: [
    { src: "/fonts/Roboto-Regular.woff", fontWeight: 400 },
    { src: "/fonts/Roboto-Bold.woff",    fontWeight: 700 },
    { src: "/fonts/Roboto-Italic.woff",  fontWeight: 400, fontStyle: "italic" },
  ],
})

Font.register({
  family: "Montserrat",
  fonts: [
    { src: "/fonts/Montserrat_400Regular.ttf", fontWeight: 400 },
    { src: "/fonts/Montserrat_500Medium.ttf",  fontWeight: 500 },
    { src: "/fonts/Montserrat_700Bold.ttf",    fontWeight: 700 },
  ],
})

Font.registerHyphenationCallback((word) => [word])

// ── Constants ─────────────────────────────────────────────────────────────────
// A4: 595.28 × 841.89 pt.  Left col = 48 mm = 48 * (595.28 / 210) ≈ 136 pt.
const LEFT_W = 180
const PAGE_H = 841.89

// ── Styles ────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    backgroundColor: "#FFFFFF",
    fontFamily: "Roboto",
    fontSize: 11,
    color: "#000000",
  },

  // Full-height row wrapper — needed so both columns fill the page height
  row: {
    flexDirection: "row",
    minHeight: PAGE_H,
  },

  // ── Left column ─────────────────────────────────────────────────────────────
  leftCol: {
    width: LEFT_W,
    backgroundColor: "#DCDCDC",
    paddingTop: 39,
    paddingBottom: 40,
    paddingLeft: 40,
    paddingRight: 0,
    flexShrink: 0,
    flexDirection: "column",
  },
  titleBar: {
    height: 4,
    backgroundColor: "#000000",
    marginBottom: 8,
  },
  titleText: {
    fontFamily: "Montserrat",
    fontSize: 14,
    fontWeight: 700,
    color: "rgba(0,0,0,0.85)",
    letterSpacing: 2,
    marginBottom: 22,
    marginTop: 3,
  },
  metaWrapper: {
    marginBottom: 18,
  },
  metaLine: {
    height: 2,
    width: 40,
    backgroundColor: "#cbcbcb",
  },
  metaLabel: {
    fontFamily: "Montserrat",
    fontSize: 10,
    fontWeight: 400,
    color: "rgba(0,0,0,0.30)",
    marginTop: 20,
    marginBottom: 3,
  },
  metaValue: {
    fontSize: 11,
    fontWeight: 700,
  },
  leftFooterNote: {
    fontSize: 8,
    color: "#666666",
    fontStyle: "italic",
    lineHeight: 1.5,
    marginBottom: 100,
    paddingRight: 20,
  },
  leftThanks: {
    fontSize: 9,
  },

  // ── Right column ─────────────────────────────────────────────────────────────
  rightCol: {
    flex: 1,
    flexDirection: "column",
    paddingTop: 38,
    paddingLeft: 38,
    paddingRight: 38,
    paddingBottom: 40,
  },

  // Parties
  partiesRow: {
    flexDirection: "row",
    marginBottom: 85,
  },
  partyBlock: {
    flex: 1,
  },
  partySpacer: {
    width: 8,
  },
  partyRoleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  partyIndicator: {
    width: 20,
    height: 4,
    backgroundColor: "#000000",
    marginRight: 3,
    marginTop: 1,
  },
  partyRoleText: {
    fontFamily: "Montserrat",
    fontSize: 6,
    fontWeight: 400,
    letterSpacing: 1,
  },
  partyName: {
    fontFamily: "Montserrat",
    fontSize: 14,
    fontWeight: 700,
    color: "#000000",
    marginTop: 8,
  },
  partyInfo: {
    fontSize: 11,
    color: "#5a5a5a",
    marginTop: 3,
  },

  // Items table
  tableTopLine: {
    borderTopWidth: 2,
    borderTopStyle: "solid",
    borderTopColor: "#000000",
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 12,
  },
  tableHeaderRow: {
    flexDirection: "row",
    paddingBottom: 1.5,
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: "#000000",
  },
  colDesc: { flex: 1 },
  colQty: { width: 25, textAlign: "center" },
  colPrice: { width: 85, textAlign: "right" },
  colTotal: { width: 85, textAlign: "right" },
  headerText: { fontSize: 10, color: "#444444" },
  cellText: { fontSize: 10 },

  // Total row
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    borderTopWidth: 2,
    borderTopStyle: "solid",
    borderTopColor: "#000000",
    paddingTop: 4,
  },
  totalLabelText: {
    flex: 1,
    fontSize: 11,
    fontWeight: 700,
    textAlign: "right",
    paddingRight: 6,
  },
  totalBg: {
    width: 85,
    backgroundColor: "#000000",
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginTop: -4,
  },
  totalBgText: {
    fontSize: 14,
    fontWeight: 700,
    color: "#FFFFFF",
    textAlign: "center",
  },

  // Payment + QR
  paymentRow: {
    flexDirection: "row",
    marginBottom: 90,
  },
  paymentText: {
    flex: 1,
    fontSize: 8,
    color: "#666666",
    fontStyle: "italic",
    lineHeight: 1.5,
  },
  qrCode: {
    width: 70,
    height: 70,
    marginLeft: 6,
  },

  // Footer
  footerRow: {
    flexDirection: "row",
  },
  footerSection: {
    flex: 1,
  },
  footerHeading: {
    fontFamily: "Montserrat",
    fontSize: 8,
    fontWeight: 500,
    color: "#2F2F2F",
    marginBottom: 4,
  },
  footerLine: {
    fontFamily: "Montserrat",
    fontSize: 7,
    fontWeight: 500,
    color: "#5A5A5A",
  },
})

// ── Sub-components ────────────────────────────────────────────────────────────

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <View style={S.metaWrapper}>
      <View style={S.metaLine} />
      <Text style={S.metaLabel}>{label}</Text>
      <Text style={S.metaValue}>{value || "—"}</Text>
    </View>
  )
}

function PartyBlock({
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
  address?: string
  /** EN only: shown below address with muted label */
  vatId?: string
}) {
  return (
    <View style={S.partyBlock}>
      <View style={S.partyRoleRow}>
        <View style={S.partyIndicator} />
        <Text style={S.partyRoleText}>{role}</Text>
      </View>
      <Text style={S.partyName}>{name}</Text>
      {identifier ? <Text style={S.partyInfo}>{identifier}</Text> : null}
      {address ? <Text style={S.partyInfo}>{address}</Text> : null}
      {vatId ? (
        <Text style={S.partyInfo}>
          <Text style={{ color: "rgba(90,90,90,0.5)" }}>VAT ID: </Text>
          <Text style={{ color: "#5a5a5a" }}>{vatId}</Text>
        </Text>
      ) : null}
    </View>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export interface InvoicePDFProps {
  invoice: InvoiceFormData
  config: AppConfig
  qrImage: string | null
}

export function InvoicePDF({ invoice, config, qrImage }: InvoicePDFProps) {
  const lang = invoice.language
  const L = LABELS[lang]
  const locale = lang === "cs" ? "cs-CZ" : "en-GB"
  const kc = lang === "cs" ? "Kč" : invoice.currency
  const showQtyCol = lang === "cs" || invoice.lines.some((l) => l.quantity && l.unit)
  const account = lang === "cs"
    ? ibanToCzDomestic(config.banking.account_czk)
    : config.banking.account_eur_iban
  const vs = invoice.variable_symbol || invoice.invoice_number.replace(/^[A-Za-z]+/, "")
  const total = invoice.total
  const totalStr = `${fmtNum(total)} ${kc}`

  const localCity = lang !== "cs"
    ? (invoice.customer.city ?? "").replace(/^Praha$/i, "Prague")
    : (invoice.customer.city ?? "")
  const localCountry = lang !== "cs"
    ? (invoice.customer.country === "CZ" || invoice.customer.country === "Česká republika"
        ? "Czech Republic"
        : invoice.customer.country ?? "")
    : ""

  const customerAddress = [
    invoice.customer.street,
    [invoice.customer.zip, localCity].filter(Boolean).join(" "),
    lang !== "cs" ? localCountry : "",
  ]
    .filter(Boolean)
    .join(lang !== "cs" ? "\n" : ", ")

  const supplierCity = lang !== "cs"
    ? config.supplier.city.replace(/^Praha$/i, "Prague")
    : config.supplier.city
  const supplierAddress = [
    config.supplier.street,
    `${config.supplier.zip} ${supplierCity}`,
    lang !== "cs" ? "Czech Republic" : "",
  ].filter(Boolean).join(lang !== "cs" ? "\n" : ", ")

  return (
    <Document>
      <Page size="A4" style={S.page}>
        {/* Explicit row wrapper with minHeight to ensure both columns fill the page */}
        <View style={S.row}>

          {/* ── Left column ── */}
          <View style={S.leftCol}>
            <View style={S.titleBar} />
            <Text style={S.titleText}>{L.invoice}</Text>

            <MetaField label={L.invoiceNumber} value={invoice.invoice_number.replace(/^[A-Za-z]+/, "")} />
            <MetaField label={L.issueDate} value={formatDate(invoice.issue_date, lang)} />
            <MetaField label={L.dueDate}   value={formatDate(invoice.due_date, lang)} />
            <MetaField label={L.payment}   value={invoice.payment_method} />
            {lang === "cs" && <MetaField label={L.account}       value={account} />}
            {lang === "cs" && <MetaField label={L.variableSymbol} value={vs} />}
            {lang !== "cs" && invoice.reverse_charge && <MetaField label="MODE" value="Reverse Charge" />}

            {/* Spacer — pushes footnote to the bottom */}
            <View style={{ flexGrow: 1 }} />

            <Text style={S.leftFooterNote}>
              {lang === "cs" ? config.footer.penalty_cs : config.footer.penalty_en}
              {"\n\n"}
              {lang === "cs" ? config.footer.note_cs : config.footer.note_en}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Svg width={10} height={9} viewBox="0 0 10 9">
                <Path
                  d="M8.53944 0.350666C8.13457 0.128035 7.67018 0 7.17474 0C6.30059 0 5.51776 0.397595 5.00085 1.02105C4.4815 0.397595 3.6994 0 2.82407 0C2.32982 0 1.86628 0.128035 1.4605 0.350666C0.589879 0.831918 0 1.75718 0 2.82052C0 3.12494 0.0496298 3.41688 0.13952 3.69001C0.62429 5.86497 5.00085 8.60801 5.00085 8.60801C5.00085 8.60801 9.37452 5.86503 9.85997 3.69001C9.94986 3.41688 10 3.12454 10 2.82052C10 1.75758 9.41012 0.832598 8.53944 0.350666Z"
                  fill="black"
                />
              </Svg>
              <Text style={[S.leftThanks, { marginLeft: 4 }]}>{L.thanks}</Text>
            </View>
          </View>

          {/* ── Right column ── */}
          <View style={S.rightCol}>

            {/* Parties */}
            <View style={S.partiesRow}>
              <PartyBlock
                role={L.customer}
                name={invoice.customer.name || "—"}
                identifier={
                  lang === "cs" && invoice.customer.ico
                    ? `IČ: ${invoice.customer.ico}`
                    : undefined
                }
                vatId={
                  lang !== "cs" && invoice.customer.dic
                    ? invoice.customer.dic
                    : undefined
                }
                address={customerAddress || undefined}
              />
              <View style={S.partySpacer} />
              <PartyBlock
                role={L.supplier}
                name={config.supplier.name}
                identifier={lang === "cs" && config.supplier.ico ? `${L.partyIcoLabel}: ${config.supplier.ico}` : undefined}
                vatId={lang !== "cs" && config.supplier.dic ? config.supplier.dic : undefined}
                address={supplierAddress}
              />
            </View>

            {/* Table */}
            <View style={S.tableTopLine} />

            <View style={S.tableHeaderRow}>
              <View style={S.colDesc}><Text style={S.headerText}>{L.description}</Text></View>
              <View style={S.colQty}><Text style={S.headerText}>{showQtyCol ? L.quantity : ""}</Text></View>
              <View style={S.colPrice}><Text style={S.headerText}>{L.unitPrice}</Text></View>
              <View style={S.colTotal}><Text style={S.headerText}>{L.total}</Text></View>
            </View>

            {invoice.lines.map((line, idx, arr) => (
              <View key={line.id} style={[S.tableRow, idx < arr.length - 1 ? { borderBottom: "2px solid #D8D8D8" } : {}]}>
                <View style={S.colDesc}>
                  <Text style={S.cellText}>{line.description}</Text>
                  {line.sub_description ? (
                    <Text style={[S.cellText, { fontFamily: "Roboto", fontWeight: 400, fontSize: 10, color: "rgba(0,0,0,0.5)", marginTop: 2 }]}>{line.sub_description}</Text>
                  ) : null}
                </View>
                <View style={S.colQty}>
                  <Text style={S.cellText}>{lang === "cs" || (line.quantity && line.unit) ? `${line.quantity} ${line.unit}` : ""}</Text>
                </View>
                <View style={S.colPrice}>
                  <Text style={S.cellText}>{`${fmtNum(line.unit_price)} ${kc}`}</Text>
                </View>
                <View style={S.colTotal}>
                  <Text style={[S.cellText, line.is_advance ? { color: "rgba(0,0,0,0.45)" } : {}]}>
                    {`${line.is_advance ? "−" : ""}${fmtNum(Math.abs(line.total))} ${kc}`}
                  </Text>
                </View>
              </View>
            ))}

            {/* Total */}
            <View style={S.totalRow}>
              <Text style={S.totalLabelText}>{L.totalLabel}</Text>
              <View style={S.totalBg}>
                <Text style={S.totalBgText}>{totalStr}</Text>
              </View>
            </View>


            {/* Spacer — pushes payment + footer to the bottom */}
            <View style={{ flexGrow: 1 }} />

            {/* Payment instruction + QR */}
            <View style={S.paymentRow}>
              <Text style={S.paymentText}>
                {getPaymentParts(lang, totalStr, account, vs, config.banking.constant_symbol).map((part, i) =>
                  part.bold
                    ? <Text key={i} style={{ fontWeight: 700 }}>{part.text}</Text>
                    : part.text
                )}
              </Text>
              {qrImage ? <Image style={S.qrCode} src={qrImage} /> : null}
            </View>

            {/* Footer */}
            <View style={S.footerRow}>
              <View style={S.footerSection}>
                <Text style={S.footerHeading}>ADRESA</Text>
                <Text style={S.footerLine}>{config.supplier.street}</Text>
                <Text style={S.footerLine}>{`${config.supplier.zip} ${config.supplier.city}`}</Text>
              </View>
              <View style={S.footerSection}>
                <Text style={S.footerHeading}>KONTAKT</Text>
                {[config.supplier.phone, config.supplier.email]
                  .filter(Boolean)
                  .map((v, i) => <Text key={i} style={S.footerLine}>{v}</Text>)}
              </View>
              <View style={S.footerSection}>
                <Text style={S.footerHeading}>WEB</Text>
                {[config.supplier.web1, config.supplier.web2]
                  .filter(Boolean)
                  .map((v, i) => <Text key={i} style={S.footerLine}>{v}</Text>)}
              </View>
            </View>

          </View>
        </View>
      </Page>
    </Document>
  )
}
