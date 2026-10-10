// The landing page's crop pictures (assets/honest/crop-<crop>.webp), by crop name
const icons = import.meta.glob('../../assets/honest/crop-*.webp', { eager: true, query: '?url', import: 'default' });
export const cropIcon = (crop) => Object.entries(icons).find(([k]) => k.endsWith(`/crop-${crop}.webp`))?.[1];
