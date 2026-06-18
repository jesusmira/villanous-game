# Villanos

Implementación digital del juego de mesa **Disney Villainous** en React + TypeScript. Cada
jugador controla a un villano con su propio tablero, mazo y condición de victoria, e intenta
cumplir su objetivo antes que el rival. Soporta **1 vs 1 local** y **partida contra la IA**.

## Villanos disponibles

| Villano | Objetivo de victoria |
|---|---|
| **Maléfica** | Cubrir cada ubicación de su Reino con al menos una Maldición. |
| **Capitán Garfio** | Encontrar a Peter Pan, desbloquear el Árbol del Ahorcado y derrotarlo en el Jolly Roger. |
| **Príncipe Juan** | Empezar su turno con al menos 20 Monedas de Poder. |

## Stack

- **React 19** + **TypeScript** (flags estrictos: `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`)
- **Vite** (dev server + build)
- **Zustand** (estado global)
- **Tailwind CSS v4**
- **Supabase Storage** (imágenes) + **PWA / Service Worker** (caché offline)
- **Vitest** (tests)

## Puesta en marcha

Requisitos: **Node.js 20+** (lo exige Vite 8).

```bash
npm install

# Variables de entorno (Supabase)
cp .env.example .env.local   # rellena VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY

npm run dev                  # http://localhost:5173
```

`.env.local` está gitignored. La clave `SUPABASE_SERVICE_ROLE_KEY` solo la necesita el script de
subida de imágenes (acceso privilegiado) y **nunca** se commitea.

## Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo con HMR. |
| `npm run build` | Type-check (`tsc -b`) + bundle de producción. Es la comprobación principal de correctitud. |
| `npm run preview` | Sirve el build de producción (necesario para probar el Service Worker). |
| `npm run lint` | ESLint. |
| `npm run test` | Suite de Vitest (59 tests). |
| `npm run images:upload [villano]` | Optimiza a WebP y sube las imágenes de `assets-src/` a Supabase. Sin argumento sube todo; con un id de villano, solo las suyas. |

## Arquitectura

Separación estricta **lógica / UI**:

- **`src/core/`** — TypeScript puro, **cero imports de React**. Funciones deterministas
  `GameState → GameState`. Aquí viven el motor de reglas, el motor de efectos, la IA y los villanos.
- **`src/components/` + `src/state/`** — toda la capa React. El store de Zustand
  (`gameStore.ts`) orquesta las acciones y ejecuta la IA tras los turnos.

`GameState` es **inmutable**: cada función del motor devuelve un estado nuevo.

### Sistema de plugins de villano

Cada villano vive en `src/core/villains/<id>/` y exporta un `VillainPlugin` (ubicaciones,
definiciones de cartas, efectos, condición de victoria y heurísticas de IA). Se auto-registra en
`registry.ts`. Los efectos siguen un patrón Strategy con un `trigger` (`ON_PLAY`, `ACTIVATED`,
`CONTINUOUS`, …) y una función `execute`.

> Para el detalle profundo de la arquitectura (fases de turno, modelo de estado, sistema de
> efectos, IA) consulta **[CLAUDE.md](CLAUDE.md)**.

### Estructura de `src/`

```
src/
├─ core/                  # Lógica pura (sin React)
│  ├─ engine/             # Motor de juego, reglas, efectos, helpers de estado
│  ├─ villains/           # Un plugin por villano (hook, jhon, maleficent) + registry
│  ├─ ai/                 # Jugador IA y heurísticas de puntuación
│  └─ utils/
├─ components/            # UI de React (+ shared/)
├─ state/                 # Store de Zustand
├─ lib/                   # Cliente Supabase, assetUrl, precarga de imágenes
├─ hooks/  styles/  tests/
```

## Imágenes y Storage

Las imágenes se sirven desde **Supabase Storage** (bucket público `game-images`), no desde el
repositorio. La URL se construye con `assetUrl(path)` ([src/lib/assets.ts](src/lib/assets.ts)).

**Pipeline de optimización** — los PNG en crudo van a `assets-src/` (carpeta de staging,
gitignored, no servida por Vite). El script [scripts/optimize-upload.ts](scripts/optimize-upload.ts)
los convierte a **WebP** (cartas q90; tableros y retratos redimensionados) y los sube al bucket.

**Caché en 3 capas** para no releer de Supabase:
1. `cacheControl: immutable` en los objetos (lo aprovecha el Smart CDN en plan Pro).
2. **Precarga en memoria** al iniciar partida ([src/lib/preload.ts](src/lib/preload.ts)): calienta
   solo los villanos en juego.
3. **Service Worker** (vite-plugin-pwa, CacheFirst): sirve las imágenes desde disco entre recargas
   e incluso offline. La app es instalable como PWA. *Solo activo en build de producción.*

## Añadir un villano nuevo

1. Crear `src/core/villains/<id>/` exportando un `VillainPlugin` (cartas con `imageFile`, efectos,
   condición de victoria, heurísticas de IA).
2. Importarlo y registrarlo en `src/core/villains/registry.ts`.
3. Añadir `<id>` al union `VillainId` en `src/core/types.ts`.
4. Dejar sus imágenes en `assets-src/cards/<id>/`, `assets-src/boards/<id>.png`,
   `assets-src/villains/<id>.png` y ejecutar `npm run images:upload <id>`.

Los componentes resuelven las URLs solos vía `assetUrl(...)`: no hay que tocar UI.

## Tests

Suite de **Vitest** (59 tests) sobre la lógica del `core/`: acciones de juego (ganar poder, mover,
jugar carta, robar, vencer) y mecánicas específicas de villano. Ejecútala con `npm run test`.

## Licencia y aviso legal

Proyecto **fan no oficial**, sin ánimo de lucro y con fines **personales y educativos**. No está
afiliado, patrocinado ni respaldado por Disney ni por Ravensburger.

*Disney Villainous*, sus villanos, personajes, ilustraciones y demás material son **propiedad
intelectual de The Walt Disney Company y Ravensburger**. Todos los derechos sobre dicha IP
pertenecen a sus respectivos titulares. Este repositorio no concede ningún derecho sobre ese
contenido y no debe usarse con fines comerciales.
