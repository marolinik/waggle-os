/**
 * HiveIcon — Theme-aware brand icon component.
 * Renders hex-themed icon images from /brand/icon-{name}-{dark|light}.jpeg
 */

import { useTheme } from '@waggle/ui';

interface HiveIconProps {
  name: string;
  size?: number;
  className?: string;
}

export function HiveIcon({ name, size = 24, className = '' }: HiveIconProps) {
  const { theme } = useTheme();
  const variant = theme === 'light' ? 'light' : 'dark';
  return (
    <img
      src={`/brand/icon-${name}-${variant}.jpeg`}
      width={size}
      height={size}
      className={`inline-block shrink-0 ${className}`}
      alt=""
      draggable={false}
    />
  );
}

/**
 * BeeImage — Theme-aware bee mascot image.
 * Renders from /brand/bee-{role}-{dark|light}.png
 *
 * Available roles: architect, researcher, writer, analyst, builder,
 * connector, marketer, hunter, orchestrator, confused, sleeping, celebrating, team
 */
interface BeeImageProps {
  role: string;
  className?: string;
}

export function BeeImage({ role, className = '' }: BeeImageProps) {
  const { theme } = useTheme();
  const variant = theme === 'light' ? 'light' : 'dark';
  return (
    <img
      src={`/brand/bee-${role}-${variant}.png`}
      className={className}
      alt=""
      draggable={false}
    />
  );
}

/**
 * HiveLogo — Theme-aware logo.
 * Dark: /brand/logo.jpeg, Light: /brand/logo-light.jpeg
 */
interface HiveLogoProps {
  height?: number;
  className?: string;
}

export function HiveLogo({ height = 40, className = '' }: HiveLogoProps) {
  const { theme } = useTheme();
  const src = theme === 'light' ? '/brand/logo-light.jpeg' : '/brand/logo.jpeg';
  return (
    <img
      src={src}
      height={height}
      className={`inline-block shrink-0 ${className}`}
      alt="Waggle"
      draggable={false}
      style={{ height: `${height}px`, width: 'auto' }}
    />
  );
}
