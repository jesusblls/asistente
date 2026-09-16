import { TenantProvider } from '../../context/TenantContext';
import { DashboardShell } from '../../components/dashboard/DashboardShell';
import { AuthGuard } from '../../components/auth/AuthGuard';
import { OnboardingGate } from '../../components/auth/OnboardingGate';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TenantProvider>
      <AuthGuard>
        <OnboardingGate>
          <DashboardShell>{children}</DashboardShell>
        </OnboardingGate>
      </AuthGuard>
    </TenantProvider>
  );
}
