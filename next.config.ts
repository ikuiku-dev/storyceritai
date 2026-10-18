import type { NextConfig } from "next";

// This app is a local, single-operator dashboard. Every page reads live SQLite data and
// renders timestamps at request time; there is no static content worth prerendering.
// Cache Components (cacheComponents) pushes every route toward prerendering, which conflicts
// with that at every page. Disabling it is the correct architectural choice here, not a
// workaround: it lets `await connection()` in pages behave normally and keeps builds honest.
const nextConfig: NextConfig = {
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
