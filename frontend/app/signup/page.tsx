// 12-12-25: Updated design language to match landing/login page
// 10-12-25: Removed tenant ID input; tenant now auto-assigned
// 15-01-25: Created signup page with tenant_id registration
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Image from 'next/image';

const highlightPoints = [
  { title: 'Script to screen', detail: 'Turn product steps into guided clips fast.' },
  { title: 'Clear narration', detail: 'AI-assisted scripts with crisp voiceovers.' },
  { title: 'Share anywhere', detail: 'Export for docs, onboarding, or in-app tours.' },
];

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState('');
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const { register, confirmRegistration } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (needsConfirmation) {
        await confirmRegistration(email, confirmationCode);
        router.push('/login');
      } else {
        const finalTenantId = `TENANT#${Date.now()}`;
        await register(email, password, email, finalTenantId);
        setNeedsConfirmation(true);
      }
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-sky-50 via-white to-indigo-100 text-neutral-900">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -left-32 h-80 w-80 rounded-full bg-sky-200 blur-[120px] opacity-80" />
        <div className="absolute top-10 -right-16 h-96 w-96 rounded-full bg-indigo-200 blur-[130px] opacity-75" />
        <div className="absolute bottom-[-6rem] left-1/4 h-64 w-64 rounded-full bg-emerald-100 blur-[120px] opacity-60" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16 lg:flex-row lg:items-center lg:gap-16">
        <div className="max-w-2xl space-y-6 text-center lg:text-left">
          <div className="inline-flex items-center gap-3 rounded-full border border-neutral-200 bg-white/80 px-4 py-2 text-sm font-semibold text-neutral-800 shadow-md backdrop-blur-md">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-inner">
              <Image src="/walkthrough-icon.svg" alt="Walkthrough" width={24} height={24} priority />
            </span>
            Walkthrough · Ship demos faster
          </div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Create polished walkthroughs without the production overhead.
          </h1>
          <p className="text-lg text-neutral-600">
            Craft, narrate, and share guided product videos that feel hand-made. Sign up to turn your next release into a crisp story in minutes.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {highlightPoints.map((item) => (
              <div key={item.title} className="rounded-2xl border border-neutral-200 bg-white/70 p-4 text-left shadow-sm backdrop-blur">
                <div className="text-sm font-semibold text-neutral-900">{item.title}</div>
                <div className="mt-1 text-sm text-neutral-600">{item.detail}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 w-full max-w-md lg:mt-0">
          <div className="rounded-3xl border border-neutral-200/70 bg-white/80 p-8 shadow-lg shadow-sky-100 backdrop-blur">
            <div className="mb-6 space-y-1">
              <div className="text-sm font-semibold text-sky-600">
                {needsConfirmation ? 'Confirm Account' : 'Get Started'}
              </div>
              <h2 className="text-2xl font-semibold text-neutral-900">
                {needsConfirmation ? 'Check your email' : 'Create your account'}
              </h2>
              <p className="text-sm text-neutral-600">
                {needsConfirmation
                  ? 'We sent a confirmation code to your email address.'
                  : 'Start creating guided demos and scripts today.'}
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                {needsConfirmation ? (
                  <div className="space-y-2">
                    <label htmlFor="code" className="text-sm font-medium text-neutral-800">
                      Confirmation Code
                    </label>
                    <input
                      id="code"
                      name="code"
                      type="text"
                      required
                      className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 shadow-inner focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                      placeholder="Enter code"
                      value={confirmationCode}
                      onChange={(e) => setConfirmationCode(e.target.value)}
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label htmlFor="email" className="text-sm font-medium text-neutral-800">
                        Email
                      </label>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 shadow-inner focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="password" className="text-sm font-medium text-neutral-800">
                        Password
                      </label>
                      <input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        required
                        className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 shadow-inner focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                        placeholder="Minimum 8 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading
                  ? (needsConfirmation ? 'Confirming...' : 'Creating account...')
                  : (needsConfirmation ? 'Confirm' : 'Sign up')}
              </button>
            </form>

            {!needsConfirmation && (
              <p className="mt-6 text-center text-sm text-neutral-600">
                Already have an account?{' '}
                <a href="/login" className="font-semibold text-neutral-900 hover:text-neutral-700">
                  Sign in
                </a>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
