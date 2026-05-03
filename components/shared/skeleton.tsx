type Props = {
  className?: string;
};

export function Skeleton({ className = "" }: Props) {
  return (
    <div className={`animate-pulse bg-surface ${className}`} aria-hidden />
  );
}
