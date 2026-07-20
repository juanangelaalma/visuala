import type { BillingGatewayResolver, BillingPaymentRepository } from "@/domain/billing/contracts";
import { BillingPaymentSimulationNotReadyError, BillingPaymentSimulationUnavailableError } from "@/domain/billing/errors";
import type { BillingEnvironment } from "@/domain/billing/types";
import { canSimulateBillingPayment } from "./payment-simulation-eligibility";

type SimulateOwnedBillingPaymentDependencies = {
  payments: BillingPaymentRepository;
  gateways: BillingGatewayResolver;
  configuredEnvironment: BillingEnvironment;
};

type SimulateOwnedBillingPaymentInput = {
  paymentId: string;
  userId: string;
};

export async function simulateOwnedBillingPayment(dependencies: SimulateOwnedBillingPaymentDependencies, input: SimulateOwnedBillingPaymentInput): Promise<void> {
  const payment = await dependencies.payments.findOwnedProjection(input.paymentId, input.userId);
  if (!payment) throw new BillingPaymentSimulationUnavailableError();
  if (!payment.latestAttempt?.providerPaymentId) throw new BillingPaymentSimulationNotReadyError();
  if (!canSimulateBillingPayment(payment, dependencies.configuredEnvironment)) throw new BillingPaymentSimulationUnavailableError();
  await dependencies.gateways.resolve(payment.latestAttempt.provider, payment.latestAttempt.environment).simulatePayment({ providerPaymentId: payment.latestAttempt.providerPaymentId, amount: payment.priceAmount });
}
