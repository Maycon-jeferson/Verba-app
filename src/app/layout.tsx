import type { Metadata } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Verba App",
  description: "Text, notes, cell editor",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
