import React from 'react'
import {
  IconHome, IconDumbbell, IconApple, IconTrendingUp, IconMenu, IconBrain,
  IconMoon, IconCalendar, IconBook, IconClipboard, IconUser, IconPlay,
  IconPause, IconCheck, IconTimer, IconSearch, IconPlus, IconTrash,
  IconChevronLeft, IconChevronRight, IconX, IconAlert, IconEye,
  IconRefresh, IconSun, IconSparkles, IconUtensils, IconSleep,
  IconBody, IconSwap, IconWeight, IconReps, IconFire, IconWater,
  IconScale, IconHeart, IconTarget, IconLightning,
  IconChart, IconMedal, IconShield, IconClock, IconMacro,
} from './FitnessIcons'

// Maps Material Symbol names to custom SVG icon components
const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  // Navigation
  'home': IconHome,
  'fitness_center': IconDumbbell,
  'apple': IconApple,
  'trending_up': IconTrendingUp,
  'trending_down': IconTrendingUp,
  'menu': IconMenu,
  'psychology': IconBrain,
  'psychology_alt': IconBrain,
  'moon': IconMoon,
  'bedtime': IconMoon,
  'calendar_month': IconCalendar,
  'calendar_today': IconCalendar,
  'date_range': IconCalendar,
  'menu_book': IconBook,
  'local_library': IconBook,
  'format_list_bulleted': IconClipboard,
  'clipboard_list': IconClipboard,
  'user': IconUser,
  'person': IconUser,
  'badge': IconUser,

  // Actions
  'play_arrow': IconPlay,
  'play_circle': IconPlay,
  'pause_circle': IconPause,
  'pause': IconPause,
  'check_circle': IconCheck,
  'check': IconCheck,
  'done': IconCheck,
  'verified': IconCheck,
  'timer': IconTimer,
  'schedule': IconClock,
  'hourglass_top': IconTimer,
  'search': IconSearch,
  'add': IconPlus,
  'add_circle': IconPlus,
  'delete': IconTrash,
  'close': IconX,
  'cancel': IconX,
  'arrow_forward': IconChevronRight,
  'arrow_back': IconChevronLeft,
  'chevron_right': IconChevronRight,
  'chevron_left': IconChevronLeft,
  'refresh': IconRefresh,
  'rotate_right': IconRefresh,
  'visibility': IconEye,
  'edit': IconEye,
  'swap_horiz': IconSwap,
  'reorder': IconSwap,
  'lightbulb': IconLightning,
  'auto_awesome': IconSparkles,
  'sparkles': IconSparkles,
  'workspace_premium': IconMedal,
  'emoji_events': IconMedal,
  'star': IconMedal,
  'military_tech': IconMedal,

  // Fitness
  'monitor_weight': IconScale,
  'balance': IconScale,
  'speed': IconLightning,
  'electric_bolt': IconLightning,
  'bolt': IconLightning,
  'zap': IconLightning,
  'local_fire_department': IconFire,
  'fire': IconFire,
  'water_drop': IconWater,
  'droplets': IconWater,
  'wine_bar': IconWater,
  'monitor_heart': IconHeart,
  'heart': IconHeart,
  'favorite': IconHeart,
  'target': IconTarget,
  'accessibility_new': IconBody,
  'body': IconBody,
  'sports_martial_arts': IconDumbbell,

  // Charts & Progress
  'bar_chart': IconChart,
  'show_chart': IconChart,
  'stacked_bar_chart': IconChart,
  'query_stats': IconChart,
  'insights': IconChart,
  'auto_graph': IconChart,
  'timeline': IconChart,
  'summarize': IconChart,

  // Health & Recovery
  'spa': IconSleep,
  'sleep': IconSleep,
  'science': IconShield,
  'shield': IconShield,
  'nutrition': IconApple,
  'restaurant_menu': IconUtensils,
  'wb_twilight': IconSun,
  'wb_sunny': IconSun,

  // UI
  'info': IconAlert,
  'alert': IconAlert,
  'warning': IconAlert,
  'do_not_disturb_on': IconX,
  'radio_button_unchecked': IconPause,
  'progress_activity': IconRefresh,
  'dark_mode': IconMoon,
  'light_mode': IconSun,
  'forum': IconBrain,
  'chat': IconBrain,
  'chat_bubble': IconBrain,
  'tune': IconTarget,
  'settings': IconTarget,
  'inventory_2': IconBook,
  'pie_chart': IconChart,
  'view_week': IconCalendar,
  'mobile_share_stack': IconTrendingUp,
  'north_east': IconTrendingUp,
  'arrow_upward': IconTrendingUp,
  'sentiment_satisfied': IconCheck,
  'sentiment_neutral': IconPause,
  'temple_hindu': IconShield,
}

interface IconProps {
  name: string
  className?: string
  size?: number
}

export default function MaterialIcon({ name, className = '', size }: IconProps) {
  const IconComponent = ICON_MAP[name]
  if (IconComponent) {
    return (
      <span className={`inline-flex items-center justify-center ${className}`} style={size ? { width: size, height: size } : undefined}>
        <IconComponent className="w-full h-full" />
      </span>
    )
  }
  // Fallback to Material Symbols font
  return (
    <span className={`material-symbols-outlined ${className}`}>
      {name}
    </span>
  )
}
