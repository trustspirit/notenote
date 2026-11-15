import { Spinner } from "@astryxdesign/core/Spinner";

export function Loading() {
  return (
    <div className="center-screen">
      <Spinner label="불러오는 중…" />
    </div>
  );
}
