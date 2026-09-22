import { LoginForm } from "./login-form";
import { ClearOfflineCache } from "@/components/clear-offline-cache";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <>
      {/* Reaching this screen means signed out, switching accounts, or an
          expired session. All three are reasons the last household's cached
          pages should stop being readable on this device. */}
      <ClearOfflineCache />
      <LoginForm callbackError={error} />
    </>
  );
}
