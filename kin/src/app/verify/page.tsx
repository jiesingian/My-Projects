import { VerifyForm } from "./verify-form";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email = "" } = await searchParams;
  return <VerifyForm email={email} />;
}
