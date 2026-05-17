import Image from "next/image";

type AppLogoProps = {
  className?: string;
  showSubtitle?: boolean;
  size?: "sm" | "md";
};

export function AppLogo({
  className = "",
  showSubtitle = true,
  size = "md",
}: AppLogoProps) {
  const markSize = size === "sm" ? "h-7 w-7" : "h-10 w-10";
  const titleSize = size === "sm" ? "text-lg" : "text-2xl";

  return (
    <span className={`flex items-center gap-3 ${className}`}>
      <Image
        src="/logo.png"
        alt=""
        width={719}
        height={719}
        className={`${markSize} shrink-0 rounded-full object-cover`}
        priority={size === "sm"}
      />
      <span className="min-w-0">
        <span className={`display block text-foreground ${titleSize}`}>
          Ledger
        </span>
        {showSubtitle ? (
          <span className="label mt-0.5 block">Portfolio Manager</span>
        ) : null}
      </span>
    </span>
  );
}
