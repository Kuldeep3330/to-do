export const EMAIL_PORT = Symbol('EMAIL_PORT');

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailPort = {
  send(input: EmailMessage): Promise<{ id: string }>;
};
