import { Geist, Geist_Mono, Cormorant_Garamond, Karla } from "next/font/google";
import "./globals.css";
import { SITE_URL } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Storefront brand faces — display serif echoes the logo wordmark, Karla
// carries body/UI. Cormorant is headings-only: its hairlines muddy below ~20px.
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
});

const karla = Karla({
  variable: "--font-karla",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata = {
  // Resolves the relative URLs in metadata below and in every page — the
  // og:image on a product page in particular, which a link preview on
  // WhatsApp or Instagram cannot use unless it is absolute.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Salwar Butterfly",
    template: "%s · Salwar Butterfly",
  },
  description:
    "Salwar Butterfly — fashion meets comfort. A single-seller dress shop for salwar suits, co-ord sets and anarkalis.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${cormorant.variable} ${karla.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
