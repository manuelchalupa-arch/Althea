// Global type declarations for testing utilities
import '@testing-library/jest-dom'

declare module 'vitest' {
  interface Assertion<T = any> {
    toBeInTheDocument(): this
    toHaveClass(className: string): this
  }
}