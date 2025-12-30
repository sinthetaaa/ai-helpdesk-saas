import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { z } from "zod";
import { AuthService } from "./auth.service";

const AuthDto = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(72),
});

@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post("signup")
  async signup(@Body() body: unknown) {
    const parsed = AuthDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const { email, password } = parsed.data;
    return this.auth.signup(email, password);
  }

  @Post("login")
  async login(@Body() body: unknown) {
    const parsed = AuthDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const { email, password } = parsed.data;
    return this.auth.login(email, password);
  }
}
