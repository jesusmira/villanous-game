import { useState, useEffect } from 'react';

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

  // Reset when src changes — critical when CardComponent instance is reused
  useEffect(() => {
    setFailed(false);
  }, [src]);

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
