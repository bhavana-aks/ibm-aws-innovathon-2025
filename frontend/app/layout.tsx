// 15-01-25: Added AuthProvider and Amplify configuration
// 12-12-25: Added Walkthrough icon to metadata
// 10-12-25: Updated branding to Walkthrough
// 15-01-25: Added AuthProvider and Amplify configuration
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { AmplifyConfig } from "@/components/AmplifyConfig";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Walkthrough",
  description: "Create, script, and share polished software walkthroughs",
  icons: { icon: "/walkthrough-icon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AmplifyConfig>
          <AuthProvider>
            {children}
          </AuthProvider>
        </AmplifyConfig>
      </body>
    </html>
  );
}
