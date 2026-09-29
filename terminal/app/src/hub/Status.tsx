/** A status word as a square badge: live, in progress, not wired, planned, set, missing, unknown. */
export function Status({ value }: { value: string }) {
  return (
    <span className="hub-status" data-status={value.replace(/\s+/g, '-')}>
      {value}
    </span>
  );
}
