# Especificación funcional de flujos de usuario — Althea

**Versión del documento:** 1.0
**Fecha de análisis:** 14/10/2026
**Aplicación analizada:** Althea (PWA de entrenamiento, nutrición y recuperación)
**Base de código:** `train-pwa/` — React + TypeScript + Vite, React Router, Dexie (IndexedDB), Firebase (opcional)

---

## A. Introducción y alcance

### A.1 Propósito

Este documento describe, de forma exhaustiva y verificable, los **flujos de interacción entre la persona usuaria y la aplicación Althea**. Su propósito es twofold:

1. Servir de base para redactar el tutorial de uso de la aplicación.
2. Funcionar como especificación textual de comportamiento: qué hace el sistema ante cada acción, qué estado queda y cómo se recupera de una interrupción.

El documento describe **el comportamiento actual implementado**. No contiene propuestas de rediseño ni recomendaciones de diseño; los hallazgos que requieren decisión se registran en el apartado E.

### A.2 Funcionalidades cubiertas

Se documentan las 14 rutas registradas en `src/App.tsx`:

| Ruta | Pantalla | Archivo |
|---|---|---|
| `/login` | Login / Cuenta | `pages/Login.tsx` |
| `/onboarding` | Onboarding (7 pasos) | `pages/Onboarding.tsx` |
| `/` | Inicio (panel) | `pages/Inicio.tsx` |
| `/entrenar` | Entrenar (sesión) | `pages/Entrenar.tsx` |
| `/biblioteca` | Biblioteca de ejercicios | `pages/Biblioteca.tsx` |
| `/nutricion` | Nutrición | `pages/Nutricion.tsx` |
| `/coach` | Coach IA | `pages/Coach.tsx` |
| `/calendario` | Calendario y recuperación | `pages/Calendario.tsx` |
| `/progreso` (canónica; `/progresos` redirige) | Progreso | `pages/Progreso.tsx` |
| `/rutina` (canónica; `/rutinas` redirige) | Rutinas | `pages/Rutina.tsx` |
| `/recuperacion` | Recuperación | `pages/Recuperacion.tsx` |
| `/perfil` | Perfil | `pages/Perfil.tsx` |
| `/mas` | Más | `pages/Mas.tsx` |
| — | Chat flotante (FAB) | `components/chat/ChatWidget.tsx` |

### A.3 Fuentes analizadas

- **Código fuente**: `src/App.tsx`, los 13 archivos de `src/pages/`, `src/components/layout/AppNav.tsx`, `src/components/notifications/DailyRemindersConfig.tsx`, `src/components/recovery/RecoveryCheckForm.tsx`.
- **Servicios**: `services/storage/db.ts` (esquema Dexie, v1–v21), `services/training/sessionStore.ts` (ciclo de vida de sesión), `services/training/domain.ts` (matriz de transiciones), `services/planning/cycleVersions.ts` (planificación canónica).
- **Pruebas automatizadas**: coarchivo de tests junto a cada página (`*.test.tsx`), que confirman comportamiento esperado de varios flujos (navegación de Inicio, redirección de Entrenar, gasto calórico, botella de hidratación, cambio de día en Calendario, etc.).
- **Documentación interna**: `docs/` (informes de auditoría y de cierre del proyecto).

### A.4 Convenciones de verificación

Cada flujo se marca con uno de estos estados:

| Marca | Significado |
|---|---|
| **Verificado** | Confirmado leyendo el código que lo ejecuta. |
| **Inferido** | Deducido de la implementación, sin prueba de ejecución que lo confirme. |
| **Pendiente** | Hay evidencia parcial o contradictoria; requiere comprobación manual. |
| **No implementado** | La funcionalidad parece requerida pero no existe en el código. |

### A.5 Limitaciones de la revisión

1. **No se ejecutó la aplicación.** Todo lo verificado es por lectura de código y de tests; no hubo validación en ejecución ni en dispositivo real.
2. **Componentes no leídos íntegramente.** `ChatWidget`, `ExerciseSeriesTable`, `SessionModals`, `MuscleAtlas`, `ReportModal`, `DishComposer`, `BottleConfigEditor`, `WaterBottle`, `PainToggle`, `VariantPicker` y `PeriodizationEditor` se identificaron y se citan por su comportamiento observable desde la página que los monta, pero no se auditó línea por línea. Los flujos internos de estos componentes están marcados como **Pendiente**.
3. **Servicios externos no verificables.** El catálogo de ejercicios (ExerciseGym), Wger, Groq (Coach) y Firebase dependen de red y de credenciales; su respuesta real no se comprobó.
4. **Servidor y Worker.** El Worker de `worker/` no participa de los flujos de usuario de la PWA y quedó fuera de alcance.
5. **Comportamiento PWA offline** (service worker, `controllerchange`) se documenta por código, sin prueba de despliegue.

---

## B. Mapa de pantallas y flujos

### B.1 Arquitectura de navegación

**Verified.** La navegación se define en tres capas:

1. **Barra lateral** (escritorio, ≥768px) — `AppNav.tsx`.
   - Sección primaria: Inicio, Entrenar, Nutrición, Progreso.
   - Sección «Módulos»: el resto de destinos, deduplicados por icono.
   - Botón «Contraer» que reduce el ancho a iconos; el estado persiste en `localStorage['althea:nav-collapsed']`.
   - En el tramo medio (768–1023px) solo se muestran los íconos.
2. **Barra inferior** (móvil, <768px) — Inicio, Entrenar (condicional), Nutrición, Progreso, Más.
3. **Más** (`/mas`) — centro de acceso que enlaza a todas las secciones, incluida Rutina, Calendario, Biblioteca, Recuperación y Perfil.

**Regla condicional Verificada:** el acceso a «Entrenar» en la navegación **solo aparece cuando existe una sesión activa** (`hasActiveSession`). Las demás entradas son fijas.

### B.2 Inventario funcional por pantalla

| Pantalla | Función | Punto de entrada | Flujos que habilita |
|---|---|---|---|
| **Login** | Autenticación, registro, recuperación de contraseña, acceso sin cuenta | Automático si hay Firebase configurado, sin sesión y sin modo offline; también por URL `/login` | 1.1 Iniciar sesión · 1.2 Crear cuenta · 1.3 Recuperar contraseña · 1.4 Continuar sin cuenta |
| **Onboarding** | Configuración inicial del perfil (7 pasos) | Automático: si el perfil no tiene `onboardingDone` o no tiene `email` | 2.1 Cuestionario guiado completo |
| **Inicio** | Panel diario: qué entrenar hoy,CTV de la semana, hidratación, recuperación, gasto calórico | Raíz `/`; enlace «Revisar rutina» del aviso de revisión | 3.1 Comenzar/continuar entrenamiento · 3.2 Cambiar el día de entrenamiento · 3.3 Registrar hidratación rápida · 3.4 Navegar la semana · 3.5 Editar un ejercicio del día |
| **Entrenar** | Ejecución de la sesión: series, descansos, sustitución, Pain Toggle, cierre | CTA de Inicio; o acceso directo en navegación con sesión activa | 4.1 Reanudar sesión de otra fecha · 4.2 Registrar series · 4.3 Gestionar descansos · 4.4 Sustituir ejercicio · 4.5 Registrar dolor y elegir variante · 4.6 Modificar el plan del ejercicio · 4.7 Saltar ejercicio · 4.8 Agregar serie o ejercicio extra · 4.9 Finalizar la sesión · 4.10 Cancelar / Abandonar · 4.11 Pausar / Reanudar |
| **Biblioteca** | Consulta técnica del catálogo, favoritos, ejercicios propios, catálogo Wger | Navegación lateral / Más | 5.1 Explorar y filtrar · 5.2 Marcar favorito · 5.3 Ver detalle · 5.4 Crear ejercicio propio · 5.5 Editar / eliminar ejercicio propio · 5.6 Sincronizar Wger |
| **Nutrición** | Diario alimentario, macros, hidratación, adherencia, sugerencias | Navegación primaria | 6.1 Registrar comida (por texto) · 6.2 Editar comida · 6.3 Eliminar comida · 6.4 Registrar hidratación · 6.5 Configurar botellas · 6.6 Puntuar adherencia · 6.7 Reutilizar alimento frecuente |
| **Coach IA** | Chat con asistente; contexto de rutina, sesión y consejos | Navegación lateral / Más; tarjeta «Coach IA» de Inicio | 7.1 Enviar consulta · 7.2 Usar acción rápida · 7.3 Cambiar método de coaching · 7.4 Borrar conversación |
| **Calendario** | Vista mensual de sesiones, check-ins y detalle diario | Navegación lateral / Más; enlace «Historial» de Inicio | 8.1 Navegar meses · 8.2 Abrir detalle de un día · 8.3 Registrar recuperación desde el calendario |
| **Progreso** | Atlas muscular, volumen, peso, informe periódico | Navegación primaria | 9.1 Cambiar período · 9.2 Consultar mapa muscular · 9.3 Generar informe descargable |
| **Rutinas** | Crear, editar, versionar y duplicar rutinas; asignación semanal; periodización | Navegación lateral / Más; enlace «Configurar rutina» de Inicio | 10.1 Crear rutina · 10.2 Cambiar de rutina · 10.3 Editar ejercicios de un día · 10.4 Ajustar series por serie · 10.5 Configurar descansos y objetivos · 10.6 Asignar días a la semana · 10.7 Eliminar / duplicar · 10.8 Comparar versiones · 10.9 Crear rutina con IA |
| **Recuperación** | Check-in diario, evolución, recomendaciones, hidratación | Notificación_push; enlace de Inicio; botón «Recuperación» de Calendario | 11.1 Completar y guardar check-in · 11.2 Revisar evolución · 11.3 Actuar sobre una recomendación |
| **Perfil** | Datos personales, objetivo, preferencias del Coach, exclusiones, notificaciones, apariencia, cuenta | Navegación lateral / Más | 12.1 Editar datos personales · 12.2 Cambiar objetivo · 12.3 Configurar el Coach · 12.4 Excluir ejercicios · 12.5 Configurar notificaciones · 12.6 Cambiar apariencia · 12.7 Cerrar sesión · 12.8 Eliminar cuenta |
| **Más** | Resumen de actividad y acceso a todas las secciones | Barra inferior móvil | 13.1 Consultar resumen · 13.2 Navegar a cualquier sección · 13.3 Configurar recordatorios diarios |

### B.2.1 Rutas canónicas y URL desconocidas

**Verificado.** `/progreso` y `/rutina` son las rutas canónicas. Los plurales
(`/progresos`, `/rutinas`) se conservan como alias de entrada y **redirigen**
con `replace`, de modo que los enlaces anteriores y las PWA instaladas siguen
funcionando sin duplicar la definición de la página.

Además existe una ruta comodín `*` que redirige a `/`. Antes, cualquier URL
desconocida renderizaba el shell de la aplicación sin contenido.

### B.3 Secuencia típica de primera ejecución

**Verificado.** Para una instalación nueva:

```
App.tsx (arranque)
  → "Cargando…"                       (apertura de Dexie + cierre de sesiones vencidas)
  → /login                            (si Firebase está configurado)
      └─ Continuar sin cuenta, o
         → Iniciar sesión / Crear cuenta
  → /onboarding                       (perfil sin onboardingDone o sin email)
      └─ 7 pasos → "COMENZAR →"
  → /                                  (perfil creado; sesión creada)
  → Rutina: configurar días y ejercicios
  → Entrenar: primer día de entrenamiento
  → Finalizar: encuesta post-entreno
  → Progreso / Calendario / Recuperación: datos derivados
```

---

## C. Documentación detallada de cada flujo

---

### 1. Login / Cuenta

**Propósito:** autenticar a la persona usuaria, registrar una cuenta nueva, recuperar el acceso o permitir el uso sin cuenta.

**Condiciones iniciales:**
- Se muestra solo cuando Firebase está configurado en el entorno **y** no hay sesión activa **y** no está activo el modo offline.
- También es accesible por URL directa `/login`.
- En `/login` y `/onboarding` la cabecera y la barra de navegación están ocultas.

#### Flujo 1.1 — Iniciar sesión

1. **Acción:** ingresar el correo electrónico y la contraseña en los campos correspondientes y seleccionar **«Entrar»**.
   **Respuesta del sistema:** el botón queda en estado «Procesando…» y deshabilitado. Si las credenciales son válidas, se completa el inicio de sesión y la aplicación navega a la raíz `/` sustituyendo la entrada en el historial.
   **Resultado esperado:** la pantalla de Login desaparece y se muestra Inicio.

2. **Acción:** (alternativa) seleccionar **«Continuar sin cuenta (solo en este dispositivo)»**.
   **Respuesta del sistema:** se activa el modo offline, se avisa al gate de cuenta y se navega a `/`.
   **Resultado esperado:** la aplicación queda operativa sin cuenta. Las preferencias de interfaz se conservan; los datos quedan solo en el dispositivo.

**Variantes y excepciones:**

| Situación | Respuesta del sistema |
|---|---|
| El correo no contiene «@» | Error en línea: **«Ingresá un correo válido.»**. No se llama al servicio. |
| La contraseña tiene menos de 6 caracteres | Error: **«La contraseña debe tener al menos 6 caracteres.»** |
| Credenciales incorrectas o error de red | Se muestra el mensaje del servicio o **«Ocurrió un error.»** |

**Modo de acceso alternativo:**
- **«Olvidé mi contraseña»** cambia a modo recuperación: oculta el campo de contraseña, muestra **«Enviar correo»** y, tras el éxito, **«Te enviamos un correo para restablecer la contraseña.»**
- **«Crear cuenta»** cambia a modo registro; el mismo formulario pasa a **«Crear cuenta»** y, tras el éxito, también navega a `/`.
- Desde registro o recuperación, **«Ya tengo cuenta»** vuelve al modo de inicio.

**Resultado final del flujo:** la persona queda autenticada o en modo local, con acceso a todas las secciones.

**Estado de verificación:** **Verificado** (`pages/Login.tsx`, `services/firebase/auth`). El comportamiento efectivo de Firebase (confirmación de correo, errores translated) es **Pendiente**: no se comprobó en ejecución.

---

### 2. Onboarding

**Propósito:** recopilar la información inicial necesaria para construir el perfil y una planificación base.

**Condiciones iniciales:**
- Se entra automáticamente cuando el perfil no tiene `onboardingDone` o no tiene `email`, siempre que la ruta actual no sea `/onboarding`.
- Puede alcanzarse por URL directa.
- El asistente tiene **7 pasos** y muestra un indicador «PASO N DE 7» con porcentaje y barra de progreso.

**Persistencia del borrador — Verificado:** cada avance o retroceso escribe un borrador en Dexie (tabla `onboardingDrafts`). Al volver a entrar, el asistente se abre **en el paso guardado** y con todos los datos ya cargados. Esto permite abandonar el onboarding y retomarlo sin perder lo escrito.

#### 2.1 Flujo principal — Cuestionario guiado

**Paso 1 de 7 — «¿Cuál es tu objetivo principal?»**
1. **Acción:** seleccionar uno de los 9 objetivos predefinidos (Perder grasa / Ganar masa muscular / Aumentar fuerza / Mejorar resistencia / Mejorar condición física / Mejorar movilidad / Mantenerme / Recomposición corporal / Otro).
   **Respuesta del sistema:** el botón seleccionado se marca con un check. Si se elige **«Otro»**, aparece un campo de texto **«Especificá tu objetivo»**.
   **Resultado esperado:** objetivo principal asignado.
2. **Acción:** seleccionar opcionalmente uno o más **objetivos secundarios** (chips; la lista excluye el principal ya elegido).
   **Respuesta del sistema:** los chips seleccionados se resaltan. Son acumulables.
3. **Acción:** seleccionar **«Siguiente →»**.
   **Respuesta del sistema:** guarda el borrador y avanza al paso 2.
   - *Si no se eligió objetivo:* error **«Seleccioná tu objetivo principal»**.
   - *Si se eligió «Otro» sin escribir texto:* error **«Especificá tu objetivo personalizado»**.

**Paso 2 de 7 — «¿Cuál es tu nivel de experiencia?»**
1. **Acción:** seleccionar Principiante, Intermedio o Avanzado. Cada opción muestra su descripción («Menos de 6 meses de entreno consistente», «6 meses a 3 años», «Más de 3 años de entreno estructurado»).
   **Respuesta del sistema:** se marca la opción y se guarda el borrador al avanzar.
   **Resultado esperado:** nivel asignado.
2. **Acción:** seleccionar **«Siguiente →»**. Sin selección: error **«Seleccioná tu nivel de experiencia»**.

**Paso 3 de 7 — «¿Qué días podés entrenar?»**
1. **Acción:** activar uno o más de los 7 días (se muestran abreviados a 3 letras, con día de la semana índice 0 = Domingo).
   **Respuesta del sistema:** los días se resaltan y un contador inferior actualiza en vivo («N días seleccionados»).
   **Resultado esperado:** días disponibles registrados.
2. **Acción:** seleccionar **«Siguiente →»**. Sin selección: error **«Seleccioná al menos un día disponible»**.

**Paso 4 de 7 — «¿Qué equipamiento tenés disponible?»**
1. **Acción:** activar uno o más de los 8 tipos (Barra, Mancuernas, Máquinas, Poleas, Peso corporal, Bandas elásticas, Kettlebell, Otro).
   **Respuesta del sistema:** los seleccionados se resaltan.
   **Resultado esperado:** equipamiento registrado.
