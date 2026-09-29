import type { ThemeConfig } from '../types';

export interface FullThemeConfig extends ThemeConfig {
  heroGradient: string;
  buttonBg: string;
  buttonHover: string;
  activeSidebarBg: string;
  badgeBg: string;
  badgeText: string;
  textColor: string;
  ringColor: string;
  iconBg: string;
  pageBg?: string;
  surfaceBg?: string;
  sidebarBg?: string;
  borderColor?: string;
  headingColor?: string;
  bodyTextColor?: string;
  subTextColor?: string;
  selectedBg?: string;
  isSoftLight?: boolean;
}

export const APP_THEMES: FullThemeConfig[] = [
  {
    id: 'spa_elegance',
    name: 'Spa Thanh Lịch — Trắng Sáng & Xanh Rêu',
    primaryColor: '#B83D62',
    secondaryColor: '#9F3153',
    gradient: 'from-[#B83D62] via-[#9F3153] to-[#244B3C]',
    heroGradient: 'linear-gradient(135deg, #FFF1F5 0%, #FFFFFF 100%)',
    buttonBg: '#B83D62',
    buttonHover: '#9F3153',
    activeSidebarBg: '#B83D62',
    badgeBg: '#FFF1F5',
    badgeText: '#B83D62',
    textColor: '#244B3C',
    ringColor: 'rgba(184, 61, 98, 0.15)',
    iconBg: '#FFF1F5',
    previewColor: '#B83D62',
    pageBg: '#FAFAF8',
    surfaceBg: '#FFFFFF',
    sidebarBg: '#FCFAF7',
    borderColor: '#E5E7E4',
    headingColor: '#244B3C',
    bodyTextColor: '#26342F',
    subTextColor: '#59665F',
    selectedBg: '#FFF1F5',
    isSoftLight: true
  },
  {
    id: 'ocean',
    name: 'Xanh Đại Dương',
    primaryColor: '#0284c7',
    secondaryColor: '#0369a1',
    gradient: 'from-sky-900 via-indigo-900 to-slate-900',
    heroGradient: 'linear-gradient(135deg, #0c4a6e 0%, #1e1b4b 50%, #0f172a 100%)',
    buttonBg: '#0284c7',
    buttonHover: '#0369a1',
    activeSidebarBg: '#0284c7',
    badgeBg: '#f0f9ff',
    badgeText: '#0369a1',
    textColor: '#0284c7',
    ringColor: 'rgba(2, 132, 199, 0.18)',
    iconBg: '#e0f2fe',
    previewColor: '#0284c7'
  },
  {
    id: 'rose',
    name: 'Hồng Rose Gold Luxury',
    primaryColor: '#e11d48',
    secondaryColor: '#be123c',
    gradient: 'from-rose-950 via-pink-900 to-slate-900',
    heroGradient: 'linear-gradient(135deg, #881337 0%, #500724 50%, #1e1b4b 100%)',
    buttonBg: '#e11d48',
    buttonHover: '#be123c',
    activeSidebarBg: '#e11d48',
    badgeBg: '#fff1f2',
    badgeText: '#be123c',
    textColor: '#e11d48',
    ringColor: 'rgba(225, 29, 72, 0.18)',
    iconBg: '#ffe4e6',
    previewColor: '#e11d48'
  },
  {
    id: 'emerald',
    name: 'Ngọc Lục Bảo Spa',
    primaryColor: '#059669',
    secondaryColor: '#047857',
    gradient: 'from-emerald-950 via-teal-900 to-slate-900',
    heroGradient: 'linear-gradient(135deg, #064e3b 0%, #134e4a 50%, #0f172a 100%)',
    buttonBg: '#059669',
    buttonHover: '#047857',
    activeSidebarBg: '#059669',
    badgeBg: '#ecfdf5',
    badgeText: '#047857',
    textColor: '#059669',
    ringColor: 'rgba(5, 150, 105, 0.18)',
    iconBg: '#d1fae5',
    previewColor: '#059669'
  },
  {
    id: 'lavender',
    name: 'Tím Oải Hương Hoàng Gia',
    primaryColor: '#7c3aed',
    secondaryColor: '#6d28d9',
    gradient: 'from-purple-950 via-indigo-950 to-slate-900',
    heroGradient: 'linear-gradient(135deg, #4c1d95 0%, #31104b 50%, #0f172a 100%)',
    buttonBg: '#7c3aed',
    buttonHover: '#6d28d9',
    activeSidebarBg: '#7c3aed',
    badgeBg: '#f5f3ff',
    badgeText: '#6d28d9',
    textColor: '#7c3aed',
    ringColor: 'rgba(124, 58, 237, 0.18)',
    iconBg: '#ede9fe',
    previewColor: '#7c3aed'
  },
  {
    id: 'coral',
    name: 'Cam San Hô Năng Động',
    primaryColor: '#ea580c',
    secondaryColor: '#c2410c',
    gradient: 'from-orange-950 via-amber-900 to-slate-900',
    heroGradient: 'linear-gradient(135deg, #7c2d12 0%, #451a03 50%, #18181b 100%)',
    buttonBg: '#ea580c',
    buttonHover: '#c2410c',
    activeSidebarBg: '#ea580c',
    badgeBg: '#fff7ed',
    badgeText: '#c2410c',
    textColor: '#ea580c',
    ringColor: 'rgba(234, 88, 12, 0.18)',
    iconBg: '#ffedd5',
    previewColor: '#ea580c'
  },
  {
    id: 'champagne',
    name: 'Hoàng Kim Champagne',
    primaryColor: '#d97706',
    secondaryColor: '#b45309',
    gradient: 'from-amber-950 via-yellow-900 to-slate-900',
    heroGradient: 'linear-gradient(135deg, #78350f 0%, #451a03 50%, #1c1917 100%)',
    buttonBg: '#d97706',
    buttonHover: '#b45309',
    activeSidebarBg: '#d97706',
    badgeBg: '#fffbeb',
    badgeText: '#b45309',
    textColor: '#d97706',
    ringColor: 'rgba(217, 119, 6, 0.18)',
    iconBg: '#fef3c7',
    previewColor: '#d97706'
  },
  {
    id: 'wine',
    name: 'Rượu Vang Quyến Rũ',
    primaryColor: '#9f1239',
    secondaryColor: '#881337',
    gradient: 'from-rose-950 via-red-950 to-slate-900',
    heroGradient: 'linear-gradient(135deg, #4c0519 0%, #2e0814 50%, #0f172a 100%)',
    buttonBg: '#9f1239',
    buttonHover: '#881337',
    activeSidebarBg: '#9f1239',
    badgeBg: '#fff1f2',
    badgeText: '#881337',
    textColor: '#9f1239',
    ringColor: 'rgba(159, 18, 57, 0.18)',
    iconBg: '#ffe4e6',
    previewColor: '#9f1239'
  },
  {
    id: 'mint',
    name: 'Bạc Hà Nha Khoa Y Khoa',
    primaryColor: '#0d9488',
    secondaryColor: '#0f766e',
    gradient: 'from-teal-950 via-emerald-900 to-slate-900',
    heroGradient: 'linear-gradient(135deg, #134e4a 0%, #064e3b 50%, #0f172a 100%)',
    buttonBg: '#0d9488',
    buttonHover: '#0f766e',
    activeSidebarBg: '#0d9488',
    badgeBg: '#f0fdfa',
    badgeText: '#0f766e',
    textColor: '#0d9488',
    ringColor: 'rgba(13, 148, 136, 0.18)',
    iconBg: '#ccfbf1',
    previewColor: '#0d9488'
  },
  {
    id: 'graphite',
    name: 'Than Chì Dark Luxury',
    primaryColor: '#475569',
    secondaryColor: '#334155',
    gradient: 'from-slate-950 via-zinc-900 to-black',
    heroGradient: 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #020617 100%)',
    buttonBg: '#334155',
    buttonHover: '#1e293b',
    activeSidebarBg: '#475569',
    badgeBg: '#f1f5f9',
    badgeText: '#334155',
    textColor: '#334155',
    ringColor: 'rgba(71, 85, 105, 0.18)',
    iconBg: '#e2e8f0',
    previewColor: '#475569'
  },
  {
    id: 'peach',
    name: 'Đào Hồng Dưỡng Nhan',
    primaryColor: '#db2777',
    secondaryColor: '#be185d',
    gradient: 'from-pink-950 via-rose-900 to-slate-900',
    heroGradient: 'linear-gradient(135deg, #831843 0%, #4a044e 50%, #1e1b4b 100%)',
    buttonBg: '#db2777',
    buttonHover: '#be185d',
    activeSidebarBg: '#db2777',
    badgeBg: '#fdf2f8',
    badgeText: '#be185d',
    textColor: '#db2777',
    ringColor: 'rgba(219, 39, 119, 0.18)',
    iconBg: '#fce7f3',
    previewColor: '#db2777'
  }
];
