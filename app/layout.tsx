import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "940Analytics",
  description: "Simple, honest website analytics for your business, built by 940Digital.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body antialiased">{children}</body>
    </html>
  );
}
