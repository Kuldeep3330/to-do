'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Field, Input, fieldAria } from '@/components/ui/form-controls';
import { Alert } from '@/components/ui/feedback';
import { authApi } from '@/lib/api/endpoints';
import { applyApiError } from '@/lib/forms';
import { homeFor, safeNext, useSession } from '@/lib/auth/use-auth';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  type ForgotPasswordValues,
  type LoginValues,
  type RegisterOutput,
  type RegisterValues,
  type ResetPasswordValues,
} from '@/lib/schemas/auth';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setUser } = useSession();
  const [formError, setFormError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { user } = await authApi.login(values);
      setUser(user);
      const next = params.get('next');
      router.replace(safeNext(next, homeFor(user)));
      router.refresh();
    } catch (err) {
      setFormError(applyApiError(err, setError, ['email', 'password']));
    }
  });

  return (
    <form onSubmit={onSubmit} method="post" noValidate className="space-y-4">
      {formError && <Alert tone="error">{formError}</Alert>}
      <Field label="Email" htmlFor="email" error={errors.email?.message} required>
        <Input
          type="email"
          autoComplete="email"
          autoFocus
          {...fieldAria('email', errors.email?.message)}
          {...register('email')}
        />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password?.message} required>
        <Input
          type="password"
          autoComplete="current-password"
          {...fieldAria('password', errors.password?.message)}
          {...register('password')}
        />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-brand-600 hover:underline">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Sign in
      </Button>
      <p className="text-center text-sm text-ink-muted">
        New here?{' '}
        <Link href="/register" className="font-medium text-brand-600 hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const { setUser } = useSession();
  const [formError, setFormError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues, unknown, RegisterOutput>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async ({ name, email, phone, password }) => {
    setFormError(null);
    try {
      const { user } = await authApi.register({ name, email, phone, password });
      setUser(user);
      router.replace('/account');
      router.refresh();
    } catch (err) {
      setFormError(applyApiError(err, setError, ['name', 'email', 'phone', 'password']));
    }
  });

  return (
    <form onSubmit={onSubmit} method="post" noValidate className="space-y-4">
      {formError && <Alert tone="error">{formError}</Alert>}
      <Field label="Full name" htmlFor="name" error={errors.name?.message} required>
        <Input autoComplete="name" autoFocus {...fieldAria('name', errors.name?.message)} {...register('name')} />
      </Field>
      <Field label="Email" htmlFor="email" error={errors.email?.message} required>
        <Input type="email" autoComplete="email" {...fieldAria('email', errors.email?.message)} {...register('email')} />
      </Field>
      <Field
        label="Mobile number"
        htmlFor="phone"
        error={errors.phone?.message}
        hint="10-digit Indian mobile number"
        required
      >
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="98765 43210"
          {...fieldAria('phone', errors.phone?.message, 'x')}
          {...register('phone')}
        />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password?.message} hint="At least 8 characters" required>
        <Input
          type="password"
          autoComplete="new-password"
          {...fieldAria('password', errors.password?.message, 'x')}
          {...register('password')}
        />
      </Field>
      <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword?.message} required>
        <Input
          type="password"
          autoComplete="new-password"
          {...fieldAria('confirmPassword', errors.confirmPassword?.message)}
          {...register('confirmPassword')}
        />
      </Field>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Create account
      </Button>
      <p className="text-center text-sm text-ink-muted">
        Already registered?{' '}
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await authApi.forgotPassword(values);
      setSent(true);
    } catch (err) {
      setFormError(applyApiError(err, setError, ['email']));
    }
  });

  if (sent) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title="Check your inbox">
          If an account exists for that email, we have sent a link to reset your password.
        </Alert>
        <Link href="/login" className="block text-center text-sm font-medium text-brand-600 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} method="post" noValidate className="space-y-4">
      {formError && <Alert tone="error">{formError}</Alert>}
      <Field label="Email" htmlFor="email" error={errors.email?.message} required>
        <Input type="email" autoComplete="email" autoFocus {...fieldAria('email', errors.email?.message)} {...register('email')} />
      </Field>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Send reset link
      </Button>
      <p className="text-center text-sm">
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [done, setDone] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({ resolver: zodResolver(resetPasswordSchema) });

  if (token.length < 16) {
    return (
      <div className="space-y-4">
        <Alert tone="error" title="This reset link is not valid">
          Request a new one and try again.
        </Alert>
        <Link href="/forgot-password" className="block text-center text-sm font-medium text-brand-600 hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      await authApi.resetPassword({ token, password });
      setDone(true);
      window.setTimeout(() => router.replace('/login'), 1500);
    } catch (err) {
      setFormError(applyApiError(err, setError, ['password']));
    }
  });

  if (done) {
    return <Alert tone="success" title="Password updated">Redirecting you to sign inâ€¦</Alert>;
  }

  return (
    <form onSubmit={onSubmit} method="post" noValidate className="space-y-4">
      {formError && <Alert tone="error">{formError}</Alert>}
      <Field label="New password" htmlFor="password" error={errors.password?.message} hint="At least 8 characters" required>
        <Input
          type="password"
          autoComplete="new-password"
          autoFocus
          {...fieldAria('password', errors.password?.message, 'x')}
          {...register('password')}
        />
      </Field>
      <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword?.message} required>
        <Input
          type="password"
          autoComplete="new-password"
          {...fieldAria('confirmPassword', errors.confirmPassword?.message)}
          {...register('confirmPassword')}
        />
      </Field>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Update password
      </Button>
    </form>
  );
}
