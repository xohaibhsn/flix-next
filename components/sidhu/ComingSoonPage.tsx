import { AdminShell, ComingSoon } from "@/components/sidhu/AdminShell";

export function ComingSoonPage({
  title,
  moduleName,
}: {
  title: string;
  moduleName: string;
}) {
  return (
    <AdminShell title={title}>
      <ComingSoon moduleName={moduleName} />
    </AdminShell>
  );
}

export default ComingSoonPage;
