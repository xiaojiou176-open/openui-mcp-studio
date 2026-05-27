function resolvePagesBasePath() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    const normalized = url.pathname.replace(/\/+$/, "");
    return normalized === "/" ? "" : normalized;
  } catch {
    return "";
  }
}

const isGitHubPagesExport = process.env.OPENUI_DEPLOY_TARGET === "github-pages";
const pagesBasePath = resolvePagesBasePath();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(isGitHubPagesExport
    ? {
        output: "export",
        trailingSlash: true,
        images: {
          unoptimized: true,
        },
        basePath: pagesBasePath,
        assetPrefix: pagesBasePath || undefined,
      }
    : {}),
};

export default nextConfig;
