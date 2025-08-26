/**
 * ErrorHandler class extends the built-in Error class.
 * It handles error messages and status codes in the app.
 */
export class ErrorHandler extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number) {
        super(message);
        this.statusCode = statusCode;

        // Capture stack trace for debugging
        Error.captureStackTrace(this, this.constructor);
    }

    getStatusCode() {
        return this.statusCode;
    }

    setStatusCode(statusCode: number) {
        this.statusCode = statusCode;
    }

    // Add method to get error message
    getMessage() {
        return this.message;
    }
}

export default ErrorHandler;
