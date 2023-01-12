import * as events from "events";

const AWS = require('aws-sdk')
const lambda = new AWS.Lambda()
const {GenericError} = require('/opt/returns/errorHandler')

const headers = {
  "accept": "application/json, text/plain, */*",
  "accept-encoding": "gzip, deflate, br",
  "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
  // "content-type": "application/json", NOTE: content-type breaks lambda (will not hit endpoint)
}

//TODO: create for organizer (JAN 4, 2023 VERDICT: need to transfer to another handler)
exports.handler = async (event: any) => {
  try {
    return await customerPreSignUp(event)
  } catch (error) {
    return error
  }
}

export const customerPreSignUp = async (event: any) => {
  try {
    // Auto Confirm participant - needed for auto-login after signup functionality, otherwise JWT will not be returned
    event.response.autoConfirmUser = true;
    // Auto Verify participant's email - needed so forget password will work
    event.response.autoVerifyEmail = true;

    let body = {
      "userId": event.userName, //do not use sub
      "userCode": event.request.userAttributes['custom:userCode'],
      "role": event.request.userAttributes['custom:role'],
      "email": event.request.userAttributes.email,
      "name": event.request.userAttributes.name,
      "password": event.request.clientMetadata?.pass,
    }

    let payload = {
      'resource': '/',
      'httpMethod': 'POST',
      'headers': headers,
      'body': JSON.stringify(body),
      "queryStringParameters": null,
      "multiValueQueryStringParameters": null,
      "stageVariables": null,
      "isBase64Encoded": 'false'
    }

    // call customer profile function
    const params = {
      FunctionName: `customer-${process.env.DEPLOYMENT_ENV}`,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(payload)
    }

    const result = await lambda.invoke(params).promise()

    // Catch error
    const resultPayload = JSON.parse(result.Payload)
    if (resultPayload.statusCode !== 201) {
      throw new GenericError(resultPayload.body)
    }

    return event
  } catch (error) {
    return error
  }
}
