export function Avatar({ url, initials, size = 44 }: { url: string | null; initials: string; size?: number }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--color-divider)", flex: "none" }}
      />
    );
  }
  return (
    <span
      className="placeholder-fill"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flex: "none",
        border: "1px solid var(--color-divider)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        font: `600 ${Math.round(size * 0.34)}px/1 var(--font-heading)`,
        color: "var(--color-neutral-700)",
      }}
    >
      {initials}
    </span>
  );
}
