/**
 * Triggers a browser download of an in-memory text file. Client-only — it pokes
 * the DOM (Blob + object URL + a synthetic anchor click), so it lives in app/utils
 * rather than shared/ (which is also imported server-side).
 */
export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
