import { FamilyForkForm } from "./family-fork-form";

export default async function FamilyForkPage({
  searchParams,
}: {
  searchParams: Promise<{ full_name?: string; dob?: string; mobile?: string }>;
}) {
  const { full_name = "", dob = "", mobile = "" } = await searchParams;
  return <FamilyForkForm fullName={full_name} dob={dob} mobile={mobile} />;
}
