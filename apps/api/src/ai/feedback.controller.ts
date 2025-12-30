import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { AuthGuard } from "../common/guards/auth.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { Tenant } from "../common/decorators/tenant.decorator";
import { User } from "../common/decorators/user.decorator";
import { FeedbackService } from "./feedback.service";

const FeedbackDto = z.object({
  ticketId: z.string().min(1).max(200),
  rating: z.enum(["UP", "DOWN"]),
  comment: z
    .string()
    .max(2000)
    .optional()
    .transform((v) => {
      const t = typeof v === "string" ? v.trim() : "";
      return t.length ? t : undefined;
    }),
});

@Controller("ai")
@UseGuards(AuthGuard, TenantGuard)
export class FeedbackController {
  constructor(private feedback: FeedbackService) {}

  @Post("feedback")
  async createOrUpdate(
    @Tenant() tenant: { tenantId: string },
    @User() user: { userId: string },
    @Body() body: unknown,
  ) {
    const parsed = FeedbackDto.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.feedback.upsertFeedback({
      tenantId: tenant.tenantId,
      userId: user.userId,
      ticketId: parsed.data.ticketId,
      rating: parsed.data.rating,
      comment: parsed.data.comment,
    });
  }
}
