import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Before You Dip | California water evidence, made clearer",
  description:
    "An independent public-data tool that brings recent bacteria results and harmful-algae reports into one plain-language view.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
