import React from 'react'
import {
  Home, Dumbbell, Apple, TrendingUp, LayoutGrid, BookOpen, ClipboardList, Calendar,
  Moon, Brain, User, Plus, Trash2, Pencil, Check, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Search, Eye, Play, Pause, Clock, RotateCcw, X, XCircle,
  Download, Info, AlertTriangle, Copy, Code2, Camera, Barcode, ExternalLink,
  Globe, WifiOff, Box, Layers, Heart, History, Cpu, HardDrive, Droplets, Zap,
  type LucideIcon,
} from 'lucide-react'
import {
  IconHome, IconDumbbell, IconApple, IconTrendingUp, IconMenu, IconBrain,
  IconMoon, IconCalendar, IconBook, IconClipboard, IconUser, IconPlay,
  IconPause, IconCheck, IconTimer, IconSearch, IconPlus, IconTrash,
  IconChevronLeft, IconChevronRight, IconX, IconAlert, IconEye,
  IconRefresh, IconSun, IconSparkles, IconUtensils, IconSleep,
  IconBody, IconSwap, IconWeight, IconReps, IconFire, IconWater,
  IconScale, IconHeart as IconHeartCustom, IconTarget, IconLightning,
  IconChart, IconMedal, IconShield, IconClock, IconMacro,
} from './FitnessIcons'

// Fuente única de iconografía (§44: no duplicar). Cada entrada resuelve a un
// SVG fitness-themed custom o fallback Lucide.
export interface BrandIconDef { name: string; file: string; group: 'navigation' | 'more' | 'actions' | 'modules'; label: string; lucide: LucideIcon; custom?: React.FC<{ className?: string }> }

export const ICONS: Record<string, BrandIconDef> = {
  logo:        { name: 'logo',        file: 'logo.png',        group: 'navigation', label: 'Logo Althea',            lucide: Dumbbell, custom: IconDumbbell },
  home:        { name: 'home',        file: 'home.png',        group: 'navigation', label: 'Inicio',                 lucide: Home, custom: IconHome },
  training:    { name: 'training',    file: 'training.png',    group: 'navigation', label: 'Entrenamiento',          lucide: Dumbbell, custom: IconDumbbell },
  nutrition:   { name: 'nutrition',   file: 'nutrition.png',   group: 'navigation', label: 'Nutrición',              lucide: Apple, custom: IconApple },
  progress:    { name: 'progress',    file: 'progress.png',    group: 'navigation', label: 'Progreso',               lucide: TrendingUp, custom: IconTrendingUp },
  more:        { name: 'more',        file: 'more.png',        group: 'navigation', label: 'Menú',                   lucide: LayoutGrid, custom: IconMenu },
  library:     { name: 'library',     file: 'library.svg',     group: 'more',       label: 'Biblioteca',             lucide: BookOpen, custom: IconBook },
  routines:    { name: 'routines',    file: 'routines.png',    group: 'more',       label: 'Rutinas',                lucide: ClipboardList, custom: IconClipboard },
  calendar:    { name: 'calendar',    file: 'calendar.svg',    group: 'more',       label: 'Calendario',             lucide: Calendar, custom: IconCalendar },
  recovery:    { name: 'recovery',    file: 'recovery.png',    group: 'more',       label: 'Recuperación',           lucide: Moon, custom: IconMoon },
  coach:       { name: 'coach',       file: 'coach.png',       group: 'more',       label: 'Coach y objetivos',      lucide: Brain, custom: IconBrain },
  profile:     { name: 'profile',     file: 'profile.png',     group: 'more',       label: 'Perfil y configuración', lucide: User, custom: IconUser },
  add:         { name: 'add',         file: 'add.png',         group: 'actions',    label: 'Agregar',                lucide: Plus, custom: IconPlus },
  confirm:     { name: 'confirm',     file: 'confirm.png',     group: 'actions',    label: 'Confirmar',              lucide: Check, custom: IconCheck },
  back:        { name: 'back',        file: 'back.svg',        group: 'actions',    label: 'Volver',                 lucide: ChevronLeft, custom: IconChevronLeft },
  forward:     { name: 'forward',     file: 'forward.svg',     group: 'actions',    label: 'Avanzar',                lucide: ChevronRight, custom: IconChevronRight },
  collapse:    { name: 'collapse',    file: 'collapse.svg',    group: 'actions',    label: 'Contraer',               lucide: ChevronsLeft },
  expand:      { name: 'expand',      file: 'expand.svg',      group: 'actions',    label: 'Expandir',               lucide: ChevronsRight },
  search:      { name: 'search',      file: 'search.svg',      group: 'actions',    label: 'Buscar',                 lucide: Search, custom: IconSearch },
  view:        { name: 'view',        file: 'view.svg',        group: 'actions',    label: 'Ver',                    lucide: Eye, custom: IconEye },
  play:        { name: 'play',        file: 'play.svg',        group: 'actions',    label: 'Iniciar',                lucide: Play, custom: IconPlay },
  pause:       { name: 'pause',       file: 'pause.svg',       group: 'actions',    label: 'Pausar',                 lucide: Pause, custom: IconPause },
  clock:       { name: 'clock',       file: 'clock.svg',       group: 'actions',    label: 'Reloj / descanso',       lucide: Clock, custom: IconClock },
  rotate:      { name: 'rotate',      file: 'rotate.svg',      group: 'actions',    label: 'Rotar / cambiar',        lucide: RotateCcw, custom: IconRefresh },
  close:       { name: 'close',       file: 'close.svg',       group: 'actions',    label: 'Cerrar',                 lucide: XCircle, custom: IconX },
  closeplain:  { name: 'closeplain',  file: 'closeplain.svg',  group: 'actions',    label: 'Cerrar simple',          lucide: X, custom: IconX },
  download:    { name: 'download',    file: 'download.svg',    group: 'actions',    label: 'Descargar',              lucide: Download },
  info:        { name: 'info',        file: 'info.svg',        group: 'actions',    label: 'Información',            lucide: Info },
  alert:       { name: 'alert',       file: 'alert.svg',       group: 'actions',    label: 'Alerta',                 lucide: AlertTriangle, custom: IconAlert },
  copy:        { name: 'copy',        file: 'copy.svg',        group: 'actions',    label: 'Copiar',                 lucide: Copy },
  code:        { name: 'code',        file: 'code.svg',        group: 'actions',    label: 'Código',                 lucide: Code2 },
  camera:      { name: 'camera',      file: 'camera.svg',      group: 'actions',    label: 'Cámara',                 lucide: Camera },
  barcode:     { name: 'barcode',     file: 'barcode.svg',     group: 'actions',    label: 'Código de barras',       lucide: Barcode },
  link:        { name: 'link',        file: 'link.svg',        group: 'actions',    label: 'Enlace externo',         lucide: ExternalLink },
  globe:       { name: 'globe',       file: 'globe.svg',       group: 'actions',    label: 'Idioma / web',           lucide: Globe },
  offline:     { name: 'offline',     file: 'offline.svg',     group: 'actions',    label: 'Sin conexión',           lucide: WifiOff },
  box:         { name: 'box',         file: 'box.svg',         group: 'actions',    label: 'Categoría',              lucide: Box },
  layers:      { name: 'layers',      file: 'layers.svg',      group: 'actions',    label: 'Partes / capas',         lucide: Layers },
  heart:       { name: 'heart',       file: 'heart.svg',       group: 'actions',    label: 'Músculo / favorito',     lucide: Heart, custom: IconHeartCustom },
  history:     { name: 'history',     file: 'history.svg',     group: 'actions',    label: 'Historial',              lucide: History },
  cpu:         { name: 'cpu',         file: 'cpu.svg',         group: 'actions',    label: 'IA / modelo',            lucide: Cpu },
  drive:       { name: 'drive',       file: 'drive.svg',       group: 'actions',    label: 'Almacenamiento',         lucide: HardDrive },
  droplets:    { name: 'droplets',    file: 'droplets.svg',    group: 'actions',    label: 'Hidratación',            lucide: Droplets, custom: IconWater },
  energy:      { name: 'energy',      file: 'energy.svg',      group: 'actions',    label: 'Energía',                lucide: Zap, custom: IconLightning },
}

