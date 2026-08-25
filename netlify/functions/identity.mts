import { getDatabase } from "@netlify/database";
import type { UserLoginEvent, UserSignupEvent } from "@netlify/functions";

const identityHandlers = {
  async userSignup(event: UserSignupEvent) {
    const db = getDatabase();
    const id = event.user.id;
    const email = event.user.email ?? "";
    const metadata = event.user.userMetadata as { fullName?: string; full_name?: string } | undefined;
    const fullName = metadata?.fullName ?? metadata?.full_name ?? email.split("@")[0] ?? "Apprenant";

    await db.sql`
      INSERT INTO users (id, email, full_name, role)
      VALUES (${id}, ${email}, ${fullName}, ${"learner"})
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name
    `;
    return {
      user: {
        ...event.user,
        appMetadata: {
          ...event.user.appMetadata,
          roles: ["learner"],
        },
      },
    };
  },

  async userLogin(event: UserLoginEvent) {
    const db = getDatabase();
    const id = event.user.id;
    const email = event.user.email ?? "";
    const userMetadata = event.user.userMetadata as { fullName?: string; full_name?: string } | undefined;
    const appMetadata = event.user.appMetadata as { roles?: string[] } | undefined;
    const roles = appMetadata?.roles ?? [];
    const role = roles.includes("super_admin") ? "super_admin" : roles.includes("admin") ? "admin" : "learner";
    const fullName = userMetadata?.fullName ?? userMetadata?.full_name ?? email.split("@")[0] ?? "Utilisateur";
    const eventId = crypto.randomUUID();

    await db.sql`
      INSERT INTO users (id, email, full_name, role, last_login_at)
      VALUES (${id}, ${email}, ${fullName}, ${role}, NOW())
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, role = EXCLUDED.role, last_login_at = NOW()
    `;
    await db.sql`
      UPDATE passport_employees SET provisioning_status = 'active', activated_at = COALESCE(activated_at, NOW()),
        last_error = NULL, updated_at = NOW()
      WHERE lms_user_id = ${id}
    `;
    await db.sql`
      INSERT INTO login_events (id, user_id, email, event_type)
      VALUES (${eventId}, ${id}, ${email}, ${"login"})
    `;
  },
};

export default identityHandlers;
