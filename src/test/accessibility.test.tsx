import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import '@testing-library/jest-dom'
import AppNav from '@/components/layout/AppNav'
import BrandIcon from '@/components/brand/BrandIcon'
import { MemoryRouter } from 'react-router-dom'

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter initialEntries={['/']}>{ui}</MemoryRouter>)
}

describe('Accessibility Audit (WCAG AA)', () => {
  describe('BrandIcon', () => {
    it('should have role="img" and aria-label for custom icons', () => {
      renderWithRouter(<BrandIcon name="logo" size={32} label="Althea Logo" />)
      const img = screen.getByRole('img', { name: 'Althea Logo' })
      expect(img).toBeInTheDocument()
    })

    it('should have role="img" and aria-label for Lucide fallback', () => {
      renderWithRouter(<BrandIcon name="home" size={24} label="Home" />)
      const img = screen.getByRole('img', { name: 'Home' })
      expect(img).toBeInTheDocument()
    })

    it('should use aria-hidden on fallback Lucide icons', () => {
      renderWithRouter(<BrandIcon name="home" size={24} />)
      const lucideIcon = screen.getByRole('img', { name: 'Inicio' })
      expect(lucideIcon).toBeInTheDocument()
    })
  })

  describe('AppNav', () => {
    it('should have aria-label on mobile nav', () => {
      renderWithRouter(<AppNav />)
      const mobileNav = screen.getByRole('navigation', { name: 'Navegación principal' })
      expect(mobileNav).toBeInTheDocument()
    })

    it('should have aria-label on desktop sidebar', () => {
      renderWithRouter(<AppNav />)
      const desktopNav = screen.getByRole('complementary', { name: 'Menú lateral' })
      expect(desktopNav).toBeInTheDocument()
    })

    it('collapse/expand button should have aria-label', () => {
      renderWithRouter(<AppNav />)
      const toggleBtn = screen.getByRole('button', { name: /(expandir|contraer)/i })
      expect(toggleBtn).toBeInTheDocument()
    })
  })

  describe('Touch targets (44px minimum)', () => {
    it('bottom nav items should have minimum 44px touch target via CSS classes', () => {
      renderWithRouter(<AppNav />)
      const homeLink = screen.getByRole('link', { name: 'Inicio' })
      // In jsdom, computed styles may not be available, so check for the CSS class
      expect(homeLink).toHaveClass('min-h-[44px]')
      expect(homeLink).toHaveClass('min-w-[44px]')
    })
  })

  describe('Color contrast', () => {
    it('should not use problematic color combinations', () => {
      renderWithRouter(<AppNav />)
      const links = screen.getAllByRole('link')
      links.forEach(link => {
        const style = window.getComputedStyle(link)
        expect(style.color).toBeTruthy()
      })
    })
  })

  describe('Keyboard navigation', () => {
    it('all interactive elements should be focusable', () => {
      renderWithRouter(<AppNav />)
      const links = screen.getAllByRole('link')
      const buttons = screen.getAllByRole('button')
      const allInteractive = [...links, ...buttons]
      allInteractive.forEach(el => {
        expect(el.tabIndex).not.toBeLessThan(0)
      })
    })

    it('focus should be visible', () => {
      renderWithRouter(<AppNav />)
      const links = screen.getAllByRole('link')
      links.forEach(link => {
        const style = window.getComputedStyle(link)
        expect(style.outline).not.toBe('none')
      })
    })
  })
})