import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import type { ApiErrorBody } from "@spiderman/types";

function normalize(
  body: string | Record<string, unknown>,
  status: number,
): ApiErrorBody {
  if (typeof body === "string") {
    return { statusCode: status, error: "Error", message: body };
  }
  const message = Array.isArray(body.message)
    ? (body.message as string[])
    : typeof body.message === "string"
      ? body.message
      : "Request failed";
  return {
    statusCode: status,
    error: (body.error as string) ?? "Error",
    message,
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      res
        .status(status)
        .json(normalize(exception.getResponse() as string | Record<string, unknown>, status));
      return;
    }

    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    this.logger.error(
      exception instanceof Error ? exception.message : String(exception),
      exception instanceof Error ? exception.stack : undefined,
    );
    res.status(status).json({
      statusCode: status,
      error: "InternalServerError",
      message: "An unexpected error occurred",
    });
  }
}
