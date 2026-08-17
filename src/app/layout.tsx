import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { AuthProvider } from "@/components/auth-provider";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Nagpur Connect — AI-Powered Civic Response",
  description:
    "Report civic issues and emergencies in Nagpur. AI-powered platform that understands your problem and connects you with the right government departments.",
  keywords: ["Nagpur", "civic", "emergency", "AI", "government", "report"],
  authors: [{ name: "Nagpur Connect" }],
  openGraph: {
    title: "Nagpur Connect",
    description: "AI-powered civic and emergency response coordination for Nagpur",
    type: "website",
  },
};

const themeScript = `(function(){try{var stored=localStorage.getItem('nagpur-theme');var theme=stored||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',theme);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`} suppressHydrationWarning>
      <body>
        <Script
          id="theme-script"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
        <AuthProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

