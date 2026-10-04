import type { NextConfig } from "next";

const YEAR = 60 * 60 * 24 * 365;

const nextConfig: NextConfig = {
  /**
   * Build output directory.
   *
   * Defaults to `.next`, which is what `next dev` is already using. Setting
   * NEXT_DIST_DIR lets a verification build run without evicting the running
   * dev server's compiled output from under it - which otherwise makes the
   * site 500 for whoever is using it at the time. `tsconfig.json` already
   * expects `.next-verify`, so that is the name to use.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",

  /**
   * The game builds under /public are large and immutable: a new release
   * replaces the folder rather than editing a file in it. Serving them with a
   * long cache keeps the 57 MB browser build to a single download per visitor.
   *
   * The explicit wasm content type matters because the engine loads the module
   * with the streaming compiler, which rejects anything that is not
   * `application/wasm`. The apk type stops phone browsers from treating the
   * download as plain binary data they cannot hand to the installer.
   */
  async headers() {
    return [
      {
        source: "/games/:file(.*\\.wasm)",
        headers: [
          { key: "Content-Type", value: "application/wasm" },
          {
            key: "Cache-Control",
            value: `public, max-age=${YEAR}, immutable`,
          },
        ],
      },
      {
        source: "/games/:file(.*\\.pck)",
        headers: [
          { key: "Content-Type", value: "application/octet-stream" },
          {
            key: "Cache-Control",
            value: `public, max-age=${YEAR}, immutable`,
          },
        ],
      },
      {
        source: "/downloads/:file(.*\\.apk)",
        headers: [
          {
            key: "Content-Type",
            value: "application/vnd.android.package-archive",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
