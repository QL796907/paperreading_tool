export const GITHUB_MIRROR_PREFIX = "https://gh.4o.pw/";
export const GITHUB_MIRROR_DOCS = "https://gh.4o.pw/docs";

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function isGithubFileHost(url) {
  const host = hostnameOf(url);
  return (
    host === "github.com" ||
    host.endsWith(".github.com") ||
    host === "githubusercontent.com" ||
    host.endsWith(".githubusercontent.com")
  );
}

/** 设置里没写过时默认开镜像。只有明确关掉才直连 GitHub。 */
export function githubMirrorOn(settings) {
  return settings?.githubMirrorEnabled !== false;
}

export function withGithubMirror(url, enabled = true) {
  if (!enabled || !url) return url;
  if (url.startsWith(GITHUB_MIRROR_PREFIX)) return url;
  if (!isGithubFileHost(url)) return url;
  return `${GITHUB_MIRROR_PREFIX}${url}`;
}
