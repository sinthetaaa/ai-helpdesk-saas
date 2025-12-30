import { Injectable, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { FeedbackRating } from "@prisma/client";

@Injectable()
export class FeedbackService {
  constructor(private prisma: PrismaService) {}

  async upsertFeedback(args: {
    tenantId: string;
    userId: string;
    ticketId: string;
    rating: FeedbackRating;
    comment?: string;
  }) {
    const { tenantId, userId, ticketId, rating } = args;

    const comment =
      typeof args.comment === "string" && args.comment.trim().length
        ? args.comment.trim()
        : null;

    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, tenantId },
      select: { id: true },
    });
    if (!ticket) throw new ForbiddenException("Ticket not found in this tenant");

    const existing = await this.prisma.aiFeedback.findFirst({
      where: { tenantId, userId, ticketId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (existing) {
      return this.prisma.aiFeedback.update({
        where: { id: existing.id },
        data: { rating, comment },
      });
    }

    return this.prisma.aiFeedback.create({
      data: {
        tenantId,
        userId,
        ticketId,
        rating,
        comment,
      },
    });
  }
}
