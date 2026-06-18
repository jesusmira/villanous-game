import { createClient } from '@supabase/supabase-js';

// Cliente de Supabase para el navegador. Usa la publishable key (segura de exponer).
// El Storage público de imágenes no necesita este cliente (basta con assetUrl), pero
// queda listo para futuras funciones que sí consulten la base de datos.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
