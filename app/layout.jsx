import { Press_Start_2P, Rubik } from "next/font/google";
import "./globals.css";

const pressStart = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-arcade",
  display: "swap",
});

const rubik = Rubik({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata = {
  title: "UTOP Flappybird",
  description: "Scan, pick your squad, and flap for glory!",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0b1023",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${pressStart.variable} ${rubik.variable}`}>
        <div className="stars" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
