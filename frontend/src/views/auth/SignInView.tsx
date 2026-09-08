import { useState, type FormEvent } from 'react';
import { Languages } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useLocaleStore } from '@/store/localeStore';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@hr.com', password: 'Admin123!' },
  { label: 'Manager', email: 'jordan.blake@company.com', password: 'Admin123!' },
  { label: 'Employee', email: 'sarah.chen@company.com', password: 'Employee123!' },
];

export function SignInView() {
  const { signIn, signUp, error, status } = useAuthStore();
  const { locale, setLocale } = useLocaleStore();
  const t = useT();
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [signedUp, setSignedUp] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    if (mode === 'sign_in') {
      await signIn(email, password);
    } else {
      await signUp(email, password, fullName);
      setSignedUp(true);
    }
    setSubmitting(false);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="absolute right-4 top-4 flex items-center gap-1.5 text-slate-400">
        <Languages size={14} />
        <div className="flex overflow-hidden rounded-md border border-slate-200 text-[11px] font-medium">
          {(['en', 'fr'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLocale(l)}
              className={cn(
                'px-2 py-1 uppercase transition-colors',
                locale === l ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl md:grid-cols-2">
        <div className="bg-blue-50 p-10">
          <div className="mb-8 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">HR</div>
            <span className="font-display text-lg text-slate-800">{t('signIn.brand')}</span>
          </div>
          <h1 className="font-display text-3xl leading-snug text-slate-800">{t('signIn.welcome')}</h1>
          <p className="mt-3 text-sm text-slate-500">{t('signIn.tagline')}</p>

          {signedUp ? (
            <div className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              {t('signIn.signedUpNotice')}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              {mode === 'sign_up' && (
                <label className="block">
                  <span className="mb-1 block text-sm text-slate-600">{t('signIn.fullName')}</span>
                  <input
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Jamie Rivera"
                  />
                </label>
              )}
              <label className="block">
                <span className="mb-1 block text-sm text-slate-600">{t('signIn.email')}</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="you@company.com"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-slate-600">{t('signIn.password')}</span>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="••••••••"
                />
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" disabled={submitting || status === 'loading'} className="w-full">
                {submitting ? t('signIn.pleaseWait') : mode === 'sign_in' ? t('signIn.signIn') : t('signIn.createAccount')}
              </Button>
              <button
                type="button"
                onClick={() => setMode(mode === 'sign_in' ? 'sign_up' : 'sign_in')}
                className="w-full text-center text-xs text-slate-500 hover:text-blue-600"
              >
                {mode === 'sign_in' ? t('signIn.switchToSignUp') : t('signIn.switchToSignIn')}
              </button>
            </form>
          )}
        </div>

        <div className="flex flex-col justify-center gap-4 p-10">
          <h2 className="font-display text-lg text-slate-800">{t('signIn.tryDemo')}</h2>
          <p className="text-sm text-slate-500">{t('signIn.tryDemoDesc')}</p>
          <div className="space-y-2">
            {DEMO_ACCOUNTS.map((acct) => (
              <button
                key={acct.email}
                onClick={() => {
                  setEmail(acct.email);
                  setPassword(acct.password);
                  void signIn(acct.email, acct.password);
                }}
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left text-sm hover:border-blue-300 hover:bg-blue-50"
              >
                <span>
                  <span className="font-medium text-slate-700">{acct.label}</span>
                  <span className="ml-2 text-slate-400">{acct.email}</span>
                </span>
                <span className="text-xs text-blue-600">{t('signIn.signInArrow')}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">{t('signIn.demoFootnote')}</p>
        </div>
      </div>
    </div>
  );
}
