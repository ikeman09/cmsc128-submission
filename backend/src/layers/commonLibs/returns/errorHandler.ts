export {}

import {JSONHeader} from "./successMessages";

export interface IResponse {
  body: string,
  statusCode: number,
  headers: {
    [header: string]: any,
  },
  isBase64Encoded: boolean
}

export type Overrides = Partial<Omit<IResponse, "body">>

/**
 * Parent class that extends the Error type to create custom errors.
 */
class CustomError extends Error {
  private success: boolean
  private errorCode: string
  protected meta?: any

  constructor(message: string) {
    super(message);
    this.success = false
    this.errorCode = this.constructor.name

    // Optional might be an expensive operation.
    Error.captureStackTrace(this, this.constructor)
  }
}

class GenericError extends CustomError {
  constructor(errorData?: any) {
    super('Unknown error occurred')
    if (errorData) {
      if (errorData.body) {
        let parsedData = JSON.parse(errorData.body).data
        this.meta = Object.assign(this.meta, parsedData)
      } else {
        this.meta = errorData
      }

    }
  }
}

/**
 * The HTTP request lacks required query parameters.
 */
class MissingQueryParams extends CustomError {
  constructor(missingParams?: string) {
    super("Some HTTP query parameters are missing.")
    if (missingParams) {
      this.meta = {missingParams}
    }
  }
}

/**
 * The URL path lacks required parameters.
 */
class MissingPathParams extends CustomError {
  constructor(missingParams?: string) {
    super("Some HTTP path parameters are missing.")
    if (missingParams) {
      this.meta = {missingParams}
    }
  }
}

/**
 * The HTTP request lacks required body properties.
 */
class MissingBodyError extends CustomError {
  constructor(missingProps?: string[]) {
    super("HTTP body is missing required properties.")
    if (missingProps) {
      this.meta = {missingProps}
    }
  }
}

/**
 * The API returned an error, possibly Axios related.
 */
class ApiError extends CustomError {
  constructor(errorResponse?: any) {
    super(errorResponse?.message ?? "There is an error in the API call")
    if (errorResponse) {
      this.meta = {config: errorResponse.config}
    }
  }
}

/**
 * The HTTP request lacks a JWT in the Authorization header.
 */
class MissingTokenError extends CustomError {
  constructor(errorMessage: string = "There is no token sent.") {
    super(errorMessage)
  }
}

/**
 * The HTTP request lacks a specific property in the JWT.
 */
class InvalidTokenError extends CustomError {
  constructor(missingProps?: [string]) {
    super("The token is missing some properties.")
    if (missingProps && missingProps.length > 0) {
      missingProps.forEach((prop: string) => {
        this.meta.missingProps.push(prop)
      })
    }
  }
}

/**
 * Unauthorized action for current logged-in user's role
 */
class UnauthorizedAction extends CustomError {
  constructor() {
    super("You are not authorized to do this action")
  }
}

/**
 * An unknown HTTP method was used
 */
class InvalidHttpMethod extends CustomError {
  constructor(httpMethod?: string) {
    super("An invalid HTTP method was received.")
    if (httpMethod) {
      this.meta = {httpMethod}
    }
  }
}

class InvalidCodeError extends CustomError {
  constructor() {
    super("Code is not valid.")
  }
}

class DatabaseError extends CustomError {
  constructor(errorMessage?: string) {
    super("An database error has occurred");
    if (errorMessage) {
      this.meta = {errorMessage}
    }
  }
}

class RecordNotFoundError extends CustomError {
  constructor(errorMessage?: string) {
    super("Record not found");
    if (errorMessage) {
      this.meta = {errorMessage}
    }
  }
}



/**
 * Specific Error Types
 */

/**
 * The user's ID was not found in the database.
 */
class UserNotFound extends CustomError {
  constructor(userID?: string | number) {
    super("User does not have an existing profile.")
    if (userID)
      this.meta = {userID}
  }
}

class DealerNotFound extends CustomError {
  constructor(errorMessage?: string) {
    super("Dealer not found");
    if (errorMessage) {
      this.meta = {errorMessage}
    }
  }
}

class DealerAlreadyExists extends CustomError {
  constructor(errorMessage?: string) {
    super("Dealer Already Exists");
    if (errorMessage) {
      this.meta = {errorMessage}
    }
  }
}

class StationDoesNotExist extends CustomError {
  constructor(errorMessage?: string) {
    super("Station does not exist");
    if (errorMessage) {
      this.meta = {errorMessage}
    }
  }
}

class StationHasNoCurrentPrices extends CustomError {
  constructor(errorMessage?: string) {
    super("Station has no current prices");
    if (errorMessage) {
      this.meta = {errorMessage}
    }
  }
}

class FuelTypeAlreadyExists extends CustomError {
  constructor(errorMessage?: string) {
    super("Fuel type already exists. Edit price of the given fuel type to update the price.");
    if (errorMessage) {
      this.meta = {errorMessage}
    }
  }
}

class RuleNameDoesNotExist extends CustomError {
  constructor(errorMessage?: string) {
    super("Rule name does not exist");
    if (errorMessage) {
      this.meta = {errorMessage}
    }
  }
}

class LockDoesNotExist extends CustomError {
  constructor(errorMessage?: string) {
    super("Lock does not exist");
    if (errorMessage) {
      this.meta = {errorMessage}
    }
  }
}

class LockCannotBeClaimed extends CustomError {
  constructor(errorMessage?: string) {
    super("Lock is already expired or cancelled.");
    if (errorMessage) {
      this.meta = {errorMessage}
    }
  }
}

class UserAlreadyHaveALock extends CustomError {
  constructor(errorMessage?: string) {
    super("User already has a lock for this station");
    if (errorMessage) {
      this.meta = {errorMessage}
    }
  }
}

class LockIsStillOpen extends CustomError {
  constructor(errorMessage?: string) {
    super("Lock status is still open. Lock cannot be deleted");
    if (errorMessage) {
      this.meta = {errorMessage}
    }
  }
}

/**
 * Error handler or bundler that converts custom errors to lambda HTTP responses
 * @param body The error body that will be used in the HTTP body
 * @param overrides Possible overrides to the default response properties excluding the HTTP body
 */
const errorHandler = (body: any, overrides?: Overrides): IResponse => {
  console.log(body)

  if (!body?.errorCode) {
    body = new GenericError(body ?? null)
  }

  // Create new object to access `message` property from parent `Error` class
  const newBody: any = {
    success: body.success,
    errorCode: body.errorCode,
    message: body.message,
  }
  if (body.meta && Object.keys(body.meta).length > 0) {
    newBody.meta = body.meta
  }

  return <IResponse>{
    body: JSON.stringify(newBody),
    statusCode: overrides?.statusCode ?? 400,
    headers: overrides?.headers ? Object.assign(JSONHeader, overrides.headers) : JSONHeader,
    isBase64Encoded: overrides?.isBase64Encoded ?? false,
  }
}

module.exports = {
  GenericError,
  MissingQueryParams,
  MissingPathParams,
  MissingBodyError,
  ApiError,
  MissingTokenError,
  InvalidTokenError,
  UnauthorizedAction,
  InvalidHttpMethod,
  InvalidCodeError,
  DatabaseError,
  RecordNotFoundError,
  UserNotFound,
  DealerNotFound,
  DealerAlreadyExists,
  StationDoesNotExist,
  StationHasNoCurrentPrices,
  FuelTypeAlreadyExists,
  RuleNameDoesNotExist,
  LockDoesNotExist,
  LockIsStillOpen,
  LockCannotBeClaimed,
  UserAlreadyHaveALock,
  errorHandler,
}
