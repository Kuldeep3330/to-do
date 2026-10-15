import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../app.module';
import { EMAIL_PORT } from '../notifications/email.port';
import { InMemoryEmail } from '../notifications/email.memory';

const prisma = new PrismaClient();

function cookieHeader(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  const parts = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return parts.map((c) => c.split(';')[0]).join('; ');
}

function setCookieList(res: request.Response): string[] {
  const raw = res.headers['set-cookie'];
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

function namedCookie(res: request.Response, name: string): string | undefined {
  return setCookieList(res)
    .map((c) => c.split(';')[0])
    .find((c) => c.startsWith(`${name}=`));
}

describe('auth HTTP', () => {
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
    await prisma.$disconnect();
  });

  it('registers with httpOnly cookies and PublicUser only', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `auth.reg.${suffix}@example.com`,
        password: 'CustomerPass1',
        name: 'Auth Reg',
        phone: `+9181${suffix.padStart(8, '0')}`.slice(0, 13),
      });
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe(`auth.reg.${suffix}@example.com`);
    expect(res.body.data.user.roles).toEqual(['CUSTOMER']);
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(res.body.data.user).not.toHaveProperty('failedLoginCount');
    const cookies = setCookieList(res);
    expect(cookies.some((c) => /ncr_access=/.test(c) && /HttpOnly/i.test(c))).toBe(true);
    expect(cookies.some((c) => /ncr_refresh=/.test(c) && /HttpOnly/i.test(c))).toBe(true);
    expect(cookies.some((c) => /SameSite=Lax/i.test(c))).toBe(true);
  });

  it('logs in with cookies and rejects a wrong password without leaking lock state', async () => {
    const emailAddr = `auth.login.${suffix}@example.com`;
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: emailAddr,
        password: 'CustomerPass1',
        name: 'Auth Login',
        phone: `+9182${suffix.padStart(8, '0')}`.slice(0, 13),
      });
    expect(reg.status).toBe(201);
    const ok = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: emailAddr, password: 'CustomerPass1' });
    expect(ok.status).toBe(200);
    expect(namedCookie(ok, 'ncr_access')).toBeTruthy();
    expect(namedCookie(ok, 'ncr_refresh')).toBeTruthy();
    const bad = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: emailAddr, password: 'WrongPass99' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rotates refresh and rejects reuse of the revoked token', async () => {
    const emailAddr = `auth.ref.${suffix}@example.com`;
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: emailAddr,
        password: 'CustomerPass1',
        name: 'Auth Refresh',
        phone: `+9183${suffix.padStart(8, '0')}`.slice(0, 13),
      });
    const oldRefresh = cookieHeader(reg);
    const rotated = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', oldRefresh);
    expect(rotated.status).toBe(200);
    expect(namedCookie(rotated, 'ncr_refresh')).toBeTruthy();
    const reuse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', oldRefresh);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('logout revokes the current refresh and clears cookies', async () => {
    const emailAddr = `auth.out.${suffix}@example.com`;
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: emailAddr,
        password: 'CustomerPass1',
        name: 'Auth Out',
        phone: `+9184${suffix.padStart(8, '0')}`.slice(0, 13),
      });
    const cookies = cookieHeader(reg);
    const out = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookies);
    expect(out.status).toBe(204);
    const refresh = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies);
    expect(refresh.status).toBe(401);
  });

  it('rejects login and refresh for DISABLED users', async () => {
    const emailAddr = `auth.dis.${suffix}@example.com`;
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: emailAddr,
        password: 'CustomerPass1',
        name: 'Auth Disabled',
        phone: `+9185${suffix.padStart(8, '0')}`.slice(0, 13),
      });
    const userId = reg.body.data.user.id as string;
    await prisma.user.update({ where: { id: userId }, data: { status: 'DISABLED' } });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: emailAddr, password: 'CustomerPass1' });
    expect(login.status).toBe(401);
    expect(login.body.error.code).toBe('INVALID_CREDENTIALS');
    const refresh = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader(reg));
    expect(refresh.status).toBe(401);
  });

  it('forgot-password always 200 and emails a reset link for known users only', async () => {
    const emailAddr = `auth.fg.${suffix}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: emailAddr,
        password: 'CustomerPass1',
        name: 'Auth Forgot',
        phone: `+9186${suffix.padStart(8, '0')}`.slice(0, 13),
      });
    const before = email.sent.length;
    const unknown = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: `missing.${suffix}@example.com` });
    expect(unknown.status).toBe(200);
    expect(unknown.body.data.ok).toBe(true);
    expect(email.sent.length).toBe(before);
    const known = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: emailAddr });
    expect(known.status).toBe(200);
    const resetMail = email.sent.find((m) => m.to === emailAddr && m.subject.includes('Reset'));
    expect(resetMail).toBeTruthy();
    expect(resetMail?.text).toMatch(/\/reset-password\//);
  });

  it('reset-password consumes the token, revokes sessions, and allows the new password', async () => {
    const emailAddr = `auth.rs.${suffix}@example.com`;
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: emailAddr,
        password: 'CustomerPass1',
        name: 'Auth Reset',
        phone: `+9187${suffix.padStart(8, '0')}`.slice(0, 13),
      });
    await request(app.getHttpServer()).post('/api/v1/auth/forgot-password').send({ email: emailAddr });
    const resetMail = [...email.sent].reverse().find((m) => m.to === emailAddr);
    const match = resetMail?.text.match(/\/reset-password\/([A-Za-z0-9_-]+)/);
    expect(match?.[1]).toBeTruthy();
    const token = match![1];
    const reset = await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'NewCustomer1' });
    expect(reset.status).toBe(200);
    const reuse = await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'NewCustomer2' });
    expect(reuse.status).toBe(401);
    const oldLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: emailAddr, password: 'CustomerPass1' });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: emailAddr, password: 'NewCustomer1' });
    expect(newLogin.status).toBe(200);
    const oldRefresh = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader(reg));
    expect(oldRefresh.status).toBe(401);
  });

  it('does not 429 auth routes when RATE_LIMIT_ENABLED=false', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: `missing.${suffix}.${i}@example.com`, password: 'x' }),
      ),
    );
    expect(results.every((r) => r.status !== 429)).toBe(true);
    expect(results.every((r) => r.body.error?.code !== 'RATE_LIMITED')).toBe(true);
  });
});