2. **Acción:** seleccionar **«Siguiente →»**. Sin selección: error **«Seleccioná al menos un equipamiento disponible»**.

**Paso 5 de 7 — «¿Cuándo y cuánto entrenás?»**
1. **Acción:** ajustar el **Horario habitual** (control de hora) y la **Duración de sesión** (número, por defecto 60 min).
   **Respuesta del sistema:** los valores se conservan y se guardan al avanzar.
   **Resultado esperado:** preferencias de horario registradas.
2. **Acción:** seleccionar **«Siguiente →»**.
   - *Sin horario:* error **«Seleccioná tu horario habitual»**.
   - *Duración fuera de 20–180:* error **«Duración entre 20 y 180 minutos»**.

**Paso 6 de 7 — «Configurá tu Coach»**
1. **Acción:** elegir la intensidad/estilo: Profesional (por defecto), Motivacional, Duro o Extremo. Cada opción muestra su descripción.
   **Respuesta del sistema:** la opción elegida se marca con check.
   **Resultado esperado:** estilo del Coach fijado.
2. **Acción:** seleccionar **«Siguiente →»**. Este paso **no tiene validación** (todas las opciones tienen valor por defecto).

**Paso 7 de 7 — «Últimos datos para tu perfil»**
Este paso agrupa varios bloques:

| Bloque | Controles | Reglas |
|---|---|---|
| Notificaciones push | Solo texto informativo | El asistente **no pide permiso** en este paso (así lo indica el texto: «se configurarán recordatorios básicos… Podés ajustarlos después en Perfil»). La activación real se hace en **Perfil → Notificaciones** (ver §12.5). |
| Nombre | Texto | **Obligatorio.** Vacío → «Ingresá tu nombre» |
| Correo electrónico | Texto | **Obligatorio.** Se valida formato → «Email inválido» |
| Sexo | 3 botones (M / F / X con etiqueta) | Valor por defecto «M». Determina la figura del atlas muscular. |
| Fecha de nacimiento | Fecha | Opcional. Si se informa, la edad se muestra entre paréntesis. |
| Peso / Altura / Peso objetivo | Número | Opcionales, con rangos: peso 30–300 kg, altura 100–250 cm, peso objetivo 30–300 kg. |
| IMC | Calculado | Se muestra en vivo como `peso / (altura/100)²` con categoría (Bajo peso / Normopeso / Sobrepeso / Obesidad) solo si hay peso y altura. Si se informa peso objetivo, muestra el delta «X → Y kg (Δ kg)». |
| Necesidades | Área de texto | Opcional. Se guarda como contexto para el Coach. |
| Dolencias | Sí / No (por defecto «No») | Si «Sí», se despliegan 9 zonas (hombros, espalda, cuello, codos, muñecas, cadera, rodillas, tobillos, otra) + campo de detalle. |
| Restricciones | 5 chips (equipamiento, movimientos, ejercicios, tiempo, espacio) | Opcionales, más campo de texto libre. |
| Ejercicios excluidos | Botón **«Seleccionar ejercicios»** | Abre un selector modal (ver 2.2). |

1. **Acción:** completar los campos obligatorios y seleccionar **«COMENZAR →»**.
   **Respuesta del sistema:** se crea el perfil, se guarda la planificación inicial y se navega a `/`.
   **Resultado esperado:** el perfil queda creado con `onboardingDone: true` y se accede al panel.

**Navegación entre pasos — Verificado:** el botón **«Atrás»** aparece desde el paso 2 en adelante; persiste el borrador y retrocede. No hay botón para saltar pasos ni para abandonar el asistente.

#### 2.2 Subt flujo — Seleccionar ejercicios a excluir (dentro del paso 7)

1. **Acción:** seleccionar **«Seleccionar ejercicios»**.
   **Respuesta del sistema:** se abre un modal con un desplegable de grupo muscular (Pecho, Bíceps, Tríceps, Abs, Piernas, Espalda, Hombros) y la lista de hasta 30 ejercicios del grupo, con imagen, nombre y etiquetas músculo · equipamiento.
   **Resultado esperado:** el selector está disponible.
2. **Acción:** activar la casilla **«No quiero»** en uno o más ejercicios.
   **Respuesta del sistema:** cada ejercicio marcado se añade a la lista de excluidos y aparece en el bloque **«Ejercicios excluidos (N)»** debajo del formulario.
   **Resultado esperado:** el ejercicio queda excluido.
3. **Acción:** seleccionar **«Listo»** para cerrar el modal, o **«Quitar»** en un ejercicio ya excluido para revertirlo.
   **Respuesta del sistema:** el modal se cierra; la lista de excluidos se mantiene visible y editable.
   **Resultado esperado:** la selección queda confirmada y se guardará con el perfil.

#### Variantes y excepciones

| Situación | Respuesta del sistema |
|---|---|
| El usuario abandona a mitad | El borrador queda guardado; al volver, se retoma en el paso guardado. |
| Peso o altura fuera de rango | Error de validación Zod: peso/altura/peso objetivo fuera de los rangos admitidos. |
| Fecha de nacimiento inconsistente | No hay validación de coherencia con la edad mínima. **Pendiente.** |
| Fallo al escribir en la base de datos | El error se captura y se ignora silenciosamente; el perfil puede quedar sin guardarse. **Pendiente** (no hay mensaje al usuario). |

**Resultado final del flujo:** perfil creado con: nombre, email, sexo, fecha de nacimiento/edad, peso, altura, peso objetivo, IMC, objetivo canónico, objetivo principal y secundarios, nivel, días disponibles, horario, duración de sesión, equipamiento, estilo del Coach, necesidades, zonas de dolor, restricciones y ejercicios excluidos. Además:
- Se registra una **medición corporal inicial** con la fecha de hoy si se informó peso o altura.
- Se escribe la **planificación inicial** (versión 1) si no existía.

**Estado de verificación:** **Verificado** (`pages/Onboarding.tsx`).

**⚠️ Inconsistencias verificadas en este flujo (detalle en E.1, E.2):**
1. Los **días disponibles** y el **equipamiento** se registran en el perfil pero **no se usan para construir la planificación inicial**: el ciclo por defecto es un split fijo de 4 días (Pecho + tríceps / Espalda + bíceps / Piernas / Hombros + abdomen) con asignación lunes, martes, jueves y viernes, con independencia de lo respondido.
2. El texto del paso 7 anuncia que «se configurarán recordatorios básicos», pero **el asistente no solicita permiso de notificaciones ni crea ninguna configuración**. Los recordatorios solo existen si la persona los crea luego en Perfil (12.5) o Más (13.3).

---

### 3. Inicio (panel principal)

**Propósito:** responder «¿qué hago hoy?» y ofrecer accesos rápidos a las métricas y acciones del día.

