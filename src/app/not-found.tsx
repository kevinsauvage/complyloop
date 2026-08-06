import Link from "next/link";

export default function NotFound() {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
      <h1 className="text-xl font-semibold text-zinc-900">Page not found</h1>
      <p className="mt-2 text-sm text-zinc-500">
        That page does not exist, or you do not have access to it.
      </p>
      <p className="mt-6">
        <Link
          href="/"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Back to dashboard
        </Link>
      </p>
    </div>
  );
}
