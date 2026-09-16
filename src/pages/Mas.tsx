import { Link } from 'react-router-dom'
import { MAS_GROUPS } from '@/components/brand/icons'
import BrandIcon from '@/components/brand/BrandIcon'

export default function Mas(){
  const routineCount = JSON.parse(localStorage.getItem('rutinas:list')||'[]').length

  return (
    <div className="min-h-screen bg-transparent pb-24">
      {/* Hero Sub-Header */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-3 border-b border-outline-variant/40">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2 h-2 bg-secondary rotate-45" />
            <span className="font-label-caps text-[11px] text-secondary uppercase tracking-widest font-semibold">ARQUITECTURA DEL SISTEMA · CANON SOMÁTICO</span>
          </div>
          <h1 className="font-headline-lg text-[36px] text-on-surface tracking-tight leading-tight">Canon General &amp; Estructura del Templo</h1>
          <p className="text-on-surface-variant font-body-md text-[15px] mt-1 max-w-3xl">
            Acceso integral a los cuatro santuarios de la disciplina, el registro corporal y la sabiduría oracular.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start md:self-auto bg-surface-container stone-etch-border px-3.5 py-2 rounded">
          <span className="material-symbols-outlined text-secondary text-[20px]">shield</span>
          <div>
            <span className="block font-label-caps text-[10px] text-outline uppercase tracking-wider">Orden Dórico</span>
            <span className="text-xs font-semibold text-on-surface">Equilibrio Áureo</span>
          </div>
        </div>
      </section>

      {/* Metric Pillars Bento Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mt-5">
        <div className="bg-surface-container stone-etch-border p-4 rounded flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute right-2 -bottom-2 text-outline-variant/30 group-hover:text-primary/10 transition-colors pointer-events-none">
            <span className="material-symbols-outlined text-[64px]">menu_book</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-[11px] text-outline uppercase tracking-wider">BIBLIOTECA ACTIVA</span>
            <span className="text-[11px] font-mono text-secondary">CANON I</span>
          </div>
          <div className="mt-2.5">
            <p className="font-headline-md text-[24px] text-on-surface leading-none font-semibold">148</p>
            <p className="text-xs text-on-surface-variant mt-1">Ejercicios Canónicos Registrados</p>
          </div>
          <div className="mt-3 w-full bg-outline-variant/30 h-1 rounded-full overflow-hidden">
            <div className="bg-primary-container h-full w-[82%]" />
          </div>
        </div>

        <div className="bg-surface-container stone-etch-border p-4 rounded flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute right-2 -bottom-2 text-outline-variant/30 group-hover:text-secondary/10 transition-colors pointer-events-none">
            <span className="material-symbols-outlined text-[64px]">fitness_center</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-[11px] text-outline uppercase tracking-wider">PALAESTRA</span>
            <span className="text-[11px] font-mono text-secondary">CANON II</span>
          </div>
          <div className="mt-2.5">
            <p className="font-headline-md text-[24px] text-on-surface leading-none font-semibold">12</p>
            <p className="text-xs text-on-surface-variant mt-1">Microciclos Programados Activos</p>
          </div>
          <div className="mt-3 w-full bg-outline-variant/30 h-1 rounded-full overflow-hidden">
            <div className="bg-secondary h-full w-[65%]" />
          </div>
        </div>

        <div className="bg-surface-container stone-etch-border p-4 rounded flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute right-2 -bottom-2 text-outline-variant/30 group-hover:text-primary/10 transition-colors pointer-events-none">
            <span className="material-symbols-outlined text-[64px]">auto_graph</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-[11px] text-outline uppercase tracking-wider">FORJA SOMÁTICA</span>
            <span className="text-[11px] font-mono text-secondary">CANON III</span>
          </div>
          <div className="mt-2.5">
            <p className="font-headline-md text-[24px] text-primary leading-none font-semibold">94.2%</p>
            <p className="text-xs text-on-surface-variant mt-1">Adherencia de Arete en 90 Días</p>
          </div>
          <div className="mt-3 w-full bg-outline-variant/30 h-1 rounded-full overflow-hidden">
            <div className="bg-primary h-full w-[94%]" />
          </div>
        </div>

        <div className="bg-surface-container stone-etch-border p-4 rounded flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute right-2 -bottom-2 text-outline-variant/30 group-hover:text-secondary/10 transition-colors pointer-events-none">
            <span className="material-symbols-outlined text-[64px]">psychology</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-[11px] text-outline uppercase tracking-wider">ORÁCULO MENTOR</span>
            <span className="text-[11px] font-mono text-secondary">CANON IV</span>
          </div>
          <div className="mt-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
              <p className="font-title-md text-[16px] text-on-surface leading-none font-semibold">Voz de Sócrates</p>
            </div>
            <p className="text-xs text-on-surface-variant mt-1">Sabiduría Dialéctica Conectada</p>
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] text-outline font-mono">
            <span>LATENCIA: 18ms</span>
            <span className="text-secondary">DELFOS ONLINE</span>
          </div>
        </div>
      </section>

      {/* Four Sanctuary Cards — 2×2 Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5 pb-8">
        {/* SANTUARIO I: Biblioteca */}
        <div className="bg-surface-container stone-etch-border rounded flex flex-col justify-between stone-card-hover">
          <div className="p-5 border-b border-outline-variant/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-surface-container-lowest border border-outline-variant flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[24px]">local_library</span>
              </div>
              <div>
                <span className="font-label-caps text-[11px] text-secondary tracking-widest uppercase">SANTUARIO I</span>
                <h2 className="font-headline-sm text-[20px] text-on-surface font-semibold">Biblioteca: Enciclopedia Somática</h2>
              </div>
            </div>
            <span className="px-2 py-1 rounded bg-surface-container-lowest border border-outline-variant text-[11px] font-mono text-on-surface-variant">VOL. I-III</span>
          </div>
          <div className="p-5 flex flex-col gap-4">
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Archivo axiomático de patrones motores de los antiguos anfiteatros, clasificados con rigor biomecánico y especificidad regional.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link to="/biblioteca" className="bg-surface border border-outline-variant rounded p-3.5 flex flex-col justify-between hover:border-primary/40 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[18px]">format_list_bulleted</span>
                    <h3 className="font-title-md text-[14px] font-semibold text-on-surface">Catálogo de Ejercicios</h3>
                  </div>
                  <span className="bg-primary-container/40 text-primary px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold">MÍO</span>
                </div>
                <div className="mt-2 text-[11px] text-outline">148 variantes biomecánicas analizadas, ángulos de palanca y guías en vídeo.</div>
                <div className="mt-3 pt-2 border-t border-outline-variant/20 flex items-center justify-between text-[11px]">
                  <span className="text-secondary font-mono">148 Activos</span>
                  <span className="text-on-surface-variant flex items-center gap-1 hover:text-primary">Abrir <span className="material-symbols-outlined text-[14px]">arrow_forward</span></span>
                </div>
              </Link>
              <Link to="/biblioteca" className="bg-surface border border-outline-variant rounded p-3.5 flex flex-col justify-between hover:border-primary/40 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary text-[18px]">accessibility_new</span>
                    <h3 className="font-title-md text-[14px] font-semibold text-on-surface">Atlas de Músculos</h3>
                  </div>
                  <span className="bg-surface-container border border-outline-variant text-secondary px-1.5 py-0.5 rounded text-[10px] font-mono">ANATOMÍA</span>
                </div>
                <div className="mt-2 text-[11px] text-outline">Visor tridimensional de deltoides, pectorales, dorsales y cuádriceps con foco en hipertrofia.</div>
                <div className="mt-3 pt-2 border-t border-outline-variant/20 flex items-center justify-between text-[11px]">
                  <span className="text-on-surface-variant font-mono">18 Grupos Clave</span>
                  <span className="text-on-surface-variant flex items-center gap-1 hover:text-primary">Mapa <span className="material-symbols-outlined text-[14px]">arrow_forward</span></span>
                </div>
              </Link>
            </div>
            <div className="p-3 bg-surface border border-outline-variant rounded flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-secondary text-[20px]">architecture</span>
                <div>
                  <p className="text-xs font-semibold text-on-surface">Densidad del Canon Motor</p>
                  <p className="text-[11px] text-outline">Complejidad y reclutamiento miofibrilar</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-4 h-2 rounded-sm bg-primary-container" />
                <span className="w-4 h-2 rounded-sm bg-primary-container" />
                <span className="w-4 h-2 rounded-sm bg-primary-container" />
                <span className="w-4 h-2 rounded-sm bg-secondary" />
                <span className="w-4 h-2 rounded-sm bg-outline-variant/30" />
              </div>
            </div>
          </div>
          <div className="p-5 border-t border-outline-variant/30 bg-surface-container-low/50 flex items-center justify-between">
            <span className="font-label-caps text-[11px] text-outline">ÍNDICE HERMÉTICO DISPONIBLE</span>
            <Link to="/biblioteca" className="bg-surface-container border border-secondary/40 text-secondary px-4 py-2 rounded text-xs font-semibold hover:bg-surface-container-high transition-all flex items-center gap-2 active:scale-[0.98]">
              <span>Explorar Biblioteca Sagrada</span>
              <span className="material-symbols-outlined text-[16px]">north_east</span>
            </Link>
          </div>
        </div>

        {/* SANTUARIO II: Entrenamiento */}
        <div className="bg-surface-container stone-etch-border rounded flex flex-col justify-between stone-card-hover">
          <div className="p-5 border-b border-outline-variant/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-surface-container-lowest border border-outline-variant flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[24px]">sports_martial_arts</span>
              </div>
              <div>
                <span className="font-label-caps text-[11px] text-secondary tracking-widest uppercase">SANTUARIO II</span>
                <h2 className="font-headline-sm text-[20px] text-on-surface font-semibold">Entrenamiento: Palaestra de Arete</h2>
              </div>
            </div>
            <span className="px-2 py-1 rounded bg-surface-container-lowest border border-outline-variant text-[11px] font-mono text-primary">FASE III</span>
          </div>
          <div className="p-5 flex flex-col gap-4">
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Programación sistemática de sobrecarga progresiva, microciclos y monitorización del sistema nervioso autónomo.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link to="/rutina" className="bg-surface border border-outline-variant rounded p-3 flex flex-col justify-between hover:border-primary/40 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="material-symbols-outlined text-primary text-[18px]">fitness_center</span>
                  <span className="text-[9px] font-mono text-secondary">RUTINAS</span>
                </div>
                <div className="my-2">
                  <p className="text-xs font-semibold text-on-surface">Fuerza Dórica</p>
                  <p className="text-[10px] text-outline mt-0.5">Hipertrofia Olímpica 4x</p>
                </div>
                <div className="w-full bg-outline-variant/30 h-1 rounded overflow-hidden">
                  <div className="bg-primary-container h-full w-[70%]" />
                </div>
              </Link>
              <Link to="/calendario" className="bg-surface border border-outline-variant rounded p-3 flex flex-col justify-between hover:border-primary/40 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="material-symbols-outlined text-secondary text-[18px]">calendar_month</span>
                  <span className="text-[9px] font-mono text-outline">HISTORIAL</span>
                </div>
                <div className="my-2">
                  <p className="text-xs font-semibold text-on-surface">Greca 3x3</p>
                  <p className="text-[10px] text-outline mt-0.5">Frecuencia semanal: 5 d</p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  <span className="w-2 h-2 rounded-full bg-outline-variant" />
                </div>
              </Link>
              <Link to="/recuperacion" className="bg-surface border border-outline-variant rounded p-3 flex flex-col justify-between hover:border-primary/40 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="material-symbols-outlined text-primary text-[18px]">bedtime</span>
                  <span className="text-[9px] font-mono text-primary">SNA</span>
                </div>
                <div className="my-2">
                  <p className="text-xs font-semibold text-on-surface">Índice VFC: 78</p>
                  <p className="text-[10px] text-outline mt-0.5">Descanso Reparador</p>
                </div>
                <span className="text-[9px] font-mono text-secondary">ÓPTIMO PARA CARGA</span>
              </Link>
            </div>
            <div className="p-3 bg-surface border border-outline-variant rounded flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[18px]">repeat</span>
                <span className="text-xs text-on-surface">Sobrecarga Semanal Ejecutada</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-primary font-semibold">18 / 22 Series</span>
                <div className="w-24 bg-outline-variant/30 h-2 rounded overflow-hidden flex">
                  <div className="bg-primary-container h-full w-[70%]" />
                  <div className="bg-secondary h-full w-[15%]" />
                </div>
              </div>
            </div>
          </div>
          <div className="p-5 border-t border-outline-variant/30 bg-surface-container-low/50 flex items-center justify-between">
            <span className="font-label-caps text-[11px] text-outline">CRONOGRAMA ACTIVO: SEMANA 3</span>
            <Link to="/rutina" className="bg-primary-container border border-primary/30 text-on-primary-container px-4 py-2 rounded text-xs font-semibold hover:bg-primary-container/80 transition-all flex items-center gap-2 active:scale-[0.98]">
              <span>Gestionar Rutinas Activas</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Link>
          </div>
        </div>

        {/* SANTUARIO III: Salud & Progreso */}
        <div className="bg-surface-container stone-etch-border rounded flex flex-col justify-between stone-card-hover">
          <div className="p-5 border-b border-outline-variant/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-surface-container-lowest border border-outline-variant flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[24px]">monitor_weight</span>
              </div>
              <div>
                <span className="font-label-caps text-[11px] text-secondary tracking-widest uppercase">SANTUARIO III</span>
                <h2 className="font-headline-sm text-[20px] text-on-surface font-semibold">Salud &amp; Progreso: Forja &amp; Néctar</h2>
              </div>
            </div>
            <span className="px-2 py-1 rounded bg-surface-container-lowest border border-outline-variant text-[11px] font-mono text-secondary">METRIC-LOG</span>
          </div>
          <div className="p-5 flex flex-col gap-4">
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Consagración del combustible somático y registro inalterable de tonelaje, peso y récords sagrados de fuerza.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link to="/nutricion" className="bg-surface border border-outline-variant rounded p-3.5 flex flex-col justify-between hover:border-primary/40 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary text-[18px]">nutrition</span>
                    <h3 className="font-title-md text-[14px] font-semibold text-on-surface">Néctar &amp; Macros</h3>
                  </div>
                  <span className="text-[10px] font-mono text-primary">TDEE 2,850</span>
                </div>
                <div className="my-2.5 flex items-center justify-between text-[11px]">
                  <div><span className="text-outline block">Proteína</span><span className="text-on-surface font-semibold font-mono">195g</span></div>
                  <div><span className="text-outline block">Carbos</span><span className="text-on-surface font-semibold font-mono">310g</span></div>
                  <div><span className="text-outline block">Lípidos</span><span className="text-on-surface font-semibold font-mono">75g</span></div>
                </div>
                <div className="pt-2 border-t border-outline-variant/20 flex items-center justify-between text-[10px]">
                  <span className="text-outline flex items-center gap-1"><span className="material-symbols-outlined text-secondary text-[14px]">water_drop</span>Ánforas (3.5L):</span>
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-secondary" />
                    <span className="w-2.5 h-2.5 rounded-full bg-secondary" />
                    <span className="w-2.5 h-2.5 rounded-full bg-secondary" />
                    <span className="w-2.5 h-2.5 rounded-full bg-secondary/30" />
                  </div>
                </div>
              </Link>
              <Link to="/progreso" className="bg-surface border border-outline-variant rounded p-3.5 flex flex-col justify-between hover:border-primary/40 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[18px]">military_tech</span>
                    <h3 className="font-title-md text-[14px] font-semibold text-on-surface">Récords &amp; Tonelaje</h3>
                  </div>
                  <span className="text-[10px] font-mono text-secondary">TOP 1RM</span>
                </div>
                <div className="my-2 text-[11px] text-outline">
                  <div className="flex justify-between py-0.5"><span>Sentadilla Olímpica:</span><span className="text-on-surface font-mono font-semibold">185 kg</span></div>
                  <div className="flex justify-between py-0.5"><span>Press Militar Dórico:</span><span className="text-on-surface font-mono font-semibold">92 kg</span></div>
                </div>
                <div className="pt-2 border-t border-outline-variant/20 flex items-center justify-between text-[10px]">
                  <span className="text-outline">Carga 90d:</span>
                  <span className="text-primary font-mono font-semibold">42.8 Toneladas</span>
                </div>
              </Link>
            </div>
            <div className="p-3 bg-surface border border-outline-variant rounded flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[18px]">timeline</span>
                <span className="text-xs text-on-surface">Evolución Somática (90 días)</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-outline">IMC Áureo: <span className="text-on-surface font-mono font-semibold">23.4</span></span>
                <span className="text-primary font-mono font-semibold">+1.8 kg Masa Magra</span>
              </div>
            </div>
          </div>
          <div className="p-5 border-t border-outline-variant/30 bg-surface-container-low/50 flex items-center justify-between">
            <span className="font-label-caps text-[11px] text-outline">MAPA DE CALOR: AL DÍA</span>
            <Link to="/progreso" className="bg-surface-container border border-outline-variant text-on-surface px-4 py-2 rounded text-xs font-semibold hover:border-secondary transition-all flex items-center gap-2 active:scale-[0.98]">
              <span>Ver Análisis Somático</span>
              <span className="material-symbols-outlined text-[16px]">trending_up</span>
            </Link>
          </div>
        </div>

        {/* SANTUARIO IV: Persona */}
        <div className="bg-surface-container stone-etch-border rounded flex flex-col justify-between stone-card-hover">
          <div className="p-5 border-b border-outline-variant/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-surface-container-lowest border border-outline-variant flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[24px]">psychology</span>
              </div>
              <div>
                <span className="font-label-caps text-[11px] text-secondary tracking-widest uppercase">SANTUARIO IV</span>
                <h2 className="font-headline-sm text-[20px] text-on-surface font-semibold">Persona: El Mentor &amp; El Atleta</h2>
              </div>
            </div>
            <span className="px-2 py-1 rounded bg-surface-container-lowest border border-outline-variant text-[11px] font-mono text-primary">ORACLE AI</span>
          </div>
          <div className="p-5 flex flex-col gap-4">
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Diálogo constante con el Mentor Filosófico, custodia de identidad somática y soberanía offline del atleta.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link to="/coach" className="bg-surface border border-outline-variant rounded p-3.5 flex flex-col justify-between hover:border-primary/40 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary text-[18px]">chat_bubble</span>
                    <h3 className="font-title-md text-[14px] font-semibold text-on-surface">Oráculo de Delfos</h3>
                  </div>
                  <span className="bg-surface-container border border-outline-variant text-secondary text-[9px] px-1.5 py-0.5 rounded font-mono">SÓCRATES</span>
                </div>
                <div className="my-2 text-[11px] text-on-surface-variant italic">"Conócete a ti mismo a través del esfuerzo bajo la barra de hierro."</div>
                <div className="pt-2 border-t border-outline-variant/20 flex items-center justify-between text-[11px]">
                  <span className="text-outline">Modos: Arnold / Sócrates</span>
                  <span className="text-secondary font-mono">3 Consultas</span>
                </div>
              </Link>
              <Link to="/perfil" className="bg-surface border border-outline-variant rounded p-3.5 flex flex-col justify-between hover:border-primary/40 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[18px]">badge</span>
                    <h3 className="font-title-md text-[14px] font-semibold text-on-surface">Custodia &amp; Perfil</h3>
                  </div>
                  <span className="bg-primary-container/30 text-primary text-[9px] px-1.5 py-0.5 rounded font-mono">OFFLINE-1ST</span>
                </div>
                <div className="my-2 text-[11px] text-outline">
                  <div className="flex justify-between py-0.5"><span>Estatura / Masa:</span><span className="text-on-surface font-mono font-semibold">182 cm / 84 kg</span></div>
                  <div className="flex justify-between py-0.5"><span>Gong de Bronce:</span><span className="text-secondary font-semibold">Activado</span></div>
                </div>
                <div className="pt-2 border-t border-outline-variant/20 flex items-center justify-between text-[11px]">
                  <span className="text-outline">Respaldo Local:</span>
                  <span className="text-primary font-mono font-semibold">100% Protegido</span>
                </div>
              </Link>
            </div>
            <div className="p-3 bg-surface border border-outline-variant rounded flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-outline text-[18px]">tune</span>
                <span className="text-on-surface">Preferencia Acústica: Gong Sacro al completar serie</span>
              </div>
              <div className="w-8 h-4 bg-primary-container rounded-full p-0.5 flex items-center justify-end cursor-pointer">
                <span className="w-3 h-3 rounded-full bg-white" />
              </div>
            </div>
          </div>
          <div className="p-5 border-t border-outline-variant/30 bg-surface-container-low/50 flex items-center justify-between">
            <span className="font-label-caps text-[11px] text-outline">DIALÉCTICA DISPONIBLE</span>
            <Link to="/coach" className="bg-surface-container border border-secondary/40 text-secondary px-4 py-2 rounded text-xs font-semibold hover:bg-surface-container-high transition-all flex items-center gap-2 active:scale-[0.98]">
              <span className="material-symbols-outlined text-[16px]">forum</span>
              <span>Consultar al Oráculo</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
