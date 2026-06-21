import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/contexts/AuthContext";
import AuthGate from "@/components/auth/AuthGate";
import ThemeManager from "@/components/theme/ThemeManager";
import { NavProvider } from "@/components/layout/NavProvider";

// Applied before first paint to avoid a flash of the wrong theme. Mirrors
// ThemeManager.applyFromStorage but runs synchronously during HTML parse.
const themeBootstrap = `
  (function() {
    try {
      var t = localStorage.getItem('sunset-theme') || 'dark';
      var a = localStorage.getItem('sunset-accent');
      var d = localStorage.getItem('sunset-density');
      var light = t === 'light' || (t === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);
      if (light) document.documentElement.classList.add('light');
      if (a) document.documentElement.setAttribute('data-accent', a);
      if (d) document.documentElement.setAttribute('data-density', d);
    } catch (e) {}
  })();
`;

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sunset - ERP System",
  description: "Complete ERP system for business management",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className={`${inter.className} h-full`} suppressHydrationWarning>
        <ThemeManager />
        <NavProvider>
          <AuthProvider>
            <AuthGate>
              {children}
            </AuthGate>
          </AuthProvider>
        </NavProvider>
      </body>
    </html>
  );
}
