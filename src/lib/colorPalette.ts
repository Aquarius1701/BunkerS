export const PALETTE_32_COLORS = [
  { name: 'Oq', bg: '#ffffff', text: '#0f172a' },
  { name: 'Qora', bg: '#0b1120', text: '#ffffff' },
  { name: 'Kulrang', bg: '#64748b', text: '#ffffff' },
  { name: 'To‘q kulrang', bg: '#334155', text: '#ffffff' },
  { name: 'Kumush', bg: '#cbd5e1', text: '#0f172a' },
  { name: 'Qizil', bg: '#ef4444', text: '#ffffff' },
  { name: 'To‘q qizil', bg: '#991b1b', text: '#ffffff' },
  { name: 'Yoqut', bg: '#dc2626', text: '#ffffff' },
  { name: 'Olovrang', bg: '#ea580c', text: '#ffffff' },
  { name: 'To‘q sariq', bg: '#f97316', text: '#ffffff' },
  { name: 'Oltinrang', bg: '#f59e0b', text: '#0f172a' },
  { name: 'Sariq', bg: '#eab308', text: '#0f172a' },
  { name: 'Limon', bg: '#facc15', text: '#0f172a' },
  { name: 'Laym', bg: '#84cc16', text: '#0f172a' },
  { name: 'Yashil', bg: '#22c55e', text: '#ffffff' },
  { name: 'Zumrad', bg: '#10b981', text: '#ffffff' },
  { name: 'To‘q yashil', bg: '#15803d', text: '#ffffff' },
  { name: 'Zaytun', bg: '#65a30d', text: '#ffffff' },
  { name: 'Mox', bg: '#4d7c0f', text: '#ffffff' },
  { name: 'Dengiz to‘lqini', bg: '#14b8a6', text: '#ffffff' },
  { name: 'Moviy', bg: '#06b6d4', text: '#0f172a' },
  { name: 'Havorang', bg: '#38bdf8', text: '#0f172a' },
  { name: 'Ko‘k', bg: '#3b82f6', text: '#ffffff' },
  { name: 'Qirollik ko‘ki', bg: '#2563eb', text: '#ffffff' },
  { name: 'To‘q ko‘k', bg: '#1d4ed8', text: '#ffffff' },
  { name: 'Siniy', bg: '#1e40af', text: '#ffffff' },
  { name: 'Binafsharang', bg: '#8b5cf6', text: '#ffffff' },
  { name: 'Siren', bg: '#a855f7', text: '#ffffff' },
  { name: 'Pushti', bg: '#ec4899', text: '#ffffff' },
  { name: 'Atirgul', bg: '#f43f5e', text: '#ffffff' },
  { name: 'Jigarrang', bg: '#78350f', text: '#ffffff' },
  { name: 'Bej', bg: '#d4b996', text: '#0f172a' },
];

export function getColorPaletteItem(colorName: string): { name: string; bg: string; text: string } {
  const norm = (s: string) => s.toLowerCase().replace(/['`‘’ʻʼ]/g, '').trim();
  const target = norm(colorName);
  const found = PALETTE_32_COLORS.find((c) => norm(c.name) === target);
  if (found) return found;
  if (target.includes('toq kulrang') || target.includes('dark')) return { name: colorName, bg: '#334155', text: '#ffffff' };
  if (target.includes('kulrang') || target.includes('seriy')) return { name: colorName, bg: '#64748b', text: '#ffffff' };
  if (target.includes('qora') || target.includes('black')) return { name: colorName, bg: '#0b1120', text: '#ffffff' };
  if (target.includes('oq') || target.includes('white')) return { name: colorName, bg: '#ffffff', text: '#0f172a' };
  if (target.includes('qizil') || target.includes('gisht')) return { name: colorName, bg: '#ef4444', text: '#ffffff' };
  if (target.includes('sariq')) return { name: colorName, bg: '#eab308', text: '#0f172a' };
  if (target.includes('yashil')) return { name: colorName, bg: '#22c55e', text: '#ffffff' };
  if (target.includes('kok') || target.includes('moviy') || target.includes('siniy')) return { name: colorName, bg: '#2563eb', text: '#ffffff' };
  if (target.includes('jigarrang')) return { name: colorName, bg: '#78350f', text: '#ffffff' };
  if (target.includes('bej') || target.includes('qum')) return { name: colorName, bg: '#d4b996', text: '#0f172a' };
  return { name: colorName, bg: '#475569', text: '#ffffff' };
}
