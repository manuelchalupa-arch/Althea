import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AltheaInput, AltheaSelect, AltheaTextarea } from './AltheaInput'

// FASE 2 - S8: los tres componentes del set renderizaban `<label>` sin `htmlFor`
// y el control sin `id`. Consecuencias: hacer clic en el label no enfocaba el
// campo, y el campo no tenia nombre accesible (los lectores de pantalla no
// anunciaban el label). Ademas `hint`/`error` no se asociaban al control y los
// iconos decorativos de material-symbols se anunciaban como texto.

describe('S8 - AltheaInput: el label se asocia al control', () => {
  it('getByLabelText encuentra el input (el label tiene htmlFor correcto)', () => {
    render(<AltheaInput label="Fecha inicio" type="date" />)
    const input = screen.getByLabelText('Fecha inicio') as HTMLInputElement
    expect(input).toBeInTheDocument()
    expect(input.tagName).toBe('INPUT')
  })

  it('el htmlFor del label coincide con el id del input', () => {
    const { container } = render(<AltheaInput label="Peso kg" />)
    const label = container.querySelector('label') as HTMLLabelElement
    const input = container.querySelector('input') as HTMLInputElement
    expect(label.htmlFor).toBeTruthy()
    expect(input.id).toBe(label.htmlFor)
  })

  it('sin label el input sigue teniendo id (util para aria-describedby externo)', () => {
    const { container } = render(<AltheaInput />)
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.id).toBeTruthy()
  })

  it('respeta el id que le pasa el consumidor y lo enlaza al label', () => {
    render(<AltheaInput label="Hasta" id="mi-id-custom" />)
    const input = screen.getByLabelText('Hasta') as HTMLInputElement
    expect(input.id).toBe('mi-id-custom')
  })

  it('dos instancias no comparten id (sin IDs duplicados)', () => {
    const { container } = render(
      <>
        <AltheaInput label="Desde" />
        <AltheaInput label="Hasta" />
      </>
    )
    const [a, b] = Array.from(container.querySelectorAll('input')) as HTMLInputElement[]
    expect(a.id).toBeTruthy()
    expect(b.id).toBeTruthy()
    expect(a.id).not.toBe(b.id)
  })

  it('sin label ni icono no renderiza texto extra en el contenedor', () => {
    const { container } = render(<AltheaInput placeholder="Buscar" />)
    expect(container.querySelector('label')).toBeNull()
    expect(screen.getByPlaceholderText('Buscar')).toBeInTheDocument()
  })
})

describe('S8 - AltheaInput: hint y error se anuncian con el control', () => {
  it('el hint queda asociado por aria-describedby', () => {
    const { container } = render(<AltheaInput label="Email" hint="Solo para recordatorios" />)
    const input = container.querySelector('input') as HTMLInputElement
    const hint = screen.getByText('Solo para recordatorios')
    expect(input.getAttribute('aria-describedby')).toBe(hint.id)
    expect(hint.id).toBeTruthy()
  })

  it('el error se anuncia con role=alert, queda asociado y marca aria-invalid', () => {
    const { container } = render(<AltheaInput label="Email" error="Correo inválido" />)
    const input = container.querySelector('input') as HTMLInputElement
    const error = screen.getByRole('alert')
    expect(error.textContent).toContain('Correo inválido')
    expect(input.getAttribute('aria-describedby')).toBe(error.id)
    expect(input.getAttribute('aria-invalid')).toBe('true')
  })

  it('el error tiene prioridad sobre el hint en aria-describedby', () => {
    const { container } = render(<AltheaInput label="Email" hint="Ayuda" error="Falla" />)
    const input = container.querySelector('input') as HTMLInputElement
    expect(screen.queryByText('Ayuda')).not.toBeInTheDocument()
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id)
  })

  it('un aria-describedby del consumidor se conserva y se combina', () => {
    const { container } = render(
      <><span id="externo">externo</span><AltheaInput label="Email" hint="Ayuda" aria-describedby="externo" /></>
    )
    const input = container.querySelector('input') as HTMLInputElement
    const described = (input.getAttribute('aria-describedby') as string).split(' ')
    expect(described).toContain('externo')
    expect(described).toContain(screen.getByText('Ayuda').id)
  })
})

describe('S8 - los iconos decorativos no se anuncian', () => {
  it('el icon del AltheaInput es aria-hidden', () => {
    const { container } = render(<AltheaInput label="Buscar" icon="search" />)
    const icon = container.querySelector('.material-symbols-outlined') as HTMLElement
    expect(icon.getAttribute('aria-hidden')).toBe('true')
  })

  it('el chevron del AltheaSelect es aria-hidden', () => {
    const { container } = render(<AltheaSelect label="Grupo" options={[{ value: 'a', label: 'A' }]} />)
    const chevron = container.querySelector('.material-symbols-outlined') as HTMLElement
    expect(chevron.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('S8 - AltheaSelect y AltheaTextarea', () => {
  it('AltheaSelect: el label se asocia al select y conserva sus opciones', () => {
    render(<AltheaSelect label="Grupo muscular" options={[{ value: 'pecho', label: 'Pecho' }]} defaultValue="pecho" />)
    const select = screen.getByLabelText('Grupo muscular') as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    expect(select.value).toBe('pecho')
  })

  it('AltheaSelect: respeta el id del consumidor', () => {
    render(<AltheaSelect label="Grupo" id="grupo-id" options={[{ value: 'a', label: 'A' }]} />)
    expect((screen.getByLabelText('Grupo') as HTMLSelectElement).id).toBe('grupo-id')
  })

  it('AltheaTextarea: el label se asocia al textarea', () => {
    const { container } = render(<AltheaTextarea label="Notas" defaultValue="hola" />)
    const ta = screen.getByLabelText('Notas') as HTMLTextAreaElement
    expect(ta.tagName).toBe('TEXTAREA')
    expect(ta.value).toBe('hola')
    const label = container.querySelector('label') as HTMLLabelElement
    expect(label.htmlFor).toBe(ta.id)
  })
})
