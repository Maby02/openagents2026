/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow the dashboard to read from a Sibyl operator running anywhere.
  // Default for local dev is http://127.0.0.1:9099 (the SSE port from `sibyl run`).
  env: {
    NEXT_PUBLIC_OBSERVER_URL: process.env.NEXT_PUBLIC_OBSERVER_URL ?? "http://127.0.0.1:9099",
  },
};

export default nextConfig;
