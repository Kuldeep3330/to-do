import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { REFRESH_COOKIE } from '../../config/env';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { AuthService } from './auth.service';
import { clearAuthCookies, setAuthCookies } from './auth.cookies';
import { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from './auth.dto';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @UseGuards(AuthRateLimitGuard)
  async register(@Body() body: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.register(body);
    setAuthCookies(res, result.accessToken, result.refreshToken, result.refreshTtlSeconds);
    res.status(201);
    return { data: { user: result.user } };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @UseGuards(AuthRateLimitGuard)
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(body);
    setAuthCookies(res, result.accessToken, result.refreshToken, result.refreshTtlSeconds);
    return { data: { user: result.user } };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    const result = await this.auth.refresh(raw);
    setAuthCookies(res, result.accessToken, result.refreshToken, result.refreshTtlSeconds);
    return { data: { user: result.user } };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    await this.auth.logout(raw);
    clearAuthCookies(res);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  @UseGuards(AuthRateLimitGuard)
  async forgot(@Body() body: ForgotPasswordDto) {
    await this.auth.forgotPassword(body);
    return { data: { ok: true } };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  async reset(@Body() body: ResetPasswordDto) {
    await this.auth.resetPassword(body);
    return { data: { ok: true } };
  }
}
