export function Logo({ size = 22, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <span style={{ fontSize: size, fontWeight: 700, letterSpacing: "-0.01em" }}>
      <span className={dark ? "wm-num dark" : "wm-num"}>940</span>
      <span className="wm-script">Analytics</span>
    </span>
  );
}
