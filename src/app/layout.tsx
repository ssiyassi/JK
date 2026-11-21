import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Jentis Kitchen - Inventory Management",
  description: "Inventory and Order Management System for Jentis Kitchen",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The public shop (jentiskitchen.id, see middleware) is in Bahasa Indonesia; the admin is in English.
  const lang = (await headers()).get("x-shop-base") ? "id" : "en";
  return (
    <html lang={lang}>
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}