import Link from "next/link";

export default function PrivacyPage() {
    return (
        <main className="min-h-screen bg-slate-950 px-4 py-16 text-slate-100 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-4xl rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-black/20">
                <Link href="/" className="text-sm font-semibold text-blue-400 hover:text-blue-300">
                    ← Back to home
                </Link>
                <h1 className="mt-6 text-3xl font-bold">Privacy Policy</h1>
                <p className="mt-4 text-sm leading-7 text-slate-300">
                    Holwa collects the minimum information needed to create and secure your account, manage credit records, and provide reminders and dashboard access.
                </p>
                <p className="mt-4 text-sm leading-7 text-slate-300">
                    We use your phone number, email address, and role-based account information to authenticate access and personalize your workspace. We do not sell personal data to third parties.
                </p>
                <p className="mt-4 text-sm leading-7 text-slate-300">
                    If you have questions about your data, reach out to the Holwa team through the support contact in your deployment environment.
                </p>
            </div>
        </main>
    );
}
