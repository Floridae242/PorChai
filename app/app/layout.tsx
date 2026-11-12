import { fontBody, fontDisplay } from "./fonts";

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <div
      className={`${fontBody.variable} ${fontDisplay.variable} min-h-full flex-1 bg-app font-body text-primary`}
    >
      {children}
    </div>
  );
}
