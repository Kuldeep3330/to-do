import { z } from 'zod';
import { emailField, phoneField } from '@/lib/schemas/auth';

export const enquirySchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80, 'Use at most 80 characters'),
  phone: phoneField,
  // Optional: empty string is allowed, anything else must be a valid email.
  email: z
    .union([z.literal(''), emailField])
    .transform((v) => (v === '' ? undefined : v)),
  message: z
    .string()
    .trim()
    .max(1000, 'Use at most 1000 characters')
    .transform((v) => (v === '' ? undefined : v)),
});

export type EnquiryValues = z.input<typeof enquirySchema>;
export type EnquiryOutput = z.output<typeof enquirySchema>;

export const ENQUIRY_FIELDS = ['name', 'phone', 'email', 'message'] as const;
export const MESSAGE_MAX = 1000;
