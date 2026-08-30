function normalizeBaseUrl(baseUrl: string): string {
  if (!baseUrl || baseUrl === '/') return '/';
  const withLeadingSlash = baseUrl.startsWith('/') ? baseUrl : `/${baseUrl}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

export function resolveRuntimeAssetUrl(path: string, baseUrl: string): string {
  const normalizedBase = normalizeBaseUrl(baseUrl);

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) return path;
  if (normalizedBase === '/') return path.startsWith('/') ? path : `/${path}`;
  if (path.startsWith(normalizedBase)) return path;

  return `${normalizedBase}${path.replace(/^\/+/, '')}`;
}
