import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "CholaScript AI — Tamil Inscription Reader",
  description: "A careful, uncertainty-aware workspace for reading historical Tamil inscriptions.",
  other: {
    "page-type": "software",
    "site-kind": "software",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-type="software" data-radius="soft" data-buttons="solid" data-motion="true"><body>{children}</body></html>;
}
