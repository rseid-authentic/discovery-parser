export function StatusBadge({ status }: { status: string }) {
  const color =
    status === "parsed"
      ? "bg-emerald-100 text-emerald-800"
      : status === "failed"
        ? "bg-red-100 text-red-800"
        : status === "parsing"
          ? "bg-blue-100 text-blue-800"
          : "bg-neutral-100 text-neutral-700";
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${color}`}>{status}</span>;
}
