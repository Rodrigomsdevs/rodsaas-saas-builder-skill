// rodsaas · sincroniza planos (config/plans.ts) com a Stripe.
//
// Copie para api/scripts/billing-sync.ts e ligue o script no package.json:
//   "billing:sync": "tsx scripts/billing-sync.ts"
//
// Uso:
//   npm run billing:sync                         # cria/atualiza produtos, preços e portal
//   npm run billing:sync -- --dry-run            # só mostra o que faria
//   npm run billing:sync -- --webhook https://api.meusaas.com.br/v1/billing/webhook   # produção
//
// Idempotente. Antes de usar, confira na doc atual do SDK da Stripe os nomes dos
// métodos e parâmetros abaixo (products, prices com lookup_keys/transfer_lookup_key,
// billingPortal.configurations, webhookEndpoints) e fixe a versão da API.

import Stripe from "stripe";
import { CURRENCY, plans, type BillingInterval, type PlanId } from "../src/config/plans";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const webhookArg = args.indexOf("--webhook");
const webhookUrl = webhookArg >= 0 ? args[webhookArg + 1] : undefined;

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY não definida. Sem ela a API usa o modo de teste (fake) e não precisa de sincronização.");
  process.exit(1);
}
const stripe = new Stripe(key); // fixe apiVersion na versão atual da API, conforme a doc do SDK instalado
const env = key.startsWith("sk_live_") ? "PRODUÇÃO" : "teste";

const brl = (cents: number | null | undefined) =>
  cents == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: CURRENCY.toUpperCase() }).format(cents / 100);
const lookupKey = (plan: string, interval: string) => `rodsaas_${plan}_${interval}`;
const productIdOf = (p: string | Stripe.Product | Stripe.DeletedProduct) => (typeof p === "string" ? p : p.id);
const log = (s: string) => console.log(`${dryRun ? "[simulação] " : ""}${s}`);

const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
];

async function findProduct(planId: string): Promise<Stripe.Product | null> {
  // list (e não search): a busca da Stripe tem atraso de indexação e criaria produtos duplicados
  for await (const p of stripe.products.list({ limit: 100 })) {
    if (p.metadata?.rodsaas_plan === planId) return p;
  }
  return null;
}

async function ensureProduct(planId: PlanId, plan: { name: string; description?: string }) {
  const data = { name: plan.name, description: plan.description || undefined, metadata: { rodsaas_plan: planId } };
  const existing = await findProduct(planId);
  if (!existing) {
    log(`+ produto ${plan.name}`);
    return dryRun ? null : stripe.products.create(data);
  }
  const changed = existing.name !== plan.name || (existing.description ?? "") !== (plan.description ?? "") || !existing.active;
  if (!changed) {
    log(`= produto ${plan.name}`);
    return existing;
  }
  log(`~ produto ${plan.name} (nome/descrição/ativo)`);
  return dryRun ? existing : stripe.products.update(existing.id, { ...data, active: true });
}

async function ensurePrice(product: Stripe.Product | null, planId: PlanId, interval: BillingInterval, amount: number) {
  const lk = lookupKey(planId, interval);
  const current = (await stripe.prices.list({ lookup_keys: [lk], limit: 1 })).data[0];
  const same =
    current &&
    current.active &&
    current.unit_amount === amount &&
    current.currency === CURRENCY &&
    current.recurring?.interval === interval &&
    product &&
    productIdOf(current.product) === product.id;
  if (same) {
    log(`  = ${lk} ${brl(amount)}`);
    return current;
  }
  log(current ? `  ~ ${lk} ${brl(current.unit_amount)} → ${brl(amount)} (vale para novas assinaturas)` : `  + ${lk} ${brl(amount)}`);
  if (dryRun || !product) return current ?? null;
  const created = await stripe.prices.create({
    product: product.id,
    unit_amount: amount,
    currency: CURRENCY,
    recurring: { interval },
    lookup_key: lk,
    transfer_lookup_key: true, // a chave passa para o preço novo
    metadata: { rodsaas_plan: planId, rodsaas_interval: interval },
  });
  if (current && current.active) await stripe.prices.update(current.id, { active: false });
  return created;
}

async function ensurePortal(products: { product: string; prices: string[] }[]) {
  const existing = (await stripe.billingPortal.configurations.list({ limit: 100 })).data.find(
    (c) => c.metadata?.rodsaas_managed === "true",
  );
  const params: Stripe.BillingPortal.ConfigurationCreateParams = {
    business_profile: { headline: "Gerencie sua assinatura" },
    features: {
      customer_update: { enabled: true, allowed_updates: ["email", "address", "tax_id"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      subscription_update: {
        enabled: products.length > 0,
        default_allowed_updates: ["price"],
        proration_behavior: "create_prorations",
        products,
      },
    },
    metadata: { rodsaas_managed: "true" },
  };
  log(existing ? "~ portal do cliente (atualizado)" : "+ portal do cliente");
  if (dryRun) return;
  if (existing) await stripe.billingPortal.configurations.update(existing.id, params as Stripe.BillingPortal.ConfigurationUpdateParams);
  else await stripe.billingPortal.configurations.create(params);
}

async function ensureWebhook(url: string) {
  for await (const w of stripe.webhookEndpoints.list({ limit: 100 })) {
    if (w.url === url) {
      log(`= webhook ${url} (o segredo é o que já está no painel da Stripe)`);
      if (!dryRun) await stripe.webhookEndpoints.update(w.id, { enabled_events: WEBHOOK_EVENTS, disabled: false });
      return;
    }
  }
  log(`+ webhook ${url}`);
  if (dryRun) return;
  const created = await stripe.webhookEndpoints.create({ url, enabled_events: WEBHOOK_EVENTS, description: "rodsaas" });
  console.log(`\n  STRIPE_WEBHOOK_SECRET=${created.secret}\n  ↑ coloque no api/.env de produção e reinicie a API. Ele só aparece agora.\n`);
}

async function main() {
  console.log(`Stripe (${env}) ← config/plans.ts\n`);
  const portalProducts: { product: string; prices: string[] }[] = [];

  for (const [planId, plan] of Object.entries(plans) as [PlanId, (typeof plans)[PlanId]][]) {
    const prices = plan.prices as Partial<Record<BillingInterval, number>> | null;
    if (!prices) {
      log(`· ${plan.name}: grátis (nada na Stripe)`);
      continue;
    }
    const product = await ensureProduct(planId, plan as { name: string; description?: string });
    const ids: string[] = [];
    for (const interval of ["month", "year"] as BillingInterval[]) {
      const amount = prices[interval];
      if (amount == null) continue;
      const price = await ensurePrice(product, planId, interval, amount);
      if (price) ids.push(price.id);
    }
    if (product && ids.length) portalProducts.push({ product: product.id, prices: ids });
  }

  await ensurePortal(portalProducts);
  if (webhookUrl) await ensureWebhook(webhookUrl);
  console.log("\nPronto. A API acha os preços pelos lookup_key; nenhum price_... no .env.");
}

main().catch((err) => {
  console.error(`\nFalhou: ${err?.message ?? err}`);
  process.exit(1);
});
