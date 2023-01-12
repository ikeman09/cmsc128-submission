// To see guide go to README.md in the root folder and search for 'Success response'

interface IBody {
  success: boolean,
  message: string,
  data?: any,
  meta?: any
}

export interface IResponse {
  body: string,
  statusCode: number,
  headers: {
    [header: string]: any,
  },
  isBase64Encoded: boolean
}

enum responseTypes {
  FETCH = 'FETCH_SUCCESS',
  SAVE = 'SAVE_SUCCESS',
  EDIT = 'EDIT_SUCCESS',
  DELETE = 'DELETE_SUCCESS',
}

export const JSONHeader = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "OPTIONS,POST,GET,DELETE,PUT",
  "Content-Type": "application/json",
}


/**
 * Returns a usable success response code.
 * @param code Uses type {@link responseTypes} which generates the response body
 * @param data Optionally pass payload data to the frontend
 * @param meta Optionally pass metadata to the frontend
 * @param overrides Optionally override the response properties excluding the body; uses a partial type of {@link IResponse}.
 */
const gatewayResponse = (code: responseTypes,
                         data?: object | any,
                         meta?: object | any,
                         overrides?: Partial<Omit<IResponse, "body">>) => {
  let message: string
  let statusCode: number

  switch(code){
    case responseTypes.FETCH:
      message = 'Data successfully fetched.'
      statusCode = 200
      break
    case responseTypes.SAVE:
      message = 'Data successfully saved.'
      statusCode = 201
      break
    case responseTypes.EDIT:
      message = 'Data successfully edited.'
      statusCode = 201
      break
    case responseTypes.DELETE:
      message = 'Data successfully deleted.'
      statusCode = 201
      break
    default:
      message = 'Action performed successfully.'
      statusCode = 200
  }

  let body: IBody = {
    success: true,
    message,
    data,
    meta
  }

  console.log({
    body: JSON.stringify(body),
    statusCode: overrides?.statusCode ?? statusCode,
    headers: (overrides?.headers && Object.assign(JSONHeader, overrides.headers)) ?? JSONHeader,
    isBase64Encoded: overrides?.isBase64Encoded ?? false
  })

  return <IResponse>{
    body: JSON.stringify(body),
    statusCode: overrides?.statusCode ?? statusCode,
    // headers: (overrides?.headers && Object.assign(JSONHeader, overrides.headers)) ?? JSONHeader,
    headers: JSONHeader,
    isBase64Encoded: overrides?.isBase64Encoded ?? false
  }
}

module.exports = {
  responseTypes,
  gatewayResponse,
}