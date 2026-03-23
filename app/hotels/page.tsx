import type { Metadata } from "next";
import { HotelScanConsole } from "@/components/hotel-scan-console";

export const metadata: Metadata = {
  title: "Hotel Analyzer",
  description:
    "Página dedicada para análise de websites de hotéis com foco em performance, SEO, mídias, CRM e motor de reservas."
};

export default function HotelAnalyzerPage() {
  return <HotelScanConsole />;
}
