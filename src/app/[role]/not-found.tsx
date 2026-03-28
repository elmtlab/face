import Link from "next/link";

export default function RoleNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-zinc-100 mb-2">
          Role not found
        </h1>
        <p className="text-sm text-zinc-400 mb-4">
          This role is not configured.
        </p>
        <Link
          href="/"
          className="text-sm text-blue-400 hover:text-blue-300 underline"
        >
          Go to home
        </Link>
      </div>
    </div>
  );
}
