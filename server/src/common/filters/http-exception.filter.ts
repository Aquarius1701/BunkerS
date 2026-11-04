import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : null;

    let message = 'Ichki server xatoligi yuz berdi';
    let errorDetails: any = null;

    if (exceptionResponse) {
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resObj = exceptionResponse as any;
        message = resObj.message || resObj.error || message;
        errorDetails = resObj;
      }
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled Exception at ${request.method} ${request.url}: ${exception.message}`, exception.stack);
    }

    // Do not alter specific RPC or webhook structures (e.g. Payme or Click)
    if (request.url.startsWith('/api/payments/payme') && typeof exceptionResponse === 'object') {
      return response.status(status).json(exceptionResponse);
    }

    if (typeof errorDetails === 'object' && errorDetails !== null && 'success' in errorDetails) {
      return response.status(status).json(errorDetails);
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      message: Array.isArray(message) ? message[0] : message,
      details: Array.isArray(message) ? message : undefined,
    });
  }
}
