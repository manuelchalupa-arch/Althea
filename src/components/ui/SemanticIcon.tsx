import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Award,
  BarChart3,
  Brain,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  CloudOff,
  Droplets,
  Dumbbell,
  ExternalLink,
  Eye,
  Flame,
  GraduationCap,
  GripVertical,
  Heart,
  Hourglass,
  Info,
  LayoutGrid,
  Lightbulb,
  LucideIcon,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Play,
  PlayCircle,
  Plus,
  RotateCw,
  Search,
  Settings,
  Sparkles,
  Thermometer,
  Trash2,
  TrendingUp,
  Utensils,
  X,
  Zap,
} from 'lucide-react'

const SEMANTIC_ICONS: Record<string, LucideIcon> = {
  warning: AlertTriangle,
  favorite: Heart,
  'favorite_border': Heart,
  water_drop: Droplets,
  local_fire_department: Flame,
  schedule: Clock,
  check_circle: CheckCircle2,
  done: Check,
  date_range: CalendarDays,
  swap_horiz: ArrowLeft,
  play_arrow: Play,
  play_circle: PlayCircle,
  chevron_right: ChevronRight,
  chevron_left: ChevronLeft,
  expand_more: ChevronDown,
  expand_less: ChevronUp,
  electric_bolt: Zap,
  restaurant: Utensils,
  restaurant_menu: Utensils,
  spa: Sparkles,
  insights: TrendingUp,
  psychology: Brain,
  psychology_alt: Brain,
  chat: MessageCircle,
  edit_square: Pencil,
  edit: Pencil,
  arrow_forward: ArrowRight,
  arrow_outward: ArrowUpRight,
  close: X,
  menu: MoreHorizontal,
  more_horiz: MoreHorizontal,
  add: Plus,
  delete: Trash2,
  refresh: RotateCw,
  search: Search,
  settings: Settings,
  info: Info,
  error_outline: AlertTriangle,
  calendar_today: Calendar,
  trending_up: TrendingUp,
  trending_flat: ArrowRight,
  leaderboard: BarChart3,
  progress_activity: RotateCw,
  self_improvement: Sparkles,
  hydration: Droplets,
  bolt: Zap,
  thermoregulator: Thermometer,
  fire: Flame,
  clear: X,
  cloud_off: CloudOff,
  error: AlertCircle,
  school: GraduationCap,
  open_in_new: ExternalLink,
  visibility: Eye,
  lightbulb: Lightbulb,
  workspace_premium: Award,
  reorder: GripVertical,
  hourglass_top: Hourglass,
  auto_awesome: Sparkles,
  apps: LayoutGrid,
  fitness_center: Dumbbell,
} as Record<string, LucideIcon>

export default function SemanticIcon({
  name,
  size = 20,
  strokeWidth = 2,
  className = '',
  ariaHidden = false,
}: {
  name: string
  size?: number
  strokeWidth?: number
  className?: string
  ariaHidden?: boolean
}) {
  const key = (name || '').trim().toLowerCase()
  const Icon = SEMANTIC_ICONS[key] || SEMANTIC_ICONS[key.replace(/\s+/g, '_')]
  if (!Icon) { return null }
  return (
    <span
      className={className}
      data-icon={key}
      role={ariaHidden ? undefined : 'img'}
      aria-hidden={ariaHidden}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon size={size} strokeWidth={strokeWidth} aria-hidden />
    </span>
  )
}