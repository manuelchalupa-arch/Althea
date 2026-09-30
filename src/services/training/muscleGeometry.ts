// GEOMETRÍA DEL MAPA MUSCULAR — paths SVG por músculo, desacoplados de datos.
//
// viewBox "0 0 120 200". El cuerpo es simétrico respecto de x=60: cada músculo
// se dibuja UNA sola vez en su mitad derecha y se refleja con
// translate(120,0) scale(-1,1), de modo que izquierda/derecha siempre coinciden.
// El silueto también se construye con mitades espejadas (misma razón).

export type MusclePathView = 'front' | 'back'

export interface MuscleShape {
  /** data-muscle-id del grupo SVG. */
  id: string
  /** Paths en coordenadas de la mitad derecha (x >= 60). Se dibujan + espejo. */
  paths: string[]
}

/** Silueto del cuerpo, mitad derecha, por vista. */
export const SILHOUETTE: Record<MusclePathView, string[]> = {
  front: [
    // cráneo (media derecha)
    'M60 8 C65 8 69 13 69 20 C69 26 66 31 62 32 L60 32 Z',
    // cuello
    'M60 30 L64 30 L65 40 L60 40 Z',
    // tronco: hombro → pectoral → cintura → cadera
    'M60 38 C71 39 81 44 84 54 C86 66 85 78 83 88 C82 98 81 106 81 114 L60 114 Z',
    // brazo superior
    'M78 48 C85 50 89 57 89 66 C89 76 88 86 87 95 L79 95 C78 85 78 73 78 62 Z',
    // antebrazo
    'M78 95 C84 96 86 103 85 111 C84 120 83 127 82 133 L75 133 C75 124 75 112 76 103 Z',
    // mano
    'M76 133 C81 134 83 140 82 146 C81 151 76 153 74 149 C72 143 72 137 76 133 Z',
    // muslo
    'M60 112 C71 113 78 119 79 132 C80 144 79 154 78 162 L64 162 C63 150 62 138 61 130 Z',
    // pantorrilla
    'M64 164 C72 165 75 172 74 181 C73 189 72 194 71 198 L64 198 C63 190 63 178 64 171 Z',
    // pie
    'M63 195 L73 195 L76 199 L62 199 Z',
  ],
  back: [
    'M60 8 C65 8 69 13 69 20 C69 26 66 31 62 32 L60 32 Z',
    'M60 30 L64 30 L65 40 L60 40 Z',
    'M60 38 C71 39 81 44 84 54 C86 66 85 78 83 88 C82 98 81 106 81 114 L60 114 Z',
    'M78 48 C85 50 89 57 89 66 C89 76 88 86 87 95 L79 95 C78 85 78 73 78 62 Z',
    'M78 95 C84 96 86 103 85 111 C84 120 83 127 82 133 L75 133 C75 124 75 112 76 103 Z',
    'M76 133 C81 134 83 140 82 146 C81 151 76 153 74 149 C72 143 72 137 76 133 Z',
    'M60 112 C71 113 78 119 79 132 C80 144 79 154 78 162 L64 162 C63 150 62 138 61 130 Z',
    'M64 164 C72 165 75 172 74 181 C73 189 72 194 71 198 L64 198 C63 190 63 178 64 171 Z',
    'M63 195 L73 195 L76 199 L62 199 Z',
  ],
}

/** Detalle no interactivo: abdomen (línea alba + oblicuos guiñados). */
export const TORSO_DETAIL = [
  'M60 62 L60 108',
  'M60 74 C66 75 71 77 74 80',
  'M60 88 C66 89 70 91 73 94',
]

export const MUSCLE_SHAPES: Record<MusclePathView, MuscleShape[]> = {
  front: [
    {
      id: 'pectoralis-major',
      paths: ['M60 54 C69 54 77 57 80 62 C82 68 80 74 75 77 C69 80 64 80 60 78 Z'],
    },
    {
      id: 'anterior-deltoid',
      paths: ['M76 46 C80 47 83 53 83 62 C83 69 81 73 78 73 C75 72 74 68 74 62 C74 54 74 48 76 46 Z'],
    },
    {
      id: 'lateral-deltoid',
      paths: ['M82 47 C87 49 90 55 90 63 C90 70 87 74 83 74 C81 73 80 70 80 63 C80 55 80 49 82 47 Z'],
    },
    {
      id: 'biceps-brachii',
      paths: ['M80 66 C85 68 87 74 87 82 C87 89 86 94 85 98 L80 98 C79 90 79 78 80 70 Z'],
    },
    {
      id: 'forearm-flexors',
      paths: ['M78 99 C83 101 85 107 84 115 C83 123 82 128 81 133 L76 133 C75 125 75 113 77 104 Z'],
    },
    {
      id: 'rectus-abdominis',
      paths: ['M60 79 C66 79 71 82 73 87 C75 94 75 102 74 109 L60 109 Z'],
    },
    {
      id: 'obliquus-externus',
      paths: ['M74 87 C77 90 78 96 78 103 C78 109 77 113 76 116 L72 114 C73 106 73 96 72 90 Z'],
    },
    {
      id: 'quadriceps',
      paths: ['M63 118 C72 119 77 126 78 138 C78 148 77 156 76 163 L67 163 C66 153 65 140 64 130 Z'],
    },
    {
      id: 'adductors',
      paths: ['M60 118 C64 119 67 125 68 135 C68 143 67 149 66 154 L61 154 C60 145 60 132 60 122 Z'],
    },
    {
      id: 'tibialis-anterior',
      paths: ['M65 167 C71 168 74 174 73 182 C72 189 71 194 70 198 L65 198 C64 190 64 179 65 172 Z'],
    },
  ],
  back: [
    {
      id: 'trapezius',
      paths: ['M60 41 C69 42 77 47 81 55 C75 59 67 61 60 61 Z'],
    },
    {
      id: 'latissimus-dorsi',
      paths: ['M60 63 C69 63 77 68 80 77 C81 87 79 96 76 103 C71 107 65 107 60 104 Z'],
    },
    {
      id: 'rhomboids',
      paths: ['M61 59 C68 60 73 63 75 68 C72 71 67 72 63 71 C61 67 60 63 61 59 Z'],
    },
    {
      id: 'spinal-erectors',
      paths: ['M60 64 L67 66 C68 78 68 94 67 106 L60 106 Z'],
    },
    {
      id: 'posterior-deltoid',
      paths: ['M76 46 C80 47 83 53 83 62 C83 69 81 73 78 73 C75 72 74 68 74 62 C74 54 74 48 76 46 Z'],
    },
    {
      id: 'triceps-brachii',
      paths: ['M80 66 C85 68 87 74 87 82 C87 89 86 94 85 98 L80 98 C79 90 79 78 80 70 Z'],
    },
    {
      id: 'forearm-extensors',
      paths: ['M78 99 C83 101 85 107 84 115 C83 123 82 128 81 133 L76 133 C75 125 75 113 77 104 Z'],
    },
    {
      id: 'gluteus-maximus',
      paths: ['M60 113 C71 114 78 121 78 132 C78 141 73 147 66 148 C62 148 60 145 60 141 Z'],
    },
    {
      id: 'hamstrings',
      paths: ['M62 136 C72 137 77 144 77 154 C77 162 76 168 75 172 L65 172 C64 163 63 150 62 143 Z'],
    },
    {
      id: 'gastrocnemius',
      paths: ['M65 172 C72 173 75 179 74 187 C73 193 72 196 71 198 L65 198 C64 191 64 180 65 175 Z'],
    },
  ],
}

export const MIRROR_TRANSFORM = 'translate(120,0) scale(-1,1)'
