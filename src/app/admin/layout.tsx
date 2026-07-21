/**
 * /admin layout — pass-through. Each page renders its own heading/nav.
 * proxy.ts cookie-gates /admin so only admin sessions reach this tree.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
