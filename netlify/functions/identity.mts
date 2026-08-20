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
    await db.sql`
      INSERT INTO enrollments (id, user_id, course_id)
      SELECT ${id} || ':' || c.id, ${id}, c.id
      FROM courses c
      WHERE c.published = TRUE
      ON CONFLICT (user_id, course_id) DO NOTHING
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
    const eventId = crypto.randomUUID();

    await db.sql`UPDATE users SET last_login_at = NOW() WHERE id = ${id}`;
    await db.sql`
      INSERT INTO login_events (id, user_id, email, event_type)
      VALUES (${eventId}, ${id}, ${email}, ${"login"})
    `;
  },
};

export default identityHandlers;
