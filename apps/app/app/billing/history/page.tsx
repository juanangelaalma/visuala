import { redirect } from "next/navigation";
import { getCurrentUser } from "@/application/auth/get-current-user";
import { createAuthServices } from "@/application/auth/services";
import { listOwnedBillingPayments } from "@/application/billing/list-owned-billing-payments";
import { createBillingServices } from "@/application/billing/services";
import { PaymentHistoryTable } from "@/features/billing/components/PaymentHistoryTable";

type BillingHistoryPageProps = {
  searchParams: Promise<{ page?: string }>;
};

export default async function BillingHistoryPage({ searchParams }: BillingHistoryPageProps) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const pageSize = 10;

  const { authProvider } = await createAuthServices();
  const user = await getCurrentUser(authProvider);
  if (!user) redirect("/login");

  const services = await createBillingServices();
  const result = await listOwnedBillingPayments(services.payments, { userId: user.id, page, pageSize });

  return (
    <main className="min-h-screen bg-black px-4 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <h1 className="font-display text-section-sm font-normal text-white">Payment history</h1>
          <p className="mt-2 text-sm text-neutral-450">View your past payments and their status.</p>
        </header>
        <PaymentHistoryTable payments={result.payments} total={result.total} page={page} pageSize={pageSize} />
      </div>
    </main>
  );
}
