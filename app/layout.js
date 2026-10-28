import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import Nav from "./Nav.js";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-display",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
});

export const metadata = {
  title: "Job Pipeline",
  description: "Job application tracker",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${fraunces.variable} ${inter.variable}`}>
        <Nav />
        {children}
      </body>
    </html>
  );
}
