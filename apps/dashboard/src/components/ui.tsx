import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-brand-700 text-white hover:bg-brand-800 disabled:bg-brand-700/50",
  secondary: "bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100",
  danger: "bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50",
};

export function Button({ variant = "primary", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
        buttonStyles[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-800">{label}</span>
      {children}
      {error ? <span className="block text-sm text-red-700">{error}</span> : hint && <span className="block text-sm text-slate-500">{hint}</span>}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  // Full width unless the caller sets one: "w-full w-24" would let the stylesheet order decide.
  const hasWidth = /(^|\s)(w-|min-w-|flex-1)/.test(className ?? "");
  return (
    <input
      className={cx(
        "block rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 placeholder:text-slate-400",
        !hasWidth && "w-full",
        "focus:ring-2 focus:ring-brand-600 focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Card({ title, description, children, className }: { title?: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-2xl bg-white p-5 shadow-sm shadow-slate-900/[0.03] ring-1 ring-slate-200/80 sm:p-6", className)}>
      {title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      <div className={title || description ? "mt-5" : undefined}>{children}</div>
    </section>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{children}</p>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export { cx };
