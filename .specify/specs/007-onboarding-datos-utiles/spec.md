# Feature: Onboarding útil y datos que personalizan entrenamiento y Coach

## Propósito
Simplificar el alta y hacer que las preferencias declaradas por la persona afecten de verdad rutina, planificación y respuestas de IA.

## Alcance
- Onboarding: obligatorio solo entrenamiento (modalidad, objetivo principal, nivel, días disponibles, equipamiento, restricciones/dolencias/movimientos excluidos). Opcional posterior: objetivos secundarios, duración, horario, estilo Coach y necesidades. Datos físicos/nutricionales quedan fuera del alta y se editan en Perfil/Nutrición.
- No se asigna rutina automáticamente: al terminar, la persona elige o crea la primera rutina.
- Días disponibles ≠ planificación activa. El calendario sale de la rutina activa; los días sin rutina no se rellenan y los descansos se respetan.
- Nivel, duración, equipamiento, restricciones y modalidad influyen en el generador y en el prompt de IA, con validación determinista y regeneración cuando la propuesta es inválida.
- El contexto IA incluye solo datos de entrenamiento relevantes; excluye nombre, email e identificadores.
- Edición posterior de preferencias y datos físicos sin repetir onboarding. Perfiles existentes se conservan (sin migraciones destructivas).

## Fuera de alcance
- Auditoría o rediseño de áreas no relacionadas.
- Sobrescribir el trabajo no commiteado de migración a Cloudflare Workers AI.
- Deploy a producción.

## Criterios de aceptación
1. Alta con 6 pasos obligatorios y preferencias opcionales; sin cálculo de IMC/macros ni rutina inicial.
2. Perfil A (principiante/hipertrofia/3 días/máquinas+mancuernas/40 min), B (avanzado/fuerza/4 días/equipamiento completo/90 min) y C (CrossFit/intermedio/restricciones/disponibilidad variable) producen rutinas y contexto IA distintos y válidos.
3. Equipamiento no disponible, movimientos excluidos y duración incompatible se rechazan o regeneran con alternativa razonable.
4. El calendario refleja la rutina activa y respeta descansos; cambiar preferencias después no reescribe el historial ni fuerza onboarding.
