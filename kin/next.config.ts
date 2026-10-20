import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // web-push is loaded from node_modules at runtime instead of being bundled
  // into the server chunks (20 October). web-push 3.6.7 still calls Node's
  // url.parse(), and Node 24 (what Vercel runs) warns about url.parse() only
  // when the caller is outside node_modules -- which a bundled copy is. That
  // warning was production's one recurring log entry (BACKLOG, 19-20
  // October). web-push's own fix (`new URL`) is on its master, unreleased
  // since 3.6.7; when a release carries it, this line can go.
  serverExternalPackages: ["web-push"],
};

export default nextConfig;
