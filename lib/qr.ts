import type { AppConfig, Language } from "@/types"

function toIBAN(account: string): string {
  const s = account.trim()
  if (/^[A-Z]{2}\d/.test(s)) return s

  const match = s.match(/^(?:(\d+)-)?(\d+)\/(\d{4})$/)
  if (!match) return s

  const prefix = (match[1] ?? "0").padStart(6, "0")
  const number = match[2].padStart(10, "0")
  const bankcode = match[3]

  const bban = bankcode + prefix + number

  const checkStr = bban + "123500"
  const mod = BigInt(checkStr) % 97n
  const checkDigits = String(98n - mod).padStart(2, "0")

  return `CZ${checkDigits}${bban}`
}

function buildSPAYD(
  amount: number,
  invoiceNumber: string,
  config: AppConfig
): string {
  const vs = invoiceNumber.replace(/\D/g, "").slice(-10)
  const acc = toIBAN(config.banking.account_czk)

  const parts = [
    "SPD*1.0",
    `ACC:${acc}`,
    `AM:${amount.toFixed(2)}`,
    "CC:CZK",
    ...(vs ? [`X-VS:${vs}`] : []),
    ...(config.banking.constant_symbol ? [`X-KS:${config.banking.constant_symbol}`] : []),
    `MSG:${invoiceNumber}`,
  ]
  return parts.join("*")
}

function buildEPC(
  amount: number,
  invoiceNumber: string,
  config: AppConfig
): string {
  const lines = [
    "BCD",
    "002",
    "1",
    "SCT",
    config.banking.account_eur_bic,
    config.supplier.name,
    config.banking.account_eur_iban,
    `EUR${amount.toFixed(2)}`,
    "",
    invoiceNumber,
    "",
  ]
  return lines.join("\n")
}

export async function generateQRCode(
  amount: number,
  invoiceNumber: string,
  language: Language,
  config: AppConfig
): Promise<string> {
  const data =
    language === "cs"
      ? buildSPAYD(amount, invoiceNumber, config)
      : buildEPC(amount, invoiceNumber, config)

  const QRCodeStyling = (await import("qr-code-styling")).default

  const qr = new QRCodeStyling({
    width: 300,
    height: 300,
    type: "canvas",
    data,
    margin: 4,
    qrOptions: {
      errorCorrectionLevel: "H",
    },
    dotsOptions: {
      type: "rounded",
      color: "#000000",
    },
    cornersSquareOptions: {
      type: "extra-rounded",
      color: "#000000",
    },
    cornersDotOptions: {
      type: "dot",
      color: "#000000",
    },
    backgroundOptions: {
      color: "#ffffff",
    },
  })

  const blob = await qr.getRawData("png")
  if (!blob) throw new Error("QR generation failed")

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = 300
      canvas.height = 300
      canvas.getContext("2d")!.drawImage(img, 0, 0, 300, 300)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL("image/png"))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("QR normalise failed")) }
    img.src = url
  })
}
