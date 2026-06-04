---
name: Vile Majesty
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#cbc4cf'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#948e99'
  outline-variant: '#49454e'
  surface-tint: '#d3bcf9'
  primary: '#d3bcf9'
  on-primary: '#382759'
  primary-container: '#2d1b4d'
  on-primary-container: '#9783bc'
  inverse-primary: '#68558a'
  secondary: '#f8ffec'
  on-secondary: '#153800'
  secondary-container: '#75fd00'
  on-secondary-container: '#307000'
  tertiary: '#e9c349'
  on-tertiary: '#3c2f00'
  tertiary-container: '#cca830'
  on-tertiary-container: '#4f3e00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ebdcff'
  primary-fixed-dim: '#d3bcf9'
  on-primary-fixed: '#231043'
  on-primary-fixed-variant: '#4f3d71'
  secondary-fixed: '#80ff2c'
  secondary-fixed-dim: '#67e100'
  on-secondary-fixed: '#092100'
  on-secondary-fixed-variant: '#215100'
  tertiary-fixed: '#ffe088'
  tertiary-fixed-dim: '#e9c349'
  on-tertiary-fixed: '#241a00'
  on-tertiary-fixed-variant: '#574500'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  display-title:
    fontFamily: Libre Caslon Text
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Libre Caslon Text
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Libre Caslon Text
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  card-title:
    fontFamily: Libre Caslon Text
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 24px
  body-md:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  stats-num:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 18px
    letterSpacing: 0.05em
  label-caps:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.1em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  card-gap: 1rem
  section-margin: 2rem
  realm-padding: 3rem
  gutter: 1.5rem
---

## Brand & Style
The design system is crafted for a high-stakes digital adaptation of the Disney Villainous board game. The brand personality is unapologetically wicked, sophisticated, and theatrical. It balances the nostalgia of classic storytelling with the sharpness of modern strategy gaming.

The visual style is **Luxurious Dark-Mode**. It utilizes deep, atmospheric layering, tactile textures (parchment and wood), and high-contrast accents to evoke a sense of power and mystery. Elements should feel like they belong in a villain's private sanctum—heavy, expensive, and slightly dangerous. Interactive states are marked by "ethereal" glows, suggesting magical or alchemical energy.

## Colors
The palette is dominated by **Deep Villainous Purple** for primary surfaces and **Deep Black** for the void-like background containers. 

- **Acid Green** is reserved strictly for high-action highlights, active turn indicators, and "Power" currency. 
- **Burnished Gold** serves as the structural accent, used for filigree, borders, and premium UI dividers. 
- **Blood Red** is the functional color for "Fate" actions—anything representing an opponent's interference or a setback.
- **Background Textures**: Use a dark, desaturated parchment grain for card faces and a polished dark wood texture for the main game board (the "Realm").

## Typography
The typography strategy creates a "Narrative vs. System" hierarchy. 

**Libre Caslon Text** provides the editorial, storybook weight required for character names, card titles, and major headings. It should feel authoritative and classic.

**Manrope** is used for all long-form card descriptions and rules text to ensure maximum legibility against dark, textured backgrounds.

**Space Grotesk** is used for technical data, power costs, and UI labels. Its slightly geometric, modern edge differentiates "game mechanics" from "game flavor," helping players parse stats quickly during intense play.

## Layout & Spacing
The layout follows a **Fixed Grid** philosophy to mimic the physical board game experience. The "Realm" is a horizontal scrollable track of four distinct locations. 

- **The Realm**: A central stage with 24px gutters between locations.
- **The Hand**: A persistent overlay at the bottom of the screen, using overlapping card logic to save space until hovered.
- **The Fate Deck**: Positioned top-right, isolated to signify its threat.
- **Safe Areas**: Use a 48px outer margin to prevent the ornate filigree from feeling cramped against the screen edges.

## Elevation & Depth
Depth is achieved through **Tonal Layering and Inner Glows** rather than traditional drop shadows.

- **Base Layer**: Dark wood grain (The Realm).
- **Secondary Layer**: Deep Purple containers with 1px Burnished Gold inner strokes.
- **Active Layer**: Elements currently in use or being played gain an **Acid Green outer glow** (blur: 15px, spread: 2px) to simulate magical energy.
- **Fate Layer**: Fate cards and actions use a **Blood Red inner shadow** to indicate their negative impact on the player.
- **Modals**: Use a high-density backdrop blur (20px) to desaturate the game board behind the active UI element.

## Shapes
This design system uses **Rounded** corners to balance the "sharpness" of the villains with the premium feel of a high-end product. 

Standard cards and UI panels use a 0.5rem (8px) base radius. Large "Location" panels in the Realm use a 1rem (16px) radius. To emphasize the luxury aesthetic, incorporate **Gold Filigree** as "corner caps" on major containers—these are ornamental vector overlays that sit on top of the rounded corners of the card art.

## Components
- **Villain Cards**: Modular units with a 1px Gold border. The top half contains character art, the bottom half contains rules text on a dark parchment background. 
- **Action Icons**: Circular tokens with a subtle "stamped" metallic effect. When an action is "locked," it should appear greyed out with a subtle wooden texture overlay.
- **Primary Buttons**: Rectangular with slightly tapered ends, filled with Deep Purple, and featuring a 2px Acid Green bottom border.
- **Power Counter**: A custom circular component in the bottom-left. It should glow with Acid Green when the player gains power.
- **Fate Cards**: Distinctive white or light-grey parchment faces (to contrast with the player's dark cards), featuring a Blood Red border.
- **Lists/Menus**: Use thin Gold dividers (0.5px) between items, with a hover state that highlights the entire row in a low-opacity Purple tint.