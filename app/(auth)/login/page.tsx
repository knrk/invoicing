import { ReceiptText } from "lucide-react"
import LoginForm from "@/components/auth/LoginForm"

export default function LoginPage() {
  return (
    <div className="auth-card w-full max-w-4xl grid md:grid-cols-2 gap-2 p-2">
      {/* Left panel — white, glass sphere. Hidden on mobile */}
      <div className="auth-hero hidden md:flex flex-col justify-between p-9 min-h-[560px]">
        <div className="relative z-10 flex items-center gap-2.5">
          <div className="auth-logo-badge w-9 h-9 flex items-center justify-center">
            <ReceiptText className="w-5 h-5 text-white" />
          </div>
          <span
            className="text-lg font-bold tracking-tight text-white"
            style={{ fontFamily: "var(--font-heading), sans-serif" }}
          >
            Fakturace
          </span>
        </div>

        <div className="relative z-0 flex justify-center py-6">
          <div className="auth-orb-wrap">
            <div className="auth-orb-img" />
          </div>
        </div>

        <div className="relative z-10">
          <h1 className="auth-title text-[1.7rem] leading-tight font-extrabold">Chytrá fakturace</h1>
          <p className="auth-muted mt-2 text-sm max-w-xs">
            Vydané i přijaté faktury, souhrnné hlášení a evidence kontaktů — na jednom
            místě, přehledně a rychle.
          </p>
        </div>

        {/* static, full-width frosted glass band covering the lower half of the panel.
            backdrop-filter is inline because the CSS build strips `url(#...)` from it. */}
        <div
          className="auth-orb-glass"
          style={{
            backdropFilter: "url(#nav-liquid-glass) blur(3px) saturate(1.4)",
            WebkitBackdropFilter: "blur(3px) saturate(1.4)",
          }}
        />
        {/* Apple-style liquid-glass refraction filter (chromatic edge dispersion) */}
        <svg className="absolute size-0" aria-hidden="true" focusable="false" width="0" height="0">
          <defs>
            <filter id="nav-liquid-glass" colorInterpolationFilters="sRGB">
              <feImage
                x="0"
                y="0"
                width="100%"
                height="100%"
                preserveAspectRatio="none"
                result="map"
                href="data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%201280%2054%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22red%22%20x1%3D%22100%25%22%20y1%3D%220%25%22%20x2%3D%220%25%22%20y2%3D%220%25%22%3E%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%23000%22%2F%3E%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22red%22%2F%3E%3C%2FlinearGradient%3E%3ClinearGradient%20id%3D%22blue%22%20x1%3D%220%25%22%20y1%3D%220%25%22%20x2%3D%220%25%22%20y2%3D%22100%25%22%3E%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%23000%22%2F%3E%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22blue%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20x%3D%220%22%20y%3D%220%22%20width%3D%221280%22%20height%3D%2254%22%20fill%3D%22black%22%2F%3E%3Crect%20x%3D%220%22%20y%3D%220%22%20width%3D%221280%22%20height%3D%2254%22%20rx%3D%2227%22%20fill%3D%22url(%23red)%22%2F%3E%3Crect%20x%3D%220%22%20y%3D%220%22%20width%3D%221280%22%20height%3D%2254%22%20rx%3D%2227%22%20fill%3D%22url(%23blue)%22%20style%3D%22mix-blend-mode%3Adifference%22%2F%3E%3Crect%20x%3D%221.8900000000000001%22%20y%3D%221.8900000000000001%22%20width%3D%221276.22%22%20height%3D%2250.22%22%20rx%3D%2227%22%20fill%3D%22hsl(0%200%25%2050%25%20%2F%200.93)%22%20style%3D%22filter%3Ablur(11px)%22%2F%3E%3C%2Fsvg%3E"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="map"
                xChannelSelector="R"
                yChannelSelector="B"
                scale={-50}
                result="dispRed"
              />
              <feColorMatrix
                in="dispRed"
                type="matrix"
                values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0"
                result="red"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="map"
                xChannelSelector="R"
                yChannelSelector="B"
                scale={-47}
                result="dispGreen"
              />
              <feColorMatrix
                in="dispGreen"
                type="matrix"
                values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0"
                result="green"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="map"
                xChannelSelector="R"
                yChannelSelector="B"
                scale={-44}
                result="dispBlue"
              />
              <feColorMatrix
                in="dispBlue"
                type="matrix"
                values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0"
                result="blue"
              />
              <feBlend in="red" in2="green" mode="screen" result="rg" />
              <feBlend in="rg" in2="blue" mode="screen" result="output" />
              <feGaussianBlur in="output" stdDeviation={0.7} />
            </filter>
          </defs>
        </svg>
      </div>

      {/* Right panel — grey-tinted form */}
      <div className="auth-form-panel px-7 py-9 sm:px-10 sm:py-11 flex flex-col justify-center">
        <h2 className="auth-title text-[1.6rem] font-extrabold">Vítejte zpět</h2>
        <p className="auth-subtitle mt-1 text-sm">Přihlaste se pro přístup do aplikace</p>
        <div className="mt-8">
          <LoginForm />
        </div>
      </div>
    </div>
  )
}
