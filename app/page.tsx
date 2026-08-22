import LmsApp from "./lms-app";
import { getChatGPTUser } from "./chatgpt-auth";

export default async function Home() {
  const user = await getChatGPTUser();
  const initialSession = user ? {
    name: user.displayName,
    email: user.email,
    initials: user.displayName.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join(""),
    role: "super_admin" as const,
    authProvider: "sites" as const,
  } : null;
  return <LmsApp initialSession={initialSession} />;
}
