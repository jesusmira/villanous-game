import { useState } from 'react';

interface Props {
  src: string;
  alt?: string;
  className?: string;
}

/**
 * React-controlled image.
 * Uses state (not DOM mutation) for error handling.
 * Resets on src change so reused instances always try to load the new image.
 */
export function Image({ src, alt = '', className }: Props) {
  const [failed, setFailed] = useState(false);

  // Reset cuando cambia src — crítico porque las instancias de CardComponent se reusan.
  // Ajustado durante el render (en vez de un useEffect) para evitar un commit con el error viejo.
  const [prevSrc, setPrevSrc] = useState(src);
  if (prevSrc !== src) {
    setPrevSrc(src);
    setFailed(false);
  }

  if (failed) return null;

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
