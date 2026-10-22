# Deuda de accesibilidad (A11Y-001 / A11Y-002)

> Medido el 2026-10-15 activando
> `eslint-plugin-jsx-a11y` en `eslint.config.mjs`.

## Qué cambió

El plugin **ya estaba instalado** pero **nunca se cargaba** en la config de
ESLint: no existía ninguna detección de accesibilidad en el proyecto.

Detalle técnico que lo explica: `eslint-plugin-jsx-a11y` es CommonJS, así que
hay que registrarlo como `(await import('eslint-plugin-jsx-a11y')).default`.
Con `await import(...)` a secas el plugin se registra pero ninguna de sus reglas
existe, y ESLint falla con
`Could not find "X" in plugin "jsx-a11y"`.

Ahora están **activas y en cero** estas reglas, que pasan a ser un gate real
contra regresiones:

- `jsx-a11y/alt-text`
- `jsx-a11y/anchor-is-valid`
- `jsx-a11y/aria-props`
- `jsx-a11y/aria-proptypes`
- `jsx-a11y/aria-role`
- `jsx-a11y/aria-unsupported-elements`
- `jsx-a11y/label-has-associated-control` — se corrigieron los 13 casos que había
- `jsx-a11y/role-has-required-aria-props`

## Reglas apagadas a propósito

| Regla | Avisos | Motivo |
|---|---:|---|
| `jsx-a11y/click-events-have-key-events` | 77 | Deuda preexistente. El proyecto usa `--max-warnings 0`, así que activarla haría fallar `npm run lint` y bloquearía el gate por algo que ya está en el código. |
| `jsx-a11y/no-static-element-interactions` | 77 | Se dispara sobre los mismos elementos que la anterior. |

Las dos reglas miden lo mismo —`div`/`span` con `onClick` sin rol de control ni
soporte de teclado—, por eso coinciden casi elemento a elemento: **77 avisos por regla y 154 en total**, que corresponden a **78 elementos distintos** en 15 archivos.

## Inventario pendiente (A11Y-001)

Elementos interactivos sin semántica de control (recuento por elemento, no por aviso):

| Archivo | Elementos |
|---|---:|
| `src/pages/Rutina.tsx` | 17 |
| `src/components/entrenar/SessionModals.tsx` | 14 |
| `src/pages/Perfil.tsx` | 13 |
| `src/pages/Inicio.tsx` | 8 |
| `src/features/training/components/VariantPicker.tsx` | 6 |
| `src/pages/Calendario.tsx` | 4 |
| `src/pages/Biblioteca.tsx` | 3 |
| `src/components/recovery/BottleConfigEditor.tsx` | 2 |
| `src/components/report/ReportModal.tsx` | 2 |
| `src/pages/BibliotecaCustomForm.tsx` | 2 |
| `src/pages/Onboarding.tsx` | 2 |
| `src/components/althea/AltheaCard.tsx` | 1 |
| `src/components/althea/AltheaPanel.tsx` | 1 |
| `src/pages/Entrenar.tsx` | 1 |

## Cómo atacar la deuda

1. **Primitivo de diálogo accesible**: un componente `Modal` con
   `role="dialog"`, `aria-modal`, foco inicial y atrapado, cierre con
   `Escape` y retorno del foco al disparador. Hoy hay ~41 overlays
   `fixed inset-0` y solo 2 declaran semántica de diálogo.
2. **Elementos clicables**: migrar los `div`/`span` con `onClick` a
   `<button type="button">` o al primitivo anterior, en lugar de añadir
   `role` + `tabIndex` + `onKeyDown` a mano en 78 sitios. Empezar por
   `components/althea/` (`AltheaCard`, `AltheaPanel`), porque arrastran al
   resto de pantallas.
3. Reactivar las dos reglas cuando el inventario llegue a 0.
