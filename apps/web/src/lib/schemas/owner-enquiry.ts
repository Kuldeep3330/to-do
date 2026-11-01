import { z } from 'zod';
import { emailField, phoneField } from '@/lib/schemas/auth';

export const ownerEnquirySchema = z.object({
  intent: z.enum(['BUY', 'RENT']),
  city: z.string().trim().min(2, 'Enter the city').max(80, 'Use at most 80 characters'),
  locality: z
    .string()
    .trim()
    .max(80, 'Use at most 80 characters')
    .transform((v) => (v === '' ? undefined : v)),
  name: z.string().trim().min(2, 'Enter your name').max(80, 'Use at most 80 characters'),
  phone: phoneField,
  email: z
    .union([z.literal(''), emailField])
    .transform((v) => (v === '' ? undefined : v)),
  message: z
    .string()
    .trim()
    .max(1000, 'Use at most 1000 characters')
    .transform((v) => (v === '' ? undefined : v)),
});

export type OwnerEnquiryValues = z.input<typeof ownerEnquirySchema>;
export type OwnerEnquiryOutput = z.output<typeof ownerEnquirySchema>;

export const OWNER_ENQUIRY_FIELDS = [
  'intent',
  'city',
  'locality',
  'name',
  'phone',
  'email',
  'message',
] as const;
