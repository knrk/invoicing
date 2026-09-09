import type { NextConfig } from "next"

// Baseline security headers applied to every response. Intentionally conservative:
// no strict Content-Security-Policy here, because a locked-down CSP would need
// testing against react-pdf, Supabase Auth and the Google OAuth redirect. Add a
// (report-only first) CSP as a follow-up.
const securityHeaders = [
  // Force HTTPS for 2 years, incl. subdomains. Vercel serves HTTPS only.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Disallow being framed anywhere (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // No MIME sniffing.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Leak only the origin on cross-origin navigations.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Drop powerful features the app never uses.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
]

const nextConfig: NextConfig = {
  // react-pdf is loaded via dynamic import (client-side only),
  // so no canvas stub or special bundler config is needed.
  turbopack: {},
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
}

export default nextConfig
