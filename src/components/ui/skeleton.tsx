import LibSkeleton, {
  SkeletonTheme,
  type SkeletonProps as LibSkeletonProps,
} from "react-loading-skeleton";
import { cn } from "@/lib/utils";

export type SkeletonProps = LibSkeletonProps;

/** Обёртка над react-loading-skeleton; base/highlight из CSS-токенов темы. */
function Skeleton({
  className,
  containerClassName,
  borderRadius = "0.375rem",
  baseColor = "var(--muted)",
  highlightColor = "color-mix(in srgb, var(--muted-foreground) 28%, var(--muted))",
  ...props
}: SkeletonProps) {
  return (
    <LibSkeleton
      borderRadius={borderRadius}
      baseColor={baseColor}
      highlightColor={highlightColor}
      {...props}
      {...(className ? { className: cn(className) } : {})}
      {...(containerClassName ? { containerClassName } : {})}
    />
  );
}

export { Skeleton, SkeletonTheme };
