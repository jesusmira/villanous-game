// Construye la URL pública de un asset en el Storage de Supabase (bucket `game-images`).
// El `path` es la ruta dentro del bucket, p.ej. 'cards/jhon/villano/sherif.webp' o 'boards/jhon.webp'.
const BASE = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/game-images`;

export const assetUrl = (path: string): string => `${BASE}/${path}`;
