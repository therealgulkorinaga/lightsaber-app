// Carbon-inspired monoline icon set, ported from the design export
// (design/icons.js). 24×24 grid, stroke 1.5, square caps, miter joins.

const ICON_PATHS: Record<string, string> = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><line x1="15.5" y1="15.5" x2="20.5" y2="20.5"/>',
  bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5"/><line x1="4.5" y1="16.5" x2="19.5" y2="16.5"/><line x1="10.5" y1="19.5" x2="13.5" y2="19.5"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13"/><polyline points="9 7 9 4 15 4 15 7"/><line x1="3" y1="12" x2="21" y2="12"/>',
  building: '<rect x="5" y="3" width="14" height="18"/><line x1="9" y1="7" x2="11" y2="7"/><line x1="13" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="11" y2="11"/><line x1="13" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="11" y2="15"/><line x1="13" y1="15" x2="15" y2="15"/><polyline points="10 21 10 18 14 18 14 21"/>',
  library: '<rect x="4" y="4" width="3" height="16"/><rect x="9" y="6" width="3" height="14"/><rect x="14" y="3" width="3" height="17"/>',
  shield: '<polygon points="12 3 4 6 4 12 12 21 20 12 20 6"/>',
  pie: '<circle cx="12" cy="12" r="9"/><polyline points="12 3 12 12 21 12"/>',
  chevronDown: '<polyline points="6 9 12 15 18 9"/>',
  chevronRight: '<polyline points="9 6 15 12 9 18"/>',
  chevronLeft: '<polyline points="15 6 9 12 15 18"/>',
  arrowRight: '<line x1="4" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/>',
  arrowUpRight: '<line x1="7" y1="17" x2="17" y2="7"/><polyline points="9 7 17 7 17 15"/>',
  arrowDown: '<line x1="12" y1="4" x2="12" y2="19"/><polyline points="6 13 12 19 18 13"/>',
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 6 12 12 16 14"/>',
  check: '<polyline points="4 12 10 18 20 6"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><polyline points="8 12 11 15 16 9"/>',
  x: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
  plus: '<line x1="12" y1="4" x2="12" y2="20"/><line x1="4" y1="12" x2="20" y2="12"/>',
  alertTriangle: '<polygon points="12 3 22 20 2 20"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  alertCircle: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="7" x2="12" y2="13"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="12" y1="7.5" x2="12.01" y2="7.5"/>',
  filter: '<polygon points="3 5 21 5 14 13 14 20 10 18 10 13"/>',
  sort: '<polyline points="3 16 7 20 11 16"/><line x1="7" y1="20" x2="7" y2="4"/><polyline points="13 8 17 4 21 8"/><line x1="17" y1="4" x2="17" y2="20"/>',
  hash: '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
  download: '<polyline points="4 14 4 20 20 20 20 14"/><polyline points="7 11 12 16 17 11"/><line x1="12" y1="4" x2="12" y2="16"/>',
  copy: '<rect x="8" y="8" width="13" height="13"/><polyline points="16 4 4 4 4 16"/>',
  refresh: '<polyline points="21 4 21 9 16 9"/><path d="M21 9A9 9 0 0 0 5 7"/><polyline points="3 20 3 15 8 15"/><path d="M3 15a9 9 0 0 0 16 2"/>',
  send: '<polygon points="22 2 2 9 11 13 22 2"/><polygon points="22 2 11 13 15 22"/>',
  fileText: '<polygon points="6 3 14 3 20 9 20 21 6 21"/><polyline points="14 3 14 9 20 9"/><line x1="9" y1="13" x2="17" y2="13"/><line x1="9" y1="17" x2="17" y2="17"/>',
  link: '<path d="M10 7H7.5a4.5 4.5 0 0 0 0 9H10"/><path d="M14 7h2.5a4.5 4.5 0 0 1 0 9H14"/><line x1="8" y1="11.5" x2="16" y2="11.5"/>',
  external: '<polyline points="13 4 20 4 20 11"/><line x1="20" y1="4" x2="11" y2="13"/><polyline points="20 14 20 20 4 20 4 4 10 4"/>',
  more: '<g fill="currentColor" stroke="none"><rect x="4" y="11" width="2.2" height="2.2"/><rect x="10.9" y="11" width="2.2" height="2.2"/><rect x="17.8" y="11" width="2.2" height="2.2"/></g>',
  sparkles: '<polygon points="9 3 10.4 8.6 16 10 10.4 11.4 9 17 7.6 11.4 2 10 7.6 8.6"/><polygon points="17 13 17.8 15.7 20.5 16.5 17.8 17.3 17 20 16.2 17.3 13.5 16.5 16.2 15.7"/>',
  command: '<path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>',
  scale: '<line x1="12" y1="3" x2="12" y2="21"/><line x1="7" y1="21" x2="17" y2="21"/><polyline points="2 14 5 8 8 14"/><line x1="2" y1="14" x2="8" y2="14"/><polyline points="16 14 19 8 22 14"/><line x1="16" y1="14" x2="22" y2="14"/><line x1="5" y1="8" x2="12" y2="6"/><line x1="12" y1="6" x2="19" y2="8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"/><path d="M16 4.5a4 4 0 0 1 0 7"/><path d="M16 14a6 6 0 0 1 6 6v1"/>',
  book: '<polygon points="3 4 11 4 11 21 4 19 3 19"/><polygon points="21 4 13 4 13 21 20 19 21 19"/>',
  layers: '<polygon points="12 3 21 7.5 12 12 3 7.5"/><polyline points="3 12 12 16.5 21 12"/><polyline points="3 16.5 12 21 21 16.5"/>',
  trendingUp: '<polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/>',
  flag: '<line x1="5" y1="3" x2="5" y2="21"/><polygon points="5 4 19 4 16 9 19 14 5 14"/>',
  bookmark: '<polygon points="6 3 18 3 18 21 12 17 6 21"/>',
  edit: '<polygon points="3 21 4.5 16 16 4.5 19.5 8 8 19.5"/><line x1="14" y1="6.5" x2="17.5" y2="10"/>',
  eye: '<path d="M2 12c2.5-5 5.5-7 10-7s7.5 2 10 7c-2.5 5-5.5 7-10 7s-7.5-2-10-7z"/><circle cx="12" cy="12" r="3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/>',
  trash: '<polyline points="3 6 21 6"/><polyline points="5 6 7 21 17 21 19 6"/><polyline points="9 6 9 3 15 3 15 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
};

export function Icn({
  name,
  size = 16,
  color = 'currentColor',
  strokeWidth = 1.5,
}: {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const paths = ICON_PATHS[name];
  if (!paths) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="square"
      strokeLinejoin="miter"
      style={{ flex: '0 0 auto', display: 'inline-block', verticalAlign: 'middle' }}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: paths }}
    />
  );
}
