"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ScanFace, ShieldCheck, Users } from "lucide-react";
import { Brand } from "@/components/brand";
import { LoginArt } from "@/components/login-art";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { useApp } from "@/context/app-context";

export default function LoginPage() {
  const { ready, authed, login } = useApp();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (ready && authed) router.replace("/dashboard"); }, [ready, authed, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) next.email = "Enter a valid email address.";
    if (password.length < 6) next.password = "Password must be at least 6 characters.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await login(email, password, remember);
      router.push("/dashboard");
    } catch {
      setErrors({ email: "Authentication failed. Check your credentials or try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#EAF6EE] p-4 sm:p-6">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 right-0 h-[28rem] w-[28rem] rounded-full bg-emerald-300/30 blur-3xl" />
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] bg-white shadow-pop ring-1 ring-black/5 lg:grid-cols-2">
        <section className="flex flex-col justify-center px-6 py-10 sm:px-12">
          <Brand className="mb-10" />
          <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sm text-muted">Log in to count and review your congregation.</p>
          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            <Field label="Email address" htmlFor="email" error={errors.email}><Input id="email" type="email" autoComplete="email" placeholder="you@church.org" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} className="h-11 bg-slate-50" /></Field>
            <Field label="Password" htmlFor="password" error={errors.password}>
              <div className="relative">
                <Input id="password" type={show ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" className="h-11 bg-slate-50 pr-10" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-slate-100">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
            </Field>
            <div className="flex items-center justify-between text-sm">
              <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-brand" />Remember me</label>
              <Link href="#" onClick={(e) => { e.preventDefault(); alert("Password reset isn't available in this frontend preview."); }} className="font-medium text-brand-dark hover:underline">Forgot password?</Link>
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? "Logging in…" : "Log in"}</Button>
          </form>
          <p className="mt-6 flex items-center gap-1.5 text-xs text-muted">Your account must be set up by your church administrator.</p>
        </section>

        <section className="relative hidden overflow-hidden bg-gradient-to-br from-forest via-forest-800 to-[#15803D] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-x-0 top-6 mx-auto h-[300px] w-[88%] opacity-95"><LoginArt /></div>
          <div className="relative mt-[330px]">
            <h2 className="text-3xl font-semibold leading-tight tracking-tight">Count your congregation,<br /><span className="text-green-300">not individuals.</span></h2>
            <ul className="mt-6 space-y-3 text-sm text-white/85">
              <li className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10"><Users className="h-4 w-4" /></span>Walk the room with your phone camera</li>
              <li className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10"><ScanFace className="h-4 w-4" /></span>No face recognition, no member profiles</li>
              <li className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10"><ShieldCheck className="h-4 w-4" /></span>Video is never stored</li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
