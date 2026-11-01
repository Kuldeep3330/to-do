import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../app.module';
import { EMAIL_PORT } from '../notifications/email.port';
import { InMemoryEmail } from '../notifications/email.memory';

describe('owner enquiries HTTP', () => {
  let app: INestApplication;
  let email: InMemoryEmail;
  const suffix = `${Date.now()}`.slice(-8);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    email = app.get(EMAIL_PORT);
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a public owner enquiry and emails ops', async () => {
    email.sent.length = 0;
    const res = await request(app.getHttpServer())
      .post('/api/v1/owner-enquiries')
      .send({
        intent: 'RENT',
        city: 'Noida',
        locality: 'Sector 62',
        name: 'Owner Asha',
        phone: `+9182${suffix.padStart(8, '0')}`.slice(0, 13),
        email: `owner.${suffix}@example.com`,
        message: '2 BHK, 1100 sq ft, ready to show',
      });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ok: true });
    const ops = email.sent.find((m) => m.subject.includes('Owner wants to rent out'));
    expect(ops).toBeDefined();
    expect(ops?.subject).toContain('Sector 62, Noida');
  });

  it('rejects invalid phone without listing anything', async () => {
    const before = email.sent.length;
    const res = await request(app.getHttpServer())
      .post('/api/v1/owner-enquiries')
      .send({
        intent: 'BUY',
        city: 'Gurugram',
        name: 'Owner',
        phone: '9876543210',
      });
    expect(res.status).toBe(400);
    expect(email.sent.length).toBe(before);
  });
});
