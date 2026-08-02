import { requireSession } from "@/app/lib/auth/session";

export default async function AccountProfilePage() {
  const user = await requireSession();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        Profile editing arrives in a later phase. Your signed-in details are
        shown below.
      </p>
      <div className="mt-6 space-y-3 text-sm">
        <p>
          <span className="text-[var(--text-soft)]">Name:</span>{" "}
          <b>{user.name}</b>
        </p>
        <p>
          <span className="text-[var(--text-soft)]">Email:</span>{" "}
          <b>{user.email}</b>
        </p>
      </div>
    </div>
  );
}
