import { useCallback, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "@/pages/auth/AuthLayout.tsx";
import { Input } from "@/components/ui/Input.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { Divider } from "@/components/ui/Divider.tsx";
import { GoogleSignInButton } from "@/components/GoogleSignInButton.tsx";
import { ContinueAsGuestButton } from "@/components/ContinueAsGuestButton.tsx";
import { ConfettiBurst } from "@/components/ConfettiBurst.tsx";
import { useAuth } from "@/context/AuthContext.tsx";
import { ApiClientError } from "@/lib/api.ts";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  const goToRoom = useCallback(() => navigate("/room", { replace: true }), [navigate]);
  const celebrateThenGo = useCallback(() => setCelebrate(true), []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(name, email, password);
      celebrateThenGo();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Create your workspace" subtitle="Move anything between your devices, instantly.">
      <ConfettiBurst active={celebrate} onComplete={goToRoom} />

      <div className="flex flex-col gap-3">
        <GoogleSignInButton onSuccess={celebrateThenGo} onError={setError} />
        <ContinueAsGuestButton onSuccess={celebrateThenGo} onError={setError} />
      </div>

      <div className="my-6">
        <Divider label="or with email" />
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-text-primary">
            Name
          </label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-text-primary">
            Email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-text-primary">
            Password
          </label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="mt-1 text-xs text-text-secondary">At least 8 characters.</p>
        </div>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <Button type="submit" size="lg" loading={loading} className="mt-1 w-full">
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-text-secondary">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
