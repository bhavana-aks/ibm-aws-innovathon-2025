// 12-12-25: Added Walkthrough icon to hero badge
// 12-12-25: Intensified hero branding and gradients
// 10-12-25: Restyled login into landing-style hero
// 15-01-25: Created login page with Cognito authentication
// 07-12-25: Added redirect for already authenticated users
'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

const highlightPoints = [
  { title: 'Script to screen', detail: 'Turn product steps into guided clips fast.' },
  { title: 'Clear narration', detail: 'AI-assisted scripts with crisp voiceovers.' },
  { title: 'Share anywhere', detail: 'Export for docs, onboarding, or in-app tours.' },
];

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-neutral-500">Loading...</div>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-neutral-500">Redirecting...</div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(username, password);
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
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
            Craft, narrate, and share guided product videos that feel hand-made. Log in to turn your next release into a crisp story in minutes.
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
              <div className="text-sm font-semibold text-sky-600">Sign in</div>
              <h2 className="text-2xl font-semibold text-neutral-900">Welcome back to Walkthrough</h2>
              <p className="text-sm text-neutral-600">
                Access your guided demos, scripts, and exports.
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="username" className="text-sm font-medium text-neutral-800">
                    Email
                  </label>
                  <input
                    id="username"
                    name="username"
                    type="email"
                    autoComplete="email"
                    required
                    className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 shadow-inner focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    placeholder="you@walkthrough.app"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
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
                    autoComplete="current-password"
                    required
                    className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 shadow-inner focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-neutral-600">
              New to Walkthrough?{' '}
              <a href="/signup" className="font-semibold text-neutral-900 hover:text-neutral-700">
                Create an account
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
