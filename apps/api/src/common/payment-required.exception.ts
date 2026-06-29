import { HttpException, HttpStatus } from '@nestjs/common';

/** 402 Payment Required — raised when a plan quota or feature gate blocks an action. */
export class PaymentRequiredException extends HttpException {
  constructor(message: string) {
    super(
      { statusCode: HttpStatus.PAYMENT_REQUIRED, message, error: 'Payment Required' },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
