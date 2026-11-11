import { useState } from 'react'
import type { ReactNode } from 'react'
import { AltheaCard } from '@/components/althea/AltheaCard'
import SemanticIcon from '@/components/ui/SemanticIcon'

interface Capitulo {
  id: string
  titulo: string
  icono: string
  contenido: ReactNode
}

function Parrafo({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-on-surface">{children}</p>
}

function Lista({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-sm leading-relaxed text-on-surface-variant">
          <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function Advertencia({ children }: { children: ReactNode }) {
  return (
    <aside
      role="note"
      className="flex gap-3 rounded-lg border-l-4 border-tertiary bg-tertiary/10 p-3.5"
    >
      <SemanticIcon name="warning" size={18} className="mt-0.5 shrink-0 text-[18px] text-tertiary" ariaHidden />
      <div className="space-y-1">
        <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-tertiary">Advertencia</p>
        <p className="text-sm leading-relaxed text-on-surface">{children}</p>
      </div>
    </aside>
  )
}

const CAPITULOS: Capitulo[] = [
  {
    id: 'cf-meta-1',
    titulo: '¿Qué es CrossFit?',
    icono: 'exercise',
    contenido: (
      <div className="space-y-3">
        <Parrafo>
          CrossFit es un método de entrenamiento funcional de alta intensidad que combina
          gimnasia, levantamiento de pesas y cardio en sesiones breves y variables. No es un
          programa fijo: cada día se entrena distinto sobre constantes que nunca cambian.
        </Parrafo>
        <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">
          Las constantes
        </p>
        <Lista
          items={[
            'Variedad: movimientos y combinaciones siempre distintos para no estancarte.',
            'Intensidad: el esfuerzo que aplicás dentro de cada sesión es lo que mueve la aguja.',
            'Funcionalidad: patrones que usás en la vida real, no máquinas aisladas.',
            'Movimientos con carga: barra, mancuernas, kettlebell o el peso del cuerpo.',
          ]}
        />
        <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">
          Capacidades físicas
        </p>
        <Parrafo>
          El método apunta a desarrollar todas ellas de forma pareja: cardio-resistencia,
          fuerza y resistencia muscular, potencia, velocidad, flexibilidad, coordinación,
          agilidad, equilibrio y precisión. En Althea lo ves materializado en el WOD del día
          (sesión con formato y cronómetro), en la Biblioteca CrossFit (los 52 movimientos
          con técnica y escalados) y en Progreso (tus marcas y benchmarks).
        </Parrafo>
      </div>
    ),
  },
  {
    id: 'cf-meta-2',
    titulo: 'Movimientos fundamentales',
    icono: 'fitness_center',
    contenido: (
      <div className="space-y-3">
        <Parrafo>
          Todo lo que hacés en un WOD se reduce a diez patrones de movimiento. Aprenderlos
          hace que cualquier ejercicio nuevo te resulte reconocible: si dominás el patrón,
          solo cambia la carga o la variante.
        </Parrafo>
        <Lista
          items={[
            'Empuje: press de banca, press de hombros, flexiones.',
            'Tracción: dominadas, remo con barra o con anillas.',
            'Sentadilla: air squat, front squat, overhead squat.',
            'Bisagra (hinge): deadlift, kettlebell swing, good morning.',
            'Lanzamiento: wall ball, shot put con balón medicinal.',
            'Cargar: farmer carry, recorridos con kettlebell o pesa rusa.',
            'Llevar: overhead carry, carries en posición frontal.',
            'Arrastrar: sled push/pull, trineo con soga.',
            'Estabilidad del core: plank, hollow body, l-sit.',
            'Salto y caída: box jump, burpee, salto a la soga.',
          ]}
        />
        <Parrafo>
          La Biblioteca CrossFit del módulo tiene los 52 movimientos organizados por patrón,
          con técnica, errores frecuentes y progresiones. Usala antes de un WOD: saber qué
          patrón trabajás es la mitad del trabajo.
        </Parrafo>
      </div>
    ),
  },
  {
    id: 'cf-meta-3',
    titulo: 'Mecánica → Consistencia → Intensidad',
    icono: 'school',
    contenido: (
      <div className="space-y-3">
        <Parrafo>
          Es la jerarquía de aprendizaje del método y el orden no se salta. Primero
          mecánica: la técnica correcta del movimiento, con carga liviana o sin carga.
          Después consistencia: repetir esa técnica bien hecha rep tras rep, set tras set,
          incluso con fatiga recién ahí aparece la intensidad: agregar velocidad, carga o
          volumen.
        </Parrafo>
        <Lista
          items={[
            'Mecánica: entendés y ejecutás el patrón con control y rango completo.',
            'Consistencia: 10 reps idénticas, no 1 bien y 9 mediocres.',
            'Intensidad: recién cuando las anteriores están automáticas.',
          ]}
        />
        <Parrafo>
          Saltar pasos es la causa número uno de lesión en la sala: una técnica floja
          repetida cientos de veces en un AMRAP carga las articulaciones en posiciones que
          no deberían aguantar. La intensidad sobre mecánica mala no hace más fuerte, solo
          más tiempo parado por lesión. En Althea, si un WOD te obliga a sacrificar la
          técnica, escalá el WOD, no la técnica.
        </Parrafo>
        <Advertencia>
          Este contenido es educativo y no reemplaza la valoración de un profesional de la
          salud. Ante dolor agudo, mareo o lesión, detené el entrenamiento y consultá.
        </Advertencia>
      </div>
    ),
  },
  {
    id: 'cf-meta-4',
    titulo: 'Formatos de WOD',
    icono: 'timelapse',
    contenido: (
      <div className="space-y-3">
        <Parrafo>
          El formato define cómo se cronometra la sesión. Elegir el formato correcto es
          elegir qué sistema energético y qué tipo de esfuerzo querés estimular. El módulo
          tiene un cronómetro real para cada uno de ellos: elegí el formato al crear o
          correr un WOD y el timer se ajusta solo.
        </Parrafo>
        <Lista
          items={[
            'AMRAP (As Many Rounds As Possible): máximo de rondas en un tiempo fijo. Mide tu capacidad de trabajo sostenido; puntaje = rondas + reps.',
            'FOR TIME: completar la tarea lo más rápido posible. Mide velocidad bajo fatiga; ejemplo clásico: 21-15-9.',
            'EMOM (Every Minute On the Minute): una tarea en cada minuto, descanso hasta el siguiente. Ideal para técnica bajo presión de reloj.',
            'TABATA: 20 segundos de máximo esfuerzo, 10 de descanso, 8 rondas (4 min). Puro sistema anaeróbico.',
            'CHIPPER: lista larga que "chippeás" de a poco, de mayor a menor o en orden fijo. Combina todo.',
            'INTERVAL: bloques de trabajo y descanso definidos (30/30, 1:1). Control fino del estímulo.',
          ]}
        />
      </div>
    ),
  },
  {
    id: 'cf-meta-5',
    titulo: 'Escalado (scaling)',
    icono: 'swap_horiz',
    contenido: (
      <div className="space-y-3">
        <Parrafo>
          Escalar no es bajar la exigencia: es conservar la intención del estímulo con
          cargas y variantes acordes a tu nivel de hoy. Si el WOD pide 50 wall balls con
          balón de 9 kg, la intención es empuje + sentadilla bajo fatiga con un ritmo alto:
          esa intención la conservás con un balón de 6 kg, con menos reps o con más
          descanso entre bloques.
        </Parrafo>
        <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">
          Niveles en Althea
        </p>
        <Lista
          items={[
            'RX: el WOD tal cual está escrito, estándar completo.',
            'Escalado: mismo estímulo, cambiando carga, rango, distancia o reps.',
            'Principiante: volumen reducido y variantes base del movimiento.',
            'Adaptado: sustituciones por lesión o movilidad, siempre dentro de lo que el profesional indicó.',
          ]}
        />
        <Parrafo>
          La Biblioteca tiene una tabla de escalado por movimiento con sustituciones por
          nivel: usala antes de arrancar, no en la mitad del WOD.
        </Parrafo>
        <Advertencia>
          Nunca entrenes con dolor. Si algo duele en la articulación (no la muscular), no
          lo escales: cambialo o paralo. Este contenido es educativo y no reemplaza la
          valoración de un profesional de la salud. Ante dolor agudo, mareo o lesión,
          detené el entrenamiento y consultá.
        </Advertencia>
      </div>
    ),
  },
  {
    id: 'cf-meta-6',
    titulo: 'Programación y sobrecarga',
    icono: 'auto_graph',
    contenido: (
      <div className="space-y-3">
        <Parrafo>
          Progresar depende de cuatro principios: sobrecarga progresiva (ir aumentando de
          a poco volumen o carga), variación (cambiar estímulos para no estancarte),
          especificidad (entrenar lo que querés mejorar) y descanso activo (los días
          livianos también son entrenamiento).
        </Parrafo>
        <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">
          Modelos de ciclado
        </p>
        <Lista
          items={[
            'Modelo 3:1 — tres días de trabajo seguidos y uno de descanso o recuperación activa.',
            'Modelo 5:2 — cinco días de trabajo y dos de descanso completo, ideal para semanas completas.',
          ]}
        />
        <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">
          Señales de sobreentrenamiento
        </p>
        <Lista
          items={[
            'Fatiga persistente: dormís y no recuperás.',
            'Rendimiento a la baja: tus marcas bajan sin motivo técnico.',
            'Irritabilidad y mal humor fuera de la sala.',
            'Insomnio o sueño poco reparador.',
          ]}
        />
        <Parrafo>
          Con una de estas señales, bajá volumen una semana antes de que el cuerpo lo baje
          por fuerza. En Althea podés marcar días de descanso en la programación: usalos,
          no son días perdidos.
        </Parrafo>
      </div>
    ),
  },
  {
    id: 'cf-meta-7',
    titulo: 'Benchmark y medición',
    icono: 'leaderboard',
    contenido: (
      <div className="space-y-3">
        <Parrafo>
          Los benchmarks son WODs fijos que se repiten a lo largo de los meses para medir
          progreso real. Hay dos familias: las Girls (cinco, por ejemplo) y los Hero WODs,
          conmemorativos, más largos y exigentes. Repetir el mismo WOD con el mismo
          estándar es lo único que hace comparable tu resultado con el de hace tres meses.
        </Parrafo>
        <Lista
          items={[
            'Mismo estándar = resultado comparable: mismas cargas, mismo rango, mismo parcial.',
            'Si adaptaste algo, marcá standardModified en tu resultado; el progreso sigue sirviendo, pero no se compara 1 a 1.',
            'Marcas de fuerza: 1RM, 3RM y 5RM. Registrar las tres te muestra si ganaste fuerza máxima o resistencia a la fuerza.',
            'Progresión: compará contra tu propio historial, no contra el de nadie más.',
          ]}
        />
        <Parrafo>
          En Progreso del módulo están tus marcas (movimiento, reps, kg) y tus resultados
          con su formato y nivel: antes de cada ciclo nuevo, revisá la pestaña y fijate qué
          movimientos estuviste testeando.
        </Parrafo>
      </div>
    ),
  },
  {
    id: 'cf-meta-8',
    titulo: 'Recuperación',
    icono: 'spa',
    contenido: (
      <div className="space-y-3">
        <Parrafo>
          El entrenamiento rompe; la recuperación construye. Sin ella, la sobrecarga
          progresiva es solo fatiga acumulada.
        </Parrafo>
        <Lista
          items={[
            'Sueño: 7 a 9 horas. Es el anabólico más barato que existe.',
            'Proteína: distribuirla en 3 a 4 comidas a lo largo del día para sostener la reparación muscular.',
            'Hidratación: agua a lo largo del día, no solo en la sesión. En Althea podés llevar el seguimiento diario.',
            'Días de descanso: al menos uno por semana; el modelo 3:1 ya los incorpora.',
            'Movilidad: 10 minutos de rango activo antes y después rinden más que una hora de estiramiento eventual.',
          ]}
        />
        <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">
          DOMS o lesión
        </p>
        <Parrafo>
          El DOMS (dolor muscular de aparición tardía) es opresión difusa en el músculo que
          mejora al moverse: se entrena liviano y pasa en 24 a 72 horas. Una lesión duele
          localizado, nítido, al tocar o al mover, y no mejora con la actividad. Si el
          dolor es agudo, intenso o limita el movimiento, pará.
        </Parrafo>
        <Advertencia>
          Este contenido es educativo y no reemplaza la valoración de un profesional de la
          salud. Ante dolor agudo, mareo o lesión, detené el entrenamiento y consultá.
        </Advertencia>
      </div>
    ),
  },
  {
    id: 'cf-meta-9',
    titulo: 'Seguridad y prevención',
    icono: 'error_outline',
    contenido: (
      <div className="space-y-3">
        <Parrafo>
          La prevención es una rutina, no un aviso. Estos son los puntos que evitan la
          mayoría de las lesiones en la sala:
        </Parrafo>
        <Lista
          items={[
            'Calentamiento: 10 minutos que eleven la temperatura y preparen el patrón del día antes de tocar carga.',
            'Técnica antes que carga: si la última repetición se ve igual que la primera, recién ahí subí peso.',
            'Espacio y aparato revisados: piso seco, barra firme, anillas/colchonetas en su lugar, nada suelto alrededor.',
            'Comunicación con el coach: avisá lesiones viejas, molestias y días de sueño malo antes de arrancar.',
          ]}
        />
        <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">
          Lesiones comunes
        </p>
        <Lista
          items={[
            'Hombro: por mala posición en el overhead y falta de movilidad. Prevención: progresiones de press y control del rango.',
            'Lumbar: por redondear la espalda en el hinge. Prevención: deadlift liviano con video, core estable antes de subir carga.',
            'Rodilla: por valgo en la sentadilla y saltos sin control. Prevención: air squat con mecánica primero, volumen de a poco.',
          ]}
        />
        <Advertencia>
          Este contenido es educativo y no reemplaza la valoración de un profesional de la
          salud. Ante dolor agudo, mareo o lesión, detené el entrenamiento y consultá.
        </Advertencia>
      </div>
    ),
  },
]

const ADVERTENCIA_COMUN =
  'Este contenido es educativo y no reemplaza la valoración de un profesional de la salud. Ante dolor agudo, mareo o lesión, detené el entrenamiento y consultá.'

export default function CrossfitMetodologia() {
  const [abiertos, setAbiertos] = useState<string[]>([CAPITULOS[0].id])

  const alternar = (id: string) => {
    setAbiertos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const abrirEIrir = (id: string) => {
    setAbiertos((prev) => (prev.includes(id) ? prev : [...prev, id]))
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <div className="space-y-4">
      <AltheaCard>
        <div className="space-y-3">
          <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">
            Manual educativo
          </p>
          <h2 className="font-headline text-lg font-semibold text-on-surface">
            Metodología y aprendizaje
          </h2>
          <p className="text-sm leading-relaxed text-on-surface-variant">
            Nueve capítulos para entender cómo se entrena, cómo progresar y cómo entrenar
            seguro. Leerlo una vez antes de arrancar te ahorra meses de idas y vueltas.
          </p>
          <nav aria-label="Índice de capítulos">
            <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant mb-2">
              Índice
            </p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {CAPITULOS.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => abrirEIrir(c.id)}
                    className="flex min-h-[44px] w-full items-center gap-2 rounded-lg border border-outline-variant px-3 text-left text-sm text-on-surface transition hover:border-primary/60"
                  >
                    <span className="font-label-caps text-[10px] uppercase tracking-widest text-on-surface-variant">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{c.titulo}</span>
                    <SemanticIcon name="chevron_right" size={16} className="shrink-0 text-[16px] text-on-surface-variant" ariaHidden />
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </AltheaCard>

      {CAPITULOS.map((c, i) => {
        const abierto = abiertos.includes(c.id)
        return (
          <AltheaCard key={c.id} padding="none">
            <h3>
              <button
                type="button"
                id={`${c.id}-btn`}
                aria-expanded={abierto}
                aria-controls={c.id}
                onClick={() => alternar(c.id)}
                className="flex min-h-[44px] w-full items-center gap-3 px-5 py-3.5 text-left"
              >
                <SemanticIcon name={c.icono} size={18} className="shrink-0 text-[18px] text-primary" ariaHidden />
                <span className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1 font-headline text-base font-semibold text-on-surface">
                  {c.titulo}
                </span>
                <SemanticIcon
                  name="expand_more"
                  size={18}
                  className={`shrink-0 text-[18px] text-on-surface-variant transition-transform ${abierto ? 'rotate-180' : ''}`}
                  ariaHidden
                />
              </button>
            </h3>
            <div
              id={c.id}
              role="region"
              aria-labelledby={`${c.id}-btn`}
              hidden={!abierto}
              className="border-t border-outline-variant px-5 py-4"
            >
              {c.contenido}
            </div>
          </AltheaCard>
        )
      })}

      <p className="text-center text-xs text-on-surface-variant">{ADVERTENCIA_COMUN}</p>
    </div>
  )
}
