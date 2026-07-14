export type Scale = {
  id: string;
  name: string;
  /** 從 root 起算的半音位移,長度必為 7 */
  intervals: [number, number, number, number, number, number, number];
};

export const SCALES: Scale[] = [
  { id: 'major',          name: '大調 (Major)', intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'natural-minor',  name: '自然小調',     intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'harmonic-minor', name: '和聲小調',     intervals: [0, 2, 3, 5, 7, 8, 11] },
];
