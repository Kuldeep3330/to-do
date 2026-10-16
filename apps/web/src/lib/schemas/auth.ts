import { z } from 'zod';
import { normalizeIndianPhone } from '@/lib/format';

export const emailField = z
  .string()
  .trim()
  .min(1, 'Enter your email')
  .email('Enter a valid email address')
  .max(255);

/** Accepts common Indian formats; transforms to +91XXXXXXXXXX as the API expects. */
export const phoneField = z
  .string()
  .trim()
  .min(1, 'Enter your mobile number')
  .transform((v, ctx) => {
    const normalized = normalizeIndianPhone(v);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid 10-digit Indian mobile number' });
      return z.NEVER;
    }
    return normalized;
  });

export const passwordField = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Use at most 128 characters');

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Enter your password').max(128),
});
export type LoginValues = z.input<typeof loginSchema>;

export const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name').max(80),
    email: emailField,
    phone: phoneField,
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
export type RegisterValues = z.input<typeof registerSchema>;
export type RegisterOutput = z.output<typeof registerSchema>;

export const forgotPasswordSchema = z.object({ email: emailField });
export type ForgotPasswordValues = z.input<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
export type ResetPasswordValues = z.input<typeof resetPasswordSchema>;
