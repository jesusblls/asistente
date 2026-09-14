import { TenantProvider } from '../../context/TenantContext';
import { DashboardShell } from '../../components/dashboard/DashboardShell';
import { AuthGuard } from '../../components/auth/AuthGuard';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TenantProvider>
      <AuthGuard>
        <DashboardShell>{children}</DashboardShell>
      </AuthGuard>
    </TenantProvider>
  );
}
