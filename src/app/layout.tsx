import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "StudyIt - Got a huge PDF module? Just StudyIt",
  description: "Add your module and get a reviewer, flashcards, and quizzes made only from your own pages.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// Runs before the page is drawn so a dark-mode student never sees a white flash.
const themeScript = `try{var t=localStorage.getItem("studyit:v1:theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body suppressHydrationWarning>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
