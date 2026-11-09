import type { Metadata } from "next";
import { DemoApp } from "@/components/DemoApp";

export const metadata: Metadata = {
  title: "Unbramble demo",
  description: "Click around Unbramble with sample data. Nothing is saved.",
};

export default function DemoPage() {
  return <DemoApp />;
}
