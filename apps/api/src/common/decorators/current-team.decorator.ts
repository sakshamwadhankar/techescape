import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { PlayerAuth } from "../guards/jwt-auth.guard";

export const CurrentTeam = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PlayerAuth => {
    const req = ctx.switchToHttp().getRequest<{ user?: PlayerAuth }>();
    return req.user as PlayerAuth;
  },
);
