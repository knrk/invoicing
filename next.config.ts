import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // react-pdf is loaded via dynamic import (client-side only),
  // so no canvas stub or special bundler config is needed.
  turbopack: {},
}

export default nextConfig
