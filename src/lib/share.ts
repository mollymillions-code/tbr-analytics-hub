// Share a canvas report via a short URL with the report's server-side ID.

export function buildShareUrl(reportId: string): string {
  return `${window.location.origin}/canvas?id=${reportId}`;
}
