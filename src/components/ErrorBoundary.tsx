import { Component, ReactNode } from 'react'
import { logger } from '@/services/logger'

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
  errorInfo?: React.ErrorInfo
}

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
  componentName?: string
}

/**
 * Error Boundary para capturar errores de renderizado de React.
 * Captura errores de UI, los registra en el logger centralizado
 * y muestra una interfaz de fallback clara al usuario.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ error, errorInfo })
    
    // Log to centralized logger
    logger.ui.error(this.props.componentName || 'ErrorBoundary', error, {
      componentStack: errorInfo.componentStack,
      event: 'ui:render:error'
    })
    
    // Call optional callback
    this.props.onError?.(error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen bg-transparent p-4 md:p-6 lg:p-8 pb-24 max-w-[1440px] w-full mx-auto">
          <div className="bg-surface-container-high/90 backdrop-blur-sm border border-error/30 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h2 className="font-headline-lg text-base font-semibold text-on-surface">Algo salió mal</h2>
                <p className="font-body-md text-sm text-on-surface-variant mt-1">Ocurrió un error inesperado en la aplicación</p>
              </div>
            </div>
            
            <div className="bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-4">
              <p className="font-body-md text-sm text-on-surface mb-2">El error ha sido registrado automáticamente. Tus datos guardados en la base de datos local (rutinas, sesiones, historial) están a salvo.</p>
              
              <details className="mt-3">
                <summary className="font-label-caps text-[10px] uppercase text-on-surface-variant cursor-pointer">Detalles técnicos</summary>
                <pre className="mt-2 p-2 bg-surface-container-high/90 backdrop-blur-sm border border-outline-variant rounded font-mono text-[10px] text-on-surface-variant overflow-auto max-h-48">
                  {this.state.error?.message || 'Error desconocido'}
                  {this.state.errorInfo?.componentStack && `\n\n${this.state.errorInfo.componentStack}`}
                </pre>
              </details>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 py-2.5 rounded-lg bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold transition-colors active:scale-[0.98]"
              >
                Recargar aplicación
              </button>
              <button
                onClick={() => this.setState({ hasError: false })}
                className="flex-1 py-2.5 rounded-lg bg-surface-container-low/90 border border-outline-variant font-label-caps text-[10px] uppercase text-on-surface-variant hover:border-secondary/50 hover:text-secondary transition-colors"
              >
                Intentar continuar
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Error Boundary específico para la pantalla de Entrenamiento
 * Aísla fallos durante el entrenamiento para no perder la sesión
 */
export class EntrenarErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ error, errorInfo })
    
    logger.ui.error('Entrenar', error, {
      componentStack: errorInfo.componentStack,
      event: 'ui:render:error'
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-transparent p-4 md:p-6 lg:p-8 pb-24 max-w-[1440px] w-full mx-auto">
          <div className="bg-error/10 border border-error/30 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-error/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h2 className="font-headline-lg text-base font-semibold text-error">Error en Entrenamiento</h2>
                <p className="font-body-md text-sm text-on-surface-variant">Tu sesión está guardada. Puedes recargar y continuar.</p>
              </div>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 px-5 rounded bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold tracking-widest transition-all active:scale-[0.98]"
            >
              Recargar y continuar
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Error Boundary específico para Nutrición
 */
export class NutricionErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ error, errorInfo })
    logger.ui.error('Nutricion', error, { componentStack: errorInfo.componentStack })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-surface-container-low/90 border border-error/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-error/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="font-headline-md text-base font-semibold text-error">Error en Nutrición</h3>
              <p className="font-body-sm text-on-surface-variant">Tus datos nutricionales están guardados.</p>
            </div>
          </div>
          <button onClick={() => window.location.reload()} className="w-full py-2 rounded bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold">
            Recargar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

/**
 * Error Boundary específico para Coach
 */
export class CoachErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ error, errorInfo })
    logger.ui.error('Coach', error, { componentStack: errorInfo.componentStack })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-surface-container-low/90 border border-error/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-error/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="font-headline-md text-base font-semibold text-error">Error en Coach IA</h3>
              <p className="font-body-sm text-on-surface-variant">Intenta recargar para restablecer la conexión.</p>
            </div>
          </div>
          <button onClick={() => window.location.reload()} className="w-full py-2 rounded bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold">
            Recargar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

/**
 * Error Boundary específico para Progreso
 */
export class ProgresoErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ error, errorInfo })
    logger.ui.error('Progreso', error, { componentStack: errorInfo.componentStack })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-surface-container-low/90 border border-error/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-error/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="font-headline-md text-base font-semibold text-error">Error en Progreso</h3>
              <p className="font-body-sm text-on-surface-variant">Tus datos de progreso están guardados en la base de datos.</p>
            </div>
          </div>
          <button onClick={() => window.location.reload()} className="w-full py-2 rounded bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold">
            Recargar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}