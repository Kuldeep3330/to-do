import { z } from 'zod';
import { createZodDto } from '../../common/dto/zod-dto';

export const emailSchema = z
  .string()
  .email()
  .max(255)
  .transform((v) => v.toLowerCase().trim());

export const phoneSchema = z.string().regex(/^\+91[6-9]\d{9}$/);

export const passwordSchema = z.string().min(8).max(128);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1).max(80),
  phone: phoneSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(16).max(512),
  password: passwordSchema,
});

export class RegisterDto extends createZodDto(registerSchema) {}
export class LoginDto extends createZodDto(loginSchema) {}
export class ForgotPasswordDto extends createZodDto(forgotPasswordSchema) {}
export class ResetPasswordDto extends createZodDto(resetPasswordSchema) {}

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
