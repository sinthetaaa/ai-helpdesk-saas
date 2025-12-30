import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

export type RequestUser = { userId: string };

function getAuthHeader(req: any): string | null {
  const h = req?.headers?.["authorization"];
  if (typeof h === "string") return h;
  if (Array.isArray(h) && typeof h[0] === "string") return h[0];
  return null;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();

    const authHeader = getAuthHeader(req);
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing token");
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) throw new UnauthorizedException("Missing token");

    try {
      const payload = this.jwt.verify(token) as any;

      const sub = payload?.sub;
      if (typeof sub !== "string" || !sub.trim()) {
        throw new UnauthorizedException("Invalid token");
      }

      req.user = { userId: sub } satisfies RequestUser;
      return true;
    } catch {
      throw new UnauthorizedException("Invalid token");
    }
  }
}
