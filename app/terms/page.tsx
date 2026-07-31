import Link from "next/link";

export default function TermsPage() {
    return (
        <main className="min-h-screen bg-slate-950 px-4 py-16 text-slate-100 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-4xl rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-black/20">
                <Link href="/" className="text-sm font-semibold text-blue-400 hover:text-blue-300">
                    ← Back to home
                </Link>
                <h1 className="mt-6 text-3xl font-bold">Terms of Service</h1>
                <p className="mt-4 text-sm leading-7 text-slate-300">
                    By using Holwa, you agree to use the platform responsibly and keep your account credentials private. You are responsible for the information you enter and the actions taken through your workspace.
                </p>
                <p className="mt-4 text-sm leading-7 text-slate-300">
                    The service is intended for business and personal credit tracking workflows. Any misuse, unauthorized access, or abusive activity may lead to account restrictions.
                </p>
            </div>
        </main>
    );
}
