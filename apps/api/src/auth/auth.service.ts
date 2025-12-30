import * as bcrypt from "bcrypt";
import { Injectable, UnauthorizedException, ConflictException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async signup(email: string, password: string) {
    const normalizedEmail = email.toLowerCase().trim();

    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existing) throw new ConflictException("Email already in use");

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await this.prisma.user.create({
      data: { email: normalizedEmail, passwordHash },
      select: { id: true },
    });

    return this.issueToken(user.id);
  }

  async login(email: string, password: string) {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, passwordHash: true },
    });

    if (!user) throw new UnauthorizedException("Invalid credentials");

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid credentials");

    return this.issueToken(user.id);
  }

  issueToken(userId: string) {
    return {
      accessToken: this.jwt.sign({ sub: userId }),
    };
  }
}
