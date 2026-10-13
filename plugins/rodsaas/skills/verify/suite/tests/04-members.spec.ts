import { test, expect } from "@playwright/test";
import { call, me, newUser, uniq } from "../support/api";
import { linkFrom, pathOf, waitForEmail } from "../support/mailpit";
import { currentOrg, newContext, ownerWithMember, signUp, submitWithRateLimitRetry } from "../support/ui";

test.describe("Membros, convites e papéis", () => {
  test("convidar pela tela, aceitar com conta nova e cair na empresa certa", async ({ page, browser, request }) => {
    test.slow();
    const owner = await signUp(page, "inviter", "/configuracoes/membros");
    const invitedEmail = `rodsaas.convidado.${uniq()}@example.com`;

    await page.getByTestId("invite-button").click();
    await page.getByTestId("invite-email").fill(invitedEmail);
    await page.getByTestId("invite-submit").click();
    await expect(page.getByTestId("invitation-row").filter({ hasText: invitedEmail })).toBeVisible();

    const mail = await waitForEmail(request, invitedEmail, { contains: "/convite" });
    const guestCtx = await newContext(browser);
    const guest = await guestCtx.newPage();
    await guest.goto(pathOf(linkFrom(mail, "/convite")));
    await expect(guest.getByTestId("invite-org-name")).toContainText(owner.organizationName);
    await guest.getByTestId("invite-create-account").click();

    const g = newUser("guest");
    await expect(guest.getByTestId("signup-email"), "e-mail do convite pré-preenchido").toHaveValue(invitedEmail);
    await expect(guest.getByTestId("signup-org-name"), "cadastro por convite não pede empresa").toHaveCount(0);
    await guest.getByTestId("signup-name").fill(g.name);
    await guest.getByTestId("signup-password").fill(g.password);
    const res = await submitWithRateLimitRetry(guest, guest.getByTestId("signup-submit"), "/v1/auth/register");
    expect(res.status()).toBeLessThan(300);

    await expect(currentOrg(guest), "convidado entra na empresa de quem convidou").toContainText(owner.organizationName);
    const gm = await me(guestCtx.request);
    expect(gm.organizations, "convidado não ganha empresa própria").toHaveLength(1);
    expect(gm.organization?.role).toBe("MEMBER");

    await page.reload();
    await expect(page.getByTestId("member-row").filter({ hasText: invitedEmail })).toBeVisible();
    await expect(page.getByTestId("invitation-row").filter({ hasText: invitedEmail })).toHaveCount(0);
    await guestCtx.close();
  });

  test("membro não vê ações de admin nem a cobrança", async ({ browser, request }) => {
    const { ownerCtx, memberCtx } = await ownerWithMember(browser, request);
    const mp = await memberCtx.newPage();
    await mp.goto("/configuracoes/membros");
    await expect(mp.getByTestId("members-table")).toBeVisible();
    await expect(mp.getByTestId("invite-button"), "membro não pode convidar").toHaveCount(0);
    await expect(mp.getByTestId("member-remove"), "membro não pode remover").toHaveCount(0);

    await mp.goto("/configuracoes/plano");
    await expect(
      mp.getByTestId("forbidden-state").or(mp.getByTestId("page-not-found")),
      "membro não acessa plano e cobrança",
    ).toBeVisible();
    await expect(mp.getByTestId("plan-card")).toHaveCount(0);
    await ownerCtx.close();
    await memberCtx.close();
  });

  test("promover membro a admin libera as ações", async ({ browser, request }) => {
    const { ownerCtx, member, memberCtx } = await ownerWithMember(browser, request);
    const op = await ownerCtx.newPage();
    await op.goto("/configuracoes/membros");
    const row = op.getByTestId("member-row").filter({ hasText: member.email });
    await row.getByTestId("member-role-select").click();
    await op.getByTestId("role-option-ADMIN").click();
    await expect.poll(async () => {
      const list = await (await call(ownerCtx.request, "GET", "/v1/members")).json();
      return (list.data ?? list).find((m: any) => m.user?.email === member.email)?.role;
    }, { message: "papel salvo na API" }).toBe("ADMIN");

    const mp = await memberCtx.newPage();
    await mp.goto("/configuracoes/membros");
    await expect(mp.getByTestId("invite-button"), "admin pode convidar (após o papel mudar)").toBeVisible();
    await ownerCtx.close();
    await memberCtx.close();
  });

  test("remover membro corta o acesso na hora", async ({ browser, request }) => {
    const { ownerCtx, member, memberCtx } = await ownerWithMember(browser, request);
    const mp = await memberCtx.newPage();
    await mp.goto("/inicio");
    await expect(mp.getByTestId("app-shell")).toBeVisible();

    const op = await ownerCtx.newPage();
    await op.goto("/configuracoes/membros");
    const row = op.getByTestId("member-row").filter({ hasText: member.email });
    await row.getByTestId("member-remove").click();
    await expect(op.getByTestId("confirm-dialog")).toBeVisible();
    await op.getByTestId("confirm-dialog-confirm").click();
    await expect(row).toHaveCount(0);

    expect((await me(memberCtx.request)).organization, "/v1/me do removido sem empresa ativa").toBeNull();
    await mp.goto("/inicio");
    await expect(mp, "removido vai para /sem-empresa").toHaveURL(/\/sem-empresa/, { timeout: 15_000 });
    await ownerCtx.close();
    await memberCtx.close();
  });
});
