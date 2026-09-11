import {
  Home, Dumbbell, Apple, TrendingUp, LayoutGrid, BookOpen, ClipboardList, Calendar,
  Moon, Brain, User, Plus, Trash2, Pencil, Check, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Search, Eye, Play, Clock, RotateCcw, X, XCircle,
  Download, Info, AlertTriangle, Copy, Code2, Camera, Barcode, ExternalLink,
  Globe, WifiOff, Box, Layers, Heart, History, Cpu, HardDrive, Droplets, Zap,
  type LucideIcon,
} from 'lucide-react'

// Fuente única de iconografía (§44: no duplicar). Cada entrada resuelve a un
// SVG de usuario en /assets/icons/<grupo>/<archivo> (ver ICON_MANIFEST).
// Hasta que el usuario los provea, BrandIcon usa el fallback Lucide.
export interface BrandIconDef { name: string; file: string; group: 'navigation' | 'more' | 'actions' | 'modules'; label: string; lucide: LucideIcon }

export const ICONS: Record<string, BrandIconDef> = {
  logo:        { name: 'logo',        file: 'logo.svg',        group: 'navigation', label: 'Logo Althea',            lucide: Dumbbell },
  home:        { name: 'home',        file: 'home.svg',        group: 'navigation', label: 'Inicio',                 lucide: Home },
  training:    { name: 'training',    file: 'training.svg',    group: 'navigation', label: 'Entrenamiento',          lucide: Dumbbell },
  nutrition:   { name: 'nutrition',   file: 'nutrition.svg',   group: 'navigation', label: 'Nutrición',              lucide: Apple },
  progress:    { name: 'progress',    file: 'progress.svg',    group: 'navigation', label: 'Progreso',               lucide: TrendingUp },
  more:        { name: 'more',        file: 'more.svg',        group: 'navigation', label: 'Menú',                   lucide: LayoutGrid },
  library:     { name: 'library',     file: 'library.svg',     group: 'more',       label: 'Biblioteca',             lucide: BookOpen },
  routines:    { name: 'routines',    file: 'routines.svg',    group: 'more',       label: 'Rutinas',                lucide: ClipboardList },
  calendar:    { name: 'calendar',    file: 'calendar.svg',    group: 'more',       label: 'Calendario',             lucide: Calendar },
  recovery:    { name: 'recovery',    file: 'recovery.svg',    group: 'more',       label: 'Recuperación',           lucide: Moon },
  coach:       { name: 'coach',       file: 'coach.svg',       group: 'more',       label: 'Coach y objetivos',      lucide: Brain },
  profile:     { name: 'profile',     file: 'profile.svg',     group: 'more',       label: 'Perfil y configuración', lucide: User },
  add:         { name: 'add',         file: 'add.svg',         group: 'actions',    label: 'Agregar',                lucide: Plus },
  delete:      { name: 'delete',      file: 'delete.svg',      group: 'actions',    label: 'Eliminar',               lucide: Trash2 },
  edit:        { name: 'edit',        file: 'edit.svg',        group: 'actions',    label: 'Editar',                 lucide: Pencil },
  confirm:     { name: 'confirm',     file: 'confirm.svg',     group: 'actions',    label: 'Confirmar',              lucide: Check },
  back:        { name: 'back',        file: 'back.svg',        group: 'actions',    label: 'Volver',                 lucide: ChevronLeft },
  forward:     { name: 'forward',     file: 'forward.svg',     group: 'actions',    label: 'Avanzar',                lucide: ChevronRight },
  collapse:    { name: 'collapse',    file: 'collapse.svg',    group: 'actions',    label: 'Contraer',               lucide: ChevronsLeft },
  expand:      { name: 'expand',      file: 'expand.svg',      group: 'actions',    label: 'Expandir',               lucide: ChevronsRight },
  search:      { name: 'search',      file: 'search.svg',      group: 'actions',    label: 'Buscar',                 lucide: Search },
  view:        { name: 'view',        file: 'view.svg',        group: 'actions',    label: 'Ver',                    lucide: Eye },
  play:        { name: 'play',        file: 'play.svg',        group: 'actions',    label: 'Iniciar',                lucide: Play },
  clock:       { name: 'clock',       file: 'clock.svg',       group: 'actions',    label: 'Reloj / descanso',       lucide: Clock },
  rotate:      { name: 'rotate',      file: 'rotate.svg',      group: 'actions',    label: 'Rotar / cambiar',        lucide: RotateCcw },
  close:       { name: 'close',       file: 'close.svg',       group: 'actions',    label: 'Cerrar',                 lucide: XCircle },
  closeplain:  { name: 'closeplain',  file: 'closeplain.svg',  group: 'actions',    label: 'Cerrar simple',          lucide: X },
  download:    { name: 'download',    file: 'download.svg',    group: 'actions',    label: 'Descargar',              lucide: Download },
  info:        { name: 'info',        file: 'info.svg',        group: 'actions',    label: 'Información',            lucide: Info },
  alert:       { name: 'alert',       file: 'alert.svg',       group: 'actions',    label: 'Alerta',                 lucide: AlertTriangle },
  copy:        { name: 'copy',        file: 'copy.svg',        group: 'actions',    label: 'Copiar',                 lucide: Copy },
  code:        { name: 'code',        file: 'code.svg',        group: 'actions',    label: 'Código',                 lucide: Code2 },
  camera:      { name: 'camera',      file: 'camera.svg',      group: 'actions',    label: 'Cámara',                 lucide: Camera },
  barcode:     { name: 'barcode',     file: 'barcode.svg',     group: 'actions',    label: 'Código de barras',       lucide: Barcode },
  link:        { name: 'link',        file: 'link.svg',        group: 'actions',    label: 'Enlace externo',         lucide: ExternalLink },
  globe:       { name: 'globe',       file: 'globe.svg',       group: 'actions',    label: 'Idioma / web',           lucide: Globe },
  offline:     { name: 'offline',     file: 'offline.svg',     group: 'actions',    label: 'Sin conexión',           lucide: WifiOff },
  box:         { name: 'box',         file: 'box.svg',         group: 'actions',    label: 'Categoría',              lucide: Box },
  layers:      { name: 'layers',      file: 'layers.svg',      group: 'actions',    label: 'Partes / capas',         lucide: Layers },
  heart:       { name: 'heart',       file: 'heart.svg',       group: 'actions',    label: 'Músculo / favorito',     lucide: Heart },
  history:     { name: 'history',     file: 'history.svg',     group: 'actions',    label: 'Historial',              lucide: History },
  cpu:         { name: 'cpu',         file: 'cpu.svg',         group: 'actions',    label: 'IA / modelo',            lucide: Cpu },
  drive:       { name: 'drive',       file: 'drive.svg',       group: 'actions',    label: 'Almacenamiento',         lucide: HardDrive },
  droplets:    { name: 'droplets',    file: 'droplets.svg',    group: 'actions',    label: 'Hidratación',            lucide: Droplets },
  energy:      { name: 'energy',      file: 'energy.svg',      group: 'actions',    label: 'Energía',                lucide: Zap },
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
