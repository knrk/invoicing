import { ReceiptText } from "lucide-react"
import LoginForm from "@/components/auth/LoginForm"

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid md:grid-cols-2 rounded-panel overflow-hidden bg-surface shadow-elevated">
        {/* Left hero — hidden on mobile */}
        <div className="hidden md:flex flex-col justify-between p-10 bg-primary text-primary-foreground">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center">
              <ReceiptText className="w-5 h-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">Fakturace</span>
          </div>
          <div>
            <h1
              className="text-3xl font-extrabold leading-tight"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Fakturační systém
            </h1>
            <p className="mt-3 text-sm text-primary-foreground/80 max-w-xs">
              Vydané i přijaté faktury, souhrnné hlášení a evidence kontaktů na jednom místě.
            </p>
          </div>
          <span className="text-xs text-primary-foreground/60">
            © {new Date().getFullYear()} Fakturace
          </span>
        </div>

        {/* Right — form */}
        <div className="p-8 sm:p-10 flex flex-col justify-center">
          <h2
            className="text-2xl font-bold text-text"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Vítejte zpět
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Přihlaste se pro přístup do aplikace
          </p>
          <div className="mt-8">
            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  )
}
