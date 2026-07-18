import { LoginForm } from "@/app/login/LoginForm";

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6 items-center justify-center min-h-[60vh]">
      <div className="flex flex-col gap-4 w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-center">Mnemo</h1>
        <p className="text-sm text-zinc-500 text-center">
          Enter your API key to access Mnemo.
        </p>
        <LoginForm />
      </div>
    </div>
  );
}