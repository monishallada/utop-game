import { Graduate, Rubik } from "next/font/google";
import "./globals.css";

const graduate = Graduate({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const rubik = Rubik({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata = {
  title: "UTOP Gridiron Flappy — UNC Charlotte",
  description:
    "UNC Charlotte UTOP game day! Scan, squad up, and drive 100 yards for a touchdown.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#005035",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${graduate.variable} ${rubik.variable}`}>
        <div className="field-bg" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
