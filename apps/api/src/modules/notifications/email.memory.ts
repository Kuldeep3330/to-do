import { EmailMessage, EmailPort } from './email.port';

export class InMemoryEmail implements EmailPort {
  readonly sent: EmailMessage[] = [];
  failNext = false;

  async send(input: EmailMessage): Promise<{ id: string }> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('smtp down');
    }
    this.sent.push(input);
    return { id: `mem-${this.sent.length}` };
  }
}