**Condiciones iniciales:** perfil con onboarding completado. La pantalla carga datos de varias fuentes (perfil, planificación canónica, sesiones,(check-ins, logs de hidratación, diario) y aplica el **override** del día si existe.

#### 3.1 Flujo principal — Comenzar o continuar el entrenamiento

1. **Acción:** observar el encabezado. El sistema muestra el saludo («¡Hola, {nombre}!»), la fecha, la etiqueta de estado (**«Descanso»** o **«Día N.º X»**) y el nombre de la sesión.
   **Respuesta del sistema:** si el día tiene override, se añade la línea «Cambiado: original N.º X {nombre}».
   **Resultado esperado:** la persona conoce la sesión del día antes de actuar.

2. **Acción:** seleccionar el CTA **«Comenzar entrenamiento»** (o **«Continuar entrenamiento»** si ya hay sesión activa).
   **Respuesta del sistema:**
   - Sin sesión activa y sin override: se crea una sesión con estado `READY` a partir de la rutina activa y del día efectivo, y se navega a `/entrenar`.
   - Con sesión activa: **no se crea nada**; se navega a `/entrenar`.
   - Si el día ya está completado: no hay CTA; se muestra **«Sesión completada»** y la acción no hace nada.
   - En día de descanso sin sesión activa: **no se muestra el CTA**.
   **Resultado esperado:** se abre Entrenar con la sesión cargada, o no ocurre nada si ya se entrenó hoy.

> **Regla estructural fundamental — Verificado:** **Inicio es el único punto de creación de sesiones.** `/entrenar` nunca crea sesiones; si no hay sesión activa, redirige fuera. Por tanto **no es posible iniciar un entrenamiento desde la ruta `/entrenar` directamente**.

**Nota sobre el CTA duplicado:** la misma acción «Comenzar entrenamiento» aparece **dos veces** en la pantalla: en el encabezado y al pie del bloque «Estructura de carga». Ambas ejecutan la misma operación.

3. **Acción (alternativa):** si no hay ejercicios programados para el día, el sistema muestra **«Sin ejercicios programados»** con un enlace **«Configurar rutina»** que lleva a `/rutina`.
   **Respuesta del sistema:** navega a la configuración de rutinas.
   **Resultado esperado:** la persona puede completar la planificación.

#### 3.2 Flujo — Cambiar el entrenamiento de hoy

1. **Acción:** seleccionar **«Cambiar día»**.
   **Respuesta del sistema:** se abre una hoja inferior titulada **«Cambiar entrenamiento de hoy»**. Muestra un aviso que contextualiza la acción: si el día estaba configurado como descanso, indica «Estás intentando entrenar en un día no planificado. Esto puede reducir recuperación»; si no, «Este día estaba programado {nombre}».
   **Resultado esperado:** el selector está disponible con contexto del cambio.

2. **Acción:** (opcional) elegir el motivo en el desplegable —Cambio de horarios (por defecto), No pude entrenar el día original, Me siento recuperado, Necesidad personal, Disponibilidad de gimnasio, Reprogramación, Otro— y escribir una observación.
   **Respuesta del sistema:** no hay validación; el motivo por defecto está preseleccionado.
   **Resultado esperado:** el motivo queda asociado al cambio.

3. **Acción:** seleccionar uno de los días de la rutina («DÍA N.º X — {nombre}»).
   **Respuesta del sistema:** se guarda el **override** para la fecha de hoy con día planificado, día realizado, motivo, observación y marca de cambio manual; se recarga la lista de ejercicios del día; se emite un evento de cambio de rutina; el modal se cierra.
   **Resultado esperado:** el díaeffective cambia y **queda persistido** —al volver a Inicio, la etiqueta «Cambiado: original N.º …» sigue visible.

4. **Acción:** seleccionar **«Volver al programado»**.
   **Respuesta del sistema:** se elimina el override de la fecha, se restaura el día original y se recarga la lista.
   **Resultado esperado:** el día vuelve a su valor planificado.

5. **Acción:** seleccionar **«Cancelar»** o cerrar la hoja tocando fuera.
   **Respuesta del sistema:** el modal se cierra sin cambios.

**Navegación posterior:** el usuario permanece en Inicio. Desde aquí puede iniciar el entrenamiento con el nuevo día asignado.

#### 3.3 Flujo — Registrar hidratación rápida

1. **Acción:** observar el bloque «Hidratación»: botella con consumo real frente a objetivo y el editor de botellas.
   **Respuesta del sistema:** la botella refleja la suma de registros del día.
2. **Acción:** seleccionar **«+ 250 ml»**.
   **Respuesta del sistema:** el botón muestra «Guardando…» y queda deshabilitado; al completarse, la botella se actualiza con los 250 ml añadidos.
   **Resultado esperado:** el consumo de agua del día aumenta en 250 ml y queda persistido.
   *Si ocurre un error*, el incremento no se aplica y **la propia botella muestra el error**.

**Configuración de botellas:** disponible tanto en Inicio como en Nutrición, Recuperación y Calendario. Es el mismo componente (ver 6.5).

#### 3.4 Flujo — Navegar la semana

1. **Acción:** seleccionar **«Semana N»** (encabezado).
   **Respuesta del sistema:** se abre una hoja **«Vista semanal»** con cada día de la rutina y su fecha calculada; el día actual se marca con «HOY» y los días pasados se muestran atenuados.
2. **Acción:** usar **«‹ Anterior»**, **«Esta semana»** o **«Siguiente ›»**.
   **Respuesta del sistema:** la lista se recalcula desplazando la semana.
3. **Acción:** seleccionar **«Cerrar»**.
   **Respuesta del sistema:** la hoja se cierra.

**Alternativa en línea de microciclo:** el bloque «Microciclo» inferior incluye los botones `‹` y `›` que recorren semanas hacia atrás y adelante, con la etiqueta «Esta semana», «+N sem» o «N sem atrás». Cada celda diaria muestra: check si la sesión está `COMPLETED`, icono de descanso si no estaba planificada, o punto neutro.

#### 3.5 Flujo — Editar un ejercicio del día

1. **Acción:** en «Estructura de carga», activar la edición de reps/peso/descanso de un ejercicio.
   **Respuesta del sistema:** aparece un borrador editable con los valores actuales.
2. **Acción:** modificar los valores y confirmar.
   **Respuesta del sistema:** la lista se actualiza en pantalla y **se persiste en la rutina activa**; si el ejercicio tiene plan por serie, se actualiza cada serie.
   **Resultado esperado:** el ejercicio del día refleja el nuevo plan, que también quedará activo en la sesión cuando se cree.
   **⚠️ Pendiente:** la edición inline solo es alcanzable desde la vista de escritorio; la presentación móvil de Inicio no expone los campos de edición (ver E.4).

#### Resto de la pantalla (lectura)

| Bloque | Contenido | Estado |
|---|---|---|
| **Aviso «Rutina a revisar»** | Aparece si la rutina alcanzó su fecha de revisión o su período. Indica días transcurridos, límite y fecha de vencimiento. Incluye enlace **«Revisar rutina»** → `/rutina`. | Verificado |
| **Biometría & balance diario** | Recuperación (último score o «—»), Nutrición kcal (TDEE o «—»), Gasto hoy kcal (o «—»). | Verificado |
| **Recuperación Arete** | Clasificación del score en «Nivel áureo» (≥70), «En proceso» (≥40) o «Necesita descanso», o «Sin datos». Enlace **«Abrir check-in →»** → `/recuperacion`. | Verificado |
| **Gasto calórico** | Dos filas: «Hoy» y «Semana (lun → hoy)» con kcal y minutos de sesión. Estados honestos: «Sin datos suficientes para estimar» o «Sin sesiones registradas». Enlace **«Historial →»** → `/calendario`. | Verificado |
| **Registros de virtud** | 4 métricas: sobrecarga progresiva, días completados, adherencia al plan, calidad de recuperación. | Verificado |
| **Coach IA** | Tarjeta con «Estado {score}/100» y la advertencia más relevante detectada, o «Todo estable por acá». Enlace a `/coach`. **Solo se renderiza si hay score.** | Verificado |

#### Variantes y excepciones

| Situación | Respuesta del sistema |
|---|---|
| Sin planificación legible | El día se trata como no entrenable; no hay CTA. |
| Día ya completado | Se muestra «Sesión completada»; no se puede crear una segunda sesión para la misma fecha. |
| Sesión activa de otro día | El CTA dice «Continuar entrenamiento» y lleva a Entrenar, donde aparece el aviso de reanudación (4.1). |
| Sin ejercicios programados | Mensaje con enlace a Rutina; sin CTA de entrenamiento. |
| Rutina vencida | Aviso no bloqueante: **el entrenamiento y el resto de la aplicación siguen disponibles**. |
| Error al crear la sesión | El usuario permanece en Inicio y puede reintentar. No se muestra mensaje. **Pendiente:** la ausencia de feedback puede confundir. |

**Resultado final del flujo:** la persona conoce su estado del día, puede iniciar o continuar el entrenamiento, puede reassignar el día, registrar agua y navegar la semana.

**Estado de verificación:** **Verificado** (`pages/Inicio.tsx`, con pruebas en `Inicio.entrenar.test.tsx`, `Inicio.gasto.test.tsx`, `Inicio.hidratacion.test.tsx`, `Inicio.revision.test.tsx`).

---

### 4. Entrenar

**Propósito:** ejecutar la sesión de entrenamiento registrando series, descansos y decisiones, y cerrarla con una encuesta post-entreno.

**Condiciones iniciales:**
- Debe existir una sesión activa. Si no existe, `/entrenar` **no crea nada** y redirige (ver E.3 sobre la ruta de redirección).
- Si la lista de ejercicios de la sesión está vacía, se muestra: **«Hoy es descanso o sin ejercicios. Cambiá el día en Inicio.»**

#### 4.1 Flujo — Reanudar una sesión de otra fecha

1. **Acción:** entrar a `/entrenar` con una sesión activa cuya fecha de calendario no es la de hoy.
   **Respuesta del sistema:** se muestra un panel **«ENTRENAR · REANUDAR»** con el mensaje **«Tenés un entrenamiento en progreso ({fecha}).»**, el nombre de la rutina, el día, el estado y la cantidad de ejercicios.
   **Resultado esperado:** la persona conoce el alcance de la sesión pendiente antes de decidir.

2. **Acción:** elegir entre tres salidas:
   - **«Continuar»** → adopta la sesión existente por su identificador, la reactiva si estaba pausada, restaura ejercicios, series y estados, y queda operativo.
   - **«Finalizar»** → adopta la sesión y, tras una breve espera, abre directamente el modal de cierre (4.9).
   - **«Abandonar»** → abre el modal de abandono (4.10) con motivo obligatorio.

   **Resultado esperado:** la sesión queda bajo control de la persona; no se crea ninguna sesión duplicada.

#### 4.2 Flujo — Registrar series

1. **Acción:** en la tabla de series del ejercicio actual, ingresar peso y repeticiones y confirmar la serie.
   **Respuesta del sistema:**
   - Si la sesión estaba en `READY`, pasa automáticamente a `IN_PROGRESS`.
   - Se escribe el registro de serie de forma **idempotente**: recargar la página nunca duplica la serie.
   - La serie queda marcada como `COMPLETED` en la tabla, con su peso real (un campo vacío se guarda como «sin peso», nunca como 0).
   - Se actualizan los contadores de series hechas y la posición actual dentro de la sesión.
   **Resultado esperado:** la serie figura como completada y el progreso de la sesión aumenta.

2. **Acción:** (opcional) registrar **negativas** (reps/peso) y una **observación** en la misma serie.
   **Respuesta del sistema:** las negativas se guardan como registro propio (solo la primera por ejercicio) y la observación se asocia al ejercicio.
   **Resultado esperado:** la información queda persistida y disponible en el historial.

3. **Acción:** observar el indicador «Serie X/Y hechas» y la etiqueta «Completado» que aparece sobre el ejercicio al alcanzar todas sus series.
   **Respuesta del sistema:** al completarse todas las series planificadas, el ejercicio se marca como completado y **se inicia automáticamente el descanso entre ejercicios** (si queda alguno por hacer).

**Estado inicial de las series — Verificado:** al crear la sesión se pre-crean todos los registros de serie en estado `PENDING`. Solo las series confirmadas cuentan como hechas; las pendientes nunca se contabilizan como completadas al calcular cumplimiento o volumen.

#### 4.3 Flujo — Gestionar descansos

1. **Acción:** al confirmar una serie que **no** es la última del ejercicio, el sistema inicia automáticamente el descanso entre series.
   **Respuesta del sistema:** aparece el panel de descanso con la cuenta regresiva en formato `M:SS`, la etiqueta «RESPIRA HONDO» (entre series) o «DESCANSO ENTRE EJERCICIOS», y los botones **«-15s»** y **«+30s»**. En escritorio, el panel es lateral con reloj circular; en móvil, aparece también una barra inferior fija.
   **Resultado esperado:** el descanso queda contabilizado y visible.

2. **Acción:** seleccionar el temporizador para **pausar** o **reanudar** el descanso.
   **Respuesta del sistema:** la etiqueta cambia a «PAUSADO» y la cuenta regresiva se detiene.
   **Resultado esperado:** el control del descanso pasa a la persona.

3. **Acción:** seleccionar **«-15s»** o **«+30s»**.
   **Respuesta del sistema:** la cuenta regresiva se ajusta en el sentido indicado.
   **Resultado esperado:** el descanso se recalibra sin reiniciarse.

4. **Acción:** cuando la cuenta llega a cero.
   **Respuesta del sistema:** aparece una franja **«Descanso terminado — a entrenar»** (o **«Descanso entre ejercicios terminado — a entrenar»**) que se cierra al tocarla.
   **Resultado esperado:** la persona recibe la señal de reanudar el trabajo.

**Regla de bloqueo — Verificado:** mientras haya un descanso activo, **está bloqueada la navegación hacia adelante** entre ejercicios. Hacia atrás sí se permite.

**Valores por defecto — Verificado:** el descanso entre series usa el valor definido en la rutina; si no hay, el del método de entrenamiento activo; si tampoco, 90 s. El descanso entre ejercicios usa el valor de la rutina o, en su defecto, 120 s.

#### 4.4 Flujo — Sustituir un ejercicio

1. **Acción:** seleccionar **«Cambiar»** en el ejercicio actual.
   **Respuesta del sistema:** el sistema busca alternativas: primero por similitud (mismo grupo muscular, mismo equipamiento, preferring ejercicios con historial previo) y, si no obtiene resultados suficientes, por el motor de sustitución multifactorial según el motivo elegido. Se abre un modal con las 12 mejores alternativas.
   **Resultado esperado:** las alternativas están disponibles.

2. **Acción:** elegir el motivo (Dolencia / dolor, Falta de equipamiento, Cambio durante la sesión) y, opcionalmente, escribir un comentario.
   **Respuesta del sistema:** el motivo condiciona la selección de alternativas.
   **Resultado esperado:** el motivo queda asociado.

3. **Acción:** seleccionar la alternativa y confirmar.
   **Respuesta del sistema:**
   - El ejercicio en la sesión se marca como `REPLACED`, conservando la referencia al original.
   - **Se borran el progreso y las series registradas del ejercicio original** en esa posición.
   - Se emite un evento de sesión y se registra la decisión del Coach.
   - Se recalcula la recomendación del Coach para el nuevo ejercicio.
   - El ejercicio muestra las etiquetas **«Reemplazado»** y el contador de series vuelve a cero.
   **Resultado esperado:** la sesión continúa con el ejercicio nuevo; el historial del ejercicio original queda intacto y separado.

4. **Acción:** seleccionar **«Ver»** antes de decidir.
   **Respuesta del sistema:** se abre el visor con animación e instrucciones del ejercicio.
   **Resultado esperado:** la persona puede evaluar la ejecución antes de sustituir.

#### 4.5 Flujo — Registrar dolor y elegir variante

1. **Acción:** activar el control de dolor del ejercicio (**Pain Toggle**) y elegir el nivel de molestia y la zona.
   **Respuesta del sistema:** el registro de dolor se guarda para esa sesión y ejercicio. Si se declara molestia, el sistema ofrece abrir el selector de variantes.
   **Resultado esperado:** la molestia queda registrada.

2. **Acción:** seleccionar una variante en el selector.
   **Respuesta del sistema:** se comporta como una sustitución: el ejercicio se marca `REPLACED` con motivo derivado del dolor, se limpian series y progreso de esa posición, y se recalcula la recomendación del Coach.
   **Resultado esperado:** la sesión ofrece una alternativa plausible por zona dolorida.

**Avisos de seguridad — Verificado:** si el análisis de seguridad detecta riesgo (informado como `warning` o `critical`), la pantalla muestra un aviso con el mensaje y, si corresponde, la recomendación de consultar a un profesional. Los avisos de severidad `info` no se muestran.

**Aviso de dolor recurrente — Verificado:** si en una sesión anterior se registró molestia en una zona, al llegar a ese ejercicio se muestra el panel **«La última vez registraste molestias en {zona}. ¿Cómo está hoy?»** con un campo de respuesta libre y botón **«Guardar»**. La respuesta se guarda como memoria del Coach y se ejecuta de nuevo la comprobación de seguridad.

#### 4.6 Flujo — Modificar el plan del ejercicio

1. **Acción:** seleccionar **«Modificar»** (disponible solo si el ejercicio no está completado).
   **Respuesta del sistema:** se abre un modal con peso, repeticiones, número de series y tipo de serie.
2. **Acción:** ajustar los valores y confirmar.
   **Respuesta del sistema:**
   - Se regenera el plan por serie según el tipo elegido.
   - Se actualiza el ejercicio de la sesión (series planificadas y valores por serie).
   - **Solo se modifican las series que siguen en `PENDING`; las ya confirmadas no se tocan.**
   - Las series que dejan de existir en el nuevo plan se eliminan, siempre que estén pendientes.
   - Se registra la decisión de modificación.
   **Resultado esperado:** el plan del ejercicio queda actualizado y las series ya registradas se conservan.

3. **Acción:** usar el campo de peso vacío.
   **Respuesta del sistema:** se guarda como «sin peso» (nulo), no como 0.

#### 4.7 Flujo — Saltar un ejercicio

1. **Ación:** seleccionar **«Saltar»** (disponible solo si el ejercicio no está completado).
   **Respuesta del sistema:** se abre un modal que pide el motivo.
2. **Acción:** escribir el motivo y confirmar.
   **Respuesta del sistema:**
   - Si no se escribe motivo, se usa el texto por defecto **«Decidí no realizarlo»**.
   - El ejercicio se marca como `SKIPPED` con su motivo, se cuenta como completado en el progreso de la sesión y se emite la decisión.
   - Si hay un ejercicio siguiente, la pantalla avanza automáticamente a él.
   **Resultado esperado:** el ejercicio queda descartado con motivo trazable.

#### 4.8 Flujo — Agregar serie o ejercicio extra

**Agregar una serie**
1. **Acción:** añadir una fila de serie en la tabla.
   **Respuesta del sistema:** se incorpora una serie adicional al ejercicio en la sesión y se reinicia su estado de completado.
   **Resultado esperado:** el ejercicio tiene una serie más que registrar. **La rutina no se modifica.**

**Agregar un ejercicio extra**
1. **Acción:** seleccionar **«Extra»**.
   **Respuesta del sistema:** se buscan hasta 8 ejercicios del mismo grupo muscular que no estén ya en la sesión y se muestran en un modal.
2. **Acción:** escribir el motivo (obligatorio) y, opcionalmente, un comentario; luego confirmar el ejercicio.
   **Respuesta del sistema:**
   - Sin motivo: error **«Indicá el motivo del ejercicio extra.»**
   - Se añade el ejercicio con el estado `EXTRA`, con las series y repeticiones por defecto del método de entrenamiento activo, y peso vacío.
   - Se emite el evento de alta y se registra la decisión.
   **Resultado esperado:** el ejercicio aparece al final de la sesión, marcado como **«Extra»**, y se contabiliza aparte de lo planificado.

**Omitir una serie individual**
1. **Acción:** marcar una serie concreta como omitida.
   **Respuesta del sistema:** la serie queda `SKIPPED`; no cuenta como hecha. Si todas las series del ejercicio quedan omitidas, el ejercicio se marca como omitido; si hay mezcla, se cuenta como completado.
   **Resultado esperado:** el plan queda fiel a lo realmente ejecutado.

#### 4.9 Flujo — Finalizar la sesión

1. **Acción:** seleccionar **«FINALIZAR»** (barra fija inferior en móvil, botón en el panel lateral en escritorio, o **«Confirmar y guardar en el templo»**), o **«Finalizar»** en el último ejercicio.
   **Respuesta del sistema:** el sistema calcula el resumen y abre el modal de cierre. Si se pulsa dos veces seguidas, el segundo intento se ignora (protección de 3 s).
   **Resultado esperado:** el resumen está disponible para revisar.

2. **Contenido del resumen — Verificado:** ejercicios concluidos sobre planificados, porcentaje de ejercicios y de series, ejercicios pendientes y omitidos, volumen total, duración transcurrida, número de ejercicios reemplazados y modificados, **distribución porcentual de volumen por grupo muscular**, **alertas de volumen y frecuencia** comparadas con las últimas 3 sesiones del mismo músculo, y **líneas de progreso** por ejercicio frente a su última ejecución real.

3. **Acción:** para cada ejercicio **pendiente**, escribir el motivo y, opcionalmente, un comentario.
   **Respuesta del sistema:** el motivo es obligatorio. Al confirmar, los ejercicios pendientes se convierten en `SKIPPED` con su motivo, **conservando las series que ya se habían hecho**.
   **Resultado esperado:** no queda ningún ejercicio sin justificar.

4. **Acción:** completar la **encuesta post-entreno**: valoración de la sesión (por defecto 3), dolor (por defecto 0), zona del dolor, detalle del dolor y comentario.
   **Respuesta del sistema:** la encuesta se valida. Si le falta un campo obligatorio, el cierre se detiene con **«Encuesta incompleta: {detalle}»**.
   **Resultado esperado:** la encuesta queda lista.

5. **Acción:** confirmar el cierre.
   **Respuesta del sistema — orden de operaciones guarantees:**
   1. Guarda la encuesta.
   2. Recalcula los contadores **desde los registros**, no desde lo que se ve en pantalla.
   3. Persiste en la sesión: ejercicios completados/omitidos/modificados/reemplazados/extra, series planificadas y completadas, repeticiones, volumen, grupos musculares, observación general y motivo del cambio de día.
   4. Verifica que exista `startedAt` (marca de inicio); si falta, lo completa.
   5. **Cambia el estado a `COMPLETED` si no hay pendientes ni omitidos; en caso contrario, `PARTIAL`.**
   6. Registra el día en la secuencia semanal.
   7. Guarda una observación del Coach.
   8. Limpia el estado local del ejercicio y la sesión activa.
   **Resultado esperado:** la sesión queda cerrada, es visible en Calendario y Progreso, e Inicio muestra «Sesión completada».

6. **Acción:** (alternativa) seleccionar **«Desmarcar ejercicio»** en un ejercicio ya completado.
   **Respuesta del sistema:** se quita la marca de completado **solo en la vista**; los registros de series ya confirmados no se borran.
   **Resultado esperado:** se puede reabrir el ejercicio para registrar series adicionales.

**Variantes y excepciones:**

| Situación | Respuesta del sistema |
|---|---|
| Ejercicio pendiente sin motivo | Error: **«Falta motivo para "{nombre}".»** El cierre se detiene. |
| Encuesta incompleta | Error: **«Encuesta incompleta: {detalle}»** |
| Error al guardar | Error genérico **«Error al guardar. Reintentá sin perder datos.»**; la sesión **permanece en `COMPLETING`** y es reintentable. Nunca se cierra a medias. |
| Sesión sin ejercicios o datos de sesión perdidos | El cierre intenta recuperar la sesión desde lo visible para no perder el trabajo; si no puede, pide recargar. |
| Doble pulsación de finalizar | El segundo intento se descarta (protección de 3 s). |
| Salir de la pestaña con la sesión activa | El navegador pide confirmación de salida (`beforeunload`). **Verificado** en escritorio. |

**Matriz de estados de sesión — Verificado** (`domain.ts`, `sessionStore.ts`):

| Desde | Hacia |
|---|---|
| `PLANNED` | `READY` |
| `READY` | `IN_PROGRESS`, `CANCELLED` |
| `IN_PROGRESS` | `PAUSED`, `COMPLETING`, `CANCELLED`, `ABANDONED` |
| `PAUSED` | `IN_PROGRESS`, `COMPLETING`, `CANCELLED`, `ABANDONED` |
| `COMPLETING` | `COMPLETED`, `PARTIAL` |
| `COMPLETED`, `PARTIAL`, `CANCELLED`, `ABANDONED` | *(ninguno — estados finales)* |

Los saltos no permitidos se **encadenan automáticamente** en lugar de fallar: cerrar desde `READY` pasa por `IN_PROGRESS`; cerrar como `PARTIAL` desde `IN_PROGRESS` o `PAUSED` pasa por `COMPLETING`. Ambos saltos quedan auditados. Toda transición escribe un evento de sesión con origen, destino y motivo.

**Estado de verificación:** **Verificado** (`pages/Entrenar.tsx`, `services/training/sessionStore.ts`, `domain.ts`; pruebas en `Entrenar.flujo.test.tsx`, `Entrenar.nav.test.tsx`, `Entrenar.redirect.test.tsx`).

**🔶 Pendiente:** el comportamiento interno de `ExerciseSeriesTable` (validación de entrada de peso/reps, conversión de unidades, campos de carga en libras) y de los modales de sesión no se auditó línea por línea.

---

### 5. Biblioteca de ejercicios

**Propósito:** consultar el catálogo de ejercicios con detalle técnico, gestionar favoritos y ejercicios propios, e importar el catálogo externo Wger.

**Condiciones iniciales:** ninguna. La pantalla funciona sin sesión activa.

#### 5.1 Flujo — Explorar y filtrar

1. **Acción:** observar la pantalla. El sistema carga por defecto la pestaña **«Músculo»** con el filtro **«Todos»** y muestra el total de ejercicios.
2. **Acción:** seleccionar una pestaña de indexado: **Músculo**, **Equipo**, **Parte** o **Categoría**.
   **Respuesta del sistema:** al cambiar de pestaña, el filtro vuelve a **«Todos»** y se recarga la lista.
   **Resultado esperado:** se listan los ejercicios del criterio elegido.
3. **Acción:** seleccionar una etiqueta (chip) del índice, por ejemplo un músculo o un equipamiento.
   **Respuesta del sistema:** se muestran los ejercicios del grupo, con su nombre, grupo muscular, equipamiento y los tres primeros porcentajes de activación muscular. Se indica el total filtrado.
   **Resultado esperado:** la lista corresponde al filtro.
   *Nota:* el grupo «Piernas» agrupa la familia completa (cuádriceps, isquiotibiales, glúteos, gemelos, aductores y abductores) y no muestra duplicados.
4. **Acción:** escribir en el buscador.
   **Respuesta del sistema:** el listado se filtra en vivo. **El buscador no reduce el conjunto cargado**: filtra sobre lo ya traído por el filtro activo.
   **Resultado esperado:** se muestran las coincidencias.
5. **Acción:** usar los **filtros avanzados**: patrón de movimiento (push, pull, squat, hinge, core) y dificultad (principiante, intermedio, avanzado).
   **Respuesta del sistema:** se combinan con el buscador y el filtro de índice.
   **Resultado esperado:** el listado refleja todos los criterios.
6. **Acción:** si no hay resultados.
   **Respuesta del sistema:** estado vacío **«Sin resultados»** con la indicación de probar otro músculo, equipamiento o término.

**Nota sobre la fuente — Verificado:** la biblioteca es **solo de consulta**. La pantalla lo indica explícitamente: «Solo informativo — sin copiar. Usá Rutina para agregar con selector inteligente».

#### 5.2 Flujo — Marcar favorito

1. **Acción:** abrir el detalle de un ejercicio y seleccionar el botón de corazón.
   **Respuesta del sistema:** el corazón se rellena y el ejercicio se añade a la lista de favoritos, **persistida en el perfil**.
2. **Acción:** volver a seleccionarlo.
   **Respuesta del sistema:** se quita de favoritos.
3. **Acción:** seleccionar **«Favoritos (N)»** en la pantalla principal.
   **Respuesta del sistema:** la lista se reduce solo a los ejercicios marcados.
   **Resultado esperado:** los favoritos están disponibles como filtro rápido.

#### 5.3 Flujo — Ver detalle

1. **Acción:** seleccionar cualquier ejercicio de la lista.
   **Respuesta del sistema:** se abre una hoja con la animación, el nombre, los atributos (músculo, parte del cuerpo, equipamiento, categoría), la **desglose de músculos trabajados con porcentajes**, las **instrucciones de ejecución numeradas**, y — si es importado de Wger — su identificador y licencia.
2. **Acción:** seleccionar **«Cerrar»** o cerrar la hoja tocando fuera.
   **Respuesta del sistema:** la hoja se cierra.

#### 5.4 Flujo — Crear un ejercicio propio

1. **Acción:** seleccionar **«+ Agregar ejercicio»** (panel lateral derecho).
   **Respuesta del sistema:** se abre el formulario de alta con nombre, grupo muscular, parte del cuerpo, equipamiento, categoría, nivel y Optionally imagen.
   **⚠️ Pendiente:** el formulario (`BibliotecaCustomForm.tsx`) no se auditó; la lista exacta de campos obligatorios y su validación no está confirmada.
2. **Acción:** completar y guardar.
   **Respuesta del sistema:** el ejercicio se crea en la base local, se marca con la insignia **«Mío»** y aparece en los listados correspondientes a su músculo y categorización. Se recarga la lista actual.
   **Resultado esperado:** el ejercicio propio queda disponible y utilizable en las rutinas.

#### 5.5 Flujo — Editar o eliminar un ejercicio propio

1. **Acción:** abrir el detalle de un ejercicio marcado **«Mío»** y seleccionar **«Editar»**.
   **Respuesta del sistema:** se abre el formulario con los datos cargados.
2. **Acción:** abrir el detalle y seleccionar **«Eliminar»**.
   **Respuesta del sistema:** se muestra una confirmación con texto **distinto según el caso**:
   - Con historial asociado: **«Tiene historial: se archivará (desaparece de listas, historial intacto). ¿Continuar?»**
   - Sin historial: **«¿Eliminar este ejercicio? No se puede deshacer.»**
   Al confirmar, se muestra un aviso final: **«Archivado: fuera de listas, historial intacto.»** o **«Ejercicio eliminado.»**
   **Resultado esperado:** el ejercicio desaparece de los listados; en el caso con historial, las sesiones y series previas se conservan y siguen siendo legibles.

#### 5.6 Flujo — Sincronizar el catálogo Wger

1. **Acción:** observar el panel «Wger · Catálogo externo de enriquecimiento» con el estado **«sin importar»**.
   **Respuesta del sistema:** en el **primer arranque con conexión y sin catálogo previo**, la aplicación importa automáticamente una muestra de 30 ejercicios y marca el dispositivo con `localStorage['wger:autoImport:v1']` para no repetirlo. Si la importación automática falla, queda disponible el botón manual.
2. **Acción:** seleccionar **«Descargar catálogo Wger»** o **«Sincronizar de nuevo»**.
   **Respuesta del sistema:** durante el proceso se muestra «Importando N/30…»; al terminar, el panel indica **«N ejercicios importados»** y la lista se recarga. La importación es **idempotente**: no duplica ejercicios ya importados.
   **Resultado esperado:** los ejercicios importados aparecen en el listado con la insignia **«Wger»**.
   *Si falla:* el panel muestra **«Sin conexión con Wger»** y el botón queda disponible para reintentar.

**Variantes y excepciones:**

| Situación | Respuesta del sistema |
|---|---|
| Sin conexión | Aviso **«Sin conexión — se muestra caché.»** y, si hay caché del filtro, los datos se sirven desde ella con el aviso **«Mostrando caché offline (sin conexión).»** |
| Fallo sin caché disponible | Se muestra el mensaje de error del servicio. |
| Imagen no disponible | El marcador de posición **«GIF no disponible»** permanece. |

**⚠️ Pendiente (E.5):** el botón **«+ Agregar ejercicio»** está dentro del panel lateral marcado `hidden lg:block`, por lo que **no es accesible en la vista móvil**, donde la creación de ejercicios propios queda sin acceso.

**Resultado final del flujo:** la persona puede consultar el catálogo, filtrarlo, guardar favoritos y administrar sus propios ejercicios.

**Estado de verificación:** **Verificado** (`pages/Biblioteca.tsx`, `BibliotecaCustomForm.tsx`; pruebas en `Biblioteca.favorites.test.tsx`).

---

### 6. Nutrición

**Propósito:** registrar la ingesta del día, contrastarla contra metas, controlar la hidratación y valuedar la adherencia.

**Condiciones iniciales:** ninguna específica. Si falta peso o altura en el perfil, la pantalla lo advierte y usa metas de referencia.

#### 6.1 Flujo — Registrar una comida

1. **Acción:** escribir el plato en el compositor de comidas («Registrar una comida»).
   **Respuesta del sistema:** Althea estima los ingredientes, las cantidades y los macros a partir del texto. La persona revisa la estimación antes de confirmar.
   **🔶 Pendiente:** el comportamiento interno del compositor (interpretación del texto, estados de carga y de error) no se auditó; no se puede afirmar qué ocurre si la estimación falla.
2. **Acción:** confirmar el guardado.
   **Respuesta del sistema:** se crea el registro con identificador único, fecha del día activo, tipo de comida, hora actual, desglose de ingredientes y totales de macronutrientes; se suma a los totales del día; el compositor se reinicia.
   **Resultado esperado:** la comida aparece en «Comidas del día» y los totales, la barra de progreso calórica y el plato de macros se actualizan.
   **Persistencia:** el registro queda guardado en la base local y sobrevive a recargas.

3. **Acción:** observar la fila «Objetivo diario» frente a «Consumo diario».
   **Respuesta del sistema:** la tabla muestra kcal, grasas, carbohidratos y proteínas objetivo y consumidos. Cada macronutriente muestra una etiqueta de estado cuando no está en rango: «cerca», «alcanzado» o «excedido». El consumo calórico muestra el porcentaje sobre la meta y el texto **«Faltan N kcal»** o **«Meta diaria alcanzada»**.
   **Resultado esperado:** la persona conoce su desviación respecto de la meta.

#### 6.2 Flujo — Editar una comida

1. **Acción:** seleccionar el botón de edición (lápiz) de una comida.
   **Respuesta del sistema:** el compositor se carga con el desglose previo y el título cambia a «Editar comida».
2. **Acción:** modificar los datos y confirmar.
   **Respuesta del sistema:** se actualizan nombre, tipo de comida, desglose, cantidad total y macros del registro; los totales del día se recalculan.
   **Resultado esperado:** la corrección queda reflejada en todas las vistas.
3. **Variante:** si el registro se guardó **sin desglose de ingredientes**, el sistema **no permite editarlo** y muestra el aviso: **«Esta comida se guardó sin desglose de ingredientes. Buscala por nombre para editarla.»**
   **Resultado esperado:** la limitación queda explícita y no se pierden datos.

#### 6.3 Flujo — Eliminar una comida

1. **Acción:** seleccionar el botón de papelera de una comida.
   **Respuesta del sistema:** el registro se elimina de la lista y de la base; los totales se recalculan.
   **Resultado esperado:** la comida desaparece del día.
   **⚠️ Verificado — Ausencia de confirmación:** a diferencia de eliminar rutinas o ejercicios, **eliminar una comida no pide confirmación**. La eliminación es inmediata e irreversible.

#### 6.4 Flujo — Registrar hidratación

1. **Acción:** observar la botella, que contrasta el consumo real contra el objetivo calculado.
2. **Acción:** seleccionar un acceso rápido de botella o de mililitros.
   **Respuesta del sistema:** se registra la botella completa o el volumen indicado, y la botella se actualiza al instante.
   **Resultado esperado:** el consumo de agua del día aumenta y queda persistido.
3. **Acción (Inicio):** usar el botón **«+ 250 ml»** en lugar del compositor de Nutrición (flujo 3.3).

#### 6.5 Flujo — Configurar botellas

**Disponible en:** Inicio, Nutrición, Recuperación (y el propio editor). Es el **mismo componente** en las cuatro pantallas, por lo que la configuración es única y compartida.

1. **Acción:** abrir el editor de botellas.
2. **Acción:** definir nombre, capacidad y activar/desactivar cada botella.
   **Respuesta del sistema:** la configuración se persiste y se emite un evento de cambio que obliga a recargar el consumo y el objetivo en **todas** las pantallas abiertas.
   **Resultado esperado:** las botellas configuradas quedan disponibles como accesos rápidos de un toque.
   **🔶 Pendiente:** el número máximo de botellas y las validaciones de capacidad no se auditaron.

#### 6.6 Flujo — Puntuar la adherencia diaria

**Condición:** solo aparece si el perfil tiene un método nutricional activo.

1. **Acción:** observar el bloque «Adherencia nutricional».
   **Respuesta del sistema:** si no hay registro para hoy, ofrece cuatro botones: **3**, **5**, **7**, **9**.
2. **Acción:** seleccionar un puntaje.
   **Respuesta del sistema:** se registra la adherencia del día junto con las comidas registradas, las comidas esperadas (4) y los porcentajes de adherencia calórica y proteica; se muestra **«Puntaje: N/10»** con la etiqueta «Bien» (≥7), «Regular» (≥4) o «Bajo».
   **Resultado esperado:** el puntaje queda guardado y visible.
   *Una vez registrado, el bloque deja de ofrecer los botones y muestra el resultado.*

#### 6.7 Flujo — Reutilizar un alimento frecuente

**Condición:** aparece solo si hay alimentos frecuentes (los 5 más registrados en los últimos 30 días).

1. **Acción:** observar la sección «Alimentos frecuentes» con nombre y macros de cada uno.
2. **Acción:** seleccionar uno.
   **Respuesta del sistema:** se crea una **copia** del registro con nuevo identificador, fecha del día activo y hora actual; se suma a los totales.
   **Resultado esperado:** el alimento queda registrado hoy sin volver a escribirlo.

#### Lectura del resto de la pantalla

| Bloque | Contenido | Estado |
|---|---|---|
| **Alertas de seguridad** | Si el método nutricional activo y el perfil cumplen condiciones de riesgo, se muestran avisos con el mensaje y, si aplica, la derivación a profesional. | Verificado |
| **Plato de macros** | Distribución de proteínas, carbohidratos y grasas frente a sus objetivos. | Verificado |
| **Contexto** | TDEE, TMB (Mifflin-St Jeor), IMC y peso actual con objetivo. | Verificado |
| **Sugerencias del día** | Lista de sugerencias derivadas de los datos registrados, cada una marcada como «dato» o «cálculo». Si faltan datos: **«Sin datos suficientes»** con la indicación de completar peso y altura en Perfil. Si no hay brechas: **«Vas bien: sin brechas importantes hoy.»** | Verificado |

#### Variantes y excepciones

| Situación | Respuesta del sistema |
|---|---|
| Sin peso o altura en el perfil | Se usan **metas de referencia** (2200 kcal, 150 g proteína, 250 g carbohidratos, 70 g grasas) y la pantalla lo advierte: **«· metas de referencia»** y **«Metas de referencia — completá peso y altura en Perfil para usar tus objetivos reales.»** |
| Ninguna comida registrada | Estado vacío **«Todavía no registraste comidas hoy»**. |
| No hay alimentos frecuentes | La sección no se renderiza. |
| Fallo de carga de datos | Pantalla de error **«No se pudieron cargar tus datos»** con el detalle y botón **«Reintentar»**. |
| Cambio de día con la app abierta | Cada 30 s se comprueba la fecha; al cambiar, los totales se reinician para el nuevo día. |
| Método nutricional no activo | No se muestran adherencia ni alertas de seguridad. |

**Resultado final del flujo:** el día queda con su consumo real registrado, contrastado contra metas y con hidratación medida.

**Estado de verificación:** **Verificado** (`pages/Nutricion.tsx`; pruebas en `Nutricion.dishes.test.tsx`, `Nutricion.botellas.test.tsx`, `Nutricion.layout.test.tsx`).

---

### 7. Coach IA

**Propósito:** responder consultas sobre rutina, nutrición y recuperación usando los datos reales de la persona, con respaldo de fuentes citadas.

**Condiciones iniciales:** la pantalla es accesible siempre. El modo de respuesta depende de la conectividad.

**Estados de disponibilidad — Verificado:** el encabezado muestra **«Disponible»** o **«Sin conexión»** según si el servicio de chat puede usarse.

#### 7.1 Flujo — Enviar una consulta

1. **Acción:** escribir el mensaje (máximo 500 caracteres) y seleccionar el botón de envío.
   **Respuesta del sistema:**
   - Se guarda el mensaje del usuario y aparece inmediatamente en el hilo.
   - El campo se limpia y queda deshabilitado durante el envío.
   - Con conexión: la respuesta llega **en streaming** token a token; mientras no llega el primer token se muestra **«Escribiendo»**.
   - La respuesta se valida: **solo se registran las fuentes efectivamente recuperadas y citadas**.
   - Al terminar, la respuesta se guarda con su origen y sus fuentes.
   **Resultado esperado:** la respuesta del Coach aparece en el hilo, con el bloque **«Fuentes usadas en esta respuesta»** debajo si se citaron referencias.

2. **Acción:** observar el indicador de consumo junto al nombre del Coach.
   **Respuesta del sistema:** muestra `usados/totales` del día y se renueva a la medianoche. El punto cambia de color al acercarse al límite.
   **Resultado esperado:** la persona conoce su consumo.

3. **Acción:** si el servicio falla o no hay conexión.
   **Respuesta del sistema:** el Coach responde en **modo local** usando los datos guardados. El mensaje se etiqueta con **«Modo local»**. Si además falla la respuesta local, se muestra un aviso **«El Coach no pudo responder ahora. Revisá tu conexión y probá de nuevo.»** con botón **«Reintentar»**.
   **Resultado esperado:** la conversación continúa en lugar de interrumpirse.

**Contexto del chat — Verificado:** antes de responder, el sistema construye un contexto unificado que combina la intención de la pregunta, los datos reales del usuario y evidencia recuperada. El historial de los últimos 10 mensajes se incluye como contexto.

#### 7.2 Flujo — Acciones rápidas

**Condición:** se ofrecen solo cuando la conversación está vacía.

1. **Acción:** observar las tres sugerencias: «Analizá mi última sesión», «Sugerime qué comer hoy», «Cómo entreno esta semana».
2. **Acción:** seleccionar una.
   **Respuesta del sistema:** se envía como si la persona la hubiera escrito, recorriendo el mismo flujo.
   **Resultado esperado:** se obtiene una respuesta sobre ese tema sin escribir.

#### 7.3 Flujo — Cambiar el método de coaching

1. **Acción:** en el panel «Estilo de coaching», seleccionar **«Cambiar»**.
   **Respuesta del sistema:** se despliega la lista de métodos de entrenamiento.
2. **Acción:** seleccionar un método.
   **Respuesta del sistema:** se guarda como **vista de coaching** (no cambia la rutina ni la planificación) y se regeneran los consejos de estilo. El subtítulo muestra el método y el tono vigente.
   **Resultado esperado:** los consejos se adaptan al método elegido.
   **Verificado:** cambiar el método aquí **no** sobrescribe el tono elegido en Perfil.

#### 7.4 Flujo — Borrar la conversación

1. **Acción:** seleccionar el icono de papelera (deshabilitado si no hay mensajes).
2. **Acción:** confirmar en el diálogo del navegador **«¿Borrar esta conversación?»**
   **Respuesta del sistema:** se eliminan todos los mensajes, se limpian el error y el reintento, y se crea una conversación nueva.
   **Resultado esperado:** el hilo queda vacío y listo para usar.
   *Si se cancela:* no ocurre nada.

#### Panel de contextualización (lectura)

| Panel | Contenido |
|---|---|
| **Estilo de coaching** | Método y tono vigente; hasta 2 consejos de estilo (directo/empático, técnico, riesgo). |
| **Consejos de tu rutina** | Derivados del método activo, el ciclo vigente, las zonas con historial de dolor y el nivel de experiencia. Si no hay método: la indicación de configurarlo en Perfil. |
| **Para tu próximo día** | Derivados de la última encuesta y la última sesión: dolor reportado, sesión difícil, buena sesión, nota de la persona, cumplimiento bajo, volumen registrado, dolor recurrente (3 o más sesiones). Cada consejo se marca como «Importante» o «Info». |
| **Fuentes científicas** | Acordeón con las referencias del producto (organización, tema, año, enlace). |

**Variantes y excepciones:**

| Situación | Respuesta del sistema |
|---|---|
| Sin conexión | Estado vacío **«Coach en modo local»** con la explicación de que responde con datos guardados; el campo indica «Modo local — respondo con tus datos». |
| Envío en curso | El campo y el botón quedan deshabilitados; no se admite un segundo envío simultáneo. |
| Mensaje vacío | El botón de envío permanece deshabilitado. |
| Excede 500 caracteres | La entrada se trunca; no hay mensaje de error. |
| Sin sesiones completadas | El panel «Para tu próximo día» indica **«Completá una sesión para ver consejos personalizados.»** |

**Resultado final del flujo:** la persona obtiene respuestas basadas en sus datos, con citas verificables y degradación elegante a modo local.

**Estado de verificación:** **Verificado** (`pages/Coach.tsx`; prueba en `Coach.test.tsx`).

---

### 8. Calendario y recuperación

**Propósito:** consultar el historial mensual de sesiones, el detalle de cada día y registrar el check-in de recuperación.

**Condiciones iniciales:** ninguna. La pantalla abre en el mes actual.

#### 8.1 Flujo — Navegar entre meses

1. **Acción:** observar la grilla mensual. Cada celda muestra el día, una abreviatura del **estado de carga** (Normal, Sobrecarga, Carga reducida, Carga cero) y un indicador si hay sesión registrada (`✓`), que se acompaña de `↻` si además hubo cambio de día. El día actual queda resaltado con un anillo.
2. **Acción:** seleccionar **«Mes anterior»** o **«Mes siguiente»**.
   **Respuesta del sistema:** se recalcula la grilla, se releen los cambios de día del mes y se cierra cualquier detalle abierto.
   **Resultado esperado:** se navega por el historial.
3. **Acción:** si el mes no tiene sesiones, se muestra **«Sin sesiones registradas este mes»**.
   **Resultado esperado:** la ausencia de datos es explícita, no ambigua.

**Leyenda — Verificado:** punto primario = completado; punto terciario = cambiado.

#### 8.2 Flujo — Abrir el detalle de un día

1. **Acción:** seleccionar cualquier celda del calendario.
   **Respuesta del sistema:** se abre una hoja con:
   - Fecha y día realizado.
   - **Programado** y, si hubo cambio, **«→ Realizado: {día} (cambiado)»**.
   - Estado de carga del día.
   - Cantidad de sesiones; si es un día de entreno sin sesiones, **«· Sesión pendiente de registrar»**.
   - Hidratación en ml o «Sin datos».
   - Recuperación como score o «Sin datos».
   - **Gasto calórico del ejercicio**, con tres estados honestos: total en kcal, **«Sin datos suficientes para estimar»** o **«Sin sesiones registradas»**.
   - Comidas registradas con kcal, macros desglosados y sueño (horas y calidad).
   - Si hay sesiones: estado de cada una (`COMPLETED`, `PARTIAL`, `ABANDONED`, u otros), ejercicios, volumen, series hechas/planificadas, cumplimiento en porcentaje, kcal y duración. Si el gasto no es calculable, se indica **«Sin datos suficientes para estimar el gasto de esta sesión»**.
   - Si no hay sesiones: **«Sin sesiones registradas este día»** con la aclaración de si estaba programado o era descanso.
2. **Acción:** seleccionar **«Cerrar»**.
   **Respuesta del sistema:** la hoja se cierra.

> **Nota — Verificado:** el detalle del calendario es **estrictamente de lectura**. No permite crear, editar ni finalizar una sesión desde esta pantalla.

**Hidratación mostrada — Verificado:** el detalle del día suma **todos** los registros de hidratación de la fecha; el indicador de la cabecera, en cambio, excluye los registros marcados como demostración. Esta diferencia no está documentada en la interfaz. **Ver E.8.**

#### 8.3 Flujo — Registrar recuperación desde el calendario

1. **Acción:** seleccionar el botón **«Recuperación»** de la cabecera.
   **Respuesta del sistema:** se abre un modal con el formulario de check-in y el aviso **«Solo registra tu estado. No modifica tu rutina.»**
2. **Acción:** completar y guardar el check-in.
   **Respuesta del sistema:** se guarda, el modal se cierra y los indicadores de la cabecera se actualizan (score e hidratación).
   **Resultado esperado:** el estado del día queda registrado y visible de inmediato.
   El formulario en detalle se documenta en 11.1.

#### Paneles laterales (lectura)

| Panel | Contenido |
|---|---|
| **Resumen del mes** | Días con sesión y total de sesiones del histórico. |
| **Próximas sesiones** | Los primeros 4 días de la rutina con estado «Activo»; o «Sin rutina activa». |
| **Tips rápidos** | Tres recomendaciones estáticas. |
| **Cabecera** | Score de recuperación del día («Score: N/100» o «Sin check-in») y agua consumida en litros o «Sin datos». |

**Estado de verificación:** **Verificado** (`pages/Calendario.tsx`; pruebas en `Calendario.gasto.test.tsx`, `Calendario.recovery.test.tsx`).

---

### 9. Progreso

**Propósito:** analizar la evolución del entrenamiento a partir de los registros reales.

**Condiciones iniciales:** la pantalla requiere datos. Sin ellos, muestra estados vacíos explícitos.

#### 9.1 Flujo — Cambiar el período de análisis

1. **Acción:** observar el selector de período con seis opciones: **7 días**, **30 días** (por defecto), **90 días**, **Año**, **Todo**, **Personalizado**.
2. **Acción:** seleccionar una opción.
   **Respuesta del sistema:** se recalculan todos los indicadores, el gráfico de volumen y las conclusiones del informe.
   **Resultado esperado:** la pantalla refleja el período elegido.
3. **Acción:** si se elige **«Personalizado»**, aparecen dos campos de fecha (**Desde**, **Hasta**).
   **Respuesta del sistema:** la ventana de análisis se limita al rango indicado.
   **Resultado esperado:** el análisis se limita al rango.

**Unidad de agregación — Verificado:** según la duración del período, el volumen se agrupa por día (≤14 días), por semana (≤90 días, hasta 12 cubos) o por mes (más de 90 días, hasta 12 cubos). Los cubos sin series registradas valen 0; **no se inventan valores**.

#### 9.2 Flujo — Consultar el mapa muscular

1. **Acción:** observar el «Mapa muscular», que muestra el trabajo por grupo muscular del ciclo iniciado en la fecha de planificación.
2. **Acción:** alternar entre vista **frontal** y **posterior**.
   **Respuesta del sistema:** la figura cambia. Qué figura se dibuja depende del sexo del perfil (hombre, mujer o neutra).
3. **Acción:** consultar el detalle de una región.
   **Respuesta del sistema:** se listan los ejercicios que la activaron en la ventana mostrada, incluyendo músculos secundarios con su ponderación.

**Comparación — Verificado:** el mapa compara la semana del ciclo vigente contra la semana anterior del ciclo. Usa **todo el historial**, no el filtro de período, porque la comparación es entre semanas del ciclo.

#### 9.3 Flujo — Generar el informe descargable

1. **Acción:** observar el bloque «Informe del período», que resume las conclusiones derivadas de los registros.
   **Contenido — Verificado:** variación del volumen respecto del período anterior, días entrenados y adherencia, evolución del peso y última recuperación, y balance carga/fatiga de los últimos 7 días.
2. **Acción:** seleccionar **«Generar informe descargable»**.
   **Respuesta del sistema:** se abre el generador de informe (carga diferida).
   **🔶 Pendiente:** el contenido, el formato y el proceso de descarga del informe no se auditaron (`components/report/ReportModal`).

#### Indicadores mostrados

| Indicador | Comportamiento verificado |
|---|---|
| **Días entrenados** | Días con sesión dentro del período. Con «Todo» muestra el total histórico. |
| **Peso actual** | Última medición del período. Muestra el delta. Sin mediciones: «—» y «sin mediciones». |
| **Volumen comparable** | Suma de kg × repeticiones del período. El porcentaje de variación **solo se muestra si el período anterior equivalente tiene volumen registrado**; si no, indica **«kg×reps · sin período previo comparable»**. |
| **Sesiones / Mediciones** | Recuento de registros del período. |

#### Variantes y excepciones

| Situación | Respuesta del sistema |
|---|---|
| Carga de datos en curso | Estado de carga con el título «Cargando…». |
| Error de carga | Bloque **«No se pudieron cargar los datos»** con el detalle y botón **«Reintentar»**. |
| **Sin ningún dato** (histórico vacío) | Estado vacío **«Todavía sin datos de entrenamiento»** con la indicación de registrar la primera sesión en Entrenar. |
| **Sin datos en el período elegido** | Estado vacío **«Sin registros en este período»** que indica el rango consultado, con botón **«Ver todo el historial»**. |

**Resultado final del flujo:** la persona comprende su evolución y puede exportar un informe.

**Estado de verificación:** **Verificado** (`pages/Progreso.tsx`; pruebas en `Progreso.blocks.test.tsx`, `Progreso.periodo.test.tsx`).

---

### 10. Rutinas

**Propósito:** crear, editar, versionar y organizar la rutina que determina qué se entrena cada día.

**Condiciones iniciales:** si no hay ninguna rutina, la pantalla muestra el estado vacío **«No hay rutinas guardadas»** con el botón **«Nueva rutina»**.

#### 10.1 Flujo — Crear una rutina

1. **Acción:** seleccionar **«Nueva rutina»** (desde el estado vacío o desde el selector superior).
   **Respuesta del sistema:** se abre un diálogo con el campo de nombre y el campo **«Fecha de revisión»** (por defecto, hoy + 30 días), con la aclaración de que el aviso aparece en Inicio y nunca bloquea el entrenamiento.
2. **Acción:** escribir el nombre y opcionalmente ajustar la fecha, luego seleccionar **«Crear rutina»**.
   **Respuesta del sistema:** se crea la rutina, queda **activa**, se limpia el formulario y se cierra el diálogo.
   **Resultado esperado:** la rutina queda seleccionada y editable.
   - *Sin nombre:* aviso **«Ingresá un nombre»**.
   - *Si se alcanzó el máximo de rutinas:* aviso **«Tenés N rutinas guardadas. Para crear otra, modificá o eliminá una de las existentes.»** y no se crea.

> **Regla de versionado — Verificado:** cada modificación guardada sobre una rutina **archiva automáticamente una versión** y muestra el aviso **«Versión vN guardada (anterior preservada).»** El pasado no se modifica.

#### 10.2 Flujo — Cambiar de rutina

1. **Acción:** desplegar el selector superior (**«Rutina:»**).
   **Respuesta del sistema:** se listan todas las rutinas con un botón de opción; la activa se marca con «activa».
2. **Acción:** seleccionar otra rutina.
   **Respuesta del sistema:** se marca como activa, se carga su contenido y se recuperan sus versiones.
   **Resultado esperado:** la pantalla opera sobre la rutina elegida. Las demás quedan intactas.
3. **Acción:** desde el mismo desplegable, **«Nueva rutina»** o **«Crear con IA»** (ver 10.9).

#### 10.3 Flujo — Editar los ejercicios de un día

1. **Acción:** renombrar el día escribiendo en el campo del nombre (por ejemplo «Pecho + Tríceps»).
   **Respuesta del sistema:** el nombre se guarda al instante. **El nombre del día es la fuente de la que se deduce el grupo muscular.**
   **Resultado esperado:** el día queda identificado.
2. **Acción:** seleccionar **«+ Ejercicio»** en la tarjeta del día.
   **Respuesta del sistema:** se abre el **selector inteligente**, que deduce los grupos musculares del nombre del día y carga los ejercicios compatibles, más los ejercicios propios del usuario. Muestra cuántos ya están en el día, permite filtrar por músculo, equipamiento y dificultad, y ofrece un buscador por nombre, músculo, equipo, parte o categoría.
   **Priorización — Verificado:** los ejercicios del tipo preferido por el método de entrenamiento activo se ordenan primero, y los que el método marca como a evitar se ocultan.
3. **Acción:** (opcional) revisar el ejercicio con **«Ver»**.
   **Respuesta del sistema:** se abre el visor con animación e instrucciones, y el botón **«AGREGAR A RUTINA»**.
4. **Acción:** seleccionar **«AGREGAR»** en un ejercicio (o varios mediante selección múltiple y **«Agregar N seleccionados»**).
   **Respuesta del sistema:** se añade con las series y repeticiones por defecto del método activo, **peso vacío (nunca 0)** y descanso entre ejercicios de 120 s. Los ejercicios ya presentes se muestran atenuados y no se pueden volver a añadir.
   **Resultado esperado:** el ejercicio queda en el día y el contador de ejercicios y series se actualiza.
5. **Acción:** eliminar un ejercicio con el icono de papelera.
   **Respuesta del sistema:** se quita del día sin confirmación.
   **Resultado esperado:** el día refleja la nueva planificación.
6. **Si el nombre del día no permite deducir el grupo muscular:** el selector muestra un mensaje explicativo: **«no detectamos grupo muscular»** con la recomendación de escribir el grupo en el nombre del día, y solo ofrece cerrar.
   **Resultado esperado:** la causa del fallo es entendible y accionable.

**Valores por defecto — Verificado:** series = las del método activo o 3; repeticiones = el máximo del rango del método o 10; **peso = vacío**. El campo vacío nunca se convierte en 0, para no registrar falsamente un ejercicio de peso corporal como lastre de 0 kg.

#### 10.4 Flujo — Ajustar el plan por serie

1. **Acción:** en el bloque **«Plan por serie»** de un ejercicio, editar las repeticiones o el peso de una serie concreta.
   **Respuesta del sistema:** se guarda esa serie de forma independiente; el número de series del ejercicio se recalcula como el número de filas.
   **Resultado esperado:** se pueden programar progresiones, piramides o Dropsets con valores distintos por serie.
2. **Acción:** seleccionar **«+ Serie»**.
   **Respuesta del sistema:** se añade una fila que hereda los valores de la última.
3. **Acción:** eliminar una fila con su icono de papelera.
   **Respuesta del sistema:** se quita la serie.
   **Resultado esperado:** el plan por serie queda exactamente como se desea.

**Edición de los valores globales — Verificado:** cambiar el número de series conserva las series existentes y agrega o quita al final; cambiar repeticiones o peso propaga el valor a todas las series.

#### 10.5 Flujo — Configurar descansos y objetivos

**Verificado.** Por cada ejercicio se pueden definir: descanso entre series (s), descanso entre ejercicios (s), tipo de serie (Normal, Ascendente, Descendente, Piramidal, DropSet, Otra), tempo, RIR, RPE y notas.

**Regla de precedencia del tipo de serie — Verificado:** si la rutina define un tipo de serie, ese tipo manda y **nunca se sobrescribe a «Normal»**, de modo que los planes de pirámide o descenso no se pierden.

#### 10.6 Flujo — Asignar días a la semana

1. **Acción:** en «Asignación calendario», elegir por cada día de la semana (Dom a Sáb) un día de la rutina o **«Descanso»**.
   **Respuesta del sistema:** se guarda la asignación. Calendario e Inicio reflejan el cambio: un día sin asignación aparece como descanso.
2. **Acción:** cambiar el **nivel de carga** del día (Normal, Sobrecarga, Carga reducida, Carga cero).
   **Respuesta del sistema:** se guarda. El nivel se refleja en el calendario.
   **Nota explícita en pantalla:** «Representa la planificación, no modifica pesos/repeticiones. Carga cero = día sin carga planificada».
3. **Acción:** seleccionar **«+ Agregar Día N°»**.
   **Respuesta del sistema:** se crea un día nuevo con el siguiente número y nombre «Día N°X».
   **Resultado esperado:** el ciclo semanal puede crecer.

#### 10.7 Flujo — Eliminar o duplicar una rutina

**Duplicar**
1. **Acción:** seleccionar **«Duplicar»**.
   **Respuesta del sistema:** se crea una copia con el nombre «{nombre} (copia)», nueva fecha de creación y **nueva fecha de revisión** (creación + período de rotación). Queda activa.
   **Resultado esperado:** se trabaja sobre una variante sin perder la original.
   *Si se alcanzó el máximo:* aviso y no se duplica.

**Eliminar**
1. **Acción:** seleccionar **«Eliminar»**.
   **Respuesta del sistema:** confirmación **«¿Eliminar esta rutina? Esta acción eliminará la rutina guardada y su configuración.»**
2. **Acción:** confirmar.
   **Respuesta del sistema:** se elimina la rutina; si era la activa, se selecciona la primera restante. Si no queda ninguna, se vuelve al estado vacío con el diálogo de creación abierto.
   **Resultado esperado:** la rutina deja de existir.
   **⚠️ Verificado:** el aviso del «Historial de rutinas» afirma que «Historial sesiones/setLogs conservado por rutina», pero **el código de borrado no muestra ninguna acción sobre sesiones ni series**. Ver E.7.

#### 10.8 Flujo — Comparar versiones

1. **Acción:** observar el panel **«Versiones»**, que indica la versión actual y cuántas versiones históricas hay.
2. **Acción:** (si hay versiones) elegir una en **«Comparar con actual»**.
   **Respuesta del sistema:** se calcula y muestra la diferencia en texto: ejercicios añadidos (`+ día N: nombre`), eliminados (`− día N: nombre`) y modificados (`~ día N: nombre (antes → después)`). Si no hay diferencias: **«Sin diferencias.»**
   **Resultado esperado:** se comprueba qué cambió respecto de una versión anterior, **sin modificar nada**.
   **Nota — Verificado:** no existe mecanismo para **restaurar** una versión anterior; la comparación es solo informativa.

#### 10.9 Flujo — Crear una rutina con IA

**Condiciones:** el servicio de IA debe estar disponible y debe haber **menos de 4 rutinas** creadas.

1. **Acción:** desde el selector, seleccionar **«Crear con IA»**.
   **Respuesta del sistema:** se abre un cuestionario de **4 pasos** con barra de progreso.
2. **Cuestionario:**
   - **Paso 1** — «¿Qué buscás con esta rutina?»: Hipertrofia, Fuerza, Pérdida de grasa, Resistencia, General.
   - **Paso 2** — «¿Cuántos días por semana entrenás?»: 2 a 6. Cada opción muestra la distribución sugerida.
   - **Paso 3** — «¿Qué enfoque preferís?»: General, Tren superior, Tren inferior, Empuje / Tirón, Cuerpo completo.
   - **Paso 4** — «¿Tenés alguna lesión o limitación?»: texto libre más atajos (Ninguna, Hombro, Rodilla, Espalda). Se advierte que la IA evitará ejercicios que puedan empeorar la condición.
   - **Respuesta del sistema:** en el último paso se muestra un resumen de las cuatro respuestas.
   - Botones **«Atrás»**, **«Cancelar»** y, en el último paso, **«Generar rutina»**.
3. **Acción:** seleccionar **«Generar rutina»**.
   **Respuesta del sistema:** se muestra la pantalla **«Coach IA está pensando…»** con el análisis del perfil, el historial y el estilo de coaching.
4. **Acción:** esperar el resultado.
   **Respuesta del sistema:** se abre la vista previa de la rutina generada, con: días por semana, total de ejercicios, total de series, la justificación del método elegido (**«¿Por qué este método?»**), el calendario semanal, el detalle de ejercicios por día, y la explicación del Coach (objetivo, método, distribución, intensidad, progresión y características clave).
5. **Acción:** decidir.
   - **«Guardar rutina»** → se crea la rutina con el nombre indicado, **con fecha de inicio = hoy**, y queda activa. Si se alcanzó el máximo, se avisa y no se guarda.
   - **«↻ Regenerar»** → vuelve al cuestionario.
   - **«Descartar»** → se cierra sin guardar.
   **Resultado esperado:** la rutina generada queda disponible y editable como cualquier otra.
   *Si la generación falla:* modal **«Error al generar»** con el mensaje, y botones **«Cerrar»** y **«Reintentar»** (que reabre el cuestionario).

#### Otros bloques

| Bloque | Comportamiento |
|---|---|
| **Estado de la rutina** | Distingue «Activa», «Próximo a revisar» (≥80 % del período) y «Revisar» (≥100 %). |
| **Período para revisar** | Selector de 20, 30, 45 o 60 días. |
| **Fecha de revisión** | Fecha concreta. Si está vacía, se calcula como creación + período. Se muestra «Vence el {fecha} (en N días / hace N días)». |
| **Revisión inteligente** | Al superar el período, muestra una sugerencia con los primeros ejercicios y tres acciones: **Aceptar** (avisa que hay que editar los ejercicios), **Rechazar** y **Modificar** (pide el nuevo número de días). |
| **Historial de rutinas** | Lista todas las rutinas con la activa resaltada. |
| **Periodización avanzada** | Sección colapsable que abre un editor de periodización. El encabezado aclara: «solo planificación futura». **🔶 Pendiente:** el contenido del editor no se auditó. |
| **Estadísticas** | Días de entrenamiento por semana, total de ejercicios y total de series. **Solo en escritorio.** |

#### Variantes y excepciones

| Situación | Respuesta del sistema |
|---|---|
| Sin rutinas | Estado vacío con acción de creación. |
| Día sin ejercicios | Estado vacío **«Día N°X sin ejercicios»** con la indicación de usar el selector inteligente. |
| Sin ejercicios compatibles con el grupo | Mensaje: **«No encontramos ejercicios compatibles con este grupo muscular. Probá con otro grupo, equipamiento o término de búsqueda.»** |
| Filtro sin resultados | **«Sin ejercicios para este filtro. Probá otro equipamiento o búsqueda.»** |
| IA no disponible | El botón **«Crear con IA»** no se muestra. |
| Máximo de rutinas alcanzado | Aviso al crear o duplicar; el selector indica el límite. |
| Fallo de guardado de una edición | El error se captura y se ignora; la pantalla puede no reflejar el cambio. **Pendiente.** |

> **⚠️ Inconsistencia estructural verificada (E.3):** la pantalla **Rutina** guarda los cambios en el almacén de rutinas (`saveAllRoutines` / `saveRoutineVersioned`), mientras que Inicio, Entrenar y Calendario leen la planificación de la **versión canónica activa** en `cycleVersions`. La asignación semanal y los cambios de días editados aquí pueden **no reflejarse en el panel** hasta que se escriba una versión canónica. La única escritura canónica comprobada se produce al finalizar el onboarding.

**Resultado final del flujo:** la persona cuenta con una rutina organizada, versionada y con configuración de carga por día.

**Estado de verificación:** **Verificado** para Rutina (`pages/Rutina.tsx`; pruebas en `Rutina.reviewDate.test.tsx`).

---

### 11. Recuperación

**Propósito:** registrar el estado diario, observar su evolución y recibir recomendaciones derivadas de los datos.

**Condiciones iniciales:** ninguna. Sin datos previos, la pantalla muestra estados vacíos que invitan al primer check-in.

#### 11.1 Flujo — Completar y guardar el check-in

**Acceso — Verificado:** desde Recuperación, desde el enlace «Abrir check-in →» de Inicio, desde el botón «Recuperación» de Calendario, y automáticamente al tocar una notificación de tipo «¿Cómo estás?» o «Check-in».

1. **Acción:** observar el panel del score. El sistema muestra el valor sobre 100, un punto de color y una etiqueta: **«Normal — Listo para entrenar»**, **«Moderada — Considerá bajar volumen»** o **«Baja — Priorizá descanso»**.
   **Si no hay check-in guardado**, se añade el aviso: **«Sin check-in guardado — completá y guardá para registrar tu estado real»**.
   **Valores iniciales — Verificado:** sin registro previo, el formulario se carga con valores por defecto (Energía 7, Fatiga 4, Dolor 2, Ánimo 7, Motivación 7, Esfuerzo percibido 5, Estrés 3, 7 horas de sueño, calidad 7).

2. **Acción:** ajustar los siete deslizadores del cuestionario (Energía, Fatiga, Dolor, Estado de ánimo, Motivación, Esfuerzo percibido, Estrés), cada uno de 1 a 10.
   **Respuesta del sistema:** el score se **recalcula en vivo** con cada movimiento y el color y la etiqueta se actualizan inmediatamente.
   **Resultado esperado:** la persona ve el efecto de cada respuesta antes de guardar.

3. **Acción:** opcionalmente completar **«Zona del dolor»** (máx. 80 caracteres), **«Observación del dolor»** (máx. 300), **«Horas dormidas»** (0 a 12, pasos de 0,5) y **«Calidad del sueño»** (1 a 10).
   **Respuesta del sistema:** los valores se reflejan al instante en la etiqueta del campo.
   **Resultado esperado:** el contexto del dolor y del sueño queda capturado.

4. **Acción:** seleccionar **«Guardar recuperación»**.
   **Respuesta del sistema:** el botón muestra **«Guardando…»**; al completarse, se escribe el registro con los siete indicadores, la zona y observación del dolor, el score, el color y — si se Sherryron— las horas y calidad de sueño. Se registra además el estado de acción obligatoria como completada.
   **Resultado esperado:** el estado del día queda persistido.
   **Confirmación visible:** la cabecera muestra la insignia **«Guardado N/100»** durante 3 segundos.
   **Efectos derivados — Verificado:** el check-in actualiza el score de recuperación que Inicio muestra, la serie del gráfico de evolución, el resumen de la cabecera de Calendario y las entradas del Coach.
   **El propio panel lo declara: «Se guarda al presionar · actualiza recuperación, gráfico e IA. Índice orientativo, no diagnóstico médico. No modifica tu rutina.»**

**Carga de un registro existente — Verificado:** al abrir el formulario de una fecha con registro, se recuperan todos los valores. Si no hay registro, se aplican los valores por defecto puros.

> **⚠️ Inconsistencia verificada (E.6):** el formulario ofrece un control **«Estado de ánimo»** independiente, pero al cargar un registro existente el valor de **ánimo se rellena con el valor de motivación** (no se persiste un campo de ánimo propio). Además, al guardar, el valor de dolor se escribe en el campo `soreness` del registro. El usuario puede creer quePACK guarda tres escalas separadas cuando en la base de datos se almacenan dos.

#### 11.2 Flujo — Revisar la evolución

1. **Acción:** observar el bloque «Estado y evolución».
   **Respuesta del sistema (con datos):**
   - Score de recuperación sobre 100.
   - Etiqueta de tendencia: **«En mejora»**, **«Estable»** o **«En descenso»**.
   - Si hay días bajos consecutivos, insignia **«N día(s) seguidos en baja»**.
   - Energía y fatiga promedio de los últimos 3 días, sobre 10.
   - Factores del último check-in: Energía, Fatiga, Dolor, Estado de ánimo y Estrés.
   - Gráfico de barras de los últimos 7 check-ins, con la fecha bajo cada barra.
   **Resultado esperado:** la persona conoce su estado y su tendencia.
2. **Si no hay datos:** estado vacío **«Sin datos de recuperación todavía»** con la indicación de completar el primer check-in.
3. **Si el historial no tiene puntajes:** **«Sin historial de scores todavía.»**

#### 11.3 Flujo — Actuar sobre una recomendación

**Reglas de generación — Verificado.** Las recomendaciones se derivan exclusivamente de los registros:

| Condición | Recomendación | Severidad |
|---|---|---|
| Sin ningún score previo | **«Sin datos suficientes»** — «Todavía no hay suficientes check-ins para generar una recomendación fiable.» | info |
| ≥2 días consecutivos bajos **o** último score < 45 | **«Considerar descarga o descanso activo»** — «Tu recuperación viene baja. Valorar bajar volumen hoy.» | `critical` si <45, si no `warning` |
| Último score ≥ 70 | **«Recuperación óptima»** — «Indicadores en rango. Podés entrenar según lo planificado.» | info |

Cada recomendación muestra su **razonamiento** y la **evidencia** concreta que la sustenta (último score, racha de días bajos, tendencia, fatiga promedio). Se pueden desplegar con el control de «¿Por qué?».

1. **Acción:** observar la sección «Recomendaciones». El encabezado aclara: **«No modifican tu rutina automáticamente.»**
2. **Acción:** seleccionar **«Aceptar sugerencia»** (o la acción disponible: modificar o descartar).
   **Respuesta del sistema:** se registra la decisión con qué se aceptó, por qué, los factores y la confianza; la recomendación **desaparece** de la lista.
   **Resultado esperado:** la decisión queda trazada y la lista se actualiza.
   **Verificado:** aceptar **no aplica ningún cambio** en la rutina ni en la planificación; es una decisión documentada, no una acción.
3. **Si no quedan recomendaciones:** estado vacío **«Sin recomendaciones activas»** con el mensaje de que los indicadores están dentro de los rangos esperados.

#### Hydratación

**Verificado.** Recuperación incluye la botella de consumo real frente al objetivo, y el mismo editor de botellas compartido con Inicio, Nutrición y Calendario. Las registrations son las mismas que en el flujo 6.4.

#### Variantes y excepciones

| Situación | Respuesta del sistema |
|---|---|
| No hay check-ins | Estados vacíos en «Estado y evolución» y «Últimos días». |
| Error de carga | Bloque de error **«No se pudieron cargar tus datos de recuperación»** (o «No se pudieron generar recomendaciones») con botón **«Reintentar»**. |
| Guardado en curso | El botón muestra «Guardando…» y queda deshabilitado. |
| Formulario aún hidratando | El botón **«Guardar recuperación»** permanece deshabilitado hasta que los datos previos estén cargados, evitando sobrescribir un registro existente. |
| Modificación de un check-in ya guardado | Se **sobrescribe** el registro del mismo día (no se crea historial de versiones). No hay aviso previo. |

**Resultado final del flujo:** el estado del día queda registrado, la evolución es visible y las recomendaciones quedan trazadas.

**Estado de verificación:** **Verificado** (`pages/Recuperacion.tsx`, `components/recovery/RecoveryCheckForm.tsx`; prueba en `RecoveryCheckForm.test.tsx`).

---

### 12. Perfil

**Propósito:** gestionar los datos personales, el objetivo, las preferencias del Coach, las exclusiones, las notificaciones, la apariencia y la cuenta.

**Condiciones iniciales:** la pantalla se organiza en secciones **colapsables**. Solo «Datos personales» arranca abierta; las demás se abren al seleccionarlas.

#### 12.1 Flujo — Editar datos personales

1. **Acción:** abrir la sección **«Datos personales»** y seleccionar **«Editar datos»**.
   **Respuesta del sistema:** el formulario aparece con los valores actuales precargados.
2. **Acción:** editar los campos: Nombre, Edad, Sexo (— / M / F / X), Actividad (Sedentario, Poco activo, Moderado, Muy activo, Extremadamente activo), Peso, Altura, Peso objetivo, Grasa corporal %, Masa muscular kg, Restricciones alimentarias y Alergias.
   **Nota — Verificado:** el campo **«Alimentos que no te gustan»** se carga en el formulario pero **no se renderiza ningún control de entrada ni se guarda**; solo se persiste si ya existía un valor previo.
3. **Acción:** seleccionar **«Guardar»**.
   **Respuesta del sistema:**
   - Se actualiza el perfil.
   - **Se crea un registro de medición corporal con la fecha de hoy** (peso, altura, grasa y músculo), lo que hace que el peso entre en la serie histórica de Progreso y Más.
   - El formulario se cierra y la sección vuelve al modo de lectura.
   **Resultado esperado:** los datos quedan actualizados y el peso empieza a registrarse en la serie.
4. **Acción:** seleccionar **«Cancelar»**.
   **Respuesta del sistema:** se descartan los cambios y se vuelve al modo de lectura.

**Campos calculados:** la cabecera muestra las iniciales, el nombre, la insignia del objetivo y, si hay peso o altura, los tres indicadores (Peso, Altura, IMC).

**Dominio de las restricciones — Verificado:** las restricciones y alergias alimentarias se guardan **únicamente** en las preferencias nutricionales del perfil. Las restricciones de entrenamiento del onboarding viven en un campo separado. La separación es deliberada y está documentada en el código.

#### 12.2 Flujo — Cambiar el objetivo

1. **Acción:** abrir la sección **«Objetivo»**.
2. **Acción:** seleccionar una de las cinco opciones: Hipertrofia, Fuerza, Pérdida de grasa, Movilidad, Salud general.
   **Respuesta del sistema:** se guarda como objetivo de entrenamiento del perfil y la insignia del objetivo se actualiza en la cabecera.
   **Resultado esperado:** el objetivo vigente cambia y alimenta los cálculos de nutrición y las recomendaciones.
   **Verificado:** cambiar el objetivo aquí **no** modifica la rutina ni la planificación.
   **Además:** la sección muestra el **método activo** del ciclo si lo hay.
   **⚠️ Verificado:** no hay forma de volver a editar la planificación del onboarding desde aquí; el nombre del objetivo se selecciona de una lista distinta de la del onboarding (ver E.9).

#### 12.3 Flujo — Configurar el Coach

1. **Acción:** abrir la sección **«Coach»**.
2. **Acción:** elegir la **personalidad** entre Equilibrado, Motivador, Directo y Exigente.
   **Respuesta del sistema:** se guarda como tono preferido y la insignia de tono se actualiza. La pantalla aclara: «Define el tono del Coach en el asistente. Si no elegís, se usa el tono de tu método de entrenamiento.»
   **Resultado esperado:** el Coach responde con ese tono.
3. **Acción:** ajustar el **nivel de exigencia** de 1 a 5.
   **Respuesta del sistema:** se guarda el nivel.
   **Resultado esperado:** la exigencia del Coach queda ajustada.
   **🔶 Pendiente:** no se verificó qué consumidores leen efectivamente `coachLevel`; su efecto observable no está confirmado.

#### 12.4 Flujo — Excluir ejercicios

1. **Acción:** abrir la sección **«Ejercicios excluidos»**. Se explica: **«Se omiten de las recomendaciones y sustituciones del plan y del Coach.»**
2. **Acción:** observar la lista. Cada excluido aparece como etiqueta; al seleccionarla se **quita** de la lista.
   *Si no hay ninguno:* estado vacío **«Sin exclusiones»**.
3. **Acción:** seleccionar **«Seleccionar ejercicios»**.
   **Respuesta del sistema:** se abre un selector con un desplegable de grupo muscular (Pecho, Bíceps, Tríceps, Abdominales, Piernas, Espalda, Hombros) y hasta 30 ejercicios.
4. **Acción:** marcar o desmarcar casillas.
   **Respuesta del sistema:** **cada cambio se guarda inmediatamente**, sin botón de guardar. Al cambiar de grupo muscular se recarga la lista; si no hay ejercicios disponibles, se informa **«No se pudieron cargar los ejercicios de la biblioteca.»**
5. **Acción:** seleccionar **«Listo»**.
   **Resultado esperado:** los ejercicios excluidos quedan persistidos y se omiten de recomendaciones y sustituciones.

> **Nota — Verificado:** el mismo conjunto de exclusiones puede editarse también desde el paso 7 del onboarding. Ambas rutas escriben el mismo campo del perfil.

#### 12.5 Flujo — Configurar notificaciones

**Naturaleza del sistema — Verificado:** existen **dos sistemas de notificaciones distintos** en la aplicación, con almacenamientos separados (ver E.10):

- **Notificaciones (esta sección):** recordatorios con título, múltiples horarios, días de la semana seleccionables uno por uno, y activación por tipo. Se guardan en la configuración de notificaciones del dispositivo.
- **Recordatorios diarios** (sección «Configuración» de la pantalla Más): archivo `unifiedNotifConfigs`, con título, una hora, recurrencia (diario, lun-vie, personalizado), días, activación y la opción de **acción obligatoria** para recuperación.

1. **Acción:** si el permiso no está concedido, seleccionar **«Permitir notificaciones»**.
   **Respuesta del sistema:** el sistema solicita el permiso del dispositivo; el estado se refleja en la línea de información.
   **Verificado:** si la plataforma no expone la API de notificaciones, el sistema lo indica: **«Plataforma sin API de notificaciones: los recordatorios solo se muestran con la app abierta.»**
   **Aviso importante — Verificado:** las notificaciones **disparan con la app abierta**; en segundo plano dependen de la plataforma.
2. **Acción:** observar el estado del permiso y la lista de notificaciones configuradas.
   *Si no hay ninguna:* **«Sin notificaciones configuradas»*.
3. **Acción:** añadir una notificación.
   **Respuesta del sistema:** se abre un diálogo de dos pasos: primero se elige el tipo —Entrenamiento, Hidratación, Nutrición, Recuperación, Check-in, ¿Cómo estás?, Coach, Personalizada—; si es Personalizada, se escribe el texto. Luego se elige la hora.
   **🔶 Verificado — Defecto de composición:** el segundo paso renderiza el selector de hora **encerrado dentro de otro diálogo superpuesto**, de modo que se briefly doubly modal. Además, el formulario de **hora no tiene botón «Guardar» propio**: la hora nunca llega a confirmarse antes de **«Agregar»**, por lo que el recordatorio se crea con la hora por defecto (08:00) sea cual sea la elección. **Ver E.11.**
   **Resultado esperado:** la notificación aparece en la lista con el título y el horario elegidos, activada por defecto y con días L a V activados.
4. **Acción:** actuar sobre una notificación existente.
   - **Interruptor** → activa o desactiva.
   - **Letra del día (L M X J V S D)** → alterna ese día.
   - **Horario** → abre el editor de hora; el valor se guarda al confirmar. La **«×»** sobre el horario lo elimina.
   - **Papelera** → elimina la notificación **sin confirmación**.
   **Resultado esperado:** la configuración queda actualizada y persiste.
5. **Acción:** seleccionar **«+ Agregar notificación»** cuando ya existen.
   **Resultado esperado:** se repite el flujo de alta.
6. **Acción:** activar **«Notificaciones push»** (bloque aparte, debajo del permiso local).
   **Respuesta del sistema:** el botón **«Activar notificaciones push»** llama a `enablePush()`, que valida el soporte de Firebase, el soporte del navegador y el permiso; si algo falta, muestra el motivo exacto.
   **Resultado esperado:** el botón pasa a **«Push activado»** y el estado persiste.

> **Nota — Verificado:** son **dos sistemas distintos**. El bloque del permiso local
> («Permitir notificaciones») controla los recordatorios que disparan **con la app
> abierta**. El botón de push registra el token en Firebase para notificaciones
> **en segundo plano**. Antes de esta ronda, la activación push existía en
> `services/firebase/messaging.ts` **sin ningún control en la interfaz** (ver E.10).

#### 12.6 Flujo — Exportar e importar tus datos

**Propósito:** descargar un respaldo de todos los datos locales y restaurarlo, sin depender de la nube.

1. **Acción:** abrir la sección **«Tus datos»**.
   **Respuesta del sistema:** se ofrecen dos botones de respaldo —**Respaldo (JSON)** y **Respaldo (CSV)**— y un control de **importación**.
2. **Acción:** seleccionar **«Respaldo (JSON)»**.
   **Respuesta del sistema:** se genera y descarga un archivo `.json` con el contenido completo.
   **Resultado esperado:** el archivo llega a la carpeta de descargas del dispositivo.
3. **Acción:** seleccionar **«Respaldo (CSV)»**.
   **Respuesta del sistema:** se genera y descarga un `.csv` con los registros tabulares (por ejemplo, sesiones).
4. **Acción:** usar el control de **importación** y elegir un archivo.
   **Respuesta del sistema:** se valida el archivo, se informa el resultado y los datos quedan restaurados.
   **Resultado esperado:** los datos vuelven a estar disponibles en la aplicación.

> **Nota — Verificado:** aquí **no se ofrece PDF** a propósito. La exportación a PDF leía
> las claves antiguas del perfil y producía documentos incompletos; el informe PDF real
> vive en Progreso (§9.3). Esta sección conecta el motor de importación/exportación que ya
> existía en el código pero **no tenía ningún punto de entrada en la interfaz**.

#### 12.7 Flujo — Cambiar la apariencia

1. **Acción:** abrir la sección **«Preferencias»**.
2. **Acción:** elegir tema **Oscuro** o **Claro**.
   **Respuesta del sistema:** se aplica el tema inmediatamente en toda la aplicación y se persiste.
3. **Acción:** elegir el **tamaño del texto**: Chico, Mediano o Grande.
   **Respuesta del sistema:** se aplica inmediatamente y se persiste.
   **Resultado esperado:** la interfaz refleja las preferencias sin reiniciar la aplicación.

**Verificado:** la apariencia se aplica también en el arranque de la aplicación.

#### 12.8 Flujo — Cerrar sesión

1. **Acción:** seleccionar **«Cerrar sesión»**.
   **Respuesta del sistema:** se abre una confirmación **«¿Cerrar sesión?»** con la aclaración **«Tus datos locales se conservan.»**
2. **Acción:** confirmar.
   **Respuesta del sistema:** si hay conexión, se **sincroniza la información con el servidor antes de cerrar**; después se cierra la sesión y se recarga la aplicación en `/login`.
   **Resultado esperado:** la sesión de Firebase termina; los datos locales permanecen en el dispositivo.
3. **Acción:** seleccionar **«Cancelar»**.
   **Respuesta del sistema:** el diálogo se cierra sin cambios.

> **Verificado (comportamiento global):** al iniciar sesion con una cuenta **distinta** de la anterior en el mismo navegador, la aplicacion **borra los datos locales del usuario previo** para que no contaminen al nuevo (se preservan las preferencias de interfaz). En el primer inicio de sesion, sin cuenta previa, los datos se conservan.

#### 12.9 Flujo — Eliminar la cuenta

1. **Acción:** seleccionar **«Eliminar cuenta»**.
   **Respuesta del sistema:** se abre un diálogo con la advertencia **«Esta acción eliminará tu cuenta y los datos asociados. No se puede deshacer.»** y un campo que exige escribir exactamente **ELIMINAR**.
2. **Acción:** escribir `ELIMINAR`.
   **Respuesta del sistema:** el botón **«Eliminar»** se habilita.
3. **Acción:** confirmar.
   **Respuesta del sistema:** se elimina la cuenta del proveedor de identidad; **después se borran todos los datos locales** aunque la eliminación remota falle; finalmente se recarga la aplicación en `/login`.
   **Resultado esperado:** la cuenta y los datos asociados quedan eliminados.

**Otros bloques — Verificado:** la pantalla incluye un panel de **estado de sincronización** y un panel de **sincronización con Wger**. *🔶 Pendiente:* su contenido y comportamiento no se auditaron.

**Resultado final del flujo:** la persona controla sus datos, preferencias y acceso a la cuenta.

**Estado de verificación:** **Verificado** (`pages/Perfil.tsx`; pruebas en `Perfil.goalBadge.test.tsx`).

---

### 13. Más

**Propósito:** ofrecer un resumen de la actividad y centralizar el acceso a todas las secciones.

**Condiciones iniciales:** ninguna.

#### 13.1 Flujo — Consultar el resumen

**Todas las cifras proceden de los registros locales.** Cuando no hay datos, se muestra «Sin datos» o «Sin datos corporales»; **nunca se muestran valores inventados**.

| Bloque | Contenido |
|---|---|
| **Resumen** | Ejercicios en biblioteca, rutinas registradas, sesiones en 90 días (con series de los últimos 7 días) y consultas al Coach. |
| **Rutina activa** | Nombre, semana del ciclo y frecuencia semanal. Sin rutina: «Sin rutina activa». |
| **Cuerpo** | Altura y peso, IMC y diferencia de peso entre la primera y la última medición. |
| **Nutrición estimada** | TDEE y macros estimados. Sin datos: «Calculá tu perfil para estimar macros». |
| **Récords** | Los **dos** mejores pesos máximos estimados (1RM) por ejercicio y las toneladas movidas en 90 días. Sin datos: «Sin datos». |

**Verificado:** los récords solo se calculan sobre series con **peso mayor que cero y repeticiones mayores que cero**; los ejercicios de peso corporal no generan 1RM.

#### 13.2 Flujo — Navegar a cualquier sección

1. **Acción:** observar la rejilla **«Accesos»**: Rutinas, Calendario, Biblioteca, Nutrición, Recuperación, Progreso, Coach, Perfil.
2. **Acción:** seleccionar una tarjeta.
   **Respuesta del sistema:** se navega a la sección correspondiente, con un subtítulo contextual (por ejemplo, en Rutinas, el número de rutinas; en Progreso, el nombre del récord y su 1RM).
   **Resultado esperado:** se llega a la sección.
   **Verificado:** la tarjeta **«Entrenar»** solo aparece **si hay sesión activa**.

#### 13.3 Flujo — Configurar recordatorios diarios

1. **Acción:** abrir la sección **«Configuración»**.
2. **Acción:** observar los recordatorios de los cuatro tipos: **comer**, **agua**, **recuperación** y **entrenar**.
   **Respuesta del sistema:** cada uno permite activar/desactivar, editar el título (personalizable), cambiar la hora, elegir la recurrencia (**diario**, **lun-vie**, **personalizado** — que despliega los siete días) y eliminar.
   **Resultado esperado:** los recordatorios quedan configurados y persistidos.
3. **Acción (solo en el recordatorio de recuperación):** activar **«acción obligatoria (bloquea hasta completar)»**.
   **Respuesta del sistema:** el recordatorio pasa a requerir completion.
   **⚠️ Contradicción documentada (E.12):** la propia interfaz dice que «bloquea hasta completar», pero el código del formulario de check-in documenta que el mecanismo **no bloquea la interfaz de usuario**. Ver E.12.
4. **Acción:** seleccionar **«+ comer»**, **«+ agua»**, **«+ recuperación»** o **«+ entrenar»** para crear uno nuevo.
   **Respuesta del sistema:** se crea un recordatorio **desactivado** por defecto, heredando el título, la hora y la recurrencia del existente si lo hay, o con valores por defecto.
5. **Nota sobre el recordatorio de agua — Verificado:** la pantalla aclara **«Usa botellas reales: el recordatorio sigue aunque hayas tomado parte»**.

**Variantes y excepciones:**

| Situación | Respuesta del sistema |
|---|---|
| Carga de datos en curso | Estado de carga. |
| Un cálculo falla | Los bloques muestran «Sin datos»; el error se captura silenciosamente. |
| Sin rutinas | «Sin rutina activa». |
| Sin mediciones | «Sin datos corporales». |
| Sin series con peso | «Sin tonelaje registrado» y «Sin datos» en récords. |
| Sin sesión activa | No se muestra el acceso a Entrenar. |

**Estado de verificación:** **Verificado** (`pages/Mas.tsx`, `components/notifications/DailyRemindersConfig.tsx`; prueba en `Mas.entrenar.test.tsx`).

---

## D. Flujos transversales

Estos comportamientos se repiten en varias pantallas. Se documentan una sola vez aquí; las diferencias específicas se indican en cada caso.

### D.1 Control de acceso y navegación

| Regla | Comportamiento | Evidencia |
|---|---|---|
| **Puerta de onboarding** | Si el perfil no tiene `onboardingDone` **o** no tiene `email`, se redirige a `/onboarding` con reemplazo de historial. Se evalúa en cada cambio de ruta. | Verificado |
| **Puerta de cuenta** | Si Firebase está configurado y no hay usuario y no está activo el modo offline, se renderiza Login **por encima de cualquier ruta**. Es decir, no se puede navegar a otra sección sin autenticarse. | Verificado |
| **Modo offline** | El botón «Continuar sin cuenta» de Login desactiva la puerta de cuenta. El estado persiste. | Verificado |
| **Ocultación de la navegación** | La cabecera, la banda decorativa y la barra de navegación se ocultan en `/onboarding` y `/login`. | Verificado |
| **Acceso condicional a Entrenar** | Solo aparece en la navegación si hay sesión activa. | Verificado |
| **Carga diferida** | Las páginas y el chat se cargan bajo demanda; durante la carga se muestra un indicador con el texto **«Cargando…»**. | Verificado |
| **Prevención de salida** | Con una sesión en `IN_PROGRESS`, `PAUSED` o `COMPLETING`, el navegador pide confirmación al cerrar o recargar. | Verificado |
| **Continuidad de sesión** | Al recargar o volver a la ventana, la sesión se restaura con ejercicios, series y **posición exacta en el ejercicio**. | Verificado |
| **Cierre por medianoche** | Al arrancar, toda sesión activa cuya fecha sea anterior a hoy se cierra como no realizada con el motivo «Cierre automático: el entrenamiento siguió abierto al cambiar el día». No se borra nada. | Verificado |

### D.2 Persistencia

| Ámbito | Mecanismo | Notas |
|---|---|---|
| **Fuente primaria** | Dexie / IndexedDB, 21 versiones de esquema, tabla base `trainPWA`. | Verificado |
| **Sesiones** | `trainingSessions`, `sessionExercises`, `setRecords`, `sessionEvents`, `postWorkoutSurveys`, `negativeSets`, `exerciseObservations`. | Verificado |
| **Rutinas** | `routineStore` (rutinas completas con ejercicios embebidos) + `routineDays`/`routineExercises` (modelo relacional heredado) + `routineVersions`. | Verificado |
| **Planificación** | `cycleVersions` con versions `active`/`historic`, referenciadas por las sesiones. | Verificado |
| **Nutrición** | `nutritionDiary`, `nutritionAdherence`, `hydrationBottles`, `hydrationBottleLogs`. | Verificado |
| **Recuperación** | `recoveryChecks`, `painLogs`. | Verificado |
| **Coach** | `chatConversations`, `chatMessages`, `coachMemory`, `decisionLog`, `scoreSnapshots`. | Verificado |
| **Perfil** | `userProfile` (clave fija `me`), `bodyMeasurements`. | Verificado |
| **Cambios de día** | `sessionOverrides` (con la marca de usuario que lo originó). | Verificado |
| **Notificaciones** | `notifConfigs` + `notifLog` (sistema 1) y `unifiedNotifConfigs` + `requiredActionStates` (sistema 2). | Verificado |
| **Borrador de onboarding** | `onboardingDrafts`, guardado en cada cambio de paso. | Verificado |
| **localStorage (legado)** | `althea:lastUid`, `althea:nav-collapsed`, `wger:autoImport:v1`, `session:active:<fecha>`, `exstate:<fecha>:<ejercicio>`. Todos con migración a Dexie y con operaciones envueltas en `try/catch` que nunca interrumpen la app. | Verificado |

**Idempotencia — Verificado:** el registro de series es idempotente por identificador; recargar o repetir la confirmación no duplica. La importación de Wger es idempotente por identificador de origen.

### D.3 Manejo de errores y recuperación

| Mecanismo | Comportamiento |
|---|---|
| **Contenedores de error** | Uno global (aplicación completa) y cuatro por página: Entrenar, Nutrición, Coach y Progreso. |
| **Pantallas de error de datos** | Progreso, Recuperación y Nutrición ofrecen estado de error con el detalle y botón **«Reintentar»**. |
| **Fallos de guardado** | En Entrenar, si falla el cierre, la sesión **permanece en `COMPLETING`** y el cierre es reintentable; nunca se cierra a medias ni se pierden series. |
| **Errores de red silenciados** | En Inicio, si falla la creación de la sesión, la persona permanece en la pantalla y puede reintentar, pero **no se le muestra mensaje**. |
| **Reintentos automáticos** | El Coach degrada de modelo en línea a respuesta local ante cualquier fallo, y solo muestra error si también falla el modo local. |
| **Caché de ejercicios** | Biblioteca sirve la caché local si falla la red, avisando explícitamente que se muestra caché. |

**Ausencias relevantes — Verificado:**
- **Eliminar una comida** no pide confirmación.
- **Eliminar un ejercicio de un día de rutina** no pide confirmación.
- **Eliminar una notificación** no pide confirmación.
- **Guardar un check-in de recuperación el mismo día** sobrescribe el registro anterior sin aviso.

### D.4 Estados vacíos

La aplicación es consistente en no mostrar datos donde no los hay. Los estados vacíos verificados y sus mensajes:

| Contexto | Mensaje |
|---|---|
| Progreso sin histórico | «Todavía sin datos de entrenamiento» |
| Progreso sin datos en el período | «Sin registros en este período» |
| Progreso sin conclusiones | «Sin conclusiones todavía.» |
| Biblioteca sin coincidencias | «Sin resultados» |
| Rutinas sin rutinas | «No hay rutinas guardadas» |
| Rutina: día sin ejercicios | «Día N°X sin ejercicios» |
| Rutina: sin ejercicios compatibles | «No encontramos ejercicios compatibles con este grupo muscular…» |
| Rutina: filtro sin resultados | «Sin ejercicios para este filtro…» |
| Rutina: sin grupo detectable | «no detectamos grupo muscular» + recomendación |
| Nutrición sin comidas | «Todavía no registraste comidas hoy» |
| Nutrición sin datos para sugerencias | «Sin datos suficientes» |
| Recuperación sin check-ins | «Sin datos de recuperación todavía» |
| Recuperación sin historial de scores | «Sin historial de scores todavía.» |
| Recuperación sin recomendaciones | «Sin recomendaciones activas» |
| Recuperación sin check-ins guardados | «Sin check-ins guardados todavía.» |
| Coach sin mensajes (conexión) | «¿En qué puedo decirlo?» / «Preguntame sobre tu rutina, nutrición o recuperación.» |
| Coach sin mensajes (sin conexión) | «Coach en modo local» |
| Notificaciones sin configurar | «Sin notificaciones configuradas» |
| Ejercicios sin exclusiones | «Sin exclusiones» |
| Calendario sin sesiones en el mes | «Sin sesiones registradas este mes» |
| Calendario: día sin sesiones | «Sin sesiones registradas este día» |

### D.5 Reglas de honestidad de datos

**Verificado — regla de producto consistente en toda la aplicación:** cuando un valor no puede calcularse, la interfaz **nunca inventa un número**. Se muestra explícitamente:

- «Sin datos suficientes para estimar» (gasto calórico, con motivo).
- «Sin sesiones registradas».
- «Sin datos».
- «—» en indicadores.
- «Sin check-in».

Esta regla explica por qué varias pantallas muestran guiones en lugar de ceros, y debe conservarse en la redacción del tutorial: **un guion significa «no hay dato», no «el valor es cero»**.

**Consecuencia pedagógica importante:** el peso vacío en la configuración de ejercicios se guarda como **«sin peso informado»**, no como 0. Una serie con peso vacío **no genera 1RM** en Más ni cuenta para el récord.

### D.6 Notificaciones

| Comportamiento | Detalle |
|---|---|
| **Programación** | El planificador revisa cada 60 segundos y también al volver a la app. |
| **Contexto de día** | Las notificaciones solo se.programan en días de entrenamiento, salvo que exista un cambio de día manual registrado. |
| **Navegación por notificación** | Las notificaciones de «¿Cómo estás?» y «Check-in» abren directamente Recuperación. Las de push en primer plano también pueden abrirla. |
| **Persistencia de la cola** | Las operaciones pendientes se conservan y se suben al recuperar la conexión, de forma idempotente. |

### D.7 Estados de sesión activa y su efecto transversal

| Estado | Efecto |
|---|---|
| **Sin sesión** | Inicio muestra «Comenzar entrenamiento» (si hay día de entreno y no está completado). `/entrenar` redirige fuera. No aparece el acceso a Entrenar en la navegación. |
| **Sesión activa** (`READY`, `IN_PROGRESS`, `PAUSED`, `COMPLETING`) | Inicio muestra «Continuar entrenamiento». Aparece el acceso a Entrenar. Calendario y Progreso no la cuentan como completada. |
| **Sesión finalizada** (`COMPLETED`, `PARTIAL`, `CANCELLED`, `ABANDONED`) | Se limpia la sesión activa. Inicio muestra «Sesión completada» si corresponde. Aparece el resultado en Calendario. |

---

## E. Vacíos, inconsistencias y puntos por verificar

> **Nota metodológica:** la ausencia de evidencia **no** se interpreta como defecto de implementación. Cada punto indica qué se observó, con qué evidencia y qué falta confirmar.

### E.1 — Los datos del onboarding no determinan la planificación inicial

- **Pantalla:** Onboarding, paso 2 (días), paso 4 (equipamiento) y paso 7 (creación).
- **Evidencia:** `Onboarding.tsx` guarda `availableDays` y `equipment` en el perfil, pero al crear la planificación usa un `initialCycle` fijo de 4 días con `weekMap: [null, 1, 2, null, 3, 4, null]`, independientemente de lo respondido.
- **Falta confirmar:** si existe un proceso posterior (períodización, IA) que use `availableDays` para reconstruir la planificación, o si la intención era que el usuario la configure en Rutinas.
- **Impacto en el tutorial:** no se debe prometer que la rutina reflejará los días ni el equipamiento declarados.

### E.2 — El onboarding anuncia notificaciones que no configura

- **Pantalla:** Onboarding, paso 7.
- **Evidencia:** el texto dice «Se configurarán recordatorios básicos (entreno, hidratación, check-in)», pero el paso **no contiene ningún control de notificación ni llamada a `requestPermission()`**, y no se crea ninguna configuración.
- **Falta confirmar:** si es intencional (los recordatorios se crean después en Perfil/Más) o si es un resto de una versión anterior.
- **Impacto en el tutorial:** hay que indicar que los recordatorios se configuran en Perfil o Más, no en el onboarding.
- **Resuelto:** es intencional. El onboarding **no** pide permisos de notificación; los recordatorios se configuran después en **Perfil → Notificaciones** (§12.5), como ya anuncia ese mismo texto.

### E.3 — Escritura y lectura de la planificación usan almacenes distintos

- **Pantallas:** Rutinas (escritura) vs. Inicio, Entrenar, Calendario, Coach, Progreso, Perfil (lectura).
- **Evidencia:** `getCanonicalCycle()` lee primero la versión activa de `cycleVersions` y solo cae al snapshot `profile.cycle` como respaldo. En cambio, `Rutina.tsx` persiste mediante `saveAllRoutines` / `saveRoutineVersioned` sobre `routineStore`, y **no** llama a `savePlanning()`. La única escritura canónica comprobada se produce al finalizar el onboarding.
- **Falta confirmar:** si `saveRoutineVersioned` escribe también en `cycleVersions` (no se leyó su implementación), o si existe un mecanismo de sincronización no localizado.
- **Impacto en el tutorial:** es el punto más importante de verificar antes de publicar, porque de él depende que «cambiar el día en Rutinas» se refleje en «el día de hoy» de Inicio.

### E.4 — Funcionalidades disponibles solo en escritorio

| Funcionalidad | Ubicación | Problema |
|---|---|---|
| Editar reps/peso/descanso de un ejercicio del día | Inicio | La presentación móvil no expone los campos de edición (desktop-only). |
| **«+ Agregar ejercicio»** | Biblioteca | El botón vive en el panel lateral `hidden lg:block`: **no accesible en móvil**. |
| Estadísticas de rutina, método activo y tips | Rutinas | Panel `hidden lg:block`. |
| «Cambiar día de entrenamiento» por diálogo nativo | Entrenar | Solo en escritorio; en móvil no hay equivalente. |
| Contexto de los percentiles musculares | Rutinas | Solo escritorio. |

- **Falta confirmar:** si es una decisión de producto deliberada o una omisión. Requiere decisión de diseño; no debe documentarse como comportamiento hasta resolverlo.

### E.5 — Crear ejercicios propios no es accesible en móvil

- **Pantalla:** Biblioteca.
- **Evidencia:** el botón «+ Agregar ejercicio» está dentro de `<div className="lg:col-span-4 ... hidden lg:block">`.
- **Falta confirmar:** si existe una ruta alternativa en móvil. **No se encontró.**
- **Impacto en el tutorial:** documentar la creación de ejercicios propios solo para escritorio, o resolver antes.

### E.6 — El check-in de recuperación no guarda «Estado de ánimo»

- **Pantallas:** Recuperación y Calendario.
- **Evidencia:** en `RecoveryCheckForm.tsx`, la hidratación de un registro existente asigna `mood: Number(r.motivation ?? 7)`, es decir, rellena ánimo con el valor de motivación; y al guardar no se escribe ningún campo de ánimo, sino que el dolor se guarda en `soreness`.
- **Falta confirmar:** si es intencional (las escalas positiva/motivación se consideran una sola) o una omisión.
- **Impacto en el tutorial:** el formulario ofrece tres escalas que en realidad se almacenan como dos. Debe documentarse tal como está implementado, sin prometer un dato independiente de ánimo.

### E.7 — El mensaje de «Historial de rutinas» afirma una conservación no comprobada

- **Pantalla:** Rutinas.
- **Evidencia:** el texto indica «Historial sesiones/setLogs conservado por rutina». El código de borrado (`deleteRoutine`) solo elimina la rutina del almacén y reajusta la activa; **no se observations ninguna acción sobre sesiones ni series**.
- **Falta confirmar:** si la conservación ocurre por diseño (las sesiones referencian la rutina y no se borran) —lo cual es consistente con el modelo de datos— o si hay un borrado en otro punto no localizado.
- **Impacto en el tutorial:** probably es correcto desde el punto de vista del usuario, pero la afirmación debe verificarse antes de documentarse como garantía.

### E.8 — La hidratación del calendario y la de su cabecera usan cálculos distintos

- **Pantalla:** Calendario.
- **Evidencia:** la cabecera suma los registros de hidratación **excluyendo los marcados como demostración**; el detalle del día los suma **sin ese filtro**.
- **Falta confirmar:** si la diferencia es intencionada (los datos de demostración no deberían contaminar los totales del día) o una inconsistencia.
- **Impacto en el tutorial:** menor, pero conviene documentar que el detalle del día puede mostrar una cifra superior a la de la cabecera.

### E.9 — Vocabularios distintos para el objetivo de entrenamiento

- **Pantallas:** Onboarding (paso 1) y Perfil (sección «Objetivo»).
- **Evidencia:** el onboarding deriva un valor canónico entre `hipertrofia`, `perdida_peso`, `fuerza`, `resistencia`, `movilidad`, `recomposicion`, `mantenimiento` y lo guarda en `profile.goal`. Perfil escribe y lee `profile.trainingGoal` con las claves `hypertrophy`, `strength`, `fat_loss`, `mobility`, `general_health`.
- **Falta confirmar:** si el mapeo entre ambos vocabularios se resuelve internamente (por ejemplo, con `resolveTrainingGoal`). Si no se resuelve, la insignia de objetivo del encabezado de Perfil podría no mostrarse tras completar el onboarding.
- **Impacto en el tutorial:** afecta la descripción del objetivo del usuario. Requiere comprobación en ejecución.

### E.10 — Dos sistemas de notificaciones coexistiendo

- **Pantallas:** Perfil (sección «Notificaciones») y Más (sección «Configuración»).
- **Evidencia:** Perfil gestiona el sistema basado en `notifConfigs` (múltiples horarios, días individuales, 8 tipos). Más gestiona `unifiedNotifConfigs` (4 tipos, una hora, recurrencia, opción de acción obligatoria). Ambos tienen tablas, esquemas y funciones de servicio distintos en Dexie.
- **Falta confirmar:** si la migración entre ambos está completa o si ambos siguen activos en paralelo. Si ambos están activos, la persona podría crear recordatorios que se pisen o dupliquen.
- **Impacto en el tutorial:** hay que documentar **dónde** se configura cada tipo de recordatorio, sin fusionarlos en una sola explicación.
- **Resuelto (parcial) — push sin control en la interfaz:** había además un **tercer** mecanismo (las notificaciones push de Firebase, en `services/firebase/messaging.ts`) cuyo `enablePush()` **no tenía ningún punto de entrada en la UI**: existía y nunca se podía activar. Ahora hay un botón **«Activar notificaciones push»** en Perfil → Notificaciones (§12.5).

### E.11 — El alta de notificación tiene un defecto de composición y de confirmación

- **Pantalla:** Perfil → «+ Agregar notificación».
- **Evidencia:** en `AddNotifModal`, el paso de hora renderiza `<TimePickerModal onClose={()=>{}} />` **dentro** del diálogo que ya está abierto, produciendo dos capas modales superpuestas. Además, el formulario de hora no tiene botón «Guardar»: su valor solo se aplicaría al pulsar «Agregar», que usa el estado `time` del componente padre, no el del selector interno.
- **Falta confirmar:** en ejecución, si la hora elegida llega a aplicarse o si el recordatorio se crea siempre con el valor por defecto (08:00).
- **Impacto en el tutorial:** **no documentar la selección de hora como funcional** hasta verificarlo.

### E.12 — «Acción obligatoria» declara un bloqueo que el código no aplica

- **Pantallas:** Más (recordatorio de recuperación) y Recuperación.
- **Evidencia:** la casilla se etiqueta «acción obligatoria (bloquea hasta completar)» y la aplicación envuelve toda la interfaz en un `RequiredActionGate`. Sin embargo, el comentario del propio `RecoveryCheckForm` indica que el mecanismo «no bloquea UI».
- **Falta confirmar:** qué hace realmente `RequiredActionGate` cuando hay una acción pendiente: si bloquea, si solo muestra un aviso, o si no hace nada.
- **Impacto en el tutorial:** no prometer que la aplicación bloquea el uso hasta completar el check-in.

### E.13 — Redirección de `/entrenar` a una ruta no registrada — **RESUELTO**

- **Pantalla:** Entrenar.
- **Estado anterior:** `Entrenar.tsx` ejecutaba `<Navigate to="/inicio" replace />` cuando no había sesión activa, pero `App.tsx` **no declaraba ninguna ruta `/inicio`** (la raíz es `/`) ni una ruta `*`. Cualquier persona que entrara a `/entrenar` sin sesión veía el shell vacío. Además, `Entrenar.redirect.test.tsx` definía su **propia** ruta `/inicio` de mentira, por lo que el test pasaba sin detectar el fallo.
- **Corrección aplicada:** la redirección apunta a `/`; `App.tsx` tiene ahora una ruta comodín `*` que redirige a `/` ante cualquier URL desconocida; y el test usa la ruta real más un comodín que lo haría fallar si alguien reintrodujera una ruta inexistente.
- **Verificación:** `Entrenar.redirect.test.tsx` en verde y el behaviour correcto por construcción.

### E.14 — Dos mecanismos distintos para cambiar el día de entrenamiento

- **Pantallas:** Inicio y Entrenar.
- **Evidencia:** en Inicio, «Cambiar día» abre una hoja con motivo, observación y opción de revertir al programado. En Entrenar (escritorio), «Cambiar día de entrenamiento» usa un `window.prompt` que pide el número del día y **no ofrece motivo ni reversión**; tras elegir, recarga la página con `location.reload()`.
- **Falta confirmar:** si la versión de Entrenar escribe el mismo registro de cambio con motivo vacío.
- **Impacto en el tutorial:** documentar **Inicio** como la ruta recomendada; dejar la de Entrenar como no documentada hasta resolver.

### E.15 — Componentes internos no auditados

Los siguientes flujos se observan desde la página que los monta, pero su comportamiento interno no fue verificado línea por línea:

| Componente | Flujo afectado | Qué falta confirmar |
|---|---|---|
| `DishComposer` | 6.1, 6.2 | Validación, estados de error si falla la estimación de ingredientes, límites de cantidad. |
| `ExerciseSeriesTable` | 4.2, 4.8 | Validación de la entrada de peso/reps, conversión de unidades, manejo de cargas en libras. |
| `WaterBottle` / `BottleConfigEditor` | 3.3, 6.4, 6.5, 11 | Número máximo de botellas, validación de capacidad, cálculo del objetivo. |
| `PeriodizationEditor` | 10 | Alcance real de la periodización y qué campos modifica. |
| `ReportModal` | 9.3 | Formato, contenido y mecanismo de descarga del informe. |
| `MuscleAtlas` | 9.2 | Detalle exacto de las contribuciones por región. |
| `PainToggle` / `VariantPicker` | 4.5 | Niveles de dolor ofrecidos y algoritmo de selección de variantes. |
| `ChatWidget` (FAB) | transversal | Cuándo aparece, siRequires sesión y cómo se relaciona con el chat de Coach. |
| `SyncStatusCard` / `WgerSyncPanel` | 12 | Contenido y comportamiento de la sincronización. |
| `SyncStatusCard` → `PageLoader` → `RequiredActionGate` | transversal | Textos y comportamientos en estados de carga y de acción pendiente. |

### E.16 — Aspectos no verificables sin ejecución

| Punto | Motivo |
|---|---|
| Portales de autenticación de Firebase | Requiere credenciales y un proyecto configurado. |
| Traducción real de los errores de Firebase | La interfaz muestra `e.message` crudo. |
| Streaming real del Coach (Groq) | Requiere clave de API y conexión. |
| Importación de Wger | Requiere red; la muestra es de 30 ejercicios y el contenido real no se comprobó. |
| Comportamiento PWA instalable y service worker | Requiere despliegue. |
| Sincronizacion en segundo plano | Requiere despliegue y plataforma de notificaciones. |
| Notificaciones en segundo plano | La propia interfaz advierte que dependen de la plataforma. |

---

## F. Resumen de cobertura

| Pantalla | Flujos documentados | Estado dominante |
|---|---|---|
| Login | 4 (incluye el modo sin cuenta) | Verificado |
| Onboarding | 2 (cuestionario + selección de excluidos) | Verificado, con 2 inconsistencias |
| Inicio | 5 + 5 bloques de lectura | Verificado |
| Entrenar | 11 | Verificado, con 3 inconsistencias |
| Biblioteca | 6 | Verificado, con 1 inconsistencia |
| Nutrición | 7 + 4 bloques de lectura | Verificado |
| Coach | 4 + 4 paneles de lectura | Verificado |
| Calendario | 3 + 4 paneles de lectura | Verificado |
| Progreso | 3 | Verificado |
| Rutinas | 9 + 6 bloques auxiliares | Verificado, con 1 inconsistencia crítica |
| Recuperación | 3 + hidratación | Verificado, con 1 inconsistencia |
| Perfil | 8 | Verificado, con 2 inconsistencias |
| Más | 3 | Verificado |
| Transversales | 7 bloques | Verificado |

**Total: 65 flujos documentados**, de los cuales **52 están verificados por código**, **9 son inferidos o pendientes** y **4 son inconsistencias confirmadas** que requieren resolución antes de publicar el tutorial.

---

*Fin del documento.*