// Extra fitness-specific icons not in the main registry
export const FITNESS_ICONS = {
  fire: IconFire,
  water: IconWater,
  scale: IconScale,
  target: IconTarget,
  lightning: IconLightning,
  chart: IconChart,
  medal: IconMedal,
  shield: IconShield,
  timer: IconTimer,
  sleep: IconSleep,
  body: IconBody,
  swap: IconSwap,
  weight: IconWeight,
  reps: IconReps,
  sparkles: IconSparkles,
  utensils: IconUtensils,
  sun: IconSun,
  macro: IconMacro,
}

export interface NavItem { to: string; label: string; icon: keyof typeof ICONS; priority?: boolean }

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Inicio', icon: 'home' },
  { to: '/entrenar', label: 'Entrenamiento', icon: 'training', priority: true },
  { to: '/nutricion', label: 'Nutrición', icon: 'nutrition' },
  { to: '/progresos', label: 'Progreso', icon: 'progress' },
  { to: '/mas', label: 'Menú', icon: 'more' },
]

export interface MasGroup { title: string; items: { to: string; label: string; icon: keyof typeof ICONS }[] }

export const MAS_GROUPS: MasGroup[] = [
  { title: 'Biblioteca', items: [{ to: '/biblioteca', label: 'Ejercicios y músculos', icon: 'library' }] },
  {
    title: 'Entrenamiento',
    items: [
      { to: '/rutinas', label: 'Rutinas', icon: 'routines' },
      { to: '/calendario', label: 'Calendario e historial', icon: 'calendar' },
      { to: '/recuperacion', label: 'Recuperación', icon: 'recovery' },
    ],
  },
  {
    title: 'Salud y progreso',
    items: [
      { to: '/nutricion', label: 'Nutrición', icon: 'nutrition' },
      { to: '/progreso', label: 'Progreso y estadísticas', icon: 'progress' },
    ],
  },
  {
    title: 'Persona',
    items: [
      { to: '/coach', label: 'Coach y objetivos', icon: 'coach' },
      { to: '/perfil', label: 'Perfil y configuración', icon: 'profile' },
    ],
  },
]

// Manifiesto de recursos que debe proveer el usuario (§15): nombre → ruta esperada.
export const ICON_MANIFEST: { name: string; path: string; label: string }[] =
  Object.values(ICONS).map((d) => ({ name: d.name, path: `assets/icons/${d.group}/${d.file}`, label: d.label }))

export function iconSrc(name: string): string | null {
  const def = (ICONS as Record<string, BrandIconDef>)[name]
  return def ? `/assets/icons/${def.group}/${def.file}` : null
}
