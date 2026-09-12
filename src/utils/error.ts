export function errorResponse(
  serviceName: string,
  errorCode: string,
  errorMessage: string,
  numericErrorCode?: number
) {
  return {
    errorCode: errorCode,
    errorMessage: errorMessage,
    messageVars: [],
    numericErrorCode: numericErrorCode || 1000,
    serviceName: serviceName,
    sessionValid: false,
  };
}

export function epicError(
  statusCode: number,
  errorCode: string,
  errorMessage: string
) {
  return {
    status: statusCode,
    errorCode: errorCode,
    errorMessage: errorMessage,
  };
}
