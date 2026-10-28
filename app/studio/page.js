import { Suspense } from "react";
import Studio from "./Studio.js";

export const metadata = { title: "Resume Studio · Job Pipeline" };

export default function StudioPage() {
  return (
    <Suspense>
      <Studio />
    </Suspense>
  );
}
