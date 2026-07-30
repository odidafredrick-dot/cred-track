"use client";

function SkeletonBlock({
  className = "",
}: {
  className?: string;
}) {
  return <div className={`animate-pulse rounded bg-gray-100 ${className}`} />;
}

function HeaderBar({
  rightPill = true,
}: {
  rightPill?: boolean;
}) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <SkeletonBlock className="h-10 w-20 rounded-lg bg-white ring-1 ring-gray-200" />
      {rightPill ? (
        <SkeletonBlock className="h-8 w-24 rounded-full bg-blue-50" />
      ) : null}
    </div>
  );
}

export function AuthLoadingScreen({
  message = "Preparing your workspace...",
}: {
  message?: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <section className="w-full max-w-sm rounded-xl border border-gray-100 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50">
          <img
            src="/logo.jpeg"
            alt="Holwa"
            className="h-9 w-9 rounded-lg object-cover"
          />
        </div>
        <h1 className="mt-4 text-xl font-bold text-blue-700">Holwa</h1>
        <p className="mt-2 text-sm text-gray-500">{message}</p>
        <div className="mt-5 space-y-2">
          <SkeletonBlock className="mx-auto h-2 w-44" />
          <SkeletonBlock className="mx-auto h-2 w-32" />
        </div>
      </section>
    </main>
  );
}

export function DashboardShellSkeleton() {
  return (
    <main className="min-h-screen bg-gray-50 pb-24">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-9 w-9 rounded-lg bg-blue-50" />
              <div className="space-y-2">
                <SkeletonBlock className="h-5 w-24" />
                <SkeletonBlock className="h-3 w-32" />
              </div>
            </div>
            <SkeletonBlock className="h-12 w-12 rounded-full" />
          </div>
        </section>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <section
              key={index}
              className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"
            >
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="mt-4 h-7 w-28" />
            </section>
          ))}
        </div>

        <section className="mt-6 rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <SkeletonBlock className="h-5 w-36" />
          </div>
          <div className="divide-y divide-gray-100">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="px-5 py-4">
                <SkeletonBlock className="h-4 w-40" />
                <SkeletonBlock className="mt-3 h-3 w-full max-w-md" />
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white px-4 py-3 md:hidden">
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonBlock key={index} className="mx-auto h-8 w-10 rounded-lg" />
          ))}
        </div>
      </div>
    </main>
  );
}

export function ProfilePageSkeleton() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <HeaderBar />
        <section className="rounded-xl border border-gray-100 bg-white px-6 py-8 text-center shadow-sm">
          <SkeletonBlock className="mx-auto h-28 w-28 rounded-full" />
          <SkeletonBlock className="mx-auto mt-5 h-7 w-44" />
          <SkeletonBlock className="mx-auto mt-3 h-4 w-24" />
        </section>
        <section className="mt-6 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <SkeletonBlock className="h-5 w-28" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-11 w-full" />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

export function CreditorDetailSkeleton() {
  return (
    <main className="min-h-screen bg-gray-50 pb-10">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <HeaderBar />
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="mt-3 h-6 w-36" />
          <div className="mt-5 divide-y divide-gray-100">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex justify-between gap-4 py-3">
                <SkeletonBlock className="h-4 w-24" />
                <SkeletonBlock className="h-4 w-32" />
              </div>
            ))}
          </div>
          <SkeletonBlock className="mt-4 h-24 w-full rounded-lg" />
        </section>
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <section
              key={index}
              className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-2">
                  <SkeletonBlock className="h-5 w-44" />
                  <SkeletonBlock className="h-3 w-64 max-w-full" />
                </div>
                <SkeletonBlock className="h-7 w-14 rounded-full" />
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

export function SupplierStoreSkeleton() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <HeaderBar />
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="mt-3 h-7 w-44" />
          <SkeletonBlock className="mt-3 h-4 w-64 max-w-full" />
          <SkeletonBlock className="mt-4 h-4 w-full max-w-2xl" />
        </section>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <SkeletonBlock className="h-5 w-24" />
            </div>
            <div className="divide-y divide-gray-100">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="px-5 py-4">
                  <SkeletonBlock className="h-5 w-36" />
                  <SkeletonBlock className="mt-3 h-4 w-28" />
                </div>
              ))}
            </div>
          </section>
          <aside className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <SkeletonBlock className="h-5 w-16" />
            <SkeletonBlock className="mt-5 h-16 w-full" />
            <SkeletonBlock className="mt-4 h-11 w-full rounded-lg" />
          </aside>
        </div>
      </div>
    </main>
  );
}


export function InlineListSkeleton({
  rows = 3,
  framed = false,
}: {
  rows?: number;
  framed?: boolean;
}) {
  return (
    <div className={framed ? "space-y-3" : "divide-y divide-gray-100"}>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className={
            framed
              ? "rounded-lg border border-gray-100 bg-white p-4 shadow-sm"
              : "px-4 py-4"
          }
        >
          <SkeletonBlock className="h-4 w-36" />
          <SkeletonBlock className="mt-3 h-3 w-full max-w-sm" />
          <SkeletonBlock className="mt-2 h-3 w-28" />
        </div>
      ))}
    </div>
  );
}
