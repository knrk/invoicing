export const MAX_PDF_SIZE = 10 * 1024 * 1024 // 10 MB

// Přečte soubor jako base64 bez data: prefixu.
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(",") + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error("Nepodařilo se přečíst soubor"))
    reader.readAsDataURL(file)
  })
}

// Vrátí chybovou hlášku, nebo null když je soubor v pořádku.
export function validatePdfFile(file: File): string | null {
  if (file.type !== "application/pdf") return "Nahraj prosím PDF."
  if (file.size > MAX_PDF_SIZE) return "Maximální velikost je 10 MB."
  return null
}
