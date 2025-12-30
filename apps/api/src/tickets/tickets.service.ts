import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { TicketPriority, TicketStatus } from "@prisma/client";

@Injectable()
export class TicketsService {
  constructor(private prisma: PrismaService) {}

  async createTicket(params: {
    tenantId: string;
    requesterId: string;
    title: string;
    description: string;
    priority?: TicketPriority;
  }) {
    const ticket = await this.prisma.ticket.create({
      data: {
        tenantId: params.tenantId,
        requesterId: params.requesterId,
        title: params.title,
        description: params.description,
        priority: params.priority ?? "MEDIUM",
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorId: params.requesterId,
        action: "TICKET_CREATED",
        entity: "Ticket",
        entityId: ticket.id,
        meta: { title: ticket.title, priority: ticket.priority },
      },
    });

    return ticket;
  }

  async listTickets(params: {
    tenantId: string;
    status?: TicketStatus;
    priority?: TicketPriority;
    assigneeId?: string;
    limit?: number;
  }) {
    const take = Math.min(Math.max(params.limit ?? 50, 1), 200);

    return this.prisma.ticket.findMany({
      where: {
        tenantId: params.tenantId,
        status: params.status,
        priority: params.priority,
        assigneeId: params.assigneeId,
      },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        requesterId: true,
        assigneeId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getTicket(tenantId: string, ticketId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, tenantId },
      include: { comments: { orderBy: { createdAt: "asc" } } },
    });
    if (!ticket) throw new NotFoundException("Ticket not found");
    return ticket;
  }

  async updateTicket(params: {
    tenantId: string;
    actorId: string;
    ticketId: string;
    status?: TicketStatus;
    priority?: TicketPriority;
    assigneeId?: string | null;
  }) {
    const existing = await this.prisma.ticket.findFirst({
      where: { id: params.ticketId, tenantId: params.tenantId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("Ticket not found");

    const updated = await this.prisma.ticket.update({
      where: { id: params.ticketId },
      data: {
        status: params.status,
        priority: params.priority,
        assigneeId: params.assigneeId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorId: params.actorId,
        action: "TICKET_UPDATED",
        entity: "Ticket",
        entityId: updated.id,
        meta: {
          status: updated.status,
          priority: updated.priority,
          assigneeId: updated.assigneeId,
        },
      },
    });

    return updated;
  }

  async addComment(params: {
    tenantId: string;
    ticketId: string;
    authorId: string;
    body: string;
  }) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: params.ticketId, tenantId: params.tenantId },
      select: { id: true },
    });
    if (!ticket) throw new NotFoundException("Ticket not found");

    const comment = await this.prisma.ticketComment.create({
      data: {
        tenantId: params.tenantId,
        ticketId: params.ticketId,
        authorId: params.authorId,
        body: params.body,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorId: params.authorId,
        action: "COMMENT_ADDED",
        entity: "TicketComment",
        entityId: comment.id,
        meta: { ticketId: params.ticketId },
      },
    });

    return comment;
  }
}
