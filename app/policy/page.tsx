import Link from "next/link";

export default function PolicyPage() {
    return (
        <main className="min-h-screen bg-slate-950 px-4 py-16 text-slate-100 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-4xl rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-black/20">
                <Link href="/" className="text-sm font-semibold text-blue-400 hover:text-blue-300">
                    ← Back to home
                </Link>
                <h1 className="mt-6 text-3xl font-bold">Security & Data Policy</h1>
                <p className="mt-4 text-sm leading-7 text-slate-300">
                    Holwa uses authentication, encrypted transport, and secure storage practices to protect account access and business records.
                </p>
                <p className="mt-4 text-sm leading-7 text-slate-300">
                    You should keep your password and recovery details private and report suspicious access immediately. Access logs and role-based permissions are used to reduce unnecessary exposure of sensitive information.
                </p>
            </div>
        </main>
    );
}
