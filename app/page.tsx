import Link from "next/link";
import { ScanConsole } from "@/components/scan-console";

export default function HomePage() {
  return (
    <>
      <div className="fixed right-4 top-4 z-20">
        <Link
          href="/hotel"
          className="inline-flex rounded-xl border border-ink/10 bg-white/85 px-4 py-2 text-sm font-semibold text-ink shadow-sm backdrop-blur transition hover:bg-white"
        >
          Ir para Hotel Intelligence
        </Link>
      </div>
      <ScanConsole />
    </>
  );
}
