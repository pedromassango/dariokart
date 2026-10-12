export interface Banner { text: string; until: number; color: string }

/** Race clock format: 00'02"00 */
export function smkTime(ms: number): string {
  if (!isFinite(ms) || ms < 0) ms = 0;
  const m = Math.min(99, Math.floor(ms / 60000));
  const s = Math.floor((ms % 60000) / 1000);
  const c = Math.floor((ms % 1000) / 10);
  return `${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}"${String(c).padStart(2, '0')}`;
}
