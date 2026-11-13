/** Canvas-side theme values. The DOM side (glass, controls) lives in style.css under [data-theme]. */
export interface Theme {
  bolts: boolean;      // dark: bolt holes on ~half the holds
  eyes: boolean;       // light: bean eyes on ~40% of the holds
  bg: string; ink: string; mute: string; tmin: string; dash: string; eye: string;
  cols: string[];      // one per grade bucket
  lift: { color: string; blur: number; y: number };  // selected-hold shadow
}

export const THEMES: Record<'dark' | 'light', Theme> = {
  // 峡湾 (default)
  dark: {
    bolts: true, eyes: false,
    bg: '#0D1A1E', ink: '#E6EEEC', mute: '#76929A', tmin: '#33484E', dash: '#3C555C', eye: '#0D1A1E',
    cols: ['#E8715A', '#E8A15A', '#D9CB6A', '#4DBFA0', '#5B95E8', '#8E86E6', '#E6EEEC'],
    lift: { color: 'rgba(0,0,0,0.45)', blur: 10, y: 8 },
  },
  // 涂鸦
  light: {
    bolts: false, eyes: true,
    bg: '#FBF8F1', ink: '#17181C', mute: '#6F6A62', tmin: '#CFC9BC', dash: '#C2BCAE', eye: '#17181C',
    cols: ['#FF4F38', '#FF9A1A', '#FFD21F', '#2FBF71', '#2C6BFF', '#9B5CFF', '#1B1B1F'],
    lift: { color: 'rgba(23,24,28,0.28)', blur: 10, y: 8 },
  },
};

export const GRADE = ['V0-1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7+'];
export const FONT = 'Inter, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif';
